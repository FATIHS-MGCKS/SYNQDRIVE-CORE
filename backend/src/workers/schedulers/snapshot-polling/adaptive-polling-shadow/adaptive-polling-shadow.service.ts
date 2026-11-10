import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { SnapshotWakeOutcome } from '../../../snapshot-wake/snapshot-wake.types';
import { P25_APD_B2_V1, P25_APD_B4_V1 } from '../adaptive-polling-policy/p25-apd-policy-versions';
import {
  evaluateP25ApdB4V1Core,
  evaluateP25ApdB2V1Core,
} from '../adaptive-polling-policy/p25-apd-policy-engine';
import { buildP25ApdProfileLvLoaderWhere } from '../adaptive-polling-policy/p25-apd-profile-lv-loader';
import { evaluateP25ApdProfile } from '../adaptive-polling-policy/p25-apd-profile-evaluator';
import { applyP25ApdShadowSafetyOverlay } from '../adaptive-polling-policy/p25-apd-shadow-overlay';
import type { P25ApdShadowPrePollInput } from '../adaptive-polling-policy/p25-apd-shadow-decision.types';
import { toApdShadowCanonicalEnqueueOutcome } from './apd-shadow-enqueue-outcome.util';
import type { ApdShadowCanonicalEnqueueOutcome } from './p25-apd-shadow-execution-versions';
import { isApdShadowEnabled } from './adaptive-polling-shadow.config';
import {
  cohortExcludedReasonForRuntime,
  isApdShadowCohortMember,
  parseApdShadowCohortRuntime,
  type ApdShadowCohortExcludedReason,
  type ApdShadowCohortRuntime,
} from './adaptive-polling-shadow-cohort.config';
import { AdaptivePollingShadowMetricsService } from './adaptive-polling-shadow-metrics.service';
import { AdaptivePollingShadowRepository } from './adaptive-polling-shadow.repository';
import { buildApdShadowOpportunityId } from './apd-shadow-opportunity.util';
import { evaluateLvProviderTimestampAdmission } from './p25-apd-shadow-lv-bootstrap.contract';
import { P25_APD_SHADOW_EXECUTION_VERSION_CURRENT } from './p25-apd-shadow-execution-versions';
import { resolveApdShadowTripAuthority } from './apd-shadow-trip-authority';
import { APD_SHADOW_LEGACY_TRIP_EVIDENCE_EXCLUSION_REASON } from './apd-shadow-legacy-trip-evidence-exclusion.contract';
import {
  apdShadowLegacyTripEvidenceExclusionRelievedReconciliationAtMs,
  isVehicleInActiveTripAtMs,
} from './apd-shadow-trip-reconciliation.util';
import type {
  AdaptivePollingShadowActualPollStartContext,
  AdaptivePollingShadowPostPollContext,
  AdaptivePollingShadowPrePollContext,
  AdaptivePollingShadowPrePollResult,
} from './adaptive-polling-shadow.types';
import { ApdShadowActivationEpochService } from './apd-shadow-activation-epoch.service';
import type { ApdShadowActiveEpochView } from './apd-shadow-activation-epoch.types';
import { ApdShadowVsiLvAvailabilityLoader } from './apd-shadow-vsi-lv-availability.loader';
import { ApdShadowBaselinePollEvidenceService } from './apd-shadow-baseline-poll-evidence.service';

@Injectable()
export class AdaptivePollingShadowService {
  private readonly logger = new Logger(AdaptivePollingShadowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: AdaptivePollingShadowRepository,
    private readonly activationEpochService: ApdShadowActivationEpochService,
    private readonly baselinePollEvidence: ApdShadowBaselinePollEvidenceService,
    @Optional() private readonly metrics?: AdaptivePollingShadowMetricsService,
    @Optional() private readonly vsiLvAvailability?: ApdShadowVsiLvAvailabilityLoader,
  ) {
    this.refreshRuntimeMetrics();
  }

  isEnabled(): boolean {
    return isApdShadowEnabled();
  }

  getCohortRuntime(): ApdShadowCohortRuntime {
    return parseApdShadowCohortRuntime();
  }

  isEnabledForVehicle(organizationId: string, vehicleId: string): boolean {
    if (!isApdShadowEnabled()) return false;
    const runtime = this.getCohortRuntime();
    if (runtime.state !== 'READY' || !runtime.config) return false;
    if (!isApdShadowCohortMember(runtime.config, organizationId, vehicleId)) {
      return false;
    }
    if (!runtime.configFingerprintSha256) return false;
    void this.activationEpochService
      .loadActiveEpochForScope(runtime.configFingerprintSha256)
      .catch(() => null);
    return true;
  }

