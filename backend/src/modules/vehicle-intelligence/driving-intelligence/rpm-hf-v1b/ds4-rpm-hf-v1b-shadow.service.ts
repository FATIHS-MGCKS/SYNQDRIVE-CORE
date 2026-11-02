import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { Ds4RpmHfV1aTripInputService } from '../rpm-hf-v1a/ds4-rpm-hf-v1a-trip-input.service';
import {
  DS4_RPM_HF_V1B_TUNING,
  isDs4RpmHfV1bWorkerRunnable,
  parseDs4RpmHfV1bRuntimeConfig,
  type Ds4RpmHfV1bRuntimeConfig,
} from './ds4-rpm-hf-v1b.config';
import { evaluateDs4RpmHfV1bEnablement } from './ds4-rpm-hf-v1b-control-plane';
import { Ds4RpmHfV1bOutboxRepository } from './ds4-rpm-hf-v1b-outbox.repository';
import { processDs4RpmHfV1bShadowTrip } from './ds4-rpm-hf-v1b-processor';
import { processDs4RpmHfV1bShadowTripTierAware } from './ds4-rpm-hf-v1b-tier-processor';
import {
  DS4_RPM_HF_V1B_ENGINE_VERSION,
  DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE,
} from './ds4-rpm-hf-v1b.contract';
import { computeDs4RpmHfV1bInputFingerprint, computeDs4RpmHfV1bTierAwareInputFingerprint } from './ds4-rpm-hf-v1b-input-fingerprint';
import { computeDs4RpmHfV1bDeferNextAttemptAt } from './ds4-rpm-hf-v1b-readiness-schedule';
import { isTripInputEligibleForAutomaticRevision } from './ds4-rpm-hf-v1b-revision-eligibility';
import { isTripInputEligibleForTierAwareAutomaticRevision } from './ds4-rpm-hf-v1b-revision-eligibility';
import { Ds4RpmHfV1bRunRepository } from './ds4-rpm-hf-v1b-run.repository';
import { parseDs4RpmRefIntelV1V1bAttachEnabled } from '../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1-v1b-attach.config';
import { applyRpmReferenceIntelligenceV1V1bShadowAttachment } from '../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1-v1b-shadow-attach';

export type Ds4RpmHfV1bPassResult = {
  configured: boolean;
  discovered: number;
  claimed: number;
  succeeded: number;
  deferred: number;
  terminal: number;
  failedRetryable: number;
};

/**
 * Integration audit (2026-10-28):
 * - HF mirror: TripBehaviorEnrichmentService → HfMirrorService → ClickHouse HF points (HF_MIRROR_ENABLED).
 * - VSI RPM cadence: refreshVsiRpmCadenceAfterTrip after HF points proven (same enrichment path).
 * - V1B trigger: bounded outbox discovery on COMPLETED trips (enabledSince + allowlists), not a new trip FSM hook.
 * - Readiness: V1A buildTripInput re-reads rolling VSI trip classification + HF; defer until admission ENABLED.
 * - Leader isolation: dedicated scheduler job + SchedulerLeaderGuardService (separate from motion-core shadow).
 */
