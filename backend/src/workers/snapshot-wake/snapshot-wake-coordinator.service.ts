import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TripDetectionState, VehicleStatus } from '@prisma/client';

import { QUEUE_NAMES } from '../queues/queue-names';
import { PrismaService } from '@shared/database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { runTripObservabilitySafely } from '@modules/vehicle-intelligence/trips/trip-fsm-observability-safe.util';
import {
  loadSnapshotPollingTierConfig,
  type SnapshotPollingTierConfig,
} from '../schedulers/snapshot-polling/snapshot-polling-tier.config';
import {
  buildSnapshotWakeContext,
  mergePendingWakeContext,
  parseVehicleIdFromSuccessorRedisKey,
  pendingWakeRedisKey,
  resolveEffectiveWakeOrigin,
  snapshotJobId,
  snapshotWakeHandoffJobId,
  successorWakeRedisKey,
  wakeAlreadyCoveredBySnapshot,
  wakeProbeDelayMs,
  shouldRequestWakeProbe,
} from './snapshot-wake.util';
import {
  MAX_SUCCESSOR_HANDOFF_RECOVERY_PER_TICK,
  SUCCESSOR_HANDOFF_RECOVERY_KEY_PATTERN,
  SUCCESSOR_HANDOFF_RECOVERY_SCAN_COUNT,
  type SuccessorHandoffRecoveryOutcome,
  type SuccessorHandoffRecoveryContinuation,
  type SuccessorHandoffRecoveryTickResult,
  INITIAL_SUCCESSOR_HANDOFF_RECOVERY_CONTINUATION,
} from './snapshot-wake-recovery.util';
import {
  enqueueStableSnapshotJob,
  coalesceNeedsPostTerminalSuccessor,
  isQueuedCoalesce,
  isActiveQueueState,
  isQueuedQueueState,
  type SnapshotStableEnqueueOutcome,
} from './snapshot-wake-queue.util';
import {
  buildApdShadowEnqueueEvidence,
  stableEnqueueOutcomeToCanonical,
} from './apd-shadow-enqueue-evidence.util';
import { stageApdShadowEnqueueEvidence } from './apd-shadow-enqueue-evidence.redis-store';
import {
  classifyWakeContinuation,
  mayScheduleWakeSuccessor,
  shouldRetireObsoleteWake,
  type WakeContinuationClass,
} from './snapshot-wake-continuation.util';
import type { DurableReadResult } from './snapshot-wake-durable-read.types';
import {
  MAX_RETIREMENT_RECONCILE_ITERATIONS,
  UNKNOWN_CONTINUATION_RETRY_MS,
  type DurableRetirementOutcome,
  type UnknownContinuationRetryOutcome,
} from './snapshot-wake-retirement.util';
import { SnapshotWakeHandoffDeferError } from './snapshot-wake-handoff-defer.error';
import {
  ACK_PENDING_WAKE_SCRIPT,
  ACK_SUCCESSOR_HANDOFF_SCRIPT,
  ATOMIC_PENDING_WAKE_MERGE_SCRIPT,
  ATOMIC_SUCCESSOR_HANDOFF_MERGE_SCRIPT,
} from './snapshot-wake-redis.scripts';
import type {
  ClaimedPendingSnapshotWake,
  DimoSnapshotJobData,
  PendingSnapshotWakeRecord,
  PendingWakePersistResult,
  RequestSnapshotInput,
  SnapshotWakeContext,
  SnapshotWakeOutcome,
  CoalescedWakeConsumerOutcome,
  SuccessorHandoffPersistResult,
  SuccessorSnapshotWakeRecord,
} from './snapshot-wake.types';

const PENDING_WAKE_TTL_SEC = 3600;
const SUCCESSOR_WAKE_TTL_SEC = 3600;

const HANDOFF_JOB_OPTIONS = {
  removeOnComplete: true,
  removeOnFail: { count: 50, age: 3600 },
  attempts: 100,
  backoff: { type: 'fixed' as const, delay: 1000 },
};

export interface AfterSnapshotJobParams {
  vehicleId: string;
  dimoTokenId: number;
  jobData: DimoSnapshotJobData;
  claimedPendingWake: ClaimedPendingSnapshotWake | null;
  effectiveWakeContext: SnapshotWakeContext | undefined;
  snapshotSourceTimestamp: Date | null;
  staleMonotonicSkipped: boolean;
  tripStartEvalError: boolean;
  possibleStartCreated: boolean;
  providerFetchFailed: boolean;
  fsmState: TripDetectionState | null;
}

@Injectable()
export class SnapshotWakeCoordinatorService {
  private readonly logger = new Logger(SnapshotWakeCoordinatorService.name);
  private readonly tierConfig: SnapshotPollingTierConfig =
    loadSnapshotPollingTierConfig();