  getCohortVerificationSummary(): {
    cohortState: string;
    cohortMemberCount: number;
    cohortConfigFingerprintSha256: string | null;
  } {
    const runtime = this.getCohortRuntime();
    return {
      cohortState: runtime.state,
      cohortMemberCount: runtime.config?.members.length ?? 0,
      cohortConfigFingerprintSha256: runtime.configFingerprintSha256,
    };
  }

  private refreshRuntimeMetrics(): void {
    const runtime = this.getCohortRuntime();
    this.metrics?.setEnabled(isApdShadowEnabled() && runtime.state === 'READY');
    if (runtime.configFingerprintSha256) {
      this.metrics?.setCohortConfigFingerprint(runtime.configFingerprintSha256);
    }
    if (runtime.config) {
      this.metrics?.setCohortMemberCount(runtime.config.members.length);
    }
  }

  private recordCohortGateBlocked(reason: ApdShadowCohortExcludedReason): void {
    this.metrics?.recordCohortExcluded(reason);
  }

  private assertCohortVehicleAllowed(
    organizationId: string,
    vehicleId: string,
  ): boolean {
    if (!isApdShadowEnabled()) return false;
    const runtime = this.getCohortRuntime();
    if (runtime.state !== 'READY' || !runtime.config) {
      const reason = cohortExcludedReasonForRuntime(runtime);
      if (reason) this.recordCohortGateBlocked(reason);
      return false;
    }
    if (!isApdShadowCohortMember(runtime.config, organizationId, vehicleId)) {
      this.recordCohortGateBlocked('NOT_ALLOWLISTED');
      return false;
    }
    return true;
  }

  private recordEpochGateBlocked(reason: string): void {
    this.metrics?.recordEpochExcluded(reason);
  }

  private async assertActiveEpochAllowsDecision(
    decisionAtMs: number,
    vehicleOrganizationId: string,
  ): Promise<ApdShadowActiveEpochView | null> {
    if (!isApdShadowEnabled()) {
      return null;
    }
    const runtime = this.getCohortRuntime();
    const fingerprint = runtime.configFingerprintSha256;
    if (!fingerprint) {
      this.recordEpochGateBlocked('EPOCH_MISSING');
      return null;
    }
    try {
      const activeEpoch =
        await this.activationEpochService.loadActiveEpochForScopeAuthoritative(
          fingerprint,
          { updatePositiveCache: true },
        );
      const cohortOrgIds = runtime.config
        ? [...new Set(runtime.config.members.map((m) => m.organizationId))]
        : undefined;
      const gate = this.activationEpochService.evaluateShadowEpochGate({
        cohortConfigFingerprintSha256: fingerprint,
        decisionAtMs,
        activeEpoch,
        vehicleOrganizationId,
        cohortOrganizationIds: cohortOrgIds,
      });
      if (!gate.allowed) {
        this.recordEpochGateBlocked(gate.reason);
        return null;
      }
      return gate.epoch;
    } catch {
      this.recordEpochGateBlocked('EPOCH_LOOKUP_FAILED');
      return null;
    }
  }

  /**
   * Scheduler-side hook — intentionally non-authoritative (APDS-9.2B).
   * Scientific policy rows are created only on actual baseline poll start in the processor.
   */
  async observePrePoll(
    _ctx: AdaptivePollingShadowPrePollContext,
  ): Promise<AdaptivePollingShadowPrePollResult | null> {
    return null;
  }

