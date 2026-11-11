import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { TripDetectionState } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { evaluateApdsV3OfflinePolicy } from './apds-v3-offline-policy.evaluator';
import { validateCausalEvidenceAtDecision } from './apds-v3-causal-evidence.v1';
import { evaluateConsumerDemandGate } from './consumer-demand-gate.v1';
import {
  APDS_V3_SHADOW_ACTIVATION_VERSION,
  apdsV3ShadowEvaluationTimeoutMs,
  apdsV3ShadowMaxConcurrentEvaluations,
  apdsV3ShadowMaxQueueDepth,
  apdsV3ShadowMaxWritesPerMinute,
  isApdsV3ShadowRuntimeReady,
} from './apds-v3-shadow.config';
import { ApdsV3ShadowEligibilityService } from './apds-v3-shadow-eligibility.service';
import {
  mapApdsV3ShadowPollStartToOfflineInput,
  resolveBaselinePartialParitySnapshot,
} from './apds-v3-shadow-input.mapper';
import {
  ApdsV3ShadowImmutableConflictError,
  ApdsV3ShadowRepository,
} from './apds-v3-shadow.repository';
import { ApdsV3ShadowMetricsService } from './apds-v3-shadow-metrics.service';
import { resolveApdsV3ShadowPhysicalRequestIdentity } from './apds-v3-shadow-physical-identity.v1';
import type { ApdsV3ShadowProcessorEnvelope } from './apds-v3-shadow-processor-envelope.v1';
import { loadApdsV3ShadowCausalEvidence } from './apds-v3-shadow-causal-loader.v1';
import { ApdsV3ShadowRuntimeQueue } from './apds-v3-shadow-runtime.v1';

export { buildApdsV3ShadowPhysicalRequestId } from './apds-v3-shadow-legacy-physical-id';

function activityTierFromTrip(state: TripDetectionState | null): string {
  if (
    state === TripDetectionState.ACTIVE_TRIP ||
    state === TripDetectionState.IDLE_WITHIN_TRIP ||
    state === TripDetectionState.POSSIBLE_END
  ) {
    return 'ACTIVE_DRIVING';
  }
  return 'RESTING_STANDBY';
}