  constructor(
    @InjectQueue(QUEUE_NAMES.DIMO_SNAPSHOT) private readonly queue: Queue,
    @InjectQueue(QUEUE_NAMES.SNAPSHOT_WAKE_HANDOFF)
    private readonly handoffQueue: Queue,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  private async stageCoalescedEnqueueEvidence(
    vehicleId: string,
    jobId: string,
    stableOutcome: SnapshotStableEnqueueOutcome,
  ): Promise<void> {
    const canonical = stableEnqueueOutcomeToCanonical(stableOutcome);
    try {
      await stageApdShadowEnqueueEvidence(this.redis, {
        vehicleId,
        canonicalJobId: jobId,
        enqueueOutcome: canonical,
        observedAtMs: Date.now(),
      });
    } catch (err) {
      this.logger.debug(
        `APD coalesced enqueue evidence stage skipped for ${vehicleId}: ${(err as Error).message}`,
      );
    }
  }

  async requestSnapshot(input: RequestSnapshotInput): Promise<SnapshotWakeOutcome> {
    let pendingVersion: number | undefined;
    if (input.wakeContext) {
      const persist = await this.persistPendingWakeAtomic(
        input.vehicleId,
        input.dimoTokenId,
        input.wakeContext,
      );
      if (!persist.ok) {
        if (input.wakeContext) {
          this.recordWakeMetric(input.wakeContext, 'PERSIST_FAILED');
        }
        return 'PERSIST_FAILED';
      }
      pendingVersion = persist.version;
    }

    const jobId = snapshotJobId(input.vehicleId);
    const data: DimoSnapshotJobData = {
      vehicleId: input.vehicleId,
      dimoTokenId: input.dimoTokenId,
      origin: input.origin,
      wakeContext: input.wakeContext,
      apdShadowOpportunityId: input.apdShadowOpportunityId,
    };
    const enqueueObservedAtMs = Date.now();

    try {
      const enqueueOutcome = await enqueueStableSnapshotJob({
        queue: this.queue,
        jobName: 'snapshot',
        jobId,
        data,
        delayMs: input.delayMs,
        beforePhysicalAdd: (kind) => {
          data.apdShadowEnqueueEvidence = buildApdShadowEnqueueEvidence(
            kind,
            enqueueObservedAtMs,
          );
        },
      });

      if (
        isQueuedCoalesce(enqueueOutcome) ||
        coalesceNeedsPostTerminalSuccessor(enqueueOutcome)
      ) {
        await this.stageCoalescedEnqueueEvidence(
          input.vehicleId,
          jobId,
          enqueueOutcome,
        );
      }

      if (isQueuedCoalesce(enqueueOutcome) && input.wakeContext) {
        this.recordWakeMetric(input.wakeContext, 'COALESCED');
        return 'COALESCED';
      }

      if (
        coalesceNeedsPostTerminalSuccessor(enqueueOutcome) &&
        input.wakeContext
      ) {
        const consumerOutcome = await this.ensureCoalescedWakeConsumer({
          vehicleId: input.vehicleId,
          dimoTokenId: input.dimoTokenId,
          origin: input.origin,
          wakeContext: input.wakeContext,
          pendingVersion: pendingVersion,
        });
        if (consumerOutcome === 'PERSIST_FAILED') {
          this.recordWakeMetric(input.wakeContext, 'PERSIST_FAILED');
          return 'PERSIST_FAILED';
        }
        if (consumerOutcome === 'QUEUE_FAILED') {
          this.recordWakeMetric(input.wakeContext, 'QUEUE_FAILED');
          return 'QUEUE_FAILED';
        }
        this.recordWakeMetric(input.wakeContext, 'COALESCED');
        return 'COALESCED';
      }

      if (enqueueOutcome === 'RECOVERED_TERMINAL') {
        if (input.wakeContext) {
          this.recordWakeMetric(input.wakeContext, 'RECOVERED_TERMINAL');
        }
        return 'RECOVERED_TERMINAL';
      }

      if (enqueueOutcome === 'ENQUEUED') {
        if (input.wakeContext) {
          this.recordWakeMetric(input.wakeContext, 'ENQUEUED');
        }
        return 'ENQUEUED';
      }

      return 'COALESCED';
    } catch (err: unknown) {
      this.logger.warn(
        `Snapshot wake enqueue failed for ${input.vehicleId}: ${(err as Error).message}`,
      );
      if (input.wakeContext) {
        this.recordWakeMetric(input.wakeContext, 'QUEUE_FAILED');
      }
      return 'QUEUE_FAILED';
    }
  }

  async loadPendingWake(
    vehicleId: string,
  ): Promise<PendingSnapshotWakeRecord | null> {
    try {
      const raw = await this.redis.get(pendingWakeRedisKey(vehicleId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PendingSnapshotWakeRecord;
      if (typeof parsed.version !== 'number') {
        parsed.version = 1;
      }
      return parsed;
    } catch (err) {
      this.logger.debug(
        `Pending wake read failed for ${vehicleId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async loadPendingWakeStrict(
    vehicleId: string,
  ): Promise<DurableReadResult<PendingSnapshotWakeRecord>> {
    try {
      const raw = await this.redis.get(pendingWakeRedisKey(vehicleId));
      if (!raw) {
        return { status: 'MISSING' };
      }
      const parsed = JSON.parse(raw) as PendingSnapshotWakeRecord;
      if (typeof parsed.version !== 'number') {
        parsed.version = 1;
      }
      return { status: 'FOUND', value: parsed };
    } catch (err) {
      return {
        status: 'READ_ERROR',
        error: (err as Error).message,
      };
    }
  }

  async claimPendingWakeForRun(
    vehicleId: string,
  ): Promise<ClaimedPendingSnapshotWake | null> {
    const record = await this.loadPendingWake(vehicleId);
    if (!record) return null;
    return { record, version: record.version };
  }

  async acknowledgePendingWake(
    vehicleId: string,
    expectedVersion: number,
  ): Promise<boolean> {
    try {
      const result = await this.redis.eval(
        ACK_PENDING_WAKE_SCRIPT,
        1,
        pendingWakeRedisKey(vehicleId),
        String(expectedVersion),
      );
      return Number(result) === 1;
    } catch (err) {
      this.logger.warn(
        `Pending wake ACK failed for ${vehicleId}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  async persistPendingWakeAtomic(
    vehicleId: string,
    dimoTokenId: number,
    wakeContext: SnapshotWakeContext,
  ): Promise<PendingWakePersistResult> {
    try {
      const raw = await this.redis.eval(
        ATOMIC_PENDING_WAKE_MERGE_SCRIPT,
        1,
        pendingWakeRedisKey(vehicleId),
        JSON.stringify(wakeContext),
        String(dimoTokenId),
        String(Date.now()),
        String(PENDING_WAKE_TTL_SEC),
      );
      if (typeof raw !== 'string') {
        return { ok: false, error: 'invalid_redis_response' };
      }
      const parsed = JSON.parse(raw) as { ok?: boolean; version?: number };
      if (!parsed.ok || typeof parsed.version !== 'number') {
        return { ok: false, error: 'merge_failed' };
      }
      return { ok: true, version: parsed.version };
    } catch (err) {
      this.logger.warn(
        `Pending wake atomic persist failed for ${vehicleId}: ${(err as Error).message}`,
      );
      return { ok: false, error: (err as Error).message };
    }
  }

  /** @deprecated Use persistPendingWakeAtomic — retained for tests migrating to atomic API. */
  async savePendingWake(
    vehicleId: string,
    dimoTokenId: number,
    wakeContext: SnapshotWakeContext,
  ): Promise<PendingWakePersistResult> {
    return this.persistPendingWakeAtomic(vehicleId, dimoTokenId, wakeContext);
  }

  resolveEffectiveWakeContext(
    jobData: DimoSnapshotJobData,
    pending: PendingSnapshotWakeRecord | null,
  ): SnapshotWakeContext | undefined {
    if (!jobData.wakeContext && !pending?.wakeContext) {
      return undefined;
    }
    if (!jobData.wakeContext) {
      return pending?.wakeContext;
    }
    if (!pending?.wakeContext) {
      return jobData.wakeContext;
    }
    return mergePendingWakeContext(jobData.wakeContext, pending.wakeContext);
  }

  async afterSnapshotJob(params: AfterSnapshotJobParams): Promise<void> {
    const effectiveWake = params.effectiveWakeContext;
    const effectiveOrigin = resolveEffectiveWakeOrigin(
      params.jobData.origin,
      effectiveWake,
    );
    const isCovered =
      !!effectiveWake &&
      wakeAlreadyCoveredBySnapshot({
        wakeContext: effectiveWake,
        snapshotSourceTimestamp: params.snapshotSourceTimestamp,
      });

    if (effectiveWake?.probeGeneration === 1) {
      await this.finalizeGenerationOneEpisode(params);
      return;
    }

    const probeEligible = shouldRequestWakeProbe({
      origin: params.jobData.origin,
      effectiveWakeOrigin: effectiveOrigin,
      wakeContext: effectiveWake,
      snapshotSourceTimestamp: params.snapshotSourceTimestamp,
      staleMonotonicSkipped: params.staleMonotonicSkipped,
      tripStartEvalError: params.tripStartEvalError,
      possibleStartCreated: params.possibleStartCreated,
      providerFetchFailed: params.providerFetchFailed,
      fsmState: params.fsmState,
    });

    if (probeEligible && effectiveWake) {
      const continuation = await this.resolveWakeContinuation(params.vehicleId);
      if (!mayScheduleWakeSuccessor(continuation.continuation)) {
        await this.handleNonEligibleWakeContinuation(
          params.vehicleId,
          params.claimedPendingWake?.version,
          continuation.continuation,
          {
            dimoTokenId: params.dimoTokenId,
            origin: 'PROVIDER_WAKE',
            wakeContext: effectiveWake,
          },
        );
        return;
      }

      const probeContext = buildSnapshotWakeContext({
        reason: effectiveWake.reason,
        signalName: effectiveWake.signalName,
        providerObservedAt: effectiveWake.providerObservedAt
          ? new Date(effectiveWake.providerObservedAt)
          : null,
        receivedAt: new Date(effectiveWake.receivedAt),
        probeGeneration: 1,
      });

      const handoffOutcome = await this.scheduleDurableSuccessor({
        vehicleId: params.vehicleId,
        dimoTokenId: params.dimoTokenId,
        origin: 'WAKE_PROBE',
        wakeContext: probeContext,
        delayMs: wakeProbeDelayMs(this.tierConfig),
        associatedPendingVersion: params.claimedPendingWake?.version,
      });

      if (handoffOutcome === 'HANDOFF_SCHEDULED') {
        await this.tryAckClaimedPendingWake(params);
      } else if (
        handoffOutcome === 'PERSIST_FAILED' ||
        handoffOutcome === 'QUEUE_FAILED'
      ) {
        await this.reconcileOutstandingPendingWake(params.vehicleId);
      }

      runTripObservabilitySafely(this.logger, 'wake_probe_schedule', () => {
        this.tripMetrics?.snapshotWakeProbeTotal.inc({
          reason: effectiveWake.reason,
          outcome:
            handoffOutcome === 'HANDOFF_SCHEDULED'
              ? 'SCHEDULED'
              : handoffOutcome === 'PERSIST_FAILED'
                ? 'PERSIST_FAILED'
                : 'QUEUE_FAILED',
        });
      });
      return;
    }

    if (isCovered && params.possibleStartCreated && effectiveWake) {
      await this.tryAckClaimedPendingWake(params);
      if (params.claimedPendingWake) {
        this.recordWakeMetric(effectiveWake, 'ALREADY_COVERED');
      }
      return;
    }

    if (
      params.claimedPendingWake &&
      params.claimedPendingWake.record.wakeContext.probeGeneration === 0 &&
      !isCovered
    ) {
      const pending = params.claimedPendingWake.record;
      const continuation = await this.resolveWakeContinuation(params.vehicleId);
      if (!mayScheduleWakeSuccessor(continuation.continuation)) {
        await this.handleNonEligibleWakeContinuation(
          params.vehicleId,
          params.claimedPendingWake.version,
          continuation.continuation,
          {
            dimoTokenId: pending.dimoTokenId,
            origin: 'PROVIDER_WAKE',
            wakeContext: pending.wakeContext,
          },
        );
        return;
      }

      const handoffOutcome = await this.scheduleDurableSuccessor({
        vehicleId: params.vehicleId,
        dimoTokenId: pending.dimoTokenId,
        origin: 'PROVIDER_WAKE',
        wakeContext: pending.wakeContext,
        associatedPendingVersion: params.claimedPendingWake.version,
      });
      if (handoffOutcome === 'HANDOFF_SCHEDULED') {
        await this.tryAckClaimedPendingWake(params);
      }
      return;
    }

    if (isCovered && effectiveWake && params.claimedPendingWake) {
      await this.tryAckClaimedPendingWake(params);
      this.recordWakeMetric(effectiveWake, 'ALREADY_COVERED');
      return;
    }

    await this.reconcileOutstandingPendingWake(params.vehicleId);
  }

  private async finalizeGenerationOneEpisode(
    params: AfterSnapshotJobParams,
  ): Promise<void> {
    if (params.claimedPendingWake) {
      const acked = await this.acknowledgePendingWake(
        params.vehicleId,
        params.claimedPendingWake.version,
      );
      if (!acked) {
        const latestRead = await this.loadPendingWakeStrict(params.vehicleId);
        if (latestRead.status === 'READ_ERROR') {
          return;
        }
        if (
          latestRead.status === 'FOUND' &&
          latestRead.value.wakeContext.probeGeneration === 0
        ) {
          const continuation = await this.resolveWakeContinuation(params.vehicleId);
          if (mayScheduleWakeSuccessor(continuation.continuation)) {
            await this.scheduleDurableSuccessor({
              vehicleId: params.vehicleId,
              dimoTokenId: latestRead.value.dimoTokenId,
              origin: 'PROVIDER_WAKE',
              wakeContext: latestRead.value.wakeContext,
              associatedPendingVersion: latestRead.value.version,
            });
          } else {
            await this.handleNonEligibleWakeContinuation(
              params.vehicleId,
              latestRead.value.version,
              continuation.continuation,
              {
                dimoTokenId: latestRead.value.dimoTokenId,
                origin: 'PROVIDER_WAKE',
                wakeContext: latestRead.value.wakeContext,
              },
            );
          }
        }
      }
      return;
    }
    await this.reconcileOutstandingPendingWake(params.vehicleId);
  }

  private async tryAckClaimedPendingWake(
    params: AfterSnapshotJobParams,
  ): Promise<void> {
    if (!params.claimedPendingWake) {
      return;
    }
    const acked = await this.acknowledgePendingWake(
      params.vehicleId,
      params.claimedPendingWake.version,
    );
    if (!acked) {
      await this.reconcileOutstandingPendingWake(params.vehicleId);
    }
  }

  async reconcileOutstandingPendingWake(vehicleId: string): Promise<void> {
    const pendingRead = await this.loadPendingWakeStrict(vehicleId);
    if (pendingRead.status === 'READ_ERROR' || pendingRead.status === 'MISSING') {
      return;
    }
    const latest = pendingRead.value;
    if (latest.wakeContext.probeGeneration === 1) {
      return;
    }
    const continuation = await this.resolveWakeContinuation(vehicleId);
    if (!mayScheduleWakeSuccessor(continuation.continuation)) {
      await this.handleNonEligibleWakeContinuation(
        vehicleId,
        latest.version,
        continuation.continuation,
        {
          dimoTokenId: latest.dimoTokenId,
          origin: 'PROVIDER_WAKE',
          wakeContext: latest.wakeContext,
        },
      );
      return;
    }
    await this.scheduleDurableSuccessor({
      vehicleId,
      dimoTokenId: latest.dimoTokenId,
      origin: 'PROVIDER_WAKE',
      wakeContext: latest.wakeContext,
      associatedPendingVersion: latest.version,
    });
  }

  async ensureCoalescedWakeConsumer(params: {
    vehicleId: string;
    dimoTokenId: number;
    origin: DimoSnapshotJobData['origin'];
    wakeContext: SnapshotWakeContext;
    pendingVersion?: number;
  }): Promise<CoalescedWakeConsumerOutcome> {
    const continuation = await this.resolveWakeContinuation(params.vehicleId);
    if (mayScheduleWakeSuccessor(continuation.continuation)) {
      const handoffOutcome = await this.scheduleDurableSuccessor({
        vehicleId: params.vehicleId,
        dimoTokenId: params.dimoTokenId,
        origin: params.origin ?? 'PROVIDER_WAKE',
        wakeContext: params.wakeContext,
        associatedPendingVersion: params.pendingVersion,
      });
      if (
        handoffOutcome === 'HANDOFF_SCHEDULED' ||
        handoffOutcome === 'UNKNOWN_RETRY_SCHEDULED'
      ) {
        return 'CONSUMER_READY';
      }
      if (handoffOutcome === 'PERSIST_FAILED') {
        return 'PERSIST_FAILED';
      }
      if (handoffOutcome === 'QUEUE_FAILED') {
        return 'QUEUE_FAILED';
      }
      return 'CONSUMER_READY';
    }
    if (continuation.continuation === 'UNKNOWN') {
      const retryOutcome = await this.scheduleUnknownContinuationRetryHandoff({
        vehicleId: params.vehicleId,
        dimoTokenId: params.dimoTokenId,
        origin: params.origin ?? 'PROVIDER_WAKE',
        wakeContext: params.wakeContext,
      });
      if (retryOutcome === 'HANDOFF_SCHEDULED') {
        return 'CONSUMER_READY';
      }
      if (retryOutcome === 'PERSIST_FAILED') {
        return 'PERSIST_FAILED';
      }
      return 'QUEUE_FAILED';
    }
    if (shouldRetireObsoleteWake(continuation.continuation)) {
      await this.retireExactPendingWakeBounded(
        params.vehicleId,
        params.pendingVersion,
        continuation.continuation,
      );
    }
    return 'CONSUMER_READY';
  }

  async scheduleUnknownContinuationRetryHandoff(params: {
    vehicleId: string;
    dimoTokenId: number;
    origin: NonNullable<DimoSnapshotJobData['origin']>;
    wakeContext: SnapshotWakeContext;
  }): Promise<UnknownContinuationRetryOutcome> {
    if (params.wakeContext.probeGeneration === 1) {
      return 'PERSIST_FAILED';
    }
    const notBeforeMs = Date.now() + UNKNOWN_CONTINUATION_RETRY_MS;
    const persist = await this.persistSuccessorHandoffAtomic({
      vehicleId: params.vehicleId,
      dimoTokenId: params.dimoTokenId,
      origin: params.origin,
      wakeContext: params.wakeContext,
      notBeforeMs,
    });
    if (!persist.ok || persist.notBeforeMs == null) {
      return 'PERSIST_FAILED';
    }
    try {
      await this.enqueueHandoffJob(params.vehicleId, persist.notBeforeMs);
      return 'HANDOFF_SCHEDULED';
    } catch (err) {
      this.logger.warn(
        `Unknown continuation handoff enqueue failed for ${params.vehicleId}: ${(err as Error).message}`,
      );
      return 'QUEUE_FAILED';
    }
  }

  private async resolveGenerationZeroRetryWake(
    vehicleId: string,
    pendingVersion: number | undefined,
    override?: {
      dimoTokenId: number;
      origin: NonNullable<DimoSnapshotJobData['origin']>;
      wakeContext: SnapshotWakeContext;
    },
  ): Promise<{
    dimoTokenId: number;
    origin: NonNullable<DimoSnapshotJobData['origin']>;
    wakeContext: SnapshotWakeContext;
  } | null> {
    if (override?.wakeContext.probeGeneration === 0) {
      return override;
    }
    const pendingRead = await this.loadPendingWakeStrict(vehicleId);
    if (pendingRead.status !== 'FOUND') {
      return null;
    }
    if (pendingRead.value.wakeContext.probeGeneration === 1) {
      return null;
    }
    if (pendingVersion != null && pendingRead.value.version !== pendingVersion) {
      const { continuation } = await this.resolveWakeContinuation(vehicleId);
      if (continuation === 'UNKNOWN') {
        return {
          dimoTokenId: pendingRead.value.dimoTokenId,
          origin: 'PROVIDER_WAKE',
          wakeContext: pendingRead.value.wakeContext,
        };
      }
    }
    return {
      dimoTokenId: pendingRead.value.dimoTokenId,
      origin: 'PROVIDER_WAKE',
      wakeContext: pendingRead.value.wakeContext,
    };
  }

  private async retireExactPendingWakeBounded(
    vehicleId: string,
    expectedVersion: number | undefined,
    initialContinuation?: WakeContinuationClass,
  ): Promise<DurableRetirementOutcome> {
    let targetVersion = expectedVersion;

    for (
      let attempt = 0;
      attempt < MAX_RETIREMENT_RECONCILE_ITERATIONS;
      attempt += 1
    ) {
      if (targetVersion == null) {
        const read = await this.loadPendingWakeStrict(vehicleId);
        if (read.status === 'READ_ERROR') {
          return 'READ_ERROR';
        }
        if (read.status === 'MISSING') {
          return 'MISSING';
        }
        targetVersion = read.value.version;
      }

      const continuation =
        attempt === 0 && initialContinuation != null
          ? initialContinuation
          : (await this.resolveWakeContinuation(vehicleId)).continuation;

      if (continuation === 'UNKNOWN') {
        return 'UNKNOWN_RETRY';
      }
      if (mayScheduleWakeSuccessor(continuation)) {
        return 'NEWER_FOUND';
      }
      if (!shouldRetireObsoleteWake(continuation)) {
        return 'NEWER_FOUND';
      }

      const acked = await this.acknowledgePendingWake(vehicleId, targetVersion);
      if (acked) {
        return 'RETIRED';
      }

      const reload = await this.loadPendingWakeStrict(vehicleId);
      if (reload.status === 'READ_ERROR') {
        return 'READ_ERROR';
      }
      if (reload.status === 'MISSING') {
        return 'MISSING';
      }
      targetVersion = reload.value.version;
    }

    return 'ACK_ERROR';
  }

  private async retireExactSuccessorWakeBounded(
    vehicleId: string,
    expectedVersion: number,
  ): Promise<DurableRetirementOutcome> {
    let targetVersion = expectedVersion;

    for (
      let attempt = 0;
      attempt < MAX_RETIREMENT_RECONCILE_ITERATIONS;
      attempt += 1
    ) {
      const read = await this.loadSuccessorHandoffStrict(vehicleId);
      if (read.status === 'READ_ERROR') {
        return 'READ_ERROR';
      }
      if (read.status === 'MISSING') {
        return 'MISSING';
      }
      if (read.value.version !== targetVersion) {
        targetVersion = read.value.version;
      }

      const { continuation } = await this.resolveWakeContinuation(vehicleId);
      if (continuation === 'UNKNOWN') {
        return 'UNKNOWN_RETRY';
      }
      if (mayScheduleWakeSuccessor(continuation)) {
        return 'NEWER_FOUND';
      }
      if (!shouldRetireObsoleteWake(continuation)) {
        return 'NEWER_FOUND';
      }

      const acked = await this.acknowledgeSuccessorHandoff(
        vehicleId,
        targetVersion,
      );
      if (acked) {
        return 'RETIRED';
      }

      const reload = await this.loadSuccessorHandoffStrict(vehicleId);
      if (reload.status === 'READ_ERROR') {
        return 'READ_ERROR';
      }
      if (reload.status === 'MISSING') {
        return 'MISSING';
      }
      targetVersion = reload.value.version;
    }

    return 'ACK_ERROR';
  }

  private async throwHandoffRetirementDefer(
    outcome: DurableRetirementOutcome,
    vehicleId: string,
  ): Promise<never> {
    if (outcome === 'READ_ERROR') {
      throw new SnapshotWakeHandoffDeferError(2000, 'redis_read_error');
    }
    if (outcome === 'UNKNOWN_RETRY' || outcome === 'ACK_ERROR') {
      throw new SnapshotWakeHandoffDeferError(
        UNKNOWN_CONTINUATION_RETRY_MS,
        'continuation_unknown',
      );
    }
    if (outcome === 'NEWER_FOUND') {
      throw await this.buildSuccessorRearmDefer(vehicleId);
    }
    throw new SnapshotWakeHandoffDeferError(
      UNKNOWN_CONTINUATION_RETRY_MS,
      'continuation_unknown',
    );
  }

  private async buildSuccessorRearmDefer(
    vehicleId: string,
  ): Promise<SnapshotWakeHandoffDeferError> {
    const latestRead = await this.loadSuccessorHandoffStrict(vehicleId);
    if (latestRead.status === 'READ_ERROR') {
      return new SnapshotWakeHandoffDeferError(2000, 'redis_read_error');
    }
    if (latestRead.status === 'MISSING') {
      return new SnapshotWakeHandoffDeferError(2000, 'continuation_unknown');
    }
    const retryDelayMs = Math.max(
      1,
      latestRead.value.notBeforeMs - Date.now(),
    );
    return new SnapshotWakeHandoffDeferError(retryDelayMs, 'not_before');
  }

  async resolveWakeContinuation(vehicleId: string): Promise<{
    continuation: WakeContinuationClass;
    fsmState: TripDetectionState | null;
  }> {
    let fsmState: TripDetectionState | null = null;
    let fsmReadError = false;
    try {
      const det = await this.prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId },
        select: { state: true },
      });
      fsmState = det?.state ?? TripDetectionState.RESTING;
    } catch (err) {
      fsmReadError = true;
      this.logger.debug(
        `FSM read failed for ${vehicleId}: ${(err as Error).message}`,
      );
    }

    let vehicleEligible: boolean | null = null;
    let eligibilityReadError = false;
    try {
      vehicleEligible = await this.isVehicleSnapshotEligible(vehicleId);
    } catch (err) {
      eligibilityReadError = true;
      this.logger.debug(
        `Eligibility read failed for ${vehicleId}: ${(err as Error).message}`,
      );
    }

    return {
      fsmState,
      continuation: classifyWakeContinuation({
        fsmState,
        vehicleEligible,
        fsmReadError,
        eligibilityReadError,
      }),
    };
  }

  private async handleNonEligibleWakeContinuation(
    vehicleId: string,
    pendingVersion: number | undefined,
    continuation: WakeContinuationClass,
    retryWakeOverride?: {
      dimoTokenId: number;
      origin: NonNullable<DimoSnapshotJobData['origin']>;
      wakeContext: SnapshotWakeContext;
    },
  ): Promise<void> {
    if (continuation === 'UNKNOWN') {
      const retryWake = await this.resolveGenerationZeroRetryWake(
        vehicleId,
        pendingVersion,
        retryWakeOverride,
      );
      if (!retryWake) {
        return;
      }
      await this.scheduleUnknownContinuationRetryHandoff({
        vehicleId,
        ...retryWake,
      });
      return;
    }
    await this.retireExactPendingWakeBounded(
      vehicleId,
      pendingVersion,
      continuation,
    );
  }

  async scheduleDurableSuccessor(params: {
    vehicleId: string;
    dimoTokenId: number;
    origin: DimoSnapshotJobData['origin'];
    wakeContext: SnapshotWakeContext;
    delayMs?: number;
    associatedPendingVersion?: number;
  }): Promise<
    | 'HANDOFF_SCHEDULED'
    | 'UNKNOWN_RETRY_SCHEDULED'
    | 'CONTINUATION_BLOCKED'
    | 'QUEUE_FAILED'
    | 'PERSIST_FAILED'
  > {
    const { continuation } = await this.resolveWakeContinuation(params.vehicleId);
    if (!mayScheduleWakeSuccessor(continuation)) {
      if (continuation === 'UNKNOWN') {
        if (params.wakeContext.probeGeneration === 1) {
          return 'CONTINUATION_BLOCKED';
        }
        const retryOutcome = await this.scheduleUnknownContinuationRetryHandoff({
          vehicleId: params.vehicleId,
          dimoTokenId: params.dimoTokenId,
          origin: params.origin ?? 'PROVIDER_WAKE',
          wakeContext: params.wakeContext,
        });
        if (retryOutcome === 'HANDOFF_SCHEDULED') {
          return 'UNKNOWN_RETRY_SCHEDULED';
        }
        if (retryOutcome === 'PERSIST_FAILED') {
          return 'PERSIST_FAILED';
        }
        return 'QUEUE_FAILED';
      }
      if (shouldRetireObsoleteWake(continuation)) {
        await this.retireExactPendingWakeBounded(
          params.vehicleId,
          params.associatedPendingVersion,
          continuation,
        );
      }
      return 'CONTINUATION_BLOCKED';
    }

    const notBeforeMs = Date.now() + (params.delayMs ?? 0);
    const persist = await this.persistSuccessorHandoffAtomic({
      vehicleId: params.vehicleId,
      dimoTokenId: params.dimoTokenId,
      origin: params.origin ?? 'PROVIDER_WAKE',
      wakeContext: params.wakeContext,
      notBeforeMs,
    });
    if (!persist.ok || persist.notBeforeMs == null) {
      return 'PERSIST_FAILED';
    }
    try {
      await this.enqueueHandoffJob(params.vehicleId, persist.notBeforeMs);
      return 'HANDOFF_SCHEDULED';
    } catch (err) {
      this.logger.warn(
        `Successor handoff enqueue failed for ${params.vehicleId}: ${(err as Error).message}`,
      );
      return 'QUEUE_FAILED';
    }
  }

  async persistSuccessorHandoffAtomic(params: {
    vehicleId: string;
    dimoTokenId: number;
    origin: NonNullable<DimoSnapshotJobData['origin']>;
    wakeContext: SnapshotWakeContext;
    notBeforeMs: number;
  }): Promise<SuccessorHandoffPersistResult> {
    try {
      const payload = JSON.stringify({
        dimoTokenId: params.dimoTokenId,
        origin: params.origin,
        wakeContext: params.wakeContext,
        notBeforeMs: params.notBeforeMs,
      });
      const raw = await this.redis.eval(
        ATOMIC_SUCCESSOR_HANDOFF_MERGE_SCRIPT,
        1,
        successorWakeRedisKey(params.vehicleId),
        payload,
        String(Date.now()),
        String(SUCCESSOR_WAKE_TTL_SEC),
      );
      if (typeof raw !== 'string') {
        return { ok: false, error: 'invalid_redis_response' };
      }
      const parsed = JSON.parse(raw) as {
        ok?: boolean;
        version?: number;
        notBeforeMs?: number;
      };
      if (!parsed.ok || typeof parsed.version !== 'number') {
        return { ok: false, error: 'merge_failed' };
      }
      return {
        ok: true,
        version: parsed.version,
        notBeforeMs: parsed.notBeforeMs ?? params.notBeforeMs,
      };
    } catch (err) {
      this.logger.warn(
        `Successor handoff persist failed for ${params.vehicleId}: ${(err as Error).message}`,
      );
      return { ok: false, error: (err as Error).message };
    }
  }

  async loadSuccessorHandoffStrict(
    vehicleId: string,
  ): Promise<DurableReadResult<SuccessorSnapshotWakeRecord>> {
    try {
      const raw = await this.redis.get(successorWakeRedisKey(vehicleId));
      if (!raw) {
        return { status: 'MISSING' };
      }
      const parsed = JSON.parse(raw) as SuccessorSnapshotWakeRecord;
      if (typeof parsed.version !== 'number') {
        parsed.version = 1;
      }
      return { status: 'FOUND', value: parsed };
    } catch (err) {
      return {
        status: 'READ_ERROR',
        error: (err as Error).message,
      };
    }
  }

  async loadSuccessorHandoff(
    vehicleId: string,
  ): Promise<SuccessorSnapshotWakeRecord | null> {
    const read = await this.loadSuccessorHandoffStrict(vehicleId);
    if (read.status === 'FOUND') {
      return read.value;
    }
    return null;
  }

  async acknowledgeSuccessorHandoff(
    vehicleId: string,
    expectedVersion: number,
  ): Promise<boolean> {
    try {
      const result = await this.redis.eval(
        ACK_SUCCESSOR_HANDOFF_SCRIPT,
        1,
        successorWakeRedisKey(vehicleId),
        String(expectedVersion),
      );
      return Number(result) === 1;
    } catch (err) {
      this.logger.warn(
        `Successor handoff ACK failed for ${vehicleId}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Returns true when a durable successor mailbox exists but no runnable BullMQ
   * handoff consumer is present (missing or terminal job state).
   */
  async successorHandoffJobNeedsRearm(vehicleId: string): Promise<boolean> {
    const successorRead = await this.loadSuccessorHandoffStrict(vehicleId);
    if (successorRead.status !== 'FOUND') {
      return false;
    }
    const jobId = snapshotWakeHandoffJobId(vehicleId);
    const existing = await this.handoffQueue.getJob(jobId);
    if (!existing) {
      return true;
    }
    const state = await existing.getState();
    if (state === 'waiting' || state === 'delayed' || state === 'active') {
      return false;
    }
    return state === 'completed' || state === 'failed';
  }

  /**
   * Idempotent per-vehicle re-arm: reuses stable jobId + enqueueHandoffJob CAS
   * semantics without mutating the successor Redis record.
   */
  async tryRecoverSuccessorHandoff(
    vehicleId: string,
  ): Promise<SuccessorHandoffRecoveryOutcome> {
    const successorRead = await this.loadSuccessorHandoffStrict(vehicleId);
    if (successorRead.status === 'READ_ERROR') {
      return 'READ_ERROR';
    }
    if (successorRead.status === 'MISSING') {
      return 'MISSING';
    }
    let needsRearm: boolean;
    try {
      needsRearm = await this.successorHandoffJobNeedsRearm(vehicleId);
    } catch (err) {
      this.logger.warn(
        `Successor handoff job inspection failed for ${vehicleId}: ${(err as Error).message}`,
      );
      return 'QUEUE_FAILED';
    }
    if (!needsRearm) {
      return 'OK';
    }
    try {
      await this.enqueueHandoffJob(
        vehicleId,
        successorRead.value.notBeforeMs,
      );
      return 'REARMED';
    } catch (err) {
      this.logger.warn(
        `Successor handoff recovery re-arm failed for ${vehicleId}: ${(err as Error).message}`,
      );
      return 'QUEUE_FAILED';
    }
  }

  /**
   * Bounded SCAN sweep for persisted successors lacking a runnable handoff job.
   * Preserves unprocessed SCAN batch tails across ticks; at most one SCAN per tick.
   * `scanCursor` is set to Redis `nextCursor` immediately when a batch is fetched;
   * while `pendingBatchKeys` is non-empty no further SCAN is issued.
   */
  async recoverOrphanedSuccessorHandoffs(
    continuation: SuccessorHandoffRecoveryContinuation = INITIAL_SUCCESSOR_HANDOFF_RECOVERY_CONTINUATION,
  ): Promise<SuccessorHandoffRecoveryTickResult> {
    let { scanCursor, pendingBatchKeys } = {
      scanCursor: continuation.scanCursor,
      pendingBatchKeys: [...continuation.pendingBatchKeys],
    };
    let scanned = 0;
    let rearmed = 0;
    let errors = 0;
    let scanFetchedThisTick = pendingBatchKeys.length > 0;

    while (scanned < MAX_SUCCESSOR_HANDOFF_RECOVERY_PER_TICK) {
      if (pendingBatchKeys.length === 0) {
        if (scanFetchedThisTick) {
          break;
        }
        const [nextCursor, keys] = await this.redis.scan(
          scanCursor,
          'MATCH',
          SUCCESSOR_HANDOFF_RECOVERY_KEY_PATTERN,
          'COUNT',
          String(SUCCESSOR_HANDOFF_RECOVERY_SCAN_COUNT),
        );
        scanCursor = nextCursor;
        pendingBatchKeys = keys;
        scanFetchedThisTick = true;

        if (keys.length === 0) {
          if (scanCursor === '0') {
            break;
          }
          continue;
        }
      }

      const key = pendingBatchKeys.shift();
      if (!key) {
        break;
      }

      scanned += 1;
      const vehicleId = parseVehicleIdFromSuccessorRedisKey(key);
      if (vehicleId) {
        const outcome = await this.tryRecoverSuccessorHandoff(vehicleId);
        if (outcome === 'REARMED') {
          rearmed += 1;
        } else if (outcome === 'READ_ERROR' || outcome === 'QUEUE_FAILED') {
          errors += 1;
        }
      }
    }

    return {
      scanned,
      rearmed,
      errors,
      continuation: { scanCursor, pendingBatchKeys },
    };
  }

  async enqueueHandoffJob(vehicleId: string, notBeforeMs: number): Promise<void> {
    const delayMs = Math.max(0, notBeforeMs - Date.now());
    const jobId = snapshotWakeHandoffJobId(vehicleId);
    const existing = await this.handoffQueue.getJob(jobId);

    if (existing) {
      const state = await existing.getState();
      if (state === 'active') {
        return;
      }
      if (state === 'waiting') {
        return;
      }
      if (state === 'delayed') {
        const remainingMs = Math.max(0, notBeforeMs - Date.now());
        await existing.changeDelay(remainingMs);
        return;
      }
      if (state === 'completed' || state === 'failed') {
        await existing.remove();
      }
    }

    await this.handoffQueue.add(
      'dispatch',
      { vehicleId },
      {
        jobId,
        delay: delayMs > 0 ? delayMs : undefined,
        ...HANDOFF_JOB_OPTIONS,
      },
    );
  }

  /**
   * Post-terminal successor dispatch. Never performs a provider fetch — only
   * enqueues the canonical serialized snapshot path when safe.
   *
   * Defers via SnapshotWakeHandoffDeferError so BullMQ re-arms the CURRENT
   * handoff job instead of self-coalescing duplicate stable jobIds.
   */
  async dispatchSuccessorHandoff(vehicleId: string): Promise<void> {
    const successorRead = await this.loadSuccessorHandoffStrict(vehicleId);
    if (successorRead.status === 'READ_ERROR') {
      throw new SnapshotWakeHandoffDeferError(2000, 'redis_read_error');
    }
    if (successorRead.status === 'MISSING') {
      return;
    }
    const successor = successorRead.value;

    const continuation = await this.resolveWakeContinuation(vehicleId);
    if (!mayScheduleWakeSuccessor(continuation.continuation)) {
      if (continuation.continuation === 'UNKNOWN') {
        throw new SnapshotWakeHandoffDeferError(
          UNKNOWN_CONTINUATION_RETRY_MS,
          'continuation_unknown',
        );
      }
      if (shouldRetireObsoleteWake(continuation.continuation)) {
        const retireResult = await this.retireExactSuccessorWakeBounded(
          vehicleId,
          successor.version,
        );
        if (retireResult === 'RETIRED' || retireResult === 'MISSING') {
          await this.retireExactPendingWakeBounded(
            vehicleId,
            undefined,
            continuation.continuation,
          );
          return;
        }
        await this.throwHandoffRetirementDefer(retireResult, vehicleId);
      }
      return;
    }

    const loadedVersion = successor.version;
    const now = Date.now();

    if (now < successor.notBeforeMs) {
      throw new SnapshotWakeHandoffDeferError(
        successor.notBeforeMs - now,
        'not_before',
      );
    }

    const canonicalJob = await this.queue.getJob(snapshotJobId(vehicleId));
    if (canonicalJob) {
      const state = await canonicalJob.getState();
      if (isActiveQueueState(state) || isQueuedQueueState(state)) {
        throw new SnapshotWakeHandoffDeferError(1000, 'canonical_active');
      }
    }

    let outcome: SnapshotWakeOutcome;
    try {
      outcome = await this.requestSnapshot({
        vehicleId,
        dimoTokenId: successor.dimoTokenId,
        origin: successor.origin,
        wakeContext: successor.wakeContext,
      });
    } catch (err) {
      this.logger.warn(
        `Successor canonical enqueue threw for ${vehicleId}: ${(err as Error).message}`,
      );
      throw new SnapshotWakeHandoffDeferError(5000, 'enqueue_failed');
    }

    if (
      outcome === 'ENQUEUED' ||
      outcome === 'COALESCED' ||
      outcome === 'RECOVERED_TERMINAL'
    ) {
      const acked = await this.acknowledgeSuccessorHandoff(
        vehicleId,
        loadedVersion,
      );
      if (!acked) {
        const latestRead = await this.loadSuccessorHandoffStrict(vehicleId);
        if (latestRead.status === 'READ_ERROR') {
          throw new SnapshotWakeHandoffDeferError(2000, 'redis_read_error');
        }
        if (latestRead.status === 'MISSING') {
          return;
        }
        const retryDelayMs = Math.max(1, latestRead.value.notBeforeMs - Date.now());
        throw new SnapshotWakeHandoffDeferError(
          retryDelayMs,
          'not_before',
        );
      }
      await this.ackPendingWakeConsumedBySuccessorDispatch(
        vehicleId,
        successor.wakeContext,
      );
      return;
    }

    throw new SnapshotWakeHandoffDeferError(5000, 'queue_failed');
  }

  private async ackPendingWakeConsumedBySuccessorDispatch(
    vehicleId: string,
    dispatchedWake: SnapshotWakeContext,
  ): Promise<void> {
    if (dispatchedWake.probeGeneration !== 0) {
      return;
    }
    const pendingRead = await this.loadPendingWakeStrict(vehicleId);
    if (pendingRead.status !== 'FOUND') {
      return;
    }
    if (pendingRead.value.wakeContext.probeGeneration !== 0) {
      return;
    }
    const pendingObserved = pendingRead.value.wakeContext.providerObservedAt
      ? new Date(pendingRead.value.wakeContext.providerObservedAt).getTime()
      : null;
    const dispatchedObserved = dispatchedWake.providerObservedAt
      ? new Date(dispatchedWake.providerObservedAt).getTime()
      : null;
    if (
      pendingObserved != null &&
      dispatchedObserved != null &&
      pendingObserved > dispatchedObserved
    ) {
      return;
    }
    await this.acknowledgePendingWake(vehicleId, pendingRead.value.version);
  }

  async isVehicleSnapshotEligible(vehicleId: string): Promise<boolean> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        status: true,
        dimoVehicle: { select: { connectionStatus: true, tokenId: true } },
      },
    });
    if (!vehicle?.dimoVehicle?.tokenId) return false;
    if (vehicle.dimoVehicle.connectionStatus !== 'CONNECTED') return false;
    return (
      vehicle.status === VehicleStatus.AVAILABLE ||
      vehicle.status === VehicleStatus.RENTED
    );
  }

  async isRestingForPrimaryWake(vehicleId: string): Promise<boolean> {
    const det = await this.prisma.vehicleTripDetectionState.findUnique({
      where: { vehicleId },
      select: { state: true },
    });
    return det?.state === TripDetectionState.RESTING;
  }

  recordWakeMetric(
    wakeContext: SnapshotWakeContext,
    outcome: SnapshotWakeOutcome,
  ): void {
    runTripObservabilitySafely(this.logger, 'snapshot_wake_total', () => {
      this.tripMetrics?.snapshotWakeTotal.inc({
        source: wakeContext.source,
        reason: wakeContext.reason,
        outcome,
      });
    });
  }

  observeWakeToFetchSeconds(
    wakeContext: SnapshotWakeContext | undefined,
    snapshotFetchedAt: Date,
  ): void {
    if (!wakeContext?.providerObservedAt) return;
    const observedAt = new Date(wakeContext.providerObservedAt);
    if (!Number.isFinite(observedAt.getTime())) return;
    const deltaSec =
      (snapshotFetchedAt.getTime() - observedAt.getTime()) / 1000;
    if (deltaSec < 0) return;
    runTripObservabilitySafely(this.logger, 'wake_to_fetch_latency', () => {
      this.tripMetrics?.snapshotWakeToFetchSeconds.observe(deltaSec);
    });
  }
}