  async observeActualBaselinePollStart(
    ctx: AdaptivePollingShadowActualPollStartContext,
  ): Promise<string | null> {
    if (!this.assertCohortVehicleAllowed(ctx.organizationId, ctx.vehicleId)) {
      return null;
    }
    const epoch = await this.assertActiveEpochAllowsDecision(
      ctx.pollStartedAtMs,
      ctx.organizationId,
    );
    if (!epoch) return null;
    try {
      return await this.observeActualBaselinePollStartInner(ctx, epoch);
    } catch (err) {
      this.metrics?.recordFailure('pre_poll');
      this.logger.warn(
        `APD shadow actual poll-start failed (non-blocking): ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  async observeEnqueueOutcome(input: {
    organizationId: string;
    vehicleId: string;
    opportunityId: string;
    wakeOutcome: SnapshotWakeOutcome;
    observedAtMs: number;
  }): Promise<void> {
    await this.observeCanonicalEnqueueOutcome({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      opportunityId: input.opportunityId,
      enqueueOutcome: toApdShadowCanonicalEnqueueOutcome(input.wakeOutcome),
      observedAtMs: input.observedAtMs,
    });
  }

  async observeCanonicalEnqueueOutcome(input: {
    organizationId: string;
    vehicleId: string;
    opportunityId: string;
    enqueueOutcome: ApdShadowCanonicalEnqueueOutcome;
    observedAtMs: number;
  }): Promise<void> {
    if (!this.assertCohortVehicleAllowed(input.organizationId, input.vehicleId)) {
      return;
    }
    const epoch = await this.assertActiveEpochAllowsDecision(
      input.observedAtMs,
      input.organizationId,
    );
    if (!epoch) return;
    try {
      await this.repository.patchEnqueueOutcome({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        opportunityId: input.opportunityId,
        enqueueOutcome: input.enqueueOutcome,
        enqueueOutcomeAt: new Date(input.observedAtMs),
      });
    } catch (err) {
      this.metrics?.recordFailure('enqueue_outcome');
      this.logger.warn(
        `APD shadow enqueue-outcome patch failed (non-blocking): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async observePostPoll(ctx: AdaptivePollingShadowPostPollContext): Promise<void> {
    if (!this.assertCohortVehicleAllowed(ctx.organizationId, ctx.vehicleId)) {
      return;
    }
    const decisionAtMs = ctx.pollCompletedAtMs ?? ctx.pollStartedAtMs;
    const epoch = await this.assertActiveEpochAllowsDecision(
      decisionAtMs,
      ctx.organizationId,
    );
    if (!epoch) return;
    try {
      await this.observePostPollInner(ctx, epoch);
    } catch (err) {
      this.metrics?.recordFailure('post_poll');
      this.logger.warn(
        `APD shadow post-poll failed (non-blocking): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async observePollFailure(input: {
    organizationId: string;
    vehicleId: string;
    opportunityId: string;
    realPollId: string;
    realPollStartedAt: Date;
  }): Promise<void> {
    if (!this.assertCohortVehicleAllowed(input.organizationId, input.vehicleId)) {
      return;
    }
    const epoch = await this.assertActiveEpochAllowsDecision(
      input.realPollStartedAt.getTime(),
      input.organizationId,
    );
    if (!epoch) return;
    try {
      await this.repository.updateFailedPollOutcome({
        ...input,
        activationEpochId: epoch.id,
      });
    } catch (err) {
      this.metrics?.recordFailure('post_poll');
      this.logger.warn(
        `APD shadow failure correlation failed (non-blocking): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async observeActualBaselinePollStartInner(
    ctx: AdaptivePollingShadowActualPollStartContext,
    activeEpoch: ApdShadowActiveEpochView,
  ): Promise<string> {
    const decisionAtMs = ctx.pollStartedAtMs;
    const inTripPerVehicleTrips = await isVehicleInActiveTripAtMs(
      this.prisma,
      ctx.vehicleId,
      decisionAtMs,
    );
    const legacyTripEvidenceExclusionRelieved =
      await apdShadowLegacyTripEvidenceExclusionRelievedReconciliationAtMs(
        this.prisma,
        ctx.vehicleId,
        decisionAtMs,
      );
    if (legacyTripEvidenceExclusionRelieved) {
      this.metrics?.recordLegacyTripEvidenceExclusion(
        APD_SHADOW_LEGACY_TRIP_EVIDENCE_EXCLUSION_REASON,
      );
      this.logger.log(
        JSON.stringify({
          event: 'APD_SHADOW_LEGACY_TRIP_EVIDENCE_EXCLUDED',
          vehicleId: ctx.vehicleId,
          organizationId: ctx.organizationId,
          decisionAtMs,
          reason: APD_SHADOW_LEGACY_TRIP_EVIDENCE_EXCLUSION_REASON,
        }),
      );
    }
    const reconciliation = !inTripPerVehicleTrips;
    const tripAuthority = resolveApdShadowTripAuthority({
      inTripPerVehicleTripsAtDecision: inTripPerVehicleTrips,
      tripDetectionState: ctx.tripDetectionState,
    });

    const opportunityId = buildApdShadowOpportunityId({
      organizationId: ctx.organizationId,
      vehicleId: ctx.vehicleId,
      decisionAtMs,
      origin: ctx.origin,
    });

    const [lvTimestamps, vehicleFuel] = await Promise.all([
      this.loadRecentLvProviderTimestampsMs(ctx.vehicleId, decisionAtMs),
      this.prisma.vehicle.findUnique({
        where: { id: ctx.vehicleId },
        select: { fuelType: true },
      }),
    ]);

    const profile = evaluateP25ApdProfile({
      nowMs: decisionAtMs,
      lvProviderTimestampsMs: lvTimestamps,
      vehicleFuelType: vehicleFuel?.fuelType ?? null,
      providerGapOpen: ctx.providerGapOpen,
      tripActive: tripAuthority.profileTripInvalidationActive,
      r9WakeRecent: ctx.r9WakeKnown,
      deviceReconnectRecent: ctx.deviceReconnectRecent,
      providerReconnectRecent: ctx.providerReconnectRecent,
      earlyAdvanceDetected: false,
      lateAdvanceDetected: false,
      phaseDriftDetected: false,
      capabilityChanged: false,
    });

    if (profile.invalidated && profile.invalidationReason) {
      this.metrics?.recordProfileInvalidated(profile.invalidationReason);
    }

    const medianIntervalMs = profile.medianCadenceMs;

    const overlayBase = {
      r9WakeKnown: ctx.r9WakeKnown,
      profileInvalidated: profile.invalidated,
      invalidationReason: profile.invalidationReason,
      providerGapOpen: ctx.providerGapOpen,
      reconnectPending: ctx.deviceReconnectRecent || ctx.providerReconnectRecent,
      tripAuthorityDisagreement: tripAuthority.tripAuthorityDisagreement,
    };

    const policies = [
      { version: P25_APD_B2_V1, evaluate: evaluateP25ApdB2V1Core },
      { version: P25_APD_B4_V1, evaluate: evaluateP25ApdB4V1Core },
    ] as const;

    for (const p of policies) {
      const lastAllowed = await this.repository.resolveLastAllowedPollStartMs({
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId,
        policyVersion: p.version,
        activationEpochId: activeEpoch.id,
      });
      const simulatedLastLv = await this.repository.resolveSimulatedLastLvSourceMs({
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId,
        policyVersion: p.version,
        activationEpochId: activeEpoch.id,
      });

      const baseInput: P25ApdShadowPrePollInput = {
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId,
        decisionAtMs,
        reconciliation,
        lastTrustworthyLvSourceMs: simulatedLastLv,
        lastProviderFetchedAtMs: ctx.lastProviderFetchedAtMs,
        profileVersion: profile.profileVersion,
        medianIntervalMs,
        tripFsmActive: tripAuthority.conservativeTripSafetyLatch,
        providerGapOpen: ctx.providerGapOpen,
        r9WakePending: ctx.r9WakeKnown,
        profileClass: profile.profileClass,
        lastAllowedReconciliationPollMs: lastAllowed,
      };

      const overlay = {
        ...overlayBase,
        sourceTimestampMissing: simulatedLastLv == null,
      };

      const core = p.evaluate(baseInput);
      const decision = applyP25ApdShadowSafetyOverlay(core, overlay);
      this.metrics?.recordDecision(p.version, decision.decision, decision.reason);

      await this.repository.upsertPrePollDecision({
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId,
        opportunityId,
        decisionAt: new Date(decisionAtMs),
        activationEpochId: activeEpoch.id,
        policyVersion: p.version,
        profileVersion: profile.profileVersion,
        profileClass: profile.profileClass,
        decision: decision.decision,
        reason: decision.reason,
        shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_VERSION_CURRENT,
        reconciliation,
        lastLvSourceAt: simulatedLastLv != null ? new Date(simulatedLastLv) : null,
        lastProviderFetchedAt: ctx.lastProviderFetchedAtMs
          ? new Date(ctx.lastProviderFetchedAtMs)
          : null,
        expectedWindowStart: decision.expectedWindowStartMs
          ? new Date(decision.expectedWindowStartMs)
          : null,
        expectedWindowEnd: decision.expectedWindowEndMs
          ? new Date(decision.expectedWindowEndMs)
          : null,
        providerGapState: ctx.providerGapOpen ? 'OPEN' : 'CLOSED',
        connectivityState: ctx.connectivityState,
        wakeCorrelationId: ctx.wakeCorrelationId,
      });
    }

    void this.observeParallelVsiLvAvailability({
      organizationId: ctx.organizationId,
      vehicleId: ctx.vehicleId,
      decisionAtMs,
      opportunityId,
      profileEligibleGapCount: profile.sampleCount,
      baselineProfileInvalidationReason: profile.invalidationReason,
    });

    return opportunityId;
  }

  private async loadRecentLvProviderTimestampsMs(
    vehicleId: string,
    decisionAtMs: number,
  ): Promise<number[]> {
    const rows = await this.prisma.batteryMeasurement.findMany({
      where: buildP25ApdProfileLvLoaderWhere(vehicleId, decisionAtMs),
      orderBy: { providerTimestamp: 'desc' },
      take: 24,
      select: { providerTimestamp: true },
    });
    return rows
      .map((r) => r.providerTimestamp?.getTime())
      .filter((t): t is number => t != null)
      .sort((a, b) => a - b);
  }

  private async observePostPollInner(
    ctx: AdaptivePollingShadowPostPollContext,
    activeEpoch: ApdShadowActiveEpochView,
  ): Promise<void> {
    if (!ctx.realPollId) {
      throw new Error('realPollId required for successful APD post-poll correlation');
    }

    await this.baselinePollEvidence.reconcilePriorSkipDiscoveryDelayFromObservingPoll({
      organizationId: ctx.organizationId,
      vehicleId: ctx.vehicleId,
      activationEpochId: activeEpoch.id,
      observingPollId: ctx.realPollId,
      observingPollStartedAtMs: ctx.pollStartedAtMs,
      observingPollCompletedAtMs: ctx.pollCompletedAtMs,
    });

    const visibleLvAt =
      ctx.realPollVisibleLvSourceAtMs != null
        ? new Date(ctx.realPollVisibleLvSourceAtMs)
        : null;

    let informativeLvRecordedForPoll = false;
    let informativeTopRecordedForPoll = false;

    for (const policyVersion of [P25_APD_B2_V1, P25_APD_B4_V1]) {
      const prePoll = await this.repository.findPrePollDecisionForOpportunity({
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId,
        opportunityId: ctx.opportunityId,
        policyVersion,
      });
      const prePollDecision = prePoll?.decision ?? 'MISSING_PRE_POLL_ROW';

      const existingOutcome =
        await this.repository.findExistingObservationalOutcomeForOpportunity({
          organizationId: ctx.organizationId,
          vehicleId: ctx.vehicleId,
          opportunityId: ctx.opportunityId,
          policyVersion,
        });

      const observational = this.baselinePollEvidence.buildObservationalPatch({
        ctx,
        existing: existingOutcome,
      });

      const mergedObservational = {
        ...observational,
        newLvSourceObserved:
          existingOutcome?.newLvSourceObserved === true ||
          observational.newLvSourceObserved,
        newTopLevelSourceObserved:
          existingOutcome?.newTopLevelSourceObserved === true ||
          observational.newTopLevelSourceObserved,
      };

      const admission = prePoll
        ? evaluateLvProviderTimestampAdmission({
            visibleLvProviderTimestampMs: ctx.realPollVisibleLvSourceAtMs,
            pollStartedAtMs: ctx.pollStartedAtMs,
            pollCompletedAtMs: ctx.pollCompletedAtMs,
            reconciliation: prePoll.reconciliation,
            prePollDecision: prePoll.decision,
          })
        : { admit: false as const, reason: 'MISSING_PRE_POLL_ROW' };

      const persistVisibleLv =
        admission.admit && visibleLvAt != null ? visibleLvAt : null;

      const wantsLvTransition =
        mergedObservational.newLvSourceObserved &&
        !existingOutcome?.newLvSourceObserved;
      const wantsTopTransition =
        mergedObservational.newTopLevelSourceObserved &&
        !existingOutcome?.newTopLevelSourceObserved;

      const persistCount = await this.repository.updateSuccessfulPollOutcome({
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId,
        opportunityId: ctx.opportunityId,
        policyVersion,
        activationEpochId: activeEpoch.id,
        realPollId: ctx.realPollId,
        realPollStartedAt: new Date(ctx.pollStartedAtMs),
        realPollCompletedAt: new Date(ctx.pollCompletedAtMs),
        realPollVisibleLvSourceAt: persistVisibleLv,
        patch: {
          ...mergedObservational,
          newLvSourceObserved: wantsLvTransition
            ? (existingOutcome?.newLvSourceObserved ?? false)
            : mergedObservational.newLvSourceObserved,
          newTopLevelSourceObserved: wantsTopTransition
            ? (existingOutcome?.newTopLevelSourceObserved ?? false)
            : mergedObservational.newTopLevelSourceObserved,
          legacyAssessmentImpact: 'NONE',
          legacyPublicationImpact: 'NONE',
          legacyCustomerImpact: 'NONE',
        },
      });

      if (persistCount !== 1) {
        continue;
      }

      let lvTransitioned = false;
      let topTransitioned = false;

      if (wantsLvTransition) {
        lvTransitioned =
          (await this.repository.promoteNewLvSourceObservedIfAbsent({
            organizationId: ctx.organizationId,
            vehicleId: ctx.vehicleId,
            opportunityId: ctx.opportunityId,
            policyVersion,
            activationEpochId: activeEpoch.id,
            newLvSourceAt: mergedObservational.newLvSourceAt,
          })) === 1;
      }

      if (wantsTopTransition) {
        topTransitioned =
          (await this.repository.promoteNewTopLevelSourceObservedIfAbsent({
            organizationId: ctx.organizationId,
            vehicleId: ctx.vehicleId,
            opportunityId: ctx.opportunityId,
            policyVersion,
            activationEpochId: activeEpoch.id,
          })) === 1;
      }

      this.baselinePollEvidence.recordSkippedInformativeAfterDurableTransition({
        policyVersion,
        prePollDecision,
        lvTransitioned,
        topLevelTransitioned: topTransitioned,
      });

      if (lvTransitioned && !informativeLvRecordedForPoll) {
        this.metrics?.recordInformativeRealPoll('lv');
        informativeLvRecordedForPoll = true;
      }
      if (topTransitioned && !informativeTopRecordedForPoll) {
        this.metrics?.recordInformativeRealPoll('top_level');
        informativeTopRecordedForPoll = true;
      }
    }
  }

  /**
   * Parallel observability only — scheduled after B2/B4 pre-poll rows persist.
   * Failures must not block baseline shadow persistence or poll-start return.
   */
  private async observeParallelVsiLvAvailability(input: {
    organizationId: string;
    vehicleId: string;
    decisionAtMs: number;
    opportunityId: string;
    profileEligibleGapCount: number;
    baselineProfileInvalidationReason: string | null;
  }): Promise<void> {
    if (!this.vsiLvAvailability) {
      return;
    }
    try {
      const lvAvailability = await this.vsiLvAvailability.projectForDecision({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        decisionAtMs: input.decisionAtMs,
        profileEligibleGapCount: input.profileEligibleGapCount,
        baselineProfileInvalidationReason: input.baselineProfileInvalidationReason,
      });
      this.metrics?.recordShadowLvAvailability(lvAvailability.classification);
      if (lvAvailability.signalAvailabilityLimitsProfileCadence) {
        this.metrics?.recordShadowLvSignalAvailabilityCadenceParity();
      }
      this.logger.debug(
        JSON.stringify({
          event: 'APD_SHADOW_VSI_LV_AVAILABILITY',
          vehicleId: input.vehicleId,
          organizationId: input.organizationId,
          opportunityId: input.opportunityId,
          classification: lvAvailability.classification,
          providerSourceLinkId: lvAvailability.providerSourceLinkId,
          profileLvLoaderVisibleMeasurementCount:
            lvAvailability.profileLvLoaderVisibleMeasurementCount,
          profileEligibleGapCount: lvAvailability.profileEligibleGapCount,
          baselineProfileInvalidationReason: lvAvailability.baselineProfileInvalidationReason,
          signalAvailabilityLimitsProfileCadence:
            lvAvailability.signalAvailabilityLimitsProfileCadence,
          reasonCodes: lvAvailability.reasonCodes,
        }),
      );
    } catch (err) {
      this.metrics?.recordFailure('vsi_lv_availability');
      this.metrics?.recordShadowVsiLvAvailabilityFailure(
        err instanceof Error ? err.name : 'UNKNOWN',
      );
      this.logger.warn(
        `APD shadow VSI LV availability failed (non-blocking): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