@Injectable()
export class Ds4RpmHfV1bShadowService {
  private readonly logger = new Logger(Ds4RpmHfV1bShadowService.name);
  private readonly runtimeConfig: Ds4RpmHfV1bRuntimeConfig;
  private readonly outbox: Ds4RpmHfV1bOutboxRepository;
  private readonly runs: Ds4RpmHfV1bRunRepository;
  private readonly refIntelV1V1bAttachEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripInputService: Ds4RpmHfV1aTripInputService,
  ) {
    this.runtimeConfig = parseDs4RpmHfV1bRuntimeConfig(process.env);
    this.refIntelV1V1bAttachEnabled = parseDs4RpmRefIntelV1V1bAttachEnabled(process.env);
    this.outbox = new Ds4RpmHfV1bOutboxRepository(prisma as unknown as PrismaClient);
    this.runs = new Ds4RpmHfV1bRunRepository(prisma as unknown as PrismaClient);
  }

  isConfigured(): boolean {
    return isDs4RpmHfV1bWorkerRunnable(this.runtimeConfig);
  }

  getRuntimeConfig(): Ds4RpmHfV1bRuntimeConfig {
    return this.runtimeConfig;
  }

  async runPass(now = new Date()): Promise<Ds4RpmHfV1bPassResult> {
    const empty: Ds4RpmHfV1bPassResult = {
      configured: false,
      discovered: 0,
      claimed: 0,
      succeeded: 0,
      deferred: 0,
      terminal: 0,
      failedRetryable: 0,
    };
    if (!this.isConfigured() || !this.runtimeConfig.enabledSince) return empty;

    const cp = this.runtimeConfig.controlPlane;
    const discovered = await this.outbox.discoverEligible({
      enabledSince: this.runtimeConfig.enabledSince,
      organizationAllowlist: [...cp.organizationAllowlist],
      vehicleAllowlist: [...cp.vehicleAllowlist],
      limit: this.runtimeConfig.batchLimit * 3,
      now,
    });

    await this.probeBoundedInputRevisions(now, DS4_RPM_HF_V1B_ENGINE_VERSION, computeDs4RpmHfV1bInputFingerprint, isTripInputEligibleForAutomaticRevision);
    await this.probeBoundedInputRevisions(
      now,
      DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE,
      computeDs4RpmHfV1bTierAwareInputFingerprint,
      isTripInputEligibleForTierAwareAutomaticRevision,
    );

    const claimed = await this.outbox.claimBatch(this.runtimeConfig.batchLimit, now);
    const result = { ...empty, configured: true, discovered, claimed: claimed.length };

    for (const row of claimed) {
      try {
        const outcome = await this.processClaimedRow(row, now);
        if (outcome === 'SUCCEEDED') result.succeeded += 1;
        else if (outcome === 'DEFER') result.deferred += 1;
        else if (outcome === 'TERMINAL') result.terminal += 1;
        else result.failedRetryable += 1;
      } catch (error) {
        const next = new Date(now.getTime() + DS4_RPM_HF_V1B_TUNING.baseRetryDelayMs);
        await this.outbox.markFailedRetryable(row.outboxId, row.claimToken, 'PROCESSING_ERROR', next);
        result.failedRetryable += 1;
        this.logger.warn(
          `rpm hf v1b tick error tripId=${row.tripId}: ${
            error instanceof Error ? error.message.slice(0, 200) : 'unknown'
          }`,
        );
      }
    }
    return result;
  }

  private async processClaimedRow(
    row: {
      outboxId: string;
      organizationId: string;
      tripId: string;
      vehicleId: string;
      engineVersion: string;
      claimToken: string;
      attemptCount: number;
    },
    now: Date,
  ): Promise<'SUCCEEDED' | 'DEFER' | 'TERMINAL' | 'FAILED'> {
    if (row.attemptCount > DS4_RPM_HF_V1B_TUNING.maxProcessingAttempts) {
      await this.outbox.markSkipped(row.outboxId, row.claimToken, 'ATTEMPT_BUDGET_EXCEEDED');
      return 'FAILED';
    }

    const leaseOk = await this.outbox.renewClaimLease(row.outboxId, row.claimToken, now);
    if (!leaseOk) return 'FAILED';

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: row.vehicleId, organizationId: row.organizationId },
      select: {
        organizationId: true,
        idleRpm: true,
        maxRpm: true,
        registrationIdentityProvenance: true,
      },
    });
    const enable = evaluateDs4RpmHfV1bEnablement(this.runtimeConfig.controlPlane, {
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      vehicleOrganizationId: vehicle?.organizationId ?? null,
    });
    if (!enable.enabled) {
      await this.outbox.markSkipped(row.outboxId, row.claimToken, enable.reason ?? 'INELIGIBLE');
      return 'TERMINAL';
    }

    const existingFp = await this.runs.findSucceededFingerprint({
      organizationId: row.organizationId,
      tripId: row.tripId,
      engineVersion: row.engineVersion,
    });

    const tripInput = await this.tripInputService.buildTripInput({
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      tripId: row.tripId,
    });

    const isTierAware = row.engineVersion === DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE;
    const processed = isTierAware
      ? processDs4RpmHfV1bShadowTripTierAware({
          tripInput,
          attemptCount: row.attemptCount,
          computedAt: now,
          existingSucceededFingerprint: existingFp,
        })
      : processDs4RpmHfV1bShadowTrip({
          tripInput,
          attemptCount: row.attemptCount,
          computedAt: now,
          existingSucceededFingerprint: existingFp,
        });

    if (processed.kind === 'IDEMPOTENT') {
      await this.outbox.markSucceeded(row.outboxId, row.claimToken, processed.fingerprint);
      return 'SUCCEEDED';
    }

    if (processed.kind === 'DEFER') {
      const nextAt =
        computeDs4RpmHfV1bDeferNextAttemptAt({
          tripEndIso: tripInput.tripEndIso,
          attemptCount: row.attemptCount,
          nowMs: now.getTime(),
        }) ?? new Date(now.getTime() + DS4_RPM_HF_V1B_TUNING.baseRetryDelayMs);
      await this.outbox.markFailedRetryable(
        row.outboxId,
        row.claimToken,
        processed.deferReasonCode,
        nextAt,
      );
      return 'DEFER';
    }

    if (processed.kind === 'SUCCEEDED') {
      const runId = randomUUID();
      const summary =
        vehicle != null
          ? applyRpmReferenceIntelligenceV1V1bShadowAttachment({
              summary: processed.result,
              tripInput,
              vehicle: {
                organizationId: vehicle.organizationId,
                idleRpm: vehicle.idleRpm != null ? Number(vehicle.idleRpm) : null,
                maxRpm: vehicle.maxRpm != null ? Number(vehicle.maxRpm) : null,
                registrationIdentityProvenance: vehicle.registrationIdentityProvenance,
              },
              runId,
              inputFingerprint: processed.fingerprint,
              computedAt: now,
              attachEnabled: this.refIntelV1V1bAttachEnabled,
              logger: this.logger,
            })
          : processed.result;
      const insert = await this.runs.insertRunWithActiveClaim({
        outboxId: row.outboxId,
        claimToken: row.claimToken,
        runId,
        organizationId: row.organizationId,
        vehicleId: row.vehicleId,
        tripId: row.tripId,
        engineVersion: processed.result.engineVersion,
        inputFingerprint: processed.fingerprint,
        shadowStatus: 'SUCCEEDED',
        summary,
        computedAt: now,
        now,
      });
      if (insert.outcome === 'claim_lost') {
        return 'FAILED';
      }
      if (insert.outcome === 'sql_error') {
        await this.outbox.markFailedRetryable(
          row.outboxId,
          row.claimToken,
          insert.code,
          new Date(now.getTime() + DS4_RPM_HF_V1B_TUNING.baseRetryDelayMs),
        );
        return 'FAILED';
      }
      await this.outbox.markSucceeded(row.outboxId, row.claimToken, processed.fingerprint);
      return 'SUCCEEDED';
    }

    if (processed.result) {
      await this.runs.insertRunWithActiveClaim({
        outboxId: row.outboxId,
        claimToken: row.claimToken,
        runId: randomUUID(),
        organizationId: row.organizationId,
        vehicleId: row.vehicleId,
        tripId: row.tripId,
        engineVersion: processed.result.engineVersion,
        inputFingerprint: processed.fingerprint,
        shadowStatus: processed.persistStatus,
        summary: processed.result,
        computedAt: now,
        now,
      });
    }
    await this.outbox.markSkipped(row.outboxId, row.claimToken, processed.rejectionReasonCode);
    return 'TERMINAL';
  }

  private async probeBoundedInputRevisions(
    now: Date,
    engineVersion: string,
    fingerprintFn: (tripInput: import('../rpm-hf-v1a/ds4-rpm-hf-v1a.contract').Ds4RpmHfV1aTripInputV1) => string,
    eligibleFn: (tripInput: import('../rpm-hf-v1a/ds4-rpm-hf-v1a.contract').Ds4RpmHfV1aTripInputV1) => boolean,
  ): Promise<void> {
    const cp = this.runtimeConfig.controlPlane;
    const probes = await this.outbox.listSucceededForRevisionProbe({
      organizationAllowlist: [...cp.organizationAllowlist],
      vehicleAllowlist: [...cp.vehicleAllowlist],
      limit: DS4_RPM_HF_V1B_TUNING.revisionProbeLimitPerPass,
      engineVersion,
    });
    for (const row of probes) {
      try {
        await this.outbox.touchRevisionProbe(row.outboxId, now);
        const tripInput = await this.tripInputService.buildTripInput({
          organizationId: row.organizationId,
          vehicleId: row.vehicleId,
          tripId: row.tripId,
        });
        if (!eligibleFn(tripInput)) {
          continue;
        }
        const liveFingerprint = fingerprintFn(tripInput);
        if (row.succeededInputFingerprint === liveFingerprint) continue;
        await this.outbox.reopenForInputRevision(row.outboxId, now);
      } catch (error) {
        this.logger.warn(
          `rpm hf v1b revision probe skipped tripId=${row.tripId} engine=${engineVersion}: ${
            error instanceof Error ? error.message.slice(0, 120) : 'unknown'
          }`,
        );
      }
    }
  }
}
