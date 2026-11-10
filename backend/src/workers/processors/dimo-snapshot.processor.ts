import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { DimoPollJobType, DimoPollStatus } from '@prisma/client';
import { isVehicleRegistryOperationalActive } from '@modules/vehicle-onboarding/registry/vehicle-registry-operational.util';

import { QUEUE_NAMES } from '../queues/queue-names';
import { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import { DimoTelemetryService } from '@modules/dimo/dimo-telemetry.service';
import { shouldApplyVlsTelemetryUpdate } from '@modules/dimo/vls-monotonic-merge.util';
import { PrismaService } from '@shared/database/prisma.service';
import { TripDetectionOrchestrationService } from '../../modules/vehicle-intelligence/trips/trip-detection-orchestration.service';
import { BatteryV2SnapshotObservationProducer } from '../../modules/vehicle-intelligence/battery-health/jobs/battery-v2-snapshot-observation.producer';
import { ClickHouseTelemetryService } from '../../modules/clickhouse/clickhouse-telemetry.service';
import { TripMetricsService } from '../../modules/observability/trip-metrics.service';
import { observeQueueLag } from '../../modules/observability/queue-lag.util';
import {
  normalizeDimoSnapshotTirePressures,
  toSynqDriveTirePressureMeta,
} from '@modules/dimo/dimo-tire-pressure.normalizer';
import { capRawPayload } from '@shared/utils/json-payload.util';
import {
  mapDimoBatterySignals,
  resolveLvBatteryObservedAt,
  resolveStrictLvBatteryProviderSourceAt,
  toVlsBatteryFields,
} from '../../modules/dimo/mappers/dimo-battery-signal.mapper';
import { DeviceConnectionEpisodeResolutionService } from '../../modules/dimo/device-connection-episode-resolution/device-connection-episode-resolution.service';
import {
  buildSnapshotReferenceId,
  extractObdPlugSignalFromSnapshot,
} from '../../modules/dimo/device-connection-episode-resolution/device-connection-episode-resolution.snapshot-evaluator';
import { PhysicalStateAuthorityCutoverService } from '../../modules/dimo/device-connection-physical-state/physical-state-authority-cutover.service';
import { PhysicalStateSnapshotEvidenceOrchestrator } from '../../modules/dimo/device-connection-physical-state/physical-state-snapshot-evidence-orchestrator.service';
import { buildTelemetrySnapshotReferenceId } from '../../modules/dimo/device-connection-episode-resolution/device-connection-telemetry-recovery.evaluator';
import {
  DeviceConnectionEpisodeService,
  hashProviderDeviceId,
} from '../../modules/dimo/device-connection-episode.service';
import { DeviceConnectionEpisodeResolutionOutboxProcessorService } from '../../modules/dimo/device-connection-episode-resolution/device-connection-episode-resolution-outbox-processor.service';
import { SnapshotWakeCoordinatorService } from '../snapshot-wake/snapshot-wake-coordinator.service';
import { AdaptivePollingShadowService } from '../schedulers/snapshot-polling/adaptive-polling-shadow/adaptive-polling-shadow.service';
import { findLatestHistoricallyVisibleLiveVoltageProviderTimestampMs } from '../schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-historical-lv-visibility';
import type { DimoSnapshotJobData } from '../snapshot-wake/snapshot-wake.types';
import { TripDetectionState } from '@prisma/client';

import { readWorkerConcurrency } from '@config/worker-concurrency.util';
import { runWithDimoRequestContext } from '@modules/dimo/provider-budget/dimo-request-context';
import {
  buildDimoSnapshotFetchObservationIdempotencyKey,
  buildDimoSnapshotVlsApplicationIdempotencyKey,
  VsiProviderSourceObservationWriterService,
} from '@modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-provider-source-observation.writer.service';
import { VsiSignalProfileMaterializationService } from '@modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-profile-materialization.service';

export type { DimoSnapshotJobData };

/**
 * BullMQ worker options:
 *  - lockDuration: 60s gives each snapshot up to ~60s of end-to-end work
 *    before BullMQ marks the job "stalled". Previously (default 30s) a
 *    slow GraphQL round-trip plus the follow-up DB upserts and trip-start
 *    evaluation could overrun the lock and flip the job into a permanent
 *    failed state that silently blocked all future enqueues for that
 *    vehicle (shared jobId = snapshot-<vehicleId>).
 *  - concurrency: env WORKER_SNAPSHOT_CONCURRENCY (default 5, max 200).
 */
@Processor(QUEUE_NAMES.DIMO_SNAPSHOT, {
  lockDuration: 60_000,
  concurrency: readWorkerConcurrency('WORKER_SNAPSHOT_CONCURRENCY', 5),
})
export class DimoSnapshotProcessor extends WorkerHost {
  private readonly logger = new Logger(DimoSnapshotProcessor.name);

  constructor(
    private readonly dimoAuth: DimoAuthService,
    private readonly dimoTelemetry: DimoTelemetryService,
    private readonly prisma: PrismaService,
    private readonly tripOrchestration: TripDetectionOrchestrationService,
    private readonly batteryObservationProducer: BatteryV2SnapshotObservationProducer,
    @Optional() private readonly chTelemetry: ClickHouseTelemetryService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
    @Optional()
    private readonly episodeResolution?: DeviceConnectionEpisodeResolutionService,
    @Optional()
    private readonly episodeService?: DeviceConnectionEpisodeService,
    @Optional()
    private readonly resolutionOutboxProcessor?: DeviceConnectionEpisodeResolutionOutboxProcessorService,
    @Optional()
    private readonly snapshotWakeCoordinator?: SnapshotWakeCoordinatorService,
    @Optional()
    private readonly snapshotPhysicalEvidenceOrchestrator?: PhysicalStateSnapshotEvidenceOrchestrator,
    @Optional()
    private readonly physicalAuthorityCutover?: PhysicalStateAuthorityCutoverService,
    @Optional()
    private readonly apdShadow?: AdaptivePollingShadowService,
    @Optional()
    private readonly vsiSourceObservationWriter?: VsiProviderSourceObservationWriterService,
    @Optional()
    private readonly vsiProfileMaterialization?: VsiSignalProfileMaterializationService,
  ) {
    super();
  }

  async process(job: Job<DimoSnapshotJobData>): Promise<void> {
    return runWithDimoRequestContext(
      { category: 'LIVE_SNAPSHOT', priority: 'HIGH' },
      () => this.processSnapshotJob(job),
    );
  }

  private async processSnapshotJob(job: Job<DimoSnapshotJobData>): Promise<void> {
    const { vehicleId, dimoTokenId } = job.data;
    const startedAt = new Date();
    observeQueueLag(this.tripMetrics, QUEUE_NAMES.DIMO_SNAPSHOT, job);

    const pendingWake = this.snapshotWakeCoordinator
      ? await this.snapshotWakeCoordinator.claimPendingWakeForRun(vehicleId)
      : null;
    const effectiveWake = this.snapshotWakeCoordinator?.resolveEffectiveWakeContext(
      job.data,
      pendingWake?.record ?? null,
    );
    const jobDataWithWake: DimoSnapshotJobData = effectiveWake
      ? { ...job.data, wakeContext: effectiveWake }
      : job.data;

    const afterCtx = {
      staleMonotonicSkipped: false,
      tripStartEvalError: false,
      possibleStartCreated: false,
      snapshotSourceTimestamp: null as Date | null,
      providerFetchFailed: false,
      fsmState: null as TripDetectionState | null,
    };

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        organizationId: true,
        registryLifecycle: true,
        hardwareType: true,
        dimoVehicle: { select: { connectionStatus: true } },
        dataSourceLinks: {
          where: { isActive: true, provider: 'DIMO' },
          orderBy: { activatedAt: 'desc' },
          take: 1,
          select: { id: true, sourceSubtype: true },
        },
      },
    });
    if (!vehicle?.organizationId) {
      throw new Error(`Vehicle ${vehicleId} missing organizationId — cannot process snapshot`);
    }

    if (!isVehicleRegistryOperationalActive(vehicle.registryLifecycle)) {
      const finishedAt = new Date();
      await this.prisma.dimoPollLog.create({
        data: {
          vehicleId,
          jobType: DimoPollJobType.SNAPSHOT,
          status: DimoPollStatus.SKIPPED,
          startedAt,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          errorMessage: `registry_lifecycle=${vehicle.registryLifecycle}`,
        },
      });
      this.logger.debug(
        `Skipping DIMO snapshot for vehicle ${vehicleId}: registry lifecycle ${vehicle.registryLifecycle}`,
      );
      this.tripMetrics?.dimoSnapshotPollTotal.inc({ result: 'skipped' });
      return;
    }

    const [previousLv, previousVls] = await Promise.all([
      this.prisma.batteryMeasurement.findFirst({
        where: {
          vehicleId,
          type: 'LIVE_VOLTAGE',
          quality: 'VALID',
          providerTimestamp: { not: null },
        },
        orderBy: { providerTimestamp: 'desc' },
        select: { providerTimestamp: true },
      }),
      this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: { sourceTimestamp: true },
      }),
    ]);

    let apdShadowOpportunityId: string | null = null;
    if (this.apdShadow?.isEnabledForVehicle(vehicle.organizationId, vehicleId)) {
      const [tripDetection, latestState] = await Promise.all([
        this.prisma.vehicleTripDetectionState.findUnique({
          where: { vehicleId },
          select: { state: true },
        }),
        this.prisma.vehicleLatestState.findUnique({
          where: { vehicleId },
          select: { providerFetchedAt: true },
        }),
      ]);
      apdShadowOpportunityId = await this.apdShadow.observeActualBaselinePollStart({
        organizationId: vehicle.organizationId,
        vehicleId,
        pollStartedAtMs: startedAt.getTime(),
        origin: jobDataWithWake.origin ?? 'SNAPSHOT',
        tripDetectionState: tripDetection?.state ?? null,
        lastProviderFetchedAtMs: latestState?.providerFetchedAt?.getTime() ?? null,
        providerGapOpen: false,
        connectivityState: vehicle.dimoVehicle?.connectionStatus ?? null,
        r9WakeKnown: jobDataWithWake.wakeContext != null,
        // SnapshotWakeContext has no separate correlation id; shadow uses r9WakeKnown + opportunity id.
        wakeCorrelationId: null,
        deviceReconnectRecent: false,
        providerReconnectRecent: false,
      });
      const enqueueEvidence = jobDataWithWake.apdShadowEnqueueEvidence;
      if (apdShadowOpportunityId && enqueueEvidence) {
        await this.apdShadow.observeCanonicalEnqueueOutcome({
          organizationId: vehicle.organizationId,
          vehicleId,
          opportunityId: apdShadowOpportunityId,
          enqueueOutcome: enqueueEvidence.outcome,
          observedAtMs: enqueueEvidence.observedAtMs,
        });
      }
    }

    try {
      const pipelineResult = await this.runSnapshotPipeline(
        job,
        jobDataWithWake,
        vehicle,
        startedAt,
        afterCtx,
      );

      if (this.apdShadow && apdShadowOpportunityId && pipelineResult) {
        const pollCompletedAtMs = pipelineResult.finishedAt.getTime();
        const latestVisibleLvProviderMs =
          await findLatestHistoricallyVisibleLiveVoltageProviderTimestampMs(
            this.prisma,
            vehicleId,
            pollCompletedAtMs,
          );
        await this.apdShadow.observePostPoll({
          organizationId: vehicle.organizationId,
          vehicleId,
          opportunityId: apdShadowOpportunityId,
          realPollId: pipelineResult.pollLogId,
          pollStartedAtMs: startedAt.getTime(),
          pollCompletedAtMs,
          realPollVisibleLvSourceAtMs:
            pipelineResult.lvProviderTimestampMs ?? latestVisibleLvProviderMs,
          previousLvSourceMs: previousLv?.providerTimestamp?.getTime() ?? null,
          baselineLvProviderSourceMs: pipelineResult.strictLvProviderTimestampMs,
          previousTopLevelSourceMs: previousVls?.sourceTimestamp?.getTime() ?? null,
          newTopLevelSourceMs: afterCtx.snapshotSourceTimestamp?.getTime() ?? null,
          providerFetchedAtMs: null,
        });
      }
    } catch (err) {
      afterCtx.providerFetchFailed = true;
      if (afterCtx.fsmState == null) {
        try {
          const det = await this.prisma.vehicleTripDetectionState.findUnique({
            where: { vehicleId },
            select: { state: true },
          });
          afterCtx.fsmState = det?.state ?? null;
        } catch {
          // fail closed — probe logic preserves mailbox when FSM unknown
        }
      }
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const errorMessage = err instanceof Error ? err.message : String(err);

      const failurePollLog = await this.prisma.dimoPollLog.create({
        data: {
          vehicleId,
          jobType: DimoPollJobType.SNAPSHOT,
          status: DimoPollStatus.FAILURE,
          startedAt,
          finishedAt,
          durationMs,
          errorMessage,
        },
      });

      if (this.apdShadow && apdShadowOpportunityId) {
        await this.apdShadow.observePollFailure({
          organizationId: vehicle.organizationId,
          vehicleId,
          opportunityId: apdShadowOpportunityId,
          realPollId: failurePollLog.id,
          realPollStartedAt: startedAt,
        });
      }

      this.logger.warn(
        `Snapshot failed for vehicle ${vehicleId}: ${errorMessage}`,
      );
      this.tripMetrics?.dimoSnapshotPollTotal.inc({ result: 'failure' });
      throw err;
    } finally {
      if (this.snapshotWakeCoordinator) {
        await this.snapshotWakeCoordinator.afterSnapshotJob({
          vehicleId,
          dimoTokenId,
          jobData: jobDataWithWake,
          claimedPendingWake: pendingWake,
          effectiveWakeContext: effectiveWake,
          ...afterCtx,
        });
      }
    }
  }

  private async runSnapshotPipeline(
    job: Job<DimoSnapshotJobData>,
    jobDataWithWake: DimoSnapshotJobData,
    vehicle: {
      organizationId: string;
      hardwareType: string;
      dimoVehicle: { connectionStatus: string } | null;
      dataSourceLinks: Array<{ id: string; sourceSubtype: string | null }>;
    },
    startedAt: Date,
    afterCtx: {
      staleMonotonicSkipped: boolean;
      tripStartEvalError: boolean;
      possibleStartCreated: boolean;
      snapshotSourceTimestamp: Date | null;
      providerFetchFailed: boolean;
      fsmState: TripDetectionState | null;
    },
  ): Promise<{
    pollLogId: string;
    finishedAt: Date;
    lvProviderTimestampMs: number | null;
    strictLvProviderTimestampMs: number | null;
  } | null> {
    const { vehicleId, dimoTokenId } = jobDataWithWake;

    const previousState =
      await this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
      });

      const vehicleJwt = await this.dimoAuth.getVehicleJwt(dimoTokenId);
      const raw = await this.dimoTelemetry.fetchLatestVehicleSnapshot(
        vehicleJwt,
        dimoTokenId,
        {
          organizationId: vehicle.organizationId,
          vehicleId,
          tokenId: dimoTokenId,
        },
      );

      const signals = this.extractSignalsLatest(raw);
      if (!signals) {
        this.tripMetrics?.emptySnapshots.inc({ vehicle_profile: 'UNKNOWN' });
        throw new Error('No signalsLatest in DIMO response');
      }

      const normalized = this.normalizeSnapshot(signals);
      const batteryMap = mapDimoBatterySignals(signals);
      const lvBatteryObservedAt = resolveLvBatteryObservedAt(batteryMap);
      const fetchedAt = new Date();
      this.snapshotWakeCoordinator?.observeWakeToFetchSeconds(
        jobDataWithWake.wakeContext,
        fetchedAt,
      );

      const providerBindingId = vehicle.dataSourceLinks[0]?.id ?? null;
      const monotonicStale =
        previousState != null &&
        !shouldApplyVlsTelemetryUpdate(normalized.lastSeenAt, previousState.sourceTimestamp);

      const fetchCorrelationId = randomUUID();
      const bullmqAttemptNumber = job.attemptsMade ?? 0;
      const fetchRecord = await this.vsiSourceObservationWriter?.recordProviderFetch({
        organizationId: vehicle.organizationId,
        vehicleId,
        provider: 'DIMO',
        providerBindingId,
        providerTokenReference: String(dimoTokenId),
        pollJobId: String(job.id),
        bullmqAttemptNumber,
        fetchCorrelationId,
        idempotencyKey: buildDimoSnapshotFetchObservationIdempotencyKey(fetchCorrelationId),
        providerFetchedAt: fetchedAt,
        providerSourceTimestamp: normalized.lastSeenAt ?? null,
        monotonicStaleSkipped: monotonicStale,
      });

      // VW-F-008: skip stale provider snapshots (monotonic sourceTimestamp guard)
      if (monotonicStale) {
        afterCtx.staleMonotonicSkipped = true;
        afterCtx.snapshotSourceTimestamp = previousState.sourceTimestamp;
        const det = await this.prisma.vehicleTripDetectionState.findUnique({
          where: { vehicleId },
          select: { state: true },
        });
        afterCtx.fsmState = det?.state ?? null;

        await this.prisma.vehicleLatestState.update({
          where: { vehicleId },
          data: {
            providerFetchedAt: fetchedAt,
            syncJobRef: `snapshot:${job.id}`,
          },
        });
        this.logger.debug(
          `VLS monotonic guard: skipped stale snapshot for ${vehicleId} ` +
            `(incoming=${normalized.lastSeenAt?.toISOString()} existing=${previousState.sourceTimestamp?.toISOString()})`,
        );
        return null;
      }

      afterCtx.snapshotSourceTimestamp = normalized.lastSeenAt ?? null;

      // Track stale snapshots (data age > 5 min indicates vehicle is not actively sending)
      const STALE_THRESHOLD_MS = 5 * 60_000;
      if (normalized.lastSeenAt && Date.now() - normalized.lastSeenAt.getTime() > STALE_THRESHOLD_MS) {
        this.tripMetrics?.staleSnapshots.inc({ vehicle_profile: 'UNKNOWN' });
      }
      const latestState = await this.prisma.vehicleLatestState.upsert({
        where: { vehicleId },
        create: {
          vehicleId,
          dimoTokenId,
          source: 'dimo',
          // Provenance
          providerSource: 'DIMO',
          providerFetchedAt: fetchedAt,
          sourceTimestamp: normalized.lastSeenAt ?? null,
          providerBindingId: vehicle.dataSourceLinks[0]?.id ?? null,
          ...normalized,
        },
        update: {
          dimoTokenId,
          // Provenance updated on every snapshot
          providerSource: 'DIMO',
          providerFetchedAt: fetchedAt,
          sourceTimestamp: normalized.lastSeenAt ?? null,
          providerBindingId: vehicle.dataSourceLinks[0]?.id ?? null,
          ...normalized,
        },
      });

      if (fetchRecord) {
        await this.vsiSourceObservationWriter?.recordVlsApplication({
          organizationId: vehicle.organizationId,
          vehicleId,
          provider: 'DIMO',
          providerBindingId,
          providerTokenReference: String(dimoTokenId),
          pollJobId: String(job.id),
          fetchCorrelationId,
          observationIndex: fetchRecord.observationIndex,
          providerFetchedAt: fetchedAt,
          providerSourceTimestamp: normalized.lastSeenAt ?? null,
          idempotencyKey: buildDimoSnapshotVlsApplicationIdempotencyKey(fetchCorrelationId),
        });
      }

      void this.vsiProfileMaterialization
        ?.materializeFromPersistedEvidence({
          organizationId: vehicle.organizationId,
          vehicleId,
          providerSourceLinkId: providerBindingId,
          requireBindingMatch: true,
        })
        .catch((err) =>
          this.logger.warn(
            `VSI profile materialization failed vehicle=${vehicleId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );

      await this.applyPhysicalSnapshotEvidence({
        organizationId: vehicle.organizationId,
        vehicleId,
        tokenId: dimoTokenId,
        signals,
        providerBindingId: vehicle.dataSourceLinks[0]?.id ?? null,
        hardwareType: vehicle.hardwareType,
        sourceSubtype: vehicle.dataSourceLinks[0]?.sourceSubtype ?? null,
        fetchedAt,
        vehicleLatestStateId: latestState.id,
        existingVlsSourceTimestamp: previousState?.sourceTimestamp ?? null,
      });

      if (this.episodeService) {
        try {
          await this.episodeService.reconcileBindingDrift({
            organizationId: vehicle.organizationId,
            vehicleId,
            tokenId: dimoTokenId,
            hardwareType: vehicle.hardwareType,
            evidenceAt: normalized.lastSeenAt ?? fetchedAt,
          });
        } catch (err) {
          this.logger.warn(
            `Binding drift reconciliation skipped for ${vehicleId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      const providerDeviceIdHash = hashProviderDeviceId('DIMO', dimoTokenId);

      const legacyEpisodeResolutionExcluded = await this.isLegacySnapshotEpisodeResolutionExcluded(
        vehicle.organizationId,
        vehicleId,
      );

      if (!legacyEpisodeResolutionExcluded) {
        await this.tryResolveOpenEpisodeFromSnapshot({
          organizationId: vehicle.organizationId,
          vehicleId,
          hardwareType: vehicle.hardwareType,
          dimoTokenId,
          fetchedAt,
          signals,
          vehicleLatestStateId: latestState.id,
          providerBindingId: vehicle.dataSourceLinks[0]?.id ?? null,
          providerDeviceIdHash,
          sourceSubtype: vehicle.dataSourceLinks[0]?.sourceSubtype ?? null,
        });

        await this.tryResolveOpenEpisodeFromSustainedTelemetry({
          organizationId: vehicle.organizationId,
          vehicleId,
          hardwareType: vehicle.hardwareType,
          fetchedAt,
          normalized,
          vehicleLatestStateId: latestState.id,
          providerBindingId: vehicle.dataSourceLinks[0]?.id ?? null,
          providerDeviceIdHash,
          sourceSubtype: vehicle.dataSourceLinks[0]?.sourceSubtype ?? null,
          providerConnectionStatus: vehicle.dimoVehicle?.connectionStatus ?? null,
          signals,
        });
      }

      // Device-connection resolution outbox drain: non-trip subsystem running
      // ahead of evaluateTripStart. Row-level failures are already handled by
      // the processor (retry/dead-letter); only infrastructure faults surface
      // here, and they must never block trip detection. UnrecoverableError is
      // the codebase-wide non-retryable marker and is deliberately re-thrown.
      if (this.resolutionOutboxProcessor) {
        try {
          await this.resolutionOutboxProcessor.processPendingBatch();
        } catch (err) {
          if (err instanceof UnrecoverableError) throw err;
          this.logger.error(
            `Resolution outbox drain failed for ${vehicleId} (snapshot continues): ` +
              `subsystem=device_connection_episode_resolution_outbox ` +
              `vehicleId=${vehicleId} jobId=${job.id ?? 'unknown'} ` +
              `errorName=${err instanceof Error ? err.name : typeof err} ` +
              `error=${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // ── ClickHouse dual-write (fire-and-forget, never blocks live pipeline) ──
      if (this.chTelemetry) {
        const chSnap = {
          isIgnitionOn: normalized.isIgnitionOn ?? null,
          speedKmh: normalized.speedKmh,
          odometerKm: normalized.odometerKm,
          latitude: normalized.latitude,
          longitude: normalized.longitude,
          engineLoad: normalized.engineLoad,
          fuelLevelAbsolute: normalized.fuelLevelAbsolute,
          evSoc: normalized.evSoc,
          tractionKw: normalized.tractionBatteryPowerKw,
          recordedAt: normalized.lastSeenAt ?? new Date(),
        };
        this.chTelemetry.insertSnapshot(vehicle.organizationId, vehicleId, dimoTokenId, chSnap).catch((err) =>
          this.logger.warn(`CH mirror failed: ${err.message}`),
        );
        this.chTelemetry
          .detectAndInsertStateChanges(
            vehicle.organizationId,
            vehicleId,
            previousState
              ? {
                  isIgnitionOn: previousState.isIgnitionOn,
                  speedKmh: previousState.speedKmh,
                }
              : null,
            chSnap,
          )
          .catch((err) =>
            this.logger.warn(`CH state change failed: ${err.message}`),
          );
      }

      // Battery V2: classify provider observations and enqueue durable job (awaited).
      // Trip start evaluation must not depend on battery queue health — isolate failures.
      try {
        const batteryFollowUpJobId =
          await this.batteryObservationProducer.classifyAndEnqueue({
            organizationId: vehicle.organizationId,
            vehicleId,
            receivedAt: fetchedAt,
            normalized: {
              lvBatteryVoltage: normalized.lvBatteryVoltage,
              evSoc: normalized.evSoc,
              tractionBatteryCurrentEnergyKwh:
                normalized.tractionBatteryCurrentEnergyKwh,
              tractionBatterySohPercent: normalized.tractionBatterySohPercent,
              tractionBatteryPowerKw: normalized.tractionBatteryPowerKw,
              tractionBatteryChargingPowerKw:
                normalized.tractionBatteryChargingPowerKw,
              tractionBatteryAddedEnergyKwh:
                normalized.tractionBatteryAddedEnergyKwh,
              tractionBatteryChargeLimitPercent:
                normalized.tractionBatteryChargeLimitPercent,
              tractionBatteryIsCharging: normalized.tractionBatteryIsCharging,
              tractionBatteryChargingCableConnected:
                normalized.tractionBatteryChargingCableConnected,
              tractionBatteryTemperatureC: normalized.tractionBatteryTemperatureC,
              tractionBatteryGrossCapacityKwh:
                normalized.tractionBatteryGrossCapacityKwh,
              rangeKm: normalized.rangeKm,
              odometerKm: normalized.odometerKm,
            },
            batteryMap,
            lvBatteryObservedAt,
            correlationId: `snapshot:${vehicleId}:${fetchedAt.toISOString()}`,
          });

        if (batteryFollowUpJobId) {
          this.logger.debug(
            `Battery V2 follow-up enqueued for vehicle ${vehicleId}: ${batteryFollowUpJobId}`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Battery V2 classify/enqueue failed for ${vehicleId} (snapshot continues): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      const detBeforeEval = await this.prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId },
        select: { state: true },
      });
      afterCtx.fsmState = detBeforeEval?.state ?? null;

      const tripEval = await this.evaluateTripStart(
        vehicleId,
        dimoTokenId,
        previousState,
        normalized,
        jobDataWithWake.wakeContext,
        fetchedAt,
      );
      afterCtx.tripStartEvalError = tripEval.error;
      afterCtx.possibleStartCreated = tripEval.shouldStartTracking;

      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();

      // Create poll log and capture its ID for provenance back-reference
      const pollLog = await this.prisma.dimoPollLog.create({
        data: {
          vehicleId,
          jobType: DimoPollJobType.SNAPSHOT,
          status: DimoPollStatus.SUCCESS,
          startedAt,
          finishedAt,
          durationMs,
        },
      });

      // Patch VehicleLatestState.syncJobRef so the state row traces back to this poll run
      await this.prisma.vehicleLatestState.updateMany({
        where: { vehicleId },
        data: { syncJobRef: pollLog.id },
      });

      this.logger.debug(
        `Snapshot completed for vehicle ${vehicleId} in ${durationMs}ms`,
      );
      this.tripMetrics?.dimoSnapshotPollTotal.inc({ result: 'success' });
      const lvProviderTimestampMs = lvBatteryObservedAt?.getTime() ?? null;
      const strictLvProviderTimestampMs =
        resolveStrictLvBatteryProviderSourceAt(batteryMap)?.getTime() ?? null;

      return {
        pollLogId: pollLog.id,
        finishedAt,
        lvProviderTimestampMs,
        strictLvProviderTimestampMs,
      };
  }

  private async isLegacySnapshotEpisodeResolutionExcluded(
    organizationId: string,
    vehicleId: string,
  ): Promise<boolean> {
    if (!this.physicalAuthorityCutover) {
      return false;
    }
    return this.physicalAuthorityCutover.isPhysicalAuthorityActive({
      organizationId,
      vehicleId,
      provider: 'DIMO',
    });
  }

  private async applyPhysicalSnapshotEvidence(input: {
    organizationId: string;
    vehicleId: string;
    tokenId: number;
    signals: Record<string, unknown>;
    providerBindingId: string | null;
    hardwareType: string;
    sourceSubtype: string | null;
    fetchedAt: Date;
    vehicleLatestStateId: string;
    existingVlsSourceTimestamp: Date | null;
  }): Promise<void> {
    await this.snapshotPhysicalEvidenceOrchestrator?.applyPhysicalSnapshotEvidence(input);
  }

  private async tryResolveOpenEpisodeFromSnapshot(input: {
    organizationId: string;
    vehicleId: string;
    hardwareType: string;
    dimoTokenId: number;
    fetchedAt: Date;
    signals: Record<string, unknown>;
    vehicleLatestStateId: string;
    providerBindingId: string | null;
    providerDeviceIdHash: string;
    sourceSubtype: string | null;
  }): Promise<void> {
    if (!this.episodeResolution) return;

    const obd = extractObdPlugSignalFromSnapshot(input.signals);
    if (obd.obdIsPluggedIn == null) return;

    const providerObservedAt = obd.providerObservedAt;
    if (!providerObservedAt) return;

    const snapshotReferenceId = buildSnapshotReferenceId({
      vehicleLatestStateId: input.vehicleLatestStateId,
      providerObservedAt,
    });

    try {
      await this.episodeResolution.tryResolveFromSnapshotPlugSignal({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider: 'DIMO',
        hardwareType: input.hardwareType,
        obdIsPluggedIn: obd.obdIsPluggedIn,
        providerObservedAt,
        receivedAt: input.fetchedAt,
        snapshotSource: 'dimo',
        providerBindingId: input.providerBindingId,
        snapshotReferenceId,
        sourceSubtype: input.sourceSubtype,
        providerDeviceIdHash: input.providerDeviceIdHash,
      });
    } catch (err) {
      this.logger.warn(
        `Episode snapshot resolution skipped for ${input.vehicleId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async tryResolveOpenEpisodeFromSustainedTelemetry(input: {
    organizationId: string;
    vehicleId: string;
    hardwareType: string;
    fetchedAt: Date;
    normalized: ReturnType<DimoSnapshotProcessor['normalizeSnapshot']>;
    vehicleLatestStateId: string;
    providerBindingId: string | null;
    providerDeviceIdHash: string;
    sourceSubtype: string | null;
    providerConnectionStatus: string | null;
    signals: Record<string, unknown>;
  }): Promise<void> {
    if (!this.episodeResolution) return;

    const obd = extractObdPlugSignalFromSnapshot(input.signals);
    if (obd.obdIsPluggedIn === false) return;

    const providerObservedAt =
      input.normalized.lastSeenAt ?? obd.providerObservedAt;
    if (!providerObservedAt) return;

    const snapshotReferenceId = buildTelemetrySnapshotReferenceId({
      vehicleLatestStateId: input.vehicleLatestStateId,
      providerObservedAt,
    });

    try {
      await this.episodeResolution.tryResolveFromSustainedTelemetry({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider: 'DIMO',
        hardwareType: input.hardwareType,
        obdIsPluggedIn: obd.obdIsPluggedIn,
        providerObservedAt,
        receivedAt: input.fetchedAt,
        snapshotSource: 'dimo',
        providerBindingId: input.providerBindingId,
        snapshotReferenceId,
        sourceSubtype: input.sourceSubtype,
        providerConnectionStatus: input.providerConnectionStatus,
        hasOperationalSignal: this.hasOperationalTelemetrySignal(input.normalized),
        providerDeviceIdHash: input.providerDeviceIdHash,
      });
    } catch (err) {
      this.logger.warn(
        `Episode telemetry recovery skipped for ${input.vehicleId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private hasOperationalTelemetrySignal(
    normalized: ReturnType<DimoSnapshotProcessor['normalizeSnapshot']>,
  ): boolean {
    return (
      normalized.speedKmh != null ||
      normalized.isIgnitionOn != null ||
      normalized.odometerKm != null ||
      (normalized.latitude != null && normalized.longitude != null)
    );
  }

  private async evaluateTripStart(
    vehicleId: string,
    dimoTokenId: number,
    previousState: Awaited<
      ReturnType<PrismaService['vehicleLatestState']['findUnique']>
    >,
    normalized: ReturnType<DimoSnapshotProcessor['normalizeSnapshot']>,
    wakeContext?: DimoSnapshotJobData['wakeContext'],
    snapshotFetchedAt?: Date,
  ): Promise<{ shouldStartTracking: boolean; error: boolean }> {
    try {
      const evaluation = await this.tripOrchestration.evaluateSnapshotForTripStart(
        vehicleId,
        dimoTokenId,
        previousState,
        {
          isIgnitionOn: normalized.isIgnitionOn ?? null,
          speedKmh: normalized.speedKmh,
          engineLoad: normalized.engineLoad,
          tractionBatteryPowerKw: normalized.tractionBatteryPowerKw,
          latitude: normalized.latitude,
          longitude: normalized.longitude,
          odometerKm: normalized.odometerKm,
          fuelLevelAbsolute: normalized.fuelLevelAbsolute,
          evSoc: normalized.evSoc,
          sourceTimestamp: normalized.lastSeenAt,
        },
        {
          wakeContext,
          snapshotFetchedAt: snapshotFetchedAt ?? null,
        },
      );
      return {
        shouldStartTracking: evaluation.shouldStartTracking,
        error: false,
      };
    } catch (err) {
      this.logger.warn(
        `Trip start eval error for ${vehicleId}: ${err instanceof Error ? err.message : err}`,
      );
      return { shouldStartTracking: false, error: true };
    }
  }

  private extractSignalsLatest(raw: unknown): Record<string, unknown> | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;

    const signals =
      r.signalsLatest ??
      (r.data as Record<string, unknown> | undefined)?.signalsLatest;

    if (Array.isArray(signals) && signals.length > 0)
      return signals[0] as Record<string, unknown>;
    if (signals && typeof signals === 'object')
      return signals as Record<string, unknown>;
    return null;
  }

  private extractSignalTimestamp(field: unknown): Date | null {
    if (!field || typeof field !== 'object') return null;
    const ts = (field as Record<string, unknown>).timestamp;
    if (typeof ts === 'number' || typeof ts === 'string') {
      const parsed = new Date(ts);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }

  private normalizeSnapshot(signals: Record<string, unknown>) {
    const numVal = (field: unknown): number | null => {
      if (field == null) return null;
      if (typeof field === 'number') return Number.isNaN(field) ? null : field;
      if (typeof field === 'object') {
        const v = (field as Record<string, unknown>).value;
        return v != null && typeof v === 'number' && !Number.isNaN(v) ? v : null;
      }
      return null;
    };

    const ts = (v: unknown): Date | null => {
      if (v == null) return null;
      if (typeof v === 'number') return new Date(v);
      if (typeof v === 'string') return new Date(v);
      return null;
    };

    const batteryFields = toVlsBatteryFields(mapDimoBatterySignals(signals));

    const locCoords = signals.currentLocationCoordinates as
      | { value?: { latitude?: number; longitude?: number } }
      | null
      | undefined;

    const tirePressures = normalizeDimoSnapshotTirePressures(signals);
    const tpmsWarningField = signals.chassisTireSystemIsWarningOn as
      | { value?: number; timestamp?: number | string }
      | null
      | undefined;
    const tpmsWarningSignalPresent =
      tpmsWarningField != null &&
      typeof tpmsWarningField === 'object' &&
      tpmsWarningField.value != null &&
      typeof tpmsWarningField.value === 'number' &&
      Number.isFinite(tpmsWarningField.value);
    const tpmsWarningValue = tpmsWarningSignalPresent
      ? numVal(tpmsWarningField) != null && numVal(tpmsWarningField)! >= 0.5
      : null;
    const tpmsWarningTimestamp = this.extractSignalTimestamp(tpmsWarningField);

    return {
      lastSeenAt: ts(signals.lastSeen),
      latitude: locCoords?.value?.latitude ?? null,
      longitude: locCoords?.value?.longitude ?? null,
      odometerKm: numVal(signals.powertrainTransmissionTravelledDistance),
      oilLevelRelative: numVal(signals.powertrainCombustionEngineEngineOilRelativeLevel),
      defLevel: numVal(signals.powertrainCombustionEngineDieselExhaustFluidLevel),
      rangeKm: numVal(signals.powertrainTractionBatteryRange),
      tirePressureFl: tirePressures.fl.normalizedValue,
      tirePressureFr: tirePressures.fr.normalizedValue,
      tirePressureRl: tirePressures.rl.normalizedValue,
      tirePressureRr: tirePressures.rr.normalizedValue,
      evSoc: batteryFields.evSoc,
      tractionBatteryCurrentEnergyKwh: batteryFields.tractionBatteryCurrentEnergyKwh,
      tractionBatterySohPercent: batteryFields.tractionBatterySohPercent,
      tractionBatteryPowerKw: batteryFields.tractionBatteryPowerKw,
      tractionBatteryCurrentVoltage: batteryFields.tractionBatteryCurrentVoltage,
      tractionBatteryTemperatureC: batteryFields.tractionBatteryTemperatureC,
      tractionBatteryChargingPowerKw: batteryFields.tractionBatteryChargingPowerKw,
      tractionBatteryAddedEnergyKwh: batteryFields.tractionBatteryAddedEnergyKwh,
      tractionBatteryChargeLimitPercent: batteryFields.tractionBatteryChargeLimitPercent,
      tractionBatteryIsCharging: batteryFields.tractionBatteryIsCharging,
      tractionBatteryChargingCableConnected:
        batteryFields.tractionBatteryChargingCableConnected,
      tractionBatteryGrossCapacityKwh: batteryFields.tractionBatteryGrossCapacityKwh,
      isIgnitionOn: (() => {
        const v = numVal(signals.isIgnitionOn);
        return v != null ? v >= 0.5 : null;
      })(),
      engineLoad: numVal(signals.obdEngineLoad),
      fuelLevelRelative: numVal(signals.powertrainFuelSystemRelativeLevel),
      fuelLevelAbsolute: numVal(signals.powertrainFuelSystemAbsoluteLevel),
      lvBatteryVoltage: batteryFields.lvBatteryVoltage,
      coolantTempC: numVal(signals.powertrainCombustionEngineECT),
      speedKmh: numVal(signals.speed),
      rawPayloadJson: capRawPayload({
        ...(signals as object),
        _synqdrive: {
          tirePressure: {
            fl: toSynqDriveTirePressureMeta(tirePressures.fl),
            fr: toSynqDriveTirePressureMeta(tirePressures.fr),
            rl: toSynqDriveTirePressureMeta(tirePressures.rl),
            rr: toSynqDriveTirePressureMeta(tirePressures.rr),
          },
          tpmsWarning: {
            signalPresent: tpmsWarningSignalPresent,
            value: tpmsWarningValue,
            sourceProvider: 'DIMO',
            sourceTimestamp: tpmsWarningTimestamp?.toISOString() ?? null,
          },
        },
      }) as object,
    };
  }
}