@Injectable()
export class ApdsV3ShadowService implements OnModuleDestroy {
  private readonly logger = new Logger(ApdsV3ShadowService.name);
  private readonly writeTimestampsMs: number[] = [];
  private readonly budgetLock = { chain: Promise.resolve() as Promise<void> };
  private readonly runtime: ApdsV3ShadowRuntimeQueue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: ApdsV3ShadowEligibilityService,
    private readonly repository: ApdsV3ShadowRepository,
    @Optional() private readonly metrics?: ApdsV3ShadowMetricsService,
  ) {
    this.runtime = new ApdsV3ShadowRuntimeQueue(
      apdsV3ShadowMaxConcurrentEvaluations(),
      apdsV3ShadowMaxQueueDepth(),
      apdsV3ShadowEvaluationTimeoutMs(),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.runtime.drainForShutdown();
  }

  isRuntimeReady(): boolean {
    return isApdsV3ShadowRuntimeReady();
  }

  /**
   * Zero blocking work on the baseline poll critical path.
   */
  scheduleBaselineObserve(envelope: ApdsV3ShadowProcessorEnvelope): void {
    if (!this.isRuntimeReady()) return;
    const queued = this.runtime.enqueue((signal) =>
      this.executeQueuedObservation(envelope, signal),
    );
    if (!queued) {
      this.metrics?.recordWriteSuppressed('QUEUE_FULL');
    }
  }

  /** @deprecated Use scheduleBaselineObserve — kept for unit tests calling inner path. */
  async observeActualBaselinePollStart(
    envelope: ApdsV3ShadowProcessorEnvelope,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.executeQueuedObservation(envelope, signal);
  }

  getRuntimeStats(): { active: number; pending: number } {
    return this.runtime.getStats();
  }

  private underWriteBudget(nowMs: number): boolean {
    const windowMs = 60_000;
    const cap = apdsV3ShadowMaxWritesPerMinute();
    while (this.writeTimestampsMs.length && this.writeTimestampsMs[0]! < nowMs - windowMs) {
      this.writeTimestampsMs.shift();
    }
    return this.writeTimestampsMs.length < cap;
  }

  private recordWrite(nowMs: number): void {
    this.writeTimestampsMs.push(nowMs);
  }

  private async withBudgetMutex<T>(fn: () => Promise<T> | T): Promise<T> {
    const run = this.budgetLock.chain.then(fn);
    this.budgetLock.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async reserveWriteBudget(nowMs: number): Promise<boolean> {
    return this.withBudgetMutex(async () => {
      if (!this.underWriteBudget(nowMs)) return false;
      this.recordWrite(nowMs);
      return true;
    });
  }

  private async executeQueuedObservation(
    envelope: ApdsV3ShadowProcessorEnvelope,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.isRuntimeReady()) return;

    const identity = resolveApdsV3ShadowPhysicalRequestIdentity(
      envelope.job,
      envelope.vehicleId,
    );
    if (!identity) {
      this.metrics?.recordWriteSuppressed('PHYSICAL_IDENTITY_UNVERIFIED');
      return;
    }
    const nowMs = envelope.pollStartedAtMs;

    const budgetReserved = await this.reserveWriteBudget(nowMs);
    if (!budgetReserved) {
      this.metrics?.recordWriteSuppressed('RATE_LIMIT');
      return;
    }

    let eligible;
    try {
      eligible = await this.eligibility.resolveForBaselinePoll(
        envelope.organizationId,
        envelope.vehicleId,
        envelope.baselineProviderSourceLinkId,
      );
    } catch (err) {
      this.logger.warn(
        `APDS V3 shadow eligibility failed (non-blocking): ${err instanceof Error ? err.message : err}`,
      );
      return;
    }

    if (!eligible.eligible) {
      this.metrics?.recordEligibilityBlocked(eligible.reason);
      return;
    }

    try {
      const causalBundle = await loadApdsV3ShadowCausalEvidence(
        this.prisma,
        {
          organizationId: envelope.organizationId,
          vehicleId: envelope.vehicleId,
          providerSourceLinkId: eligible.providerSourceLinkId,
          decisionAtMs: envelope.pollStartedAtMs,
        },
        signal,
      );

      const activityTier = activityTierFromTrip(envelope.tripDetectionState);
      const mapped = mapApdsV3ShadowPollStartToOfflineInput({
        organizationId: envelope.organizationId,
        vehicleId: envelope.vehicleId,
        providerSourceLinkId: eligible.providerSourceLinkId,
        pollStartedAtMs: envelope.pollStartedAtMs,
        tripDetectionState: envelope.tripDetectionState,
        lastProviderFetchedAtMs: causalBundle.lastProviderFetchedAtMs,
        lastTrustworthyLvSourceMs: envelope.lastTrustworthyLvSourceMs,
        lvProviderTimestampsMs: causalBundle.lvProviderTimestampsMs,
        providerGapOpen: envelope.providerGapOpen,
        r9WakeKnown: envelope.r9WakeKnown,
        deviceReconnectRecent: envelope.deviceReconnectRecent,
        providerReconnectRecent: envelope.providerReconnectRecent,
        vehicleFuelType: envelope.vehicleFuelType,
        activityTierLabel: activityTier,
        p2cObservationId: causalBundle.p2cObservationId,
        p2cObservationAvailableAtMs: causalBundle.p2cObservationAvailableAtMs,
        p2cBoundOrganizationId: causalBundle.p2cBoundOrganizationId,
        p2cBoundVehicleId: causalBundle.p2cBoundVehicleId,
        p2cBoundProviderSourceLinkId: causalBundle.p2cBoundProviderSourceLinkId,
        p2cDataSourceTimestampMs: causalBundle.p2cDataSourceTimestampMs,
        p2cTopLevelAdvanceKnown: causalBundle.p2cTopLevelAdvanceKnown,
        p2cObservationCoverageVerified: causalBundle.p2cObservationCoverageVerified,
        signalProfileRevision: causalBundle.signalProfileRevision,
        signalProfileRevisionEffectiveAtMs:
          causalBundle.signalProfileRevisionEffectiveAtMs,
      });
      mapped.input.lastPhysicalPollMs = causalBundle.lastPhysicalPollMs;
      mapped.input.lastTopLevelProviderSourceMs =
        causalBundle.lastTopLevelProviderSourceMs ?? envelope.lastTopLevelProviderSourceMs;

      const causal = validateCausalEvidenceAtDecision(mapped.input);
      const gate = evaluateConsumerDemandGate(mapped.input.consumerDemandRevision, {
        decisionAtMs: mapped.input.decisionAtMs,
        strictLvProviderSourceMs: mapped.input.lastLvProviderSourceMs,
        topLevelProviderSourceMs: mapped.input.lastTopLevelProviderSourceMs,
        tripFsmState: mapped.input.tripFsmState,
      });

      let v3 = evaluateApdsV3OfflinePolicy(mapped.input);
      const missingReasons = [...causalBundle.missingEvidenceReasons];
      if (!causal.ok) {
        missingReasons.push(causal.reason);
        v3 = {
          policyVersion: v3.policyVersion,
          decision: causal.kind,
          reason: causal.reason,
          expectedInformationGain: null,
          heuristic: false,
          hardSafetyTriggered: false,
        };
      }

      const baseline = resolveBaselinePartialParitySnapshot(mapped.input);
      const outcome = await this.repository.insertPollStartDecision({
        organizationId: envelope.organizationId,
        vehicleId: envelope.vehicleId,
        providerSourceLinkId: eligible.providerSourceLinkId,
        physicalRequestId: identity.physicalRequestId,
        physicalRequestIdentityClass: identity.identityClass,
        correlationAttemptId: identity.enqueueAttemptId,
        decisionAt: new Date(envelope.pollStartedAtMs),
        activationVersion: APDS_V3_SHADOW_ACTIVATION_VERSION,
        policyVersion: ApdsV3ShadowRepository.defaultPolicyVersion(),
        baselineCanonicalDue: baseline.baselineCanonicalDue,
        baselineAuthority: baseline.baselineAuthority,
        baselineAssessable: baseline.baselineAssessable,
        v3Decision: v3.decision,
        v3Reason: v3.reason,
        expectedInformationGain: v3.expectedInformationGain,
        informationGainHeuristic: v3.heuristic,
        consumerDemandFailClosed: gate.blocksAuthoritativeSafeSkip,
        observationQuality: causal.ok ? causal.observationQuality : null,
        observationScope: 'BASELINE_PHYSICAL_POLL_START_ONLY',
        missingEvidenceReasons: missingReasons,
      });

      if (outcome === 'immutable_conflict') {
        this.metrics?.recordWriteSuppressed('IMMUTABLE_CONFLICT');
      }
      if (outcome === 'inserted' || outcome === 'idempotent_replay') {
        this.metrics?.recordDecision(v3.decision);
      }
    } catch (err) {
      if (err instanceof ApdsV3ShadowImmutableConflictError) {
        this.metrics?.recordWriteSuppressed('IMMUTABLE_CONFLICT');
        this.logger.warn(`APDS V3 shadow immutable conflict: ${err.message}`);
        return;
      }
      this.logger.warn(
        `APDS V3 shadow evaluate/persist failed (non-blocking): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
