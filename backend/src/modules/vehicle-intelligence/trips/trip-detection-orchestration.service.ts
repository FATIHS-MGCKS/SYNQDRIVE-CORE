import { forwardRef, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DimoSegmentsService,
  type DimoTripSegment,
} from '../../dimo/dimo-segments.service';
import { buildDimoProviderRequestContext } from '../../dimo/provider/dimo-provider-request-context.util';
import type { DimoProviderRequestContext } from '../../dimo/provider/dimo-provider-gateway.types';
import { BatteryV2TripStartProducer } from '../battery-health/jobs/battery-v2-trip-start.producer';
import { BatteryV2LvRestSessionProducer } from '../battery-health/jobs/battery-v2-lv-rest-session.producer';
import { ShutdownEvidenceTripContextService } from '../battery-health/shutdown-evidence/shutdown-evidence-trip-context.service';
import { TripEnrichmentOrchestratorService } from './trip-enrichment-orchestrator.service';
import { TripPostFinalizeAnalysisProducer } from '../driving-analysis-init/trip-post-finalize-analysis.producer';
import {
  TripDetectionState,
  TripTrackingRunType,
  DetectionConfidence,
  VehicleDetectionProfile,
  TripStatus,
} from '@prisma/client';
import type {
  VehicleTripDetectionState as DetState,
  VehicleLatestState,
} from '@prisma/client';
import { QUEUE_NAMES } from '../../../workers/queues/queue-names';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import {
  TRIP_TRACKING_TRIGGERS,
  END_DETECTION_MODES,
  type TripTrackingJobData,
  type TripStartEvaluation,
  type SnapshotEvidenceSignals,
  type WorkerLockResult,
  type StartDetectionMode,
  type TerminalLifecycleCommit,
  type TerminalLifecycleIntent,
} from './trip-detection.types';
import {
  // evaluateSnapshotEvidence → SnapshotEvidenceEvaluator (Phase 2 seam, done)
  // validateTripStart → StartConfirmationDetector (Phase 2 seam, done)
  // assessActiveContinuity/evaluatePerformanceActivity → ContinuityAssessmentDetector (Phase 2 seam, done)
  // hasActivityResumed → EndContinuityDetector (Phase 2 seam, done)
  checkTripQuality,
  hasPersistedMeaningfulMovementForQuality,
  refineTripStartBoundary,
  resolveAnalyticsAssistedStartDecision,
  resolveAnalyticsAssistedEndDecision,
  resolveClickHouseContinuityGuard,
  resolveDetectionProfile,
  isCurrentTelemetryInactive,
  extractLatestSegmentEnd,
  resolveLatestMeaningfulMovementEventAt,
  continuityImpliesMeaningfulMovement,
  continuityImpliesCrediblePostBoundaryMovement,
  hasCrediblePostBoundaryRouteMotion,
  assessLiveStartSnapshotFreshness,
} from './trip-evidence.helpers';
import { START_DETECTION_PHASES } from './trip-start-detection-policy';
import {
  evaluateTrustedCompleteCooldownBypass,
  buildSnapshotWakeForensics,
} from '../../../workers/snapshot-wake/snapshot-wake.util';
import type { EvaluateSnapshotForTripStartWakeOptions } from '../../../workers/snapshot-wake/snapshot-wake.types';
// detectTripEndChangePoint → ChangePointEndDetector (Phase 2 seam, done)
import { TripDecisionEngine } from './decision/trip-decision.engine';
import { TripDetectionPolicyResolver } from './policy/trip-detection-policy.resolver';
import {
  DETECTION_PHASES,
  type DetectorFinding,
} from './detectors/detector.interfaces';
import { DetectorRegistry } from './detectors/detector.registry';
import { TripMetricsService } from '../../observability/trip-metrics.service';
import { RedisService } from '@shared/redis/redis.service';
import { Dtc02ObservabilityService } from '../dtc/observability/dtc02-observability.service';
import { runDtc02AdaptiveShadowOnTripFsmEvent } from '../dtc/adaptive/dtc-02-adaptive-trip-fsm-shadow.hook';
import { ClickHouseService } from '@modules/clickhouse/clickhouse.service';
import { isClickHouseTripAssistEnabled } from '@modules/clickhouse/clickhouse-env.util';
import {
  computePossibleStartCoreFetchFrom,
  computeStartBoundaryWindowFrom,
} from './start-boundary-window.util';
import { isTripStartBoundaryAdmissionShadowEnabledForVehicle } from './start-boundary-admission/trip-start-boundary-admission-shadow.config';
import {
  mergeShadowStartBoundaryIntoEvidenceSummary,
  runStartBoundaryAdmissionShadow,
  type ShadowStartBoundaryAdmissionSummary,
} from './start-boundary-admission/trip-start-boundary-admission-shadow.runtime';
import { persistStartBoundaryAdmissionShadowDurable } from './start-boundary-admission/trip-start-boundary-admission-durable.persistence';
import { resolveTripStartIntegrationModality } from './start-boundary-admission/trip-start-boundary-integration-modality';
import {
  resolveLegacyConfirmedStartBoundary,
  type StartBoundaryEvidenceContext,
} from './start-boundary-admission/trip-start-boundary-legacy-resolution';
import {
  clearPossibleEndClockFields,
  clearPossibleStartClockFields,
  reconcilePossibleEndClockColumns,
  readPossibleEndEnteredAtFromEvidence,
  resolvePossibleEndBoundaryAnchor,
  resolvePossibleEndBoundaryCandidate,
  resolvePossibleEndFsmDwellAnchor,
  resolvePossibleStartConfirmationAnchor,
  resolveOperationalNoCoreInactivityAnchor,
  resolveStartCandidateClock,
  isValidProviderEventTimestamp,
} from './trip-fsm-clock-contract';
import {
  TripLifecycleRecoveryService,
  type ExecuteLifecycleRecoveryParams,
} from './trip-lifecycle-recovery.service';
import { resolveMergeReopenPossibleStartAt } from './trip-lifecycle-recovery-meta';
import { buildMidGapSplitActiveFsmExtras } from './trip-mid-gap-fsm.util';
import {
  buildMidGapAppliedForensics,
  buildMidGapRejectedForensics,
  classifyLiveMidGapDriftDecision,
  computeMidGapDriftEvidence,
  selectRoutePointAtOrAfter,
  selectRoutePointAtOrBefore,
  type MidGapSplitCommitPhase,
} from './trip-mid-gap-split.util';
import { findMidTripGapCandidateWithPolicy } from './trip-mid-gap-detection.util';
import { isTripMidGapTelemetrySilenceHardeningEnabledForVehicle } from './trip-mid-gap-telemetry-silence.config';
import { resolveMaxSameTripQualifiedStopMs } from './trip-qualified-stop-duration.config';
import {
  buildMidGapCommitAmbiguityForensics,
  readDurableLiveSplitOutcome,
  type DurableLiveSplitOutcome,
} from './trip-mid-gap-split-commit.util';
import {
  readDurableTerminalOutcome,
  resolveTerminalRestingRecoveryWake,
} from './trip-terminal-lifecycle-commit.util';
import {
  assessSuccessfulEmptyCoreEndEligibility,
  buildEmptyCoreKeepOpenSummary,
  buildEmptyCorePossibleEndSummary,
} from './trip-empty-core-end-gate';
import { computeEmptyCoreBackoffMs } from './trip-empty-core-backoff';
import {
  classifyFetchError,
  coreFetchOutcome,
  type TripTelemetryFetchOutcome,
} from './trip-fetch-outcome';
import {
  clearPauseEvidence,
  isPauseCorroborated,
  mergeEmptyCoreDeferral,
  mergeLastProviderActivityAt,
  mergePauseDetectedAt,
  mergeStopBoundaryAt,
  mergeProviderStopBoundaryCandidate,
  readActiveStopBoundaryAt,
  readLastProviderActivityAt,
  resolveIdleStopBoundaryAt,
  resolveProviderStopBoundaryCandidate,
  readEmptyCoreDeferralStreak,
  readPauseDetectedAt,
  readStopBoundaryAt,
  readStopBoundaryProvenance,
  resolveProviderOperationalAnchor,
  retireActiveStopBoundaryAfterMovement,
} from './trip-fsm-evidence-state';
import {
  buildEndValidationCompletionEvidence,
  buildEndValidationFailureEvidence,
  buildEndValidationFetchFailureEvidence,
  buildEndValidationScheduledEvidence,
  buildEndValidationStartedEvidence,
  buildChSkipResumeRevalidationDeferredEvidence,
  buildChSkipResumeRevalidationHandoffEvidence,
  buildMaxAttemptFallbackEvidence,
  buildPendingFinalizeScheduledEvidence,
  buildPossibleEndToActiveReset,
  evaluateChSkipResumeRevalidationMaturity,
  evaluateEndCycleJobAdmission,
  extractR5EndForensicsForPersistence,
  mapEndCycleStaleFinalizeReason,
  readChSkipResumeRevalidationDeferCount,
  resolveChSkipResumeRevalidationImmaturityBoundMs,
  resolveChSkipResumeRevalidationHandoffReason,
  resolveChSkipResumeRevalidationMaxDeferCount,
  resolveChSkipResumeRevalidationRelatchEnteredAt,
  resolveEndCycleToken,
  resolveEndValidationAttemptsOnPossibleEndReentry,
  type ChSkipResumeRevalidationOutcome,
  type PecResumeCheckOutcome,
  validateCusumMovementEventTime,
} from './trip-end-cycle-reset';
import {
  classifyChangePointEndFinding,
} from './trip-end-validation-classifier';
import {
  cancelPendingTripTrackingJobs,
  enqueueEndCycleTripTrackingJob,
  enqueuePreemptiveTripTrackingJob,
  enqueueStableTripTrackingJob,
} from './trip-tracking-queue.util';
import {
  isTripTrackingHandoffJob,
  TripTrackingHandoffLockContentionError,
} from './trip-tracking-lock-contention';
import type { TripLifecycleTripFact } from './trip-lifecycle-invariant';
import {
  buildEndTimelineFields,
  buildStartTimelineFields,
  buildTripFsmForensicsR8V1,
  mergeFinalizeRawDetectionMeta,
  parseStrictEvidenceTimestamp,
  readPersistedEndRecognizedAt,
  resolveBoundaryConsistentEndCoordinate,
  resolveStartForensicProvenance,
} from './trip-fsm-forensics.util';
import { runTripObservabilitySafely } from './trip-fsm-observability-safe.util';
import {
  attachShadowToResultSummary,
  runShadowActiveTickObservation,
  runShadowFinalizeObservation,
  runShadowPauseStartObservation,
  runShadowResumeObservation,
} from './trip-fsm-shadow-observability.integration';
import {
  observeEndValidationCusumValidated,
  observeEndValidationOutcome,
  observeFinalizeCommitted,
} from './trip-end-validation-observability.integration';
import { TripEndValidationObservabilityService } from './trip-end-validation-observability.service';
import { TRIP_END_VALIDATION_OBSERVATION_OUTCOMES } from './trip-end-validation-observability.types';
import {
  observeEndBoundaryAdjustment,
  observeEndCandidateLatency,
  observeEndRecognitionLatency,
  observeStartBoundaryAdjustment,
  observeStartCandidateLatency,
  observeStartRecognitionLatency,
  observeTripDuration,
} from './trip-fsm-timing-observability.util';
import {
  analyzePersistedRouteMovement,
  computePersistedRouteDisplacementM,
  resolveFinalizeEndTime,
} from './trip-finalize-quality.util';
import { TripDiBoundaryAdmissionService } from './di-boundary-admission/trip-di-boundary-admission.service';
import { TripReconciliationService } from './reconciliation/trip-reconciliation.service';

type TripTrackingSchedulePhase = 'ps' | 'at' | 'pec' | 'ev' | 'fin';

/** Non-authoritative shadow layer — module-level so prototype `.call(harness)` tests still work. */
function runShadowObservabilitySafely<T>(
  logger: { warn: (message: string) => void } | undefined,
  name: string,
  fn: () => T,
): T | undefined {
  let result: T | undefined;
  runTripObservabilitySafely(logger, name, () => {
    result = fn();
  });
  return result;
}

function mergeShadowEvidencePatch(
  prior: Record<string, unknown>,
  shadowPatch: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!shadowPatch?.shadowObservability) return prior;
  return {
    ...prior,
    shadowObservability: shadowPatch.shadowObservability,
  };
}

@Injectable()
export class TripDetectionOrchestrationService {
  private readonly logger = new Logger(TripDetectionOrchestrationService.name);

  // ── Primary trip lifecycle config ──
  private readonly TRACKING_INTERVAL_MS: number;
  private readonly LOCK_TTL_MS = 120_000;
  private readonly BACKFILL_MS = 60_000;
  private readonly OVERLAP_CORE_MS = 30_000;
  private readonly OVERLAP_ROUTE_MS = 15_000;
  private readonly OVERLAP_PERF_MS = 30_000;
  private readonly CONFIRM_MAX_WAIT_MS = 180_000;
  private readonly tripStartBoundaryMaxLookbackMs: number;

  // ── Smart cooldown constants (replaces blunt COOLDOWN_MS = 5min) ──
  // After a completed trip: 2 min (vehicle likely still) — configurable
  private readonly COOLDOWN_AFTER_COMPLETE_MS = 2 * 60_000;
  // After a cancelled/discarded trip: 30s (allow quick re-detection)
  private readonly COOLDOWN_AFTER_DISCARD_MS = 30_000;
  // After a timeout/forced end: 1 min
  private readonly COOLDOWN_AFTER_TIMEOUT_MS = 60_000;

  // ── Active continuity: time-based evaluation windows (Fix B) ──
  // Replaces the old hardcoded slice(-5) approach with configurable time windows.
  private readonly TRIP_CONTINUITY_CORE_WINDOW_MS: number;
  private readonly TRIP_CONTINUITY_PERF_WINDOW_MS: number;

  // ── Trip End detection config (centralized, overridable via env) ──
  // Timeout fallback: last resort only, not the primary end trigger
  private readonly TRIP_END_TIMEOUT_MS: number;
  // How long POSSIBLE_END must remain stable before CUSUM runs
  private readonly TRIP_END_STABILITY_WINDOW_MS: number;
  // Min inactivity before CUSUM is triggered — enforced in processPossibleEndCheck
  private readonly TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS: number;
  // Retry interval between CUSUM validation attempts
  private readonly TRIP_END_VALIDATION_RETRY_MS: number;
  // Max CUSUM attempts before accepting timeout fallback
  private readonly TRIP_END_VALIDATION_MAX_ATTEMPTS: number;
  // CUSUM data window: how far back from possibleEndAt to fetch
  private readonly TRIP_END_SEGMENT_LOOKBACK_MS: number;
  // CUSUM data window: how far forward from possibleEndAt to fetch
  private readonly TRIP_END_SEGMENT_LOOKAHEAD_MS: number;

  // ── ClickHouse trip-end assist (first instance; FSM/CUSUM fallback) ──
  private readonly TRIP_END_CH_ASSIST_MIN_STATIONARY_MS: number;
  private readonly TRIP_END_CH_ASSIST_MIN_TRIP_DURATION_MS: number;
  private readonly TRIP_END_CH_ASSIST_STABILITY_MS: number;
  private readonly TRIP_END_CH_ASSIST_HIGH_STATIONARY_MS: number;

  private readonly TRIP_EMPTY_CORE_BACKOFF_BASE_MS: number;
  private readonly TRIP_EMPTY_CORE_BACKOFF_MAX_MS: number;
  private readonly TRIP_EMPTY_CORE_BACKOFF_JITTER_RATIO: number;

  // ── Mid-trip gap split: recognise short ignition-off parks inside a trip ──
  // Silence of at least this duration inside an otherwise ACTIVE trip,
  // sandwiched by stationary data, is treated as a mid-trip end + restart
  // and the trip is split into two canonical trips. Covers the DIMO case
  // where the telematics unit sleeps during a brief stop and no explicit
  // ignition-off signal is ever emitted.
  /** Max qualified-stop duration that remains the same trip (ms); split when duration > this. */
  private readonly maxSameTripQualifiedStopMs: number;
  // Max GPS drift between pre-gap and post-gap position that still counts
  // as "same parking spot" (prevents splitting signal dropouts during
  // actual driving, e.g., tunnels).
  private readonly TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M: number;
  // Minimum already-elapsed duration of the trip before we will consider a
  // split. Prevents splitting a trip seconds after it started when a startup
  // hiccup could be mistaken for a parked gap.
  private readonly TRIP_MID_GAP_MIN_PRE_DURATION_MS: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: DimoSegmentsService,
    private readonly batteryTripStartProducer: BatteryV2TripStartProducer,
    private readonly batteryLvRestSessionProducer: BatteryV2LvRestSessionProducer,
    private readonly configService: ConfigService,
    @InjectQueue(QUEUE_NAMES.TRIP_TRACKING)
    private readonly trackingQueue: Queue,
    @InjectQueue(QUEUE_NAMES.TRIP_BEHAVIOR_ENRICHMENT)
    private readonly behaviorQueue: Queue,
    private readonly enrichmentOrchestrator: TripEnrichmentOrchestratorService,
    private readonly postFinalizeAnalysisProducer: TripPostFinalizeAnalysisProducer,
    private readonly decisionEngine: TripDecisionEngine,
    private readonly policyResolver: TripDetectionPolicyResolver,
    private readonly detectorRegistry: DetectorRegistry,
    @Inject(forwardRef(() => TripLifecycleRecoveryService))
    private readonly lifecycleRecovery: TripLifecycleRecoveryService,
    private readonly diBoundaryAdmission: TripDiBoundaryAdmissionService,
    @Optional()
    private readonly tripReconciliation?: TripReconciliationService,
    @Optional()
    private readonly shutdownEvidenceTripContext?: ShutdownEvidenceTripContextService,
    @Optional() private readonly clickHouse?: ClickHouseService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
    @Optional()
    private readonly endValidationObservability?: TripEndValidationObservabilityService,
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly dtc02Observability?: Dtc02ObservabilityService,
  ) {
    this.TRACKING_INTERVAL_MS = this.configService.get<number>('worker.tripTrackingIntervalMs') ?? 30_000;
    this.TRIP_CONTINUITY_CORE_WINDOW_MS = this.configService.get<number>('worker.tripContinuityCoreWindowMs') ?? 120_000;
    this.TRIP_CONTINUITY_PERF_WINDOW_MS = this.configService.get<number>('worker.tripContinuityPerfWindowMs') ?? 90_000;
    this.TRIP_END_TIMEOUT_MS = this.configService.get<number>('worker.tripEndTimeoutMs') ?? 1_800_000;
    this.TRIP_END_STABILITY_WINDOW_MS = this.configService.get<number>('worker.tripEndStabilityWindowMs') ?? 90_000;
    this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS = this.configService.get<number>('worker.tripEndMinInactivityBeforeCusumMs') ?? 120_000;
    this.TRIP_END_VALIDATION_RETRY_MS = this.configService.get<number>('worker.tripEndValidationRetryMs') ?? 60_000;
    this.TRIP_END_VALIDATION_MAX_ATTEMPTS = this.configService.get<number>('worker.tripEndValidationMaxAttempts') ?? 3;
    this.TRIP_END_SEGMENT_LOOKBACK_MS = this.configService.get<number>('worker.tripEndSegmentLookbackMs') ?? 900_000;
    this.TRIP_END_SEGMENT_LOOKAHEAD_MS = this.configService.get<number>('worker.tripEndSegmentLookaheadMs') ?? 300_000;
    this.TRIP_END_CH_ASSIST_MIN_STATIONARY_MS =
      this.configService.get<number>('worker.tripEndChAssistMinStationaryMs') ?? 45_000;
    this.TRIP_END_CH_ASSIST_MIN_TRIP_DURATION_MS =
      this.configService.get<number>('worker.tripEndChAssistMinTripDurationMs') ?? 60_000;
    this.TRIP_END_CH_ASSIST_STABILITY_MS =
      this.configService.get<number>('worker.tripEndChAssistStabilityMs') ?? 30_000;
    this.TRIP_END_CH_ASSIST_HIGH_STATIONARY_MS =
      this.configService.get<number>('worker.tripEndChAssistHighConfidenceStationaryMs') ?? 90_000;
    this.TRIP_EMPTY_CORE_BACKOFF_BASE_MS =
      this.configService.get<number>('worker.tripEndEmptyCoreBackoffBaseMs') ?? 30_000;
    this.TRIP_EMPTY_CORE_BACKOFF_MAX_MS =
      this.configService.get<number>('worker.tripEndEmptyCoreBackoffMaxMs') ?? 600_000;
    this.TRIP_EMPTY_CORE_BACKOFF_JITTER_RATIO =
      this.configService.get<number>('worker.tripEndEmptyCoreBackoffJitterRatio') ?? 0.15;
    this.maxSameTripQualifiedStopMs =
      this.configService.get<number>('worker.tripSameTripMaxQualifiedStopMs') ??
      this.configService.get<number>('worker.tripMidGapSplitMs') ??
      resolveMaxSameTripQualifiedStopMs();
    this.TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M = this.configService.get<number>('worker.tripMidGapMaxStationaryDriftM') ?? 200;
    this.TRIP_MID_GAP_MIN_PRE_DURATION_MS = this.configService.get<number>('worker.tripMidGapMinPreDurationMs') ?? 60_000;
    this.tripStartBoundaryMaxLookbackMs =
      this.configService.get<number>('worker.tripStartBoundaryMaxLookbackMs') ?? 35 * 60_000;

    this.logger.log(
      `Trip end detection config: trackingIntervalMs=${this.TRACKING_INTERVAL_MS} ` +
        `minInactivityBeforeCusumMs=${this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS} ` +
        `stabilityWindowMs=${this.TRIP_END_STABILITY_WINDOW_MS} ` +
        `validationRetryMs=${this.TRIP_END_VALIDATION_RETRY_MS} ` +
        `validationMaxAttempts=${this.TRIP_END_VALIDATION_MAX_ATTEMPTS} ` +
        `timeoutMs=${this.TRIP_END_TIMEOUT_MS} ` +
        `chEndAssistMinStationaryMs=${this.TRIP_END_CH_ASSIST_MIN_STATIONARY_MS}`,
    );
  }

  private dimoProviderContext(
    dimoTokenId: number,
    vehicleId?: string,
    organizationId?: string | null,
  ): DimoProviderRequestContext {
    return buildDimoProviderRequestContext(dimoTokenId, {
      vehicleId,
      organizationId: organizationId ?? undefined,
    });
  }

  private recordEndValidationObservability(
    input: Omit<
      Parameters<typeof observeEndValidationOutcome>[0],
      'logger' | 'service' | 'retryBudgetMax'
    >,
  ): void {
    observeEndValidationOutcome({
      logger: this.logger,
      service: this.endValidationObservability,
      retryBudgetMax: this.TRIP_END_VALIDATION_MAX_ATTEMPTS,
      ...input,
    });
  }

  // ══════════════════════════════════════════════════════════
  //  STATE MANAGEMENT
  // ══════════════════════════════════════════════════════════

  async getOrCreateDetectionState(
    vehicleId: string,
    organizationId?: string | null,
  ): Promise<DetState> {
    const existing =
      await this.prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId },
      });
    if (existing) return existing;

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true, fuelType: true },
    });

    const profile = resolveDetectionProfile(vehicle?.fuelType);

    return this.prisma.vehicleTripDetectionState.upsert({
      where: { vehicleId },
      create: {
        vehicleId,
        organizationId: organizationId ?? vehicle?.organizationId ?? null,
        detectionProfile: profile,
      },
      update: {},
    });
  }

  async transitionState(
    vehicleId: string,
    newState: TripDetectionState,
    extras?: Record<string, unknown>,
  ): Promise<DetState> {
    return this.prisma.vehicleTripDetectionState.update({
      where: { vehicleId },
      data: { state: newState, ...extras } as any,
    });
  }

  /**
   * R2 — apply a lifecycle invariant recovery action (FSM authority only).
   * Canonical trip rows are never mutated here.
   */
  async executeLifecycleRecoveryAction(
    params: ExecuteLifecycleRecoveryParams,
  ): Promise<void> {
    const now = new Date();
    const {
      vehicleId,
      organizationId,
      dimoTokenId,
      det,
      action,
      tripId,
      classification,
      referencedTrip,
      recoveredTrip,
    } = params;

    const resolveRecoveredPossibleStartAt = (
      trip: TripLifecycleTripFact,
    ): Date => {
      if (classification === 'RECOVERABLE_MERGE_ORPHAN') {
        const anchor = resolveMergeReopenPossibleStartAt({
          rawDetectionMeta: trip.rawDetectionMeta,
          detPossibleStartAt: det.possibleStartAt,
        });
        if (!anchor) {
          throw new Error(
            `Merge orphan recovery missing safe episode anchor for trip ${tripId}`,
          );
        }
        return anchor;
      }
      if (
        classification === 'RECOVERABLE_MISSING_POINTER' &&
        det.possibleStartAt
      ) {
        return det.possibleStartAt;
      }
      return trip.startTime;
    };

    if (action === 'ADOPT_ONGOING') {
      const trip = recoveredTrip;
      if (!trip) {
        throw new Error(`Lifecycle recovery missing recovered trip ${tripId}`);
      }
      const possibleStartAt = resolveRecoveredPossibleStartAt(trip);
      const startRecognizedAt = new Date();
      await this.transitionState(vehicleId, TripDetectionState.ACTIVE_TRIP, {
        activeTripId: tripId,
        possibleStartAt,
        possibleStartEnteredAt: null,
        lastActivityAt: now,
        lastEvidenceSummary: {
          ...(((det.lastEvidenceSummary as Record<string, unknown> | null) ?? {})),
          lifecycleRecovery: classification,
          lifecycleRecoveryAt: now.toISOString(),
          lifecycleRecoveryTripId: tripId,
          startRecognizedAt: startRecognizedAt.toISOString(),
        },
      });
      const profileStr = String(det.detectionProfile ?? 'UNKNOWN');
      runTripObservabilitySafely(this.logger,'start_recognition_recovery', () => {
        observeStartRecognitionLatency(this.tripMetrics, {
          profile: profileStr,
          mode: 'recovery',
          outcome: 'recovery',
          recognizedAt: startRecognizedAt,
          canonicalStartAt: trip.startTime,
        });
      });
      await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);
      return;
    }

    if (action === 'REPOINT_ACTIVE_TRIP') {
      const trip = recoveredTrip;
      if (!trip) {
        throw new Error(`Lifecycle split repoint missing recovered trip ${tripId}`);
      }
      await this.transitionState(
        vehicleId,
        TripDetectionState.ACTIVE_TRIP,
        {
          ...buildMidGapSplitActiveFsmExtras({
            secondTripId: tripId,
            secondStartAt: trip.startTime,
          }),
          lastEvidenceSummary: {
            ...(((det.lastEvidenceSummary as Record<string, unknown> | null) ?? {})),
            lifecycleRecovery: classification,
            lifecycleRecoveryAt: now.toISOString(),
            lifecycleRecoveryTripId: tripId,
          },
        },
      );
      await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);
      return;
    }

    if (action === 'RESET_TO_RESTING') {
      const restingReason =
        referencedTrip?.tripStatus === TripStatus.CANCELLED
          ? 'discard'
          : 'complete';
      const restAnchor =
        referencedTrip?.tripStatus === TripStatus.COMPLETED &&
        referencedTrip.endTime
          ? referencedTrip.endTime
          : now;

      await this.transitionState(vehicleId, TripDetectionState.RESTING, {
        activeTripId: null,
        ...clearPossibleStartClockFields(),
        ...clearPossibleEndClockFields(),
        lastActivityAt: restAnchor,
        lastMeaningfulMovementAt: null,
        lastCoreProcessedAt: null,
        lastRouteProcessedAt: null,
        lastDrivingProcessedAt: null,
        startOdometerKm: null,
        startFuelLevel: null,
        startEvSoc: null,
        startDetectionMode: null,
        startConfidence: null,
        endDetectionMode: null,
        endConfidence: null,
        endValidationAttempts: 0,
        cusumValidatedAt: null,
        cusumSegmentStart: null,
        cusumSegmentEnd: null,
        lastEvidenceSummary: {
          lastRestingReason: restingReason,
          lifecycleRecovery: classification,
          lifecycleRecoveryAt: now.toISOString(),
          recoveredFromTripId: tripId,
        },
      });
    }
  }

  private async maybeRecoverLifecycleInvariant(params: {
    det: DetState;
    organizationId: string | null;
    dimoTokenId: number;
    context?: {
      expectedStartAt?: Date | null;
      expectedDimoSegmentId?: string | null;
      mergeTargetTripId?: string | null;
    };
  }): Promise<'recovered' | 'blocked' | 'continue'> {
    const outcome = await this.lifecycleRecovery.attemptRecovery({
      det: params.det,
      organizationId: params.organizationId,
      dimoTokenId: params.dimoTokenId,
      context: params.context,
    });
    if (outcome.recovered) return 'recovered';
    if (outcome.blocked) return 'blocked';
    return 'continue';
  }

  // ══════════════════════════════════════════════════════════
  //  WORKER LOCKING
  // ══════════════════════════════════════════════════════════

  async acquireWorkerLock(
    vehicleId: string,
    ttlMs = this.LOCK_TTL_MS,
  ): Promise<WorkerLockResult> {
    const runToken = randomUUID();
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + ttlMs);

    const result =
      await this.prisma.vehicleTripDetectionState.updateMany({
        where: {
          vehicleId,
          OR: [
            { workerLockedUntil: null },
            { workerLockedUntil: { lt: now } },
          ],
        },
        data: { workerLockedUntil: lockedUntil, workerRunToken: runToken },
      });

    return { acquired: result.count > 0, runToken };
  }

  async releaseWorkerLock(
    vehicleId: string,
    runToken: string,
  ): Promise<void> {
    await this.prisma.vehicleTripDetectionState.updateMany({
      where: { vehicleId, workerRunToken: runToken },
      data: { workerLockedUntil: null, workerRunToken: null },
    });
  }

  // ══════════════════════════════════════════════════════════
  //  SCHEDULING
  // ══════════════════════════════════════════════════════════

  private tripTrackingJobId(
    phase: TripTrackingSchedulePhase,
    vehicleId: string,
    activeTripId?: string | null,
  ): string {
    if (phase === 'ps') {
      return `trip-ps-${vehicleId}`;
    }
    const tripKey = activeTripId ?? 'pending';
    return `trip-${phase}-${vehicleId}-${tripKey}`;
  }

  private async resolveActiveTripIdForScheduling(
    vehicleId: string,
  ): Promise<string | null> {
    const det = await this.prisma.vehicleTripDetectionState.findUnique({
      where: { vehicleId },
      select: { activeTripId: true },
    });
    return det?.activeTripId ?? null;
  }

  /** Drop queued successor/primary end-cycle jobs when POSSIBLE_END is cancelled. */
  private async cancelPendingEndCycleJobs(
    vehicleId: string,
    activeTripId: string | null,
  ): Promise<void> {
    const phases: TripTrackingSchedulePhase[] = ['ev', 'fin'];
    const jobIds = phases.map((phase) =>
      this.tripTrackingJobId(phase, vehicleId, activeTripId),
    );
    const { removed, activePreserved } = await cancelPendingTripTrackingJobs({
      queue: this.trackingQueue,
      jobIds,
    });
    if (removed > 0 || activePreserved > 0) {
      this.logger.debug(
        `End-cycle job recycle for ${vehicleId} trip=${activeTripId ?? 'pending'}: ` +
          `removed=${removed} activePreserved=${activePreserved}`,
      );
    }
  }

  /**
   * R12: restore POSSIBLE_END clock columns from durable evidence when DB columns
   * were lost; prevents updatedAt/workerNow from becoming dwell/boundary anchors.
   */
  private async ensurePossibleEndClockDurability(
    vehicleId: string,
    det: DetState,
    workerNow: Date,
  ): Promise<DetState> {
    if (det.state !== TripDetectionState.POSSIBLE_END) return det;
    const patch = reconcilePossibleEndClockColumns({
      state: det.state,
      possibleEndAt: det.possibleEndAt,
      possibleEndEnteredAt: det.possibleEndEnteredAt,
      lastEvidenceSummary: det.lastEvidenceSummary,
      workerNow,
    });
    if (!patch) return det;
    return this.transitionState(vehicleId, TripDetectionState.POSSIBLE_END, patch);
  }

  /**
   * Enqueue a trip-tracking job with a stable per-vehicle/phase/trip jobId so
   * concurrent schedule calls do not pile up duplicate BullMQ jobs.
   *
   * R3A: when the primary job is still ACTIVE (self-reschedule), a durable
   * successor slot (`${jobId}__succ`) is used instead of one-shot setImmediate.
   */
  private async enqueueTripTrackingJob(
    phase: TripTrackingSchedulePhase,
    vehicleId: string,
    organizationId: string | null,
    dimoTokenId: number,
    trigger: TripTrackingJobData['trigger'],
    opts?: {
      delayMs?: number;
      activeTripId?: string | null;
      endCycleToken?: string | null;
      /** R10: recycle waiting end-cycle jobs before enqueue (FINALIZE / END_VALIDATION). */
      recycleEndCycleSlot?: boolean;
      /** R11: replace delayed empty-core backoff with an urgent ACTIVE_TICK. */
      preemptDelayed?: boolean;
    },
  ): Promise<void> {
    if (!canEnqueueQueue(this.logger, 'trip-tracking')) return;

    const activeTripId =
      opts?.activeTripId !== undefined
        ? opts.activeTripId
        : phase === 'ps'
          ? null
          : await this.resolveActiveTripIdForScheduling(vehicleId);

    const jobId = this.tripTrackingJobId(phase, vehicleId, activeTripId);
    const delayMs = opts?.delayMs ?? 0;
    const data: TripTrackingJobData = {
      vehicleId,
      organizationId,
      dimoTokenId,
      trigger,
      requestedAt: new Date().toISOString(),
      ...(opts?.endCycleToken ? { endCycleToken: opts.endCycleToken } : {}),
    };

    const outcome = opts?.recycleEndCycleSlot
      ? await enqueueEndCycleTripTrackingJob({
          queue: this.trackingQueue,
          jobName: 'trip-tracking',
          jobId,
          data,
          trigger,
          delayMs,
        })
      : opts?.preemptDelayed
        ? await enqueuePreemptiveTripTrackingJob({
            queue: this.trackingQueue,
            jobName: 'trip-tracking',
            jobId,
            data,
            trigger,
            delayMs,
          })
        : await enqueueStableTripTrackingJob({
            queue: this.trackingQueue,
            jobName: 'trip-tracking',
            jobId,
            data,
            trigger,
            delayMs,
          });

    if (outcome === 'skipped') {
      this.logger.debug(
        `Trip tracking job not re-enqueued (already queued): jobId=${jobId} trigger=${trigger}`,
      );
    } else if (outcome === 'successor') {
      this.logger.debug(
        `Trip tracking successor scheduled: primary=${jobId} successor=${jobId}__succ trigger=${trigger} delayMs=${delayMs}`,
      );
    } else if (opts?.recycleEndCycleSlot) {
      this.logger.debug(
        `End-cycle enqueue outcome=${outcome} jobId=${jobId} trigger=${trigger} delayMs=${delayMs}`,
      );
    }
  }

  async schedulePossibleStart(
    vehicleId: string,
    organizationId: string | null,
    dimoTokenId: number,
    delayMs = 0,
  ): Promise<void> {
    await this.enqueueTripTrackingJob(
      'ps',
      vehicleId,
      organizationId,
      dimoTokenId,
      TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
      { delayMs },
    );
  }

  async scheduleActiveTick(
    vehicleId: string,
    organizationId: string | null,
    dimoTokenId: number,
    delayMs?: number,
    opts?: { preemptDelayed?: boolean },
  ): Promise<void> {
    await this.enqueueTripTrackingJob(
      'at',
      vehicleId,
      organizationId,
      dimoTokenId,
      TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
      {
        delayMs: delayMs ?? this.TRACKING_INTERVAL_MS,
        preemptDelayed: opts?.preemptDelayed,
      },
    );
  }

  /**
   * R11: urgent provider wake during empty-core backoff — preempt delayed ACTIVE_TICK.
   */
  async accelerateActiveTickAfterWake(
    vehicleId: string,
    organizationId: string | null,
    dimoTokenId: number,
  ): Promise<void> {
    await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId, 0, {
      preemptDelayed: true,
    });
  }

  async schedulePossibleEndCheck(
    vehicleId: string,
    organizationId: string | null,
    dimoTokenId: number,
    delayMs?: number,
  ): Promise<void> {
    await this.enqueueTripTrackingJob(
      'pec',
      vehicleId,
      organizationId,
      dimoTokenId,
      TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK,
      { delayMs: delayMs ?? this.TRACKING_INTERVAL_MS },
    );
  }

  async scheduleEndValidation(
    vehicleId: string,
    organizationId: string | null,
    dimoTokenId: number,
    delayMs?: number,
  ): Promise<void> {
    const det = await this.getOrCreateDetectionState(vehicleId, organizationId);
    const endCycleToken = resolveEndCycleToken(det);
    await this.enqueueTripTrackingJob(
      'ev',
      vehicleId,
      organizationId,
      dimoTokenId,
      TRIP_TRACKING_TRIGGERS.END_VALIDATION,
      {
        delayMs: delayMs ?? 0,
        activeTripId: det.activeTripId,
        endCycleToken,
        recycleEndCycleSlot: endCycleToken != null,
      },
    );
  }

  async scheduleFinalize(
    vehicleId: string,
    organizationId: string | null,
    dimoTokenId: number,
  ): Promise<void> {
    const det = await this.getOrCreateDetectionState(vehicleId, organizationId);
    if (det.state === TripDetectionState.ACTIVE_TRIP) {
      this.logger.debug(
        `scheduleFinalize skipped for ${vehicleId}: FSM is ACTIVE_TRIP`,
      );
      return;
    }
    const endCycleToken = resolveEndCycleToken(det);
    if (!endCycleToken) {
      this.logger.warn(
        `scheduleFinalize skipped for ${vehicleId}: missing end cycle token (possibleEndEnteredAt)`,
      );
      return;
    }
    const workerNow = new Date();
    await this.transitionState(vehicleId, det.state, {
      lastEvidenceSummary: buildPendingFinalizeScheduledEvidence({
        priorSummary: det.lastEvidenceSummary as Record<string, unknown> | null,
        endCycleToken,
        workerNow,
      }),
    });
    await this.enqueueTripTrackingJob(
      'fin',
      vehicleId,
      organizationId,
      dimoTokenId,
      TRIP_TRACKING_TRIGGERS.FINALIZE,
      {
        delayMs: 0,
        activeTripId: det.activeTripId,
        endCycleToken,
        recycleEndCycleSlot: true,
      },
    );
  }

  // ══════════════════════════════════════════════════════════
  //  SNAPSHOT EVALUATION (trigger layer)
  // ══════════════════════════════════════════════════════════

  async evaluateSnapshotForTripStart(
    vehicleId: string,
    dimoTokenId: number,
    previousTelemetry: VehicleLatestState | null,
    current: SnapshotEvidenceSignals,
    wakeOptions?: EvaluateSnapshotForTripStartWakeOptions,
  ): Promise<TripStartEvaluation> {
    const detState = await this.getOrCreateDetectionState(vehicleId);

    if (detState.state !== TripDetectionState.RESTING) {
      return { shouldStartTracking: false };
    }

    const workerNow = new Date();
    const wakeContext = wakeOptions?.wakeContext ?? null;
    const snapshotFetchedAt = wakeOptions?.snapshotFetchedAt ?? workerNow;
    const restAnchorAt = detState.lastActivityAt ?? null;
    const lastMeta = detState.lastEvidenceSummary as Record<string, unknown> | null;
    const lastReason = lastMeta?.lastRestingReason as string | undefined;

    const cooldownBypass = evaluateTrustedCompleteCooldownBypass({
      lastRestingReason: lastReason,
      restAnchorAt,
      wakeContext,
      snapshotSourceTimestamp: current.sourceTimestamp,
      workerNow,
    });

    // ── Smart cooldown (replaces blunt 5-min flat cooldown) ──────────────────
    // Cooldown duration depends on WHY we entered RESTING, not just time elapsed.
    // This prevents false-zero blind spots after discarded micro-trips.
    if (detState.updatedAt && !cooldownBypass.bypass) {
      const sinceLast = workerNow.getTime() - detState.updatedAt.getTime();

      let cooldownMs: number;
      if (lastReason === 'discard') {
        cooldownMs = this.COOLDOWN_AFTER_DISCARD_MS;
      } else if (lastReason === 'timeout') {
        cooldownMs = this.COOLDOWN_AFTER_TIMEOUT_MS;
      } else {
        cooldownMs = this.COOLDOWN_AFTER_COMPLETE_MS;
      }

      if (sinceLast < cooldownMs) {
        return { shouldStartTracking: false };
      }
    }

    const profile = detState.detectionProfile ?? VehicleDetectionProfile.UNKNOWN;
    const profileStr = String(profile);
    const liveStartFreshness = assessLiveStartSnapshotFreshness({
      providerSourceTimestamp: current.sourceTimestamp,
      workerNow,
    });

    const dataQuality = this.policyResolver.assessDataQuality({
      snapshotFreshMs: liveStartFreshness.snapshotFreshMs,
      ignitionAvailable: current.isIgnitionOn != null,
      speedAvailable: current.speedKmh != null,
      odometerAvailable: current.odometerKm != null,
      corePointCount: 1,
      hasRoutePoints: false,
      hasHighFrequency: false,
    });
    if (liveStartFreshness.state === 'FRESH') {
      dataQuality.snapshotFreshness = 'FRESH';
    } else if (liveStartFreshness.state === 'STALE') {
      dataQuality.snapshotFreshness = 'STALE';
    } else if (liveStartFreshness.state === 'MISSING') {
      dataQuality.snapshotFreshness = 'MISSING';
    }

    const policy = this.policyResolver.resolve({
      phase: DETECTION_PHASES.LIVE_START,
      profile,
      dataQuality,
      liveStartFreshnessState: liveStartFreshness.state,
      anomalyContext: {},
    });

    if (policy.detectors.length === 0) {
      this.logger.debug(
        `LIVE_START skipped ${vehicleId} freshness=${liveStartFreshness.state}` +
          (policy.skipReason ? ` reason=${policy.skipReason}` : ''),
      );
      return { shouldStartTracking: false };
    }

    const findings = await this.detectorRegistry.runAll(
      policy.detectors,
      {
        vehicleId,
        dimoTokenId,
        profile,
        phase: DETECTION_PHASES.LIVE_START,
        currentState: detState.state,
        snapshotSignals: current,
        previousSnapshot: previousTelemetry
          ? {
              latitude: previousTelemetry.latitude,
              longitude: previousTelemetry.longitude,
              odometerKm: previousTelemetry.odometerKm,
              fuelLevelAbsolute: previousTelemetry.fuelLevelAbsolute,
              evSoc: previousTelemetry.evSoc,
              isIgnitionOn: previousTelemetry.isIgnitionOn,
              speedKmh: previousTelemetry.speedKmh,
            }
          : null,
      },
      policy.timeoutMs,
    );

    const startDecision = this.decisionEngine.evaluateStartCandidate(findings);

    if (!startDecision.shouldStart) {
      return { shouldStartTracking: false };
    }

    // Extract evidence summary from the SnapshotEvidenceEvaluator finding
    const evidenceFinding = findings.find((f) => f.detectorName === 'SnapshotEvidenceEvaluator');
    const ev = evidenceFinding?.evidence ?? {};

    const now = workerNow;
    const startClock = resolveStartCandidateClock({
      providerSourceTimestamp: current.sourceTimestamp,
      workerNow: now,
    });
    const confEnum =
      startDecision.confidence === 'HIGH'
        ? DetectionConfidence.HIGH
        : startDecision.confidence === 'MEDIUM'
          ? DetectionConfidence.MEDIUM
          : DetectionConfidence.LOW;

    await this.transitionState(
      vehicleId,
      TripDetectionState.POSSIBLE_START,
      {
        possibleStartAt: startClock.candidateEventAt,
        possibleStartEnteredAt: startClock.enteredAt,
        lastSnapshotEvidenceAt: startClock.candidateEventAt,
        // WORKER_TIME — operational evaluation timestamp, not physical movement.
        lastActivityAt: now,
        startOdometerKm: current.odometerKm,
        startFuelLevel: current.fuelLevelAbsolute,
        startEvSoc: current.evSoc,
        startDetectionMode: startDecision.mode as StartDetectionMode | undefined,
        startConfidence: confEnum,
        lastEvidenceSummary: {
          candidatePhase: START_DETECTION_PHASES.START_CANDIDATE_WAKE,
          candidatePolicyProfile: profileStr,
          strong: ev.strong,
          weak: ev.weak,
          hasMovement: ev.hasMovement,
          reasons: ev.reasons,
          profile: profileStr,
          detectorPolicy: policy.detectors,
          candidateFreshnessState: liveStartFreshness.state,
          candidateTimestampSource: liveStartFreshness.timestampSource,
          candidateProviderObservedAt:
            liveStartFreshness.providerSourceTimestamp?.toISOString() ?? null,
          startCandidateClockSource: startClock.clockSource,
          startCandidateObservedAt: startClock.candidateEventAt.toISOString(),
          startCandidateEnteredAt: startClock.enteredAt.toISOString(),
          ...(wakeContext
            ? {
                startWake: buildSnapshotWakeForensics({
                  wakeContext,
                  snapshotFetchedAt,
                  cooldownBypassUsed: cooldownBypass.cooldownBypassUsed,
                }),
              }
            : {}),
        },
      },
    );

    await this.schedulePossibleStart(
      vehicleId,
      detState.organizationId,
      dimoTokenId,
    );

    const reasons = (ev.reasons as string[]) ?? [startDecision.reason];
    this.logger.log(
      `POSSIBLE_START ${vehicleId} [${profileStr}] via ${policy.detectors.join('+')}` +
        `: ${reasons.join(', ')} (conf=${startDecision.confidence})`,
    );
    runTripObservabilitySafely(this.logger, 'start_candidate_counter', () => {
      this.tripMetrics?.tripStartCandidates.inc({
        profile: profileStr,
        detector: policy.detectors[0] ?? 'none',
      });
    });
    runTripObservabilitySafely(this.logger,'start_candidate_latency', () => {
      observeStartCandidateLatency(this.tripMetrics, {
        profile: profileStr,
        clockSource: startClock.clockSource,
        candidateAt: startClock.candidateEventAt,
        enteredAt: startClock.enteredAt,
      });
    });

    return {
      shouldStartTracking: true,
      reason: reasons.join(', '),
      startDetectionMode: startDecision.mode as StartDetectionMode | undefined,
      confidence: startDecision.confidence,
      evidenceSummary: {
        strong: ev.strong as number,
        weak: ev.weak as number,
        hasMovement: ev.hasMovement as boolean,
        reasons: reasons,
      },
    };
  }

  // ══════════════════════════════════════════════════════════
  //  PROCESS: POSSIBLE_START
  // ══════════════════════════════════════════════════════════

  async processPossibleStart(data: TripTrackingJobData): Promise<void> {
    const { vehicleId, dimoTokenId, organizationId } = data;
    const lock = await this.acquireWorkerLock(vehicleId);
    if (!lock.acquired) {
      if (isTripTrackingHandoffJob(data)) {
        throw new TripTrackingHandoffLockContentionError();
      }
      this.logger.debug(`Lock not acquired for POSSIBLE_START ${vehicleId}`);
      return;
    }

    const startedMs = Date.now();
    let resultState: TripDetectionState | undefined;

    try {
      const det = await this.getOrCreateDetectionState(vehicleId, organizationId);
      if (det.state !== TripDetectionState.POSSIBLE_START) {
        if (
          (det.state === TripDetectionState.ACTIVE_TRIP ||
            det.state === TripDetectionState.IDLE_WITHIN_TRIP) &&
          det.activeTripId
        ) {
          await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);
        }
        return;
      }

      const earlyRecovery = await this.maybeRecoverLifecycleInvariant({
        det,
        organizationId,
        dimoTokenId,
      });
      if (earlyRecovery !== 'continue') {
        return;
      }

      const profile = det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN;
      const profileStr = String(profile);
      const now = new Date();
      const startAt = det.possibleStartAt ?? now;
      const confirmationAnchor = resolvePossibleStartConfirmationAnchor(det, now);
      const elapsed = now.getTime() - confirmationAnchor.getTime();

      // Expire stale start candidates before they can be confirmed from old data.
      if (elapsed > this.CONFIRM_MAX_WAIT_MS) {
        resultState = TripDetectionState.RESTING;
        await this.transitionState(
          vehicleId,
          TripDetectionState.RESTING,
          {
            ...clearPossibleStartClockFields(),
            startOdometerKm: null,
            startFuelLevel: null,
            startEvSoc: null,
            lastEvidenceSummary: null,
            startDetectionMode: null,
            startConfidence: null,
          },
        );
        this.logger.log(
          `POSSIBLE_START expired for ${vehicleId} after ${Math.round(elapsed / 1000)}s`,
        );

        await this.logTrackingRun({
          vehicleId,
          organizationId,
          tripId: det.activeTripId,
          stateAtRun: TripDetectionState.POSSIBLE_START,
          runType: TripTrackingRunType.POSSIBLE_START_VALIDATION,
          requestedFrom: startAt,
          requestedTo: now,
          corePointsCount: 0,
          resultState,
          resultSummary: {
            reason: 'possible_start_expired',
            elapsedMs: elapsed,
            maxWaitMs: this.CONFIRM_MAX_WAIT_MS,
          },
          durationMs: Date.now() - startedMs,
        });
        return;
      }

      const from = computePossibleStartCoreFetchFrom(
        startAt,
        now,
        this.tripStartBoundaryMaxLookbackMs,
        this.BACKFILL_MS,
      );

      const corePoints = await this.segments.fetchRawTripCoreData(
        dimoTokenId,
        from,
        now,
        this.dimoProviderContext(dimoTokenId, vehicleId, organizationId),
      );

      const telemetry = await this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
      });

      const clickhouseAvailable = this.hasClickHouseAnalyticsDetectors();
      const confirmationPolicy = this.policyResolver.resolve({
        phase: DETECTION_PHASES.ACTIVE_TRIP,
        profile,
        dataQuality: {
          snapshotFreshness: telemetry?.updatedAt ? 'FRESH' : 'MISSING',
          ignitionAvailable: telemetry?.isIgnitionOn != null,
          speedAvailable: telemetry?.speedKmh != null,
          odometerAvailable: telemetry?.odometerKm != null,
          telemetryDensity:
            corePoints.length >= 4
              ? 'HIGH'
              : corePoints.length >= 2
                ? 'MEDIUM'
                : corePoints.length === 1
                  ? 'LOW'
                  : 'NONE',
          routeCoverage: 'NONE',
          highFrequencyAvailable: clickhouseAvailable,
        },
        anomalyContext: {
          confirmingStart: true,
          clickhouseAvailable,
        },
      });

      // ── PHASE 2 SEAM: Start confirmation with optional ClickHouse corroboration ──
      const confirmFindings = await this.detectorRegistry.runAll(
        confirmationPolicy.detectors,
        {
          vehicleId,
          dimoTokenId,
          profile,
          phase: DETECTION_PHASES.ACTIVE_TRIP,
          timeWindow: { from, to: now },
          coreDataPoints: corePoints,
          snapshotSignals: telemetry
            ? {
                isIgnitionOn: telemetry.isIgnitionOn,
                speedKmh: telemetry.speedKmh,
                engineLoad: telemetry.engineLoad,
                tractionBatteryPowerKw: null,
                latitude: telemetry.latitude,
                longitude: telemetry.longitude,
                odometerKm: telemetry.odometerKm,
                fuelLevelAbsolute: telemetry.fuelLevelAbsolute,
                evSoc: telemetry.evSoc,
                sourceTimestamp: telemetry.sourceTimestamp ?? null,
              }
            : undefined,
          anomalyContext: {
            confirmingStart: true,
            clickhouseAvailable,
          },
        },
        confirmationPolicy.timeoutMs,
      );

      const confirmFinding = confirmFindings.find(
        (f) => f.detectorName === 'StartConfirmationDetector',
      );
      const analyticsStartDecision = resolveAnalyticsAssistedStartDecision({
        startConfirmation: confirmFinding,
        activityWindow: confirmFindings.find(
          (f) => f.detectorName === 'ActivityWindowDetector',
        ),
        ignitionSegment: confirmFindings.find(
          (f) => f.detectorName === 'IgnitionSegmentDetector',
        ),
        motionSegment: confirmFindings.find(
          (f) => f.detectorName === 'MotionSegmentDetector',
        ),
        profile,
        currentTelemetry: telemetry
          ? {
              isIgnitionOn: telemetry.isIgnitionOn,
              speedKmh: telemetry.speedKmh,
              engineLoad: telemetry.engineLoad,
            }
          : null,
      });
      const confirmed = analyticsStartDecision.confirmed;
      const confirmConfidence = analyticsStartDecision.confidence;
      const confirmMode = analyticsStartDecision.mode;
      const confirmSummary = {
        detectorSummary:
          (confirmFinding?.evidence?.summary as Record<string, unknown> | undefined) ??
          null,
        analytics: analyticsStartDecision.summary,
      };

      if (confirmed) {
        const confEnum =
          confirmConfidence === 'HIGH'
            ? DetectionConfidence.HIGH
            : confirmConfidence === 'MEDIUM'
              ? DetectionConfidence.MEDIUM
              : DetectionConfidence.LOW;
        const boundaryResolution = await this.resolveConfirmedStartBoundary({
          dimoTokenId,
          vehicleId,
          organizationId,
          candidateStartAt: startAt,
          confirmedAt: now,
          corePoints,
          profile: profileStr,
        });
        const resolvedStart = boundaryResolution.legacy;
        const effectiveStartAt = resolvedStart.startAt;
        const startRouteFetchFrom = new Date(
          Math.max(
            effectiveStartAt.getTime() - this.BACKFILL_MS,
            now.getTime() - this.tripStartBoundaryMaxLookbackMs,
          ),
        );
        let startBoundaryShadowSummary: ShadowStartBoundaryAdmissionSummary | null =
          null;
        let startEvidenceSummary = {
          ...(((det.lastEvidenceSummary as Record<string, unknown> | null) ?? {})),
          startCandidateAt: startAt.toISOString(),
          startCandidateObservedAt:
            typeof (det.lastEvidenceSummary as Record<string, unknown> | null)
              ?.startCandidateObservedAt === 'string'
              ? (det.lastEvidenceSummary as Record<string, unknown>).startCandidateObservedAt
              : startAt.toISOString(),
          startCandidateEnteredAt:
            det.possibleStartEnteredAt?.toISOString() ??
            (typeof (det.lastEvidenceSummary as Record<string, unknown> | null)
              ?.startCandidateEnteredAt === 'string'
              ? (det.lastEvidenceSummary as Record<string, unknown>).startCandidateEnteredAt
              : null),
          confirmedStartAt: effectiveStartAt.toISOString(),
          confirmedStartSource: resolvedStart.source,
          startBoundaryAdjustedMs: resolvedStart.adjustedMs,
          startEvidencePath: analyticsStartDecision.evidencePath,
          clickhouseAssistedStart: analyticsStartDecision.evidencePath !== 'DIMO_ONLY',
          startConfirmationSummary: analyticsStartDecision.summary,
        };
        if (isTripStartBoundaryAdmissionShadowEnabledForVehicle(vehicleId)) {
          try {
            const integrationModality = await resolveTripStartIntegrationModality(
              this.prisma,
              vehicleId,
            );
            const shadowSummary = await runStartBoundaryAdmissionShadow({
              vehicleId,
              dimoTokenId,
              organizationId,
              candidateStartAt: startAt,
              confirmedAt: now,
              corePoints,
              profile: profileStr,
              integrationModality,
              legacy: {
                startAt: effectiveStartAt,
                source: resolvedStart.source,
                dimoSegmentId: resolvedStart.dimoSegmentId,
              },
              evidence: boundaryResolution.evidence,
              segments: this.segments,
              providerContext: this.dimoProviderContext(
                dimoTokenId,
                vehicleId,
                organizationId,
              ),
              tripMetrics: this.tripMetrics,
              logger: this.logger,
            });
            startBoundaryShadowSummary = shadowSummary;
            startEvidenceSummary = mergeShadowStartBoundaryIntoEvidenceSummary(
              startEvidenceSummary,
              shadowSummary,
            );
          } catch (err) {
            this.logger.warn(
              `Start boundary admission shadow wiring failed (non-blocking): vehicle=${vehicleId} ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
        runTripObservabilitySafely(this.logger, 'start_confirmation_evidence', () => {
          this.tripMetrics?.tripEvidencePaths.inc({
            phase: 'start_confirmation',
            path: analyticsStartDecision.evidencePath,
          });
        });

        // Check for merge with recent previous trip
        const previousTrip = await this.prisma.vehicleTrip.findFirst({
          where: { vehicleId, tripStatus: TripStatus.COMPLETED },
          orderBy: { endTime: 'desc' },
          select: { id: true, endTime: true },
        });

        const mergeCheck = checkTripQuality(
          0,
          null,
          0,
          previousTrip?.endTime ?? null,
          effectiveStartAt,
          undefined,
          this.maxSameTripQualifiedStopMs,
        );

        const recoveryPreflight = await this.maybeRecoverLifecycleInvariant({
          det,
          organizationId,
          dimoTokenId,
          context: {
            expectedStartAt: effectiveStartAt,
            expectedDimoSegmentId:
              resolvedStart.dimoSegmentId ??
              `v2-${vehicleId}-${effectiveStartAt.getTime()}`,
            mergeTargetTripId:
              mergeCheck.shouldMergeWithPrevious && previousTrip?.id
                ? previousTrip.id
                : null,
          },
        });
        if (recoveryPreflight !== 'continue') {
          return;
        }

        if (mergeCheck.shouldMergeWithPrevious && previousTrip?.id) {
          const startRecognizedAt = new Date();
          // Reopen the previous trip instead of creating a new one
          // DecisionEngine is the sole writer of tripStatus changes
          await this.decisionEngine.reopenTripForMerge({
            targetTripId: previousTrip.id,
            lifecycleRecovery: {
              candidateStartAt: startAt,
              effectiveStartAt,
            },
          });

          resultState = TripDetectionState.ACTIVE_TRIP;
          await this.transitionState(
            vehicleId,
            TripDetectionState.ACTIVE_TRIP,
            {
              activeTripId: previousTrip.id,
              possibleStartAt: effectiveStartAt,
              possibleStartEnteredAt: null,
              lastCoreProcessedAt: now,
              lastRouteProcessedAt: null,
              lastDrivingProcessedAt: null,
              lastActivityAt: now,
              startDetectionMode: confirmMode as StartDetectionMode,
              startConfidence: confEnum,
              lastEvidenceSummary: {
                ...startEvidenceSummary,
                startRecognizedAt: startRecognizedAt.toISOString(),
              },
            },
          );

          await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);
          void runDtc02AdaptiveShadowOnTripFsmEvent({
            prisma: this.prisma,
            observability: this.dtc02Observability,
            redis: this.redis,
            vehicleId,
            tripId: previousTrip.id,
            eventKind: 'trip_start_confirmed',
            evaluatedAtMs: Date.now(),
            logger: this.logger,
          });
          await persistStartBoundaryAdmissionShadowDurable({
            tripId: previousTrip.id,
            vehicleId,
            organizationId: det.organizationId ?? null,
            candidateStartAt: startAt,
            confirmedAt: now,
            shadowSummary: startBoundaryShadowSummary,
            shadowEnabled: isTripStartBoundaryAdmissionShadowEnabledForVehicle(vehicleId),
            evidence: boundaryResolution.evidence,
            corePointCount: corePoints.length,
            prisma: this.prisma,
            tripMetrics: this.tripMetrics,
            logger: this.logger,
          });
          runTripObservabilitySafely(this.logger,'start_recognition_merge', () => {
            observeStartRecognitionLatency(this.tripMetrics, {
              profile: profileStr,
              mode: confirmMode,
              outcome: 'merge',
              recognizedAt: startRecognizedAt,
              canonicalStartAt: effectiveStartAt,
            });
            observeStartBoundaryAdjustment(this.tripMetrics, {
              profile: profileStr,
              source: resolvedStart.source,
              outcome: 'merge',
              initialCandidateAt: startAt,
              effectiveStartAt,
            });
            this.logTripStartTimeline('active_trip_confirmed', {
              vehicleId,
              tripId: previousTrip.id,
              startCandidateAt: startAt,
              startCandidateEnteredAt: det.possibleStartEnteredAt,
              canonicalStartAt: effectiveStartAt,
              startRecognizedAt,
              boundarySource: resolvedStart.source,
              evidencePath: analyticsStartDecision.evidencePath,
            });
          });
          this.logger.log(
            `ACTIVE_TRIP merged with previous: vehicle=${vehicleId} trip=${previousTrip.id}` +
              ` startSource=${resolvedStart.source} evidencePath=${analyticsStartDecision.evidencePath}` +
              ` adjustedMs=${resolvedStart.adjustedMs}`,
          );
        } else {
          const startRecognizedAt = new Date();
          // DecisionEngine.createTrip is the SOLE canonical trip creator
          const trip = await this.decisionEngine.createTrip({
            vehicleId,
            organizationId: det.organizationId ?? null,
            dimoSegmentId:
              resolvedStart.dimoSegmentId ??
              `v2-${vehicleId}-${effectiveStartAt.getTime()}`,
            startTime: effectiveStartAt,
            startLatitude:
              resolvedStart.startLatitude ?? telemetry?.latitude,
            startLongitude:
              resolvedStart.startLongitude ?? telemetry?.longitude,
            detectionProfile: profileStr,
            startDetectionMode: confirmMode,
            startConfidence: confirmConfidence,
            lifecycleRecovery: {
              candidateStartAt: startAt,
              effectiveStartAt,
              dimoSegmentId:
                resolvedStart.dimoSegmentId ??
                `v2-${vehicleId}-${effectiveStartAt.getTime()}`,
            },
          });

          resultState = TripDetectionState.ACTIVE_TRIP;
          await this.transitionState(
            vehicleId,
            TripDetectionState.ACTIVE_TRIP,
            {
              activeTripId: trip.id,
              possibleStartAt: effectiveStartAt,
              possibleStartEnteredAt: null,
              lastCoreProcessedAt: now,
              lastRouteProcessedAt: null,
              lastDrivingProcessedAt: null,
              lastActivityAt: now,
              startDetectionMode: confirmMode as StartDetectionMode,
              startConfidence: confEnum,
              lastEvidenceSummary: {
                ...startEvidenceSummary,
                startRecognizedAt: startRecognizedAt.toISOString(),
              },
            },
          );

          await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);

          await persistStartBoundaryAdmissionShadowDurable({
            tripId: trip.id,
            vehicleId,
            organizationId: det.organizationId ?? null,
            candidateStartAt: startAt,
            confirmedAt: now,
            shadowSummary: startBoundaryShadowSummary,
            shadowEnabled: isTripStartBoundaryAdmissionShadowEnabledForVehicle(vehicleId),
            evidence: boundaryResolution.evidence,
            corePointCount: corePoints.length,
            prisma: this.prisma,
            tripMetrics: this.tripMetrics,
            logger: this.logger,
          });

          this.fetchAndStoreStartTemperature(
            dimoTokenId,
            trip.id,
            effectiveStartAt,
            this.dimoProviderContext(dimoTokenId, vehicleId, organizationId),
          ).catch((e) =>
            this.logger.warn(`Temp fetch failed for trip ${trip.id}: ${e}`),
          );

          this.fetchAndStoreInitialRoute(
            dimoTokenId,
            trip.id,
            startRouteFetchFrom,
            now,
            this.dimoProviderContext(dimoTokenId, vehicleId, organizationId),
          ).catch((e) =>
            this.logger.warn(
              `Initial route fetch failed for trip ${trip.id}: ${e}`,
            ),
          );

          const orgId = det.organizationId;
          if (orgId) {
            try {
              await this.batteryTripStartProducer.enqueueStartProxy({
                organizationId: orgId,
                vehicleId,
                tripId: trip.id,
                tripStartedAt: effectiveStartAt,
              });
            } catch (e) {
              this.logger.warn(
                `Battery start-proxy enqueue failed for trip ${trip.id}: ${e}`,
              );
            }
          } else {
            this.logger.warn(
              `Battery start-proxy skipped — missing organizationId for vehicle=${vehicleId}`,
            );
          }

          void runDtc02AdaptiveShadowOnTripFsmEvent({
            prisma: this.prisma,
            observability: this.dtc02Observability,
            redis: this.redis,
            vehicleId,
            tripId: trip.id,
            eventKind: 'trip_start_confirmed',
            evaluatedAtMs: Date.now(),
            logger: this.logger,
          });

          this.logger.log(
            `ACTIVE_TRIP confirmed: vehicle=${vehicleId} trip=${trip.id} mode=${confirmMode}` +
              ` [${profileStr}] startSource=${resolvedStart.source}` +
              ` evidencePath=${analyticsStartDecision.evidencePath} adjustedMs=${resolvedStart.adjustedMs}`,
          );
          runTripObservabilitySafely(this.logger, 'start_recognition_create', () => {
            this.tripMetrics?.tripStartsConfirmed.inc({
              profile: profileStr,
              mode: confirmMode,
            });
            observeStartRecognitionLatency(this.tripMetrics, {
              profile: profileStr,
              mode: confirmMode,
              outcome: 'create',
              recognizedAt: startRecognizedAt,
              canonicalStartAt: effectiveStartAt,
            });
            observeStartBoundaryAdjustment(this.tripMetrics, {
              profile: profileStr,
              source: resolvedStart.source,
              outcome: 'create',
              initialCandidateAt: startAt,
              effectiveStartAt,
            });
            this.logTripStartTimeline('active_trip_confirmed', {
              vehicleId,
              tripId: trip.id,
              startCandidateAt: startAt,
              startCandidateEnteredAt: det.possibleStartEnteredAt,
              canonicalStartAt: effectiveStartAt,
              startRecognizedAt,
              boundarySource: resolvedStart.source,
              evidencePath: analyticsStartDecision.evidencePath,
            });
          });
        }
      } else {
        if (elapsed > this.CONFIRM_MAX_WAIT_MS) {
          resultState = TripDetectionState.RESTING;
          await this.transitionState(
            vehicleId,
            TripDetectionState.RESTING,
            {
              ...clearPossibleStartClockFields(),
              startOdometerKm: null,
              startFuelLevel: null,
              startEvSoc: null,
              lastEvidenceSummary: null,
              startDetectionMode: null,
              startConfidence: null,
            },
          );
          this.logger.log(
            `POSSIBLE_START timeout for ${vehicleId}, reverting to RESTING`,
          );
        } else {
          await this.schedulePossibleStart(
            vehicleId,
            organizationId,
            dimoTokenId,
            30_000,
          );
        }
      }

      await this.logTrackingRun({
        vehicleId,
        organizationId,
        tripId: det.activeTripId,
        stateAtRun: TripDetectionState.POSSIBLE_START,
        runType: TripTrackingRunType.POSSIBLE_START_VALIDATION,
        requestedFrom: from,
        requestedTo: now,
        corePointsCount: corePoints.length,
        resultState,
        resultSummary: confirmSummary as Record<string, unknown> | undefined,
        durationMs: Date.now() - startedMs,
      });
    } catch (err) {
      this.logger.warn(`POSSIBLE_START error for ${vehicleId}: ${err}`);
      try {
        await this.logTrackingRun({
          vehicleId,
          organizationId,
          stateAtRun: TripDetectionState.POSSIBLE_START,
          runType: TripTrackingRunType.POSSIBLE_START_VALIDATION,
          errorMessage: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startedMs,
        });
      } catch (logErr) {
        this.logger.warn(
          `POSSIBLE_START diagnostic log failed for ${vehicleId}: ${logErr}`,
        );
      }
      throw err;
    } finally {
      await this.releaseWorkerLock(vehicleId, lock.runToken);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  PROCESS: ACTIVE_TICK
  // ══════════════════════════════════════════════════════════

  async processActiveTick(data: TripTrackingJobData): Promise<void> {
    const { vehicleId, dimoTokenId, organizationId } = data;
    const lock = await this.acquireWorkerLock(vehicleId);
    if (!lock.acquired) {
      if (isTripTrackingHandoffJob(data)) {
        throw new TripTrackingHandoffLockContentionError();
      }
      this.logger.debug(`Lock not acquired for ACTIVE_TICK ${vehicleId}`);
      return;
    }

    const startedMs = Date.now();
    let resultState: TripDetectionState | undefined;

    try {
      const det = await this.getOrCreateDetectionState(vehicleId, organizationId);
      if (
        det.state !== TripDetectionState.ACTIVE_TRIP &&
        det.state !== TripDetectionState.IDLE_WITHIN_TRIP
      ) {
        return;
      }

      const activeRecovery = await this.maybeRecoverLifecycleInvariant({
        det,
        organizationId,
        dimoTokenId,
      });
      if (activeRecovery !== 'continue') {
        return;
      }

      const tripId = det.activeTripId;
      if (!tripId) {
        this.logger.warn(`ACTIVE_TICK but no activeTripId for ${vehicleId}`);
        const missingPointerRecovery = await this.maybeRecoverLifecycleInvariant({
          det,
          organizationId,
          dimoTokenId,
        });
        if (missingPointerRecovery === 'continue') {
          await this.transitionState(vehicleId, TripDetectionState.RESTING, {
            activeTripId: null,
          });
        }
        return;
      }

      const profile = String(det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN);
      const now = new Date();
      const startAt = det.possibleStartAt ?? now;

      const isFirstCore = det.lastCoreProcessedAt == null;
      const isFirstRoute = det.lastRouteProcessedAt == null;
      const isFirstDriving = det.lastDrivingProcessedAt == null;

      const coreFrom = isFirstCore
        ? new Date(startAt.getTime() - this.BACKFILL_MS)
        : new Date(det.lastCoreProcessedAt!.getTime() - this.OVERLAP_CORE_MS);
      const routeFrom = isFirstRoute
        ? new Date(startAt.getTime() - this.BACKFILL_MS)
        : new Date(det.lastRouteProcessedAt!.getTime() - this.OVERLAP_ROUTE_MS);
      const perfFrom = isFirstDriving
        ? new Date(startAt.getTime() - this.BACKFILL_MS)
        : new Date(det.lastDrivingProcessedAt!.getTime() - this.OVERLAP_PERF_MS);

      const [corePoints, routePoints, perfReadings] = await Promise.all([
        this.segments.fetchRawTripCoreData(
          dimoTokenId,
          coreFrom,
          now,
          this.dimoProviderContext(dimoTokenId, vehicleId, organizationId),
        ),
        this.segments.fetchRouteEnrichment(
          dimoTokenId,
          routeFrom,
          now,
          this.dimoProviderContext(dimoTokenId, vehicleId, organizationId),
        ),
        this.segments.fetchPerformance(
          dimoTokenId,
          perfFrom,
          now,
          this.dimoProviderContext(dimoTokenId, vehicleId, organizationId),
        ),
      ]);

      if (corePoints.length === 0) {
        const telemetryNoCore = await this.prisma.vehicleLatestState.findUnique({
          where: { vehicleId },
        });
        const chEndAppliedNoCore = await this.tryApplyClickHouseAssistedEnd({
          vehicleId,
          organizationId,
          dimoTokenId,
          tripId,
          det,
          profile,
          tripStartAt: startAt,
          now,
          telemetry: telemetryNoCore,
          corePoints: [],
        });
        if (chEndAppliedNoCore) {
          resultState = TripDetectionState.POSSIBLE_END;
          await this.logTrackingRun({
            vehicleId,
            organizationId,
            tripId,
            stateAtRun: det.state,
            runType: TripTrackingRunType.ACTIVE_TRACKING,
            requestedFrom: coreFrom,
            requestedTo: now,
            corePointsCount: 0,
            routePointsCount: routePoints.length,
            drivingPointsCount: perfReadings.length,
            resultState,
            resultSummary: { reason: 'clickhouse_end_assist_no_core_stream' },
            durationMs: Date.now() - startedMs,
          });
          return;
        }

        // ── Inactivity-based POSSIBLE_END transition ────────────────────────
        // DIMO stops streaming core data once the ignition is off and the
        // vehicle drops off the network. Without a core stream the continuity
        // assessment below never runs, so historically the FSM stayed in
        // ACTIVE_TRIP until the 2 h stale-ongoing repair kicked in — leaving
        // the trip visually "ongoing" for up to two hours after the driver
        // parked. If the last meaningful movement is older than the CUSUM
        // inactivity threshold, hand off to POSSIBLE_END and let the
        // POSSIBLE_END_CHECK → END_VALIDATION chain finalize the trip with
        // a proper endTime (lastMeaningfulMovementAt / last waypoint / CUSUM).
        const priorSummary =
          (det.lastEvidenceSummary as Record<string, unknown> | null) ?? {};
        let evidencePatch: Record<string, unknown> = { ...priorSummary };
        const priorStopBoundaryAt = readActiveStopBoundaryAt(evidencePatch);
        const priorStopBoundaryProvenance = readStopBoundaryProvenance(priorSummary);
        const priorTrustedStopBoundaryAt =
          priorStopBoundaryProvenance?.trust === true
            ? priorStopBoundaryProvenance.boundaryAt
            : null;
        let stopBoundaryAt = priorStopBoundaryAt;
        const emptyCoreVlsTelemetry = telemetryNoCore
          ? {
              isIgnitionOn: telemetryNoCore.isIgnitionOn,
              speedKmh: telemetryNoCore.speedKmh,
              engineLoad: telemetryNoCore.engineLoad,
              sourceTimestamp: telemetryNoCore.sourceTimestamp,
            }
          : null;
        const emptyCoreStopCandidate = resolveProviderStopBoundaryCandidate({
          telemetry: emptyCoreVlsTelemetry,
          profile,
          workerNow: now,
          lastMeaningfulMovementAt: det.lastMeaningfulMovementAt,
          existingStopBoundaryAt: stopBoundaryAt,
          existingStopBoundarySummary: evidencePatch,
          maxFreshObservationAgeMs: this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS,
        });
        if (emptyCoreStopCandidate) {
          evidencePatch = mergeProviderStopBoundaryCandidate(
            evidencePatch,
            emptyCoreStopCandidate,
          );
          stopBoundaryAt = readActiveStopBoundaryAt(evidencePatch);
          if (
            now.getTime() - emptyCoreStopCandidate.boundaryAt.getTime() <
            this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS
          ) {
            evidencePatch = mergePauseDetectedAt(
              evidencePatch,
              emptyCoreStopCandidate.boundaryAt,
              'provider_stationary_vls',
            );
          }
        }

        const emptyCoreGateStopBoundary = emptyCoreStopCandidate
          ? priorTrustedStopBoundaryAt
          : stopBoundaryAt;

        const { anchorAt: operationalAnchor, anchorSource: operationalAnchorSource } =
          resolveProviderOperationalAnchor({
            lastEvidenceSummary: evidencePatch,
            lastMeaningfulMovementAt: det.lastMeaningfulMovementAt,
            lastActivityAt: det.lastActivityAt,
            possibleStartAt: det.possibleStartAt,
            workerNow: now,
          });
        const effectiveOperationalAnchor =
          emptyCoreGateStopBoundary &&
          isValidProviderEventTimestamp(emptyCoreGateStopBoundary, now) &&
          operationalAnchor.getTime() < emptyCoreGateStopBoundary.getTime()
            ? {
                anchorAt: emptyCoreGateStopBoundary,
                anchorSource: 'stopBoundaryAt',
              }
            : { anchorAt: operationalAnchor, anchorSource: operationalAnchorSource };
        const inactiveMs =
          now.getTime() - effectiveOperationalAnchor.anchorAt.getTime();
        const movementInvalidationAnchor =
          emptyCoreGateStopBoundary ??
          (isValidProviderEventTimestamp((det as any).lastMeaningfulMovementAt, now)
            ? ((det as any).lastMeaningfulMovementAt as Date)
            : null);
        const hasCrediblePostBoundaryMovement =
          movementInvalidationAnchor != null
            ? hasCrediblePostBoundaryRouteMotion(
                routePoints,
                profile,
                movementInvalidationAnchor,
              )
            : false;
        const providerSilenceAnchorAt =
          readLastProviderActivityAt(evidencePatch) ??
          emptyCoreVlsTelemetry?.sourceTimestamp ??
          null;
        const emptyCoreGateStopBoundaryProvenance =
          emptyCoreGateStopBoundary != null
            ? emptyCoreStopCandidate
              ? readStopBoundaryProvenance({
                  ...priorSummary,
                  stopBoundaryAt: emptyCoreGateStopBoundary.toISOString(),
                })
              : readStopBoundaryProvenance(evidencePatch)
            : null;
        const emptyCoreGate = assessSuccessfulEmptyCoreEndEligibility({
          operationalInactiveMs: inactiveMs,
          minInactivityBeforeCusumMs:
            this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS,
          telemetry: emptyCoreVlsTelemetry,
          perfReadings,
          routePoints,
          profile,
          workerNow: now,
          stopBoundaryAt: emptyCoreGateStopBoundary,
          stopBoundaryProvenance: emptyCoreGateStopBoundaryProvenance,
          operationalAnchorSource: effectiveOperationalAnchor.anchorSource,
          hasCrediblePostBoundaryMovement,
          providerSilenceAnchorAt,
          lastMeaningfulMovementAt: (det as any).lastMeaningfulMovementAt,
        });

        const shadowEmptyCorePatch = runShadowObservabilitySafely(this.logger, 
          'shadow_provider_silence_empty_core',
          () =>
            runShadowActiveTickObservation({
              vehicleId,
              tripId,
              activeTripId: det.activeTripId,
              fsmState: det.state,
              workerNow: now,
              operationalInactiveMs: inactiveMs,
              minInactivityBeforeCusumMs:
                this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS,
              telemetry: emptyCoreVlsTelemetry,
              profile,
              stopBoundaryProvenance: emptyCoreGateStopBoundaryProvenance,
              performanceActivity: emptyCoreGate.forensics.performanceActivity,
              routeMotion: emptyCoreGate.forensics.routeMotion,
              hasCrediblePostMovement: hasCrediblePostBoundaryMovement,
              providerSilenceAnchorAt,
              lastMeaningfulMovementAt: (det as any).lastMeaningfulMovementAt,
              lastProviderActivityAt: readLastProviderActivityAt(evidencePatch),
              emptyCoreForensics: emptyCoreGate.forensics,
              realWinningEndPath: emptyCoreGate.eligible
                ? emptyCoreGate.forensics.providerSilenceAdmissionEligible
                  ? 'provider_silence_admitted'
                  : emptyCoreGate.forensics.boundaryBackedSilenceEligible
                    ? 'trusted_boundary_backed_silence'
                    : emptyCoreGate.forensics.reason
                : null,
              endCycleGeneration: resolveEndCycleToken(det),
              priorSummary: evidencePatch,
              evaluateProviderSilence: true,
            }),
        );
        if (shadowEmptyCorePatch) {
          evidencePatch = mergeShadowEvidencePatch(
            evidencePatch,
            shadowEmptyCorePatch,
          );
        }

        if (
          isPauseCorroborated({
            telemetry: emptyCoreVlsTelemetry,
            workerNow: now,
            maxObservationAgeMs: this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS,
            operationalInactiveMs: inactiveMs,
            minEndInactivityMs: this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS,
          })
        ) {
          const pauseAt =
            telemetryNoCore?.sourceTimestamp &&
            isValidProviderEventTimestamp(telemetryNoCore.sourceTimestamp, now)
              ? telemetryNoCore.sourceTimestamp
              : effectiveOperationalAnchor.anchorAt;
          evidencePatch = mergePauseDetectedAt(
            evidencePatch,
            pauseAt,
            'vls_inactive_empty_core',
          );
        } else if (
          emptyCoreStopCandidate &&
          inactiveMs < this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS &&
          !readPauseDetectedAt(evidencePatch)
        ) {
          evidencePatch = mergePauseDetectedAt(
            evidencePatch,
            emptyCoreStopCandidate.boundaryAt,
            'provider_stationary_vls',
          );
        }

        if (
          readPauseDetectedAt(evidencePatch) &&
          !readPauseDetectedAt(priorSummary)
        ) {
          const pauseShadowPatch = runShadowObservabilitySafely(this.logger, 
            'shadow_pause_start_empty_core',
            () =>
              runShadowPauseStartObservation({
                vehicleId,
                tripId,
                activeTripId: det.activeTripId,
                fsmState: det.state,
                workerNow: now,
                episodeStartSource: 'empty_core_pause_detected',
                stopAnchorAt: readStopBoundaryAt(evidencePatch),
                possibleEndAt: det.possibleEndAt,
                completedAt: null,
                restingAt: null,
                priorSummary: evidencePatch,
              }),
          );
          if (pauseShadowPatch) {
            evidencePatch = mergeShadowEvidencePatch(
              evidencePatch,
              pauseShadowPatch,
            );
          }
        }

        if (emptyCoreGate.eligible) {
          const silenceEndCandidate =
            emptyCoreGate.forensics.providerSilenceAdmissionEligible &&
            emptyCoreGate.forensics.providerSilenceCandidateAt
              ? {
                  anchorAt: new Date(emptyCoreGate.forensics.providerSilenceCandidateAt),
                  source: 'provider_silence_candidate' as const,
                  clockAuthority: 'PROVIDER_EVENT_TIME' as const,
                  trust: false as const,
                }
              : null;
          const endBoundary = resolvePossibleEndBoundaryCandidate({
            stopBoundaryProvenance: emptyCoreGateStopBoundaryProvenance,
            lastMeaningfulMovementAt: (det as any).lastMeaningfulMovementAt,
            lastActivityAt: det.lastActivityAt,
            workerNow: now,
            silenceEndCandidate,
          });
          resultState = TripDetectionState.POSSIBLE_END;
          await this.transitionState(vehicleId, TripDetectionState.POSSIBLE_END, {
            possibleEndAt: endBoundary.boundaryAt,
            possibleEndEnteredAt: now,
            endValidationAttempts: resolveEndValidationAttemptsOnPossibleEndReentry({
              priorState: det.state,
              endValidationAttempts: det.endValidationAttempts,
              priorSummary:
                (det.lastEvidenceSummary as Record<string, unknown> | null) ?? {},
              workerNow: now,
              lastMeaningfulMovementAt: (det as any).lastMeaningfulMovementAt,
              candidateStopBoundary: emptyCoreGateStopBoundaryProvenance,
              candidateProviderSilence: silenceEndCandidate,
            }),
            cusumValidatedAt: null,
            cusumSegmentStart: null,
            cusumSegmentEnd: null,
            lastEvidenceSummary: {
              ...evidencePatch,
              endCandidateClockSource: endBoundary.clockSource,
              noCoreEmptyCoreForensics: emptyCoreGate.forensics,
              emptyCoreDecision: emptyCoreGate.forensics.decision,
              emptyCoreReason: emptyCoreGate.forensics.reason,
              innerGateReason: emptyCoreGate.forensics.innerGateReason,
              boundaryBackedSilenceEligible:
                emptyCoreGate.forensics.boundaryBackedSilenceEligible,
              providerSilenceAdmissionEligible:
                emptyCoreGate.forensics.providerSilenceAdmissionEligible,
              providerSilenceCandidateAt:
                emptyCoreGate.forensics.providerSilenceCandidateAt,
              providerSilenceCandidateSource:
                emptyCoreGate.forensics.providerSilenceCandidateSource,
              providerSilenceCandidateClockAuthority:
                emptyCoreGate.forensics.providerSilenceCandidateClockAuthority,
              providerSilenceCandidateTrust:
                emptyCoreGate.forensics.providerSilenceCandidateTrust,
              vlsEvidenceState: emptyCoreGate.forensics.vlsEvidenceState,
              vlsProviderObservedAt: emptyCoreGate.forensics.vlsProviderObservedAt,
              vlsObservationAgeMs: emptyCoreGate.forensics.vlsObservationAgeMs,
            },
          });
          await this.schedulePossibleEndCheck(
            vehicleId,
            organizationId,
            dimoTokenId,
            0,
          );
          runTripObservabilitySafely(this.logger,'empty_core_end_candidate', () => {
            this.observePossibleEndCandidateLatency({
              priorState: det.state,
              profile: String(profile),
              evidencePath: 'EMPTY_CORE_GATE',
              clockSource: endBoundary.clockSource,
              candidateAt: endBoundary.boundaryAt,
              enteredAt: now,
            });
            this.tripMetrics?.tripEvidencePaths?.inc({
              phase: 'end_candidate',
              path: 'EMPTY_CORE_GATE',
            });
            this.logTripEndTimeline('possible_end_entered', {
              vehicleId,
              tripId,
              lastMeaningfulMovementAt:
                (det as any).lastMeaningfulMovementAt ?? endBoundary.boundaryAt,
              possibleEndAt: endBoundary.boundaryAt,
              possibleEndEnteredAt: now,
            });
          });
          this.logger.log(
            `ACTIVE_TICK: no core data for ${vehicleId}, corroborated inactivity ${Math.round(inactiveMs / 60_000)}min ago → POSSIBLE_END`,
          );
          await this.logTrackingRun({
            vehicleId,
            organizationId,
            tripId,
            stateAtRun: det.state,
            runType: TripTrackingRunType.ACTIVE_TRACKING,
            requestedFrom: coreFrom,
            requestedTo: now,
            corePointsCount: 0,
            routePointsCount: routePoints.length,
            drivingPointsCount: perfReadings.length,
            resultState,
            resultSummary: attachShadowToResultSummary(
              buildEmptyCorePossibleEndSummary(
                emptyCoreGate.forensics,
                effectiveOperationalAnchor.anchorAt.toISOString(),
              ),
              shadowEmptyCorePatch ?? null,
            ),
            durationMs: Date.now() - startedMs,
          });
          return;
        }

        resultState = det.state;
        const deferralStreak =
          emptyCoreGate.forensics.vlsEvidenceState === 'UNKNOWN' ||
          emptyCoreGate.forensics.innerGateReason.startsWith('vls_')
            ? readEmptyCoreDeferralStreak(priorSummary) + 1
            : 0;
        const nextDelayMs = computeEmptyCoreBackoffMs({
          baseIntervalMs: this.TRACKING_INTERVAL_MS,
          consecutiveDeferrals: deferralStreak,
          backoffBaseMs: this.TRIP_EMPTY_CORE_BACKOFF_BASE_MS,
          backoffMaxMs: this.TRIP_EMPTY_CORE_BACKOFF_MAX_MS,
          jitterRatio: this.TRIP_EMPTY_CORE_BACKOFF_JITTER_RATIO,
        });
        evidencePatch = mergeEmptyCoreDeferral(evidencePatch, {
          streak: deferralStreak,
          nextCheckDelayMs: nextDelayMs,
          innerGateReason: emptyCoreGate.forensics.innerGateReason,
        });
        await this.transitionState(vehicleId, det.state, {
          lastEvidenceSummary: evidencePatch,
        });
        await this.scheduleActiveTick(
          vehicleId,
          organizationId,
          dimoTokenId,
          nextDelayMs,
        );
        await this.logTrackingRun({
          vehicleId,
          organizationId,
          tripId,
          stateAtRun: det.state,
          runType: TripTrackingRunType.ACTIVE_TRACKING,
          requestedFrom: coreFrom,
          requestedTo: now,
          corePointsCount: 0,
          routePointsCount: routePoints.length,
          drivingPointsCount: perfReadings.length,
          resultState,
          resultSummary: attachShadowToResultSummary(
            {
              ...buildEmptyCoreKeepOpenSummary(
                emptyCoreGate.forensics,
                effectiveOperationalAnchor.anchorAt.toISOString(),
              ),
              fetchOutcome: 'SUCCESS_EMPTY' satisfies TripTelemetryFetchOutcome,
              nextCheckDelayMs: nextDelayMs,
              emptyCoreDeferralStreak: deferralStreak,
            },
            shadowEmptyCorePatch ?? null,
          ),
          durationMs: Date.now() - startedMs,
        });
        return;
      }

      // ── Mid-trip gap split (live) ───────────────────────────────────────
      // A sustained stationary silence inside an ACTIVE trip means the
      // vehicle was parked with the engine off and then restarted. DIMO's
      // telematics unit sleeps during such a stop so we never see an
      // ignition-off transition, but the silence + "parked in place" is
      // strong evidence that the old trip ended and a new one begins.
      // Detected here on the LIVE path so the split happens as soon as the
      // new data arrives; a parallel retroactive scan lives in
      // TripReconciliationService.repairIntraTripGapSplits.
      const midGap = this.findMidTripGap(corePoints, det, vehicleId);
      if (midGap) {
        const tripAge =
          new Date().getTime() - det.possibleStartAt!.getTime();
        if (tripAge >= this.TRIP_MID_GAP_MIN_PRE_DURATION_MS) {
          const driftEvidence = await this.resolveLiveMidGapDriftEvidence(
            tripId,
            midGap.firstEndAt,
            midGap.secondStartAt,
            routePoints,
          );
          const driftDecision = classifyLiveMidGapDriftDecision(
            driftEvidence,
            this.TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M,
          );

          if (driftDecision.decision === 'REJECTED') {
            this.logger.debug(
              `MID_GAP_SPLIT: rejected for ${vehicleId} — reason=${driftDecision.reason} ` +
                `driftState=${driftEvidence.state} ` +
                `drift=${driftEvidence.driftM != null ? `${Math.round(driftEvidence.driftM)}m` : 'unknown'} ` +
                `max=${this.TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M}m`,
            );
            await this.logTrackingRun({
              vehicleId,
              organizationId,
              tripId,
              stateAtRun: det.state,
              runType: TripTrackingRunType.ACTIVE_TRACKING,
              requestedFrom: coreFrom,
              requestedTo: now,
              corePointsCount: corePoints.length,
              routePointsCount: routePoints.length,
              drivingPointsCount: perfReadings.length,
              resultState: det.state,
              resultSummary: buildMidGapRejectedForensics({
                gapMs: midGap.gapMs,
                firstEndAt: midGap.firstEndAt,
                secondStartAt: midGap.secondStartAt,
                driftDecision,
                maxAllowedDriftM: this.TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M,
              }),
              durationMs: Date.now() - startedMs,
            }).catch(() => {});
          } else {
            let splitCommitPhase: MidGapSplitCommitPhase = 'PRE_COMMIT';
            try {
              const seg1Cutoff = det.lastRouteProcessedAt
                ? det.lastRouteProcessedAt.getTime() - 5000
                : 0;
              const seg1Waypoints = routePoints.filter((p) => {
                const tsMs = new Date(p.timestamp).getTime();
                return (
                  tsMs > seg1Cutoff && tsMs <= midGap.firstEndAt.getTime()
                );
              });
              if (seg1Waypoints.length > 0) {
                await this.prisma.vehicleTripWaypoint.createMany({
                  data: seg1Waypoints.map((p) => ({
                    tripId,
                    latitude: p.latitude,
                    longitude: p.longitude,
                    speedKmh: p.speedKmh,
                    recordedAt: new Date(p.timestamp),
                  })),
                });
              }

              const splitResult = await this.decisionEngine.splitTripAtGap({
                tripId,
                firstEndAt: midGap.firstEndAt,
                firstEndLatitude: midGap.firstEndLatitude,
                firstEndLongitude: midGap.firstEndLongitude,
                secondStartAt: midGap.secondStartAt,
                secondStartLatitude: midGap.secondStartLatitude,
                secondStartLongitude: midGap.secondStartLongitude,
                gapMs: midGap.gapMs,
                detectionProfile: String(
                  det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN,
                ),
                reason: 'live_mid_trip_gap_split',
                triggeredBy: 'LIVE_FSM',
                splitDriftM: driftEvidence.driftM,
              });
              splitCommitPhase = 'POST_COMMIT';

              await this.transitionState(
                vehicleId,
                TripDetectionState.ACTIVE_TRIP,
                buildMidGapSplitActiveFsmExtras({
                  secondTripId: splitResult.secondTripId,
                  secondStartAt: midGap.secondStartAt,
                }),
              );

              await this.postFinalizeAnalysisProducer.produceAfterPersistedCompletion({
                tripId: splitResult.firstTripId,
                vehicleId,
                organizationId,
                source: 'MID_GAP_SPLIT',
              });
              this.enrichmentOrchestrator
                .enqueueBehaviorEnrichment(
                  splitResult.firstTripId,
                  vehicleId,
                  organizationId,
                )
                .catch((e) =>
                  this.logger.warn(
                    `MID_GAP_SPLIT: enrichment enqueue failed for ${splitResult.firstTripId}: ${e}`,
                  ),
                );

              await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);

              this.logger.log(
                `MID_GAP_SPLIT: vehicle=${vehicleId} firstTrip=${splitResult.firstTripId} ` +
                  `→ secondTrip=${splitResult.secondTripId} gap=${Math.round(midGap.gapMs / 1000)}s ` +
                  `firstEnd=${midGap.firstEndAt.toISOString()} secondStart=${midGap.secondStartAt.toISOString()} ` +
                  `drift=${driftEvidence.driftM != null ? `${Math.round(driftEvidence.driftM)}m` : 'unknown'}`,
              );

              runTripObservabilitySafely(this.logger, 'mid_gap_split_evidence', () => {
                this.tripMetrics?.tripEvidencePaths.inc({
                  phase: 'mid_gap_split',
                  path: 'live_fsm',
                });
              });

              await this.logTrackingRun({
                vehicleId,
                organizationId,
                tripId: splitResult.secondTripId,
                stateAtRun: det.state,
                runType: TripTrackingRunType.ACTIVE_TRACKING,
                requestedFrom: coreFrom,
                requestedTo: now,
                corePointsCount: corePoints.length,
                routePointsCount: routePoints.length,
                drivingPointsCount: perfReadings.length,
                resultState: TripDetectionState.ACTIVE_TRIP,
                resultSummary: buildMidGapAppliedForensics({
                  gapMs: midGap.gapMs,
                  firstEndAt: midGap.firstEndAt,
                  secondStartAt: midGap.secondStartAt,
                  driftM: driftEvidence.driftM,
                  firstTripId: splitResult.firstTripId,
                  secondTripId: splitResult.secondTripId,
                  maxSameTripStopMs: this.maxSameTripQualifiedStopMs,
                  qualificationReason: 'live_mid_gap_qualified_stationary',
                }),
                durationMs: Date.now() - startedMs,
              });

              return;
            } catch (err) {
              if (splitCommitPhase === 'POST_COMMIT') {
                this.logger.warn(
                  `MID_GAP_SPLIT: post-commit failure for ${vehicleId} (split committed, aborting tick): ${err}`,
                );
                await this.scheduleActiveTick(
                  vehicleId,
                  organizationId,
                  dimoTokenId,
                ).catch(() => {});
                return;
              }

              const failureMsg = err instanceof Error ? err.message : String(err);
              const durableOutcome = await readDurableLiveSplitOutcome(this.prisma, {
                vehicleId,
                originalTripId: tripId,
                expectedFirstEndAt: midGap.firstEndAt,
                expectedSecondStartAt: midGap.secondStartAt,
              });

              if (durableOutcome !== 'NOT_COMMITTED') {
                this.logger.warn(
                  `MID_GAP_SPLIT: split promise failed with durableOutcome=${durableOutcome} for ${vehicleId}: ${err}`,
                );
                await this.logTrackingRun({
                  vehicleId,
                  organizationId,
                  tripId,
                  stateAtRun: det.state,
                  runType: TripTrackingRunType.ACTIVE_TRACKING,
                  requestedFrom: coreFrom,
                  requestedTo: now,
                  corePointsCount: corePoints.length,
                  routePointsCount: routePoints.length,
                  drivingPointsCount: perfReadings.length,
                  resultSummary: buildMidGapCommitAmbiguityForensics({
                    durableOutcome,
                    originalTripId: tripId,
                    expectedFirstEndAt: midGap.firstEndAt,
                    expectedSecondStartAt: midGap.secondStartAt,
                    errorMessage: failureMsg,
                  }),
                  durationMs: Date.now() - startedMs,
                }).catch(() => {});
                await this.scheduleActiveTick(
                  vehicleId,
                  organizationId,
                  dimoTokenId,
                ).catch(() => {});
                return;
              }

              this.logger.warn(
                `MID_GAP_SPLIT: pre-commit split failed (durable NOT_COMMITTED) for ${vehicleId}: ${err}`,
              );
            }
          }
        }
      }

      // ── Store new waypoints (deduplicate overlap) ──
      const waypointCutoff = det.lastRouteProcessedAt
        ? det.lastRouteProcessedAt.getTime() - 5000
        : 0;
      const newWaypoints = routePoints.filter(
        (p) => new Date(p.timestamp).getTime() > waypointCutoff,
      );
      if (newWaypoints.length > 0) {
        await this.prisma.vehicleTripWaypoint.createMany({
          data: newWaypoints.map((p) => ({
            tripId,
            latitude: p.latitude,
            longitude: p.longitude,
            speedKmh: p.speedKmh,
            recordedAt: new Date(p.timestamp),
          })),
        });
      }

      // ── Update trip metrics ──
      const telemetry = await this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
      });

      const chEndApplied = await this.tryApplyClickHouseAssistedEnd({
        vehicleId,
        organizationId,
        dimoTokenId,
        tripId,
        det,
        profile,
        tripStartAt: startAt,
        now,
        telemetry,
        corePoints,
      });
      if (chEndApplied) {
        resultState = TripDetectionState.POSSIBLE_END;
        await this.logTrackingRun({
          vehicleId,
          organizationId,
          tripId,
          stateAtRun: det.state,
          runType: TripTrackingRunType.ACTIVE_TRACKING,
          requestedFrom: coreFrom,
          requestedTo: now,
          corePointsCount: corePoints.length,
          routePointsCount: routePoints.length,
          drivingPointsCount: perfReadings.length,
          resultState,
          resultSummary: { reason: 'clickhouse_end_assist_applied' },
          durationMs: Date.now() - startedMs,
        });
        return;
      }

      const endCoord =
        routePoints.length > 0
          ? routePoints[routePoints.length - 1]
          : null;
      const speeds = corePoints
        .filter((p) => p.speed != null && p.speed > 0)
        .map((p) => p.speed!);

      let distanceKm: number | null = null;
      if (det.startOdometerKm != null && telemetry?.odometerKm != null) {
        const delta = telemetry.odometerKm - det.startOdometerKm;
        if (delta >= 0 && delta < 2000) {
          distanceKm = Math.round(delta * 10) / 10;
        }
      }

      const vehicleForTank = await this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { tankCapacityLiters: true, fuelType: true },
      });
      const maxTank = vehicleForTank?.tankCapacityLiters ?? 120;
      // EV gating (V4.6.46): no ICE tank → skip legacy fuel delta entirely.
      // Battery-electric consumption is tracked via energyUsedKwh below.
      const isEv = vehicleForTank?.fuelType === 'ELECTRIC';

      let fuelUsedLiters: number | null = null;
      if (
        !isEv &&
        det.startFuelLevel != null &&
        telemetry?.fuelLevelAbsolute != null
      ) {
        if (
          det.startFuelLevel <= maxTank * 1.1 &&
          telemetry.fuelLevelAbsolute <= maxTank * 1.1
        ) {
          const delta = det.startFuelLevel - telemetry.fuelLevelAbsolute;
          if (delta >= 0 && delta <= maxTank) {
            fuelUsedLiters = Math.round(delta * 100) / 100;
          }
        }
      }

      let energyUsedKwh: number | null = null;
      if (det.startEvSoc != null && telemetry?.evSoc != null) {
        const delta = det.startEvSoc - telemetry.evSoc;
        if (delta >= 0 && delta < 200) {
          energyUsedKwh = Math.round(delta * 100) / 100;
        }
      }

      const durationMin =
        (now.getTime() - (det.possibleStartAt?.getTime() ?? now.getTime())) /
        60_000;

      // Extract perf-based metrics for trip enrichment
      const rpmValues = perfReadings
        .filter((r) => r.rpm != null)
        .map((r) => r.rpm!);
      const throttleValues = perfReadings
        .filter((r) => r.throttlePosition != null)
        .map((r) => r.throttlePosition!);
      const engineLoadValues = perfReadings
        .filter((r) => r.engineLoad != null)
        .map((r) => r.engineLoad!);

      await this.prisma.vehicleTrip.update({
        where: { id: tripId },
        data: {
          // ONGOING endTime is provisional/worker-anchored — not canonical physical boundary (R1/P5-F01).
          endTime: now,
          ...(endCoord && {
            endLatitude: endCoord.latitude,
            endLongitude: endCoord.longitude,
          }),
          ...(distanceKm != null && { distanceKm }),
          durationMinutes: Math.round(durationMin * 10) / 10,
          ...(speeds.length > 0 && {
            maxSpeedKmh: Math.max(...speeds),
            avgSpeedKmh:
              Math.round(
                (speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10,
              ) / 10,
          }),
          ...(fuelUsedLiters != null && { fuelUsedLiters }),
          ...(energyUsedKwh != null && { energyUsedKwh }),
          ...(rpmValues.length > 0 && {
            avgRpm:
              Math.round(rpmValues.reduce((a, b) => a + b, 0) / rpmValues.length),
          }),
          ...(throttleValues.length > 0 && {
            avgThrottlePosition:
              Math.round(
                (throttleValues.reduce((a, b) => a + b, 0) / throttleValues.length) * 10,
              ) / 10,
          }),
          ...(engineLoadValues.length > 0 && {
            avgEngineLoad:
              Math.round(
                (engineLoadValues.reduce((a, b) => a + b, 0) / engineLoadValues.length) * 10,
              ) / 10,
          }),
          lastActivityAt: now,
          ...(isFirstDriving && perfReadings.length > 0 && {
            drivingTrackingStartedAt: now,
          }),
          ...(isFirstRoute && routePoints.length > 0 && {
            routeTrackingStartedAt: now,
          }),
        },
      });

      // ── State transition: time-based continuity evaluation ───────────────────
      // Use a configurable time window rather than a fixed last-N-points slice.
      // This prevents relevant earlier activity in the fetched window from being
      // silently discarded when the fetch window is larger than 5 points.
      const nowMs = now.getTime();
      const recentCore = corePoints.filter(
        (p) => nowMs - new Date(p.timestamp).getTime() <= this.TRIP_CONTINUITY_CORE_WINDOW_MS,
      );
      const recentPerf = perfReadings.filter(
        (p) => nowMs - new Date(p.timestamp).getTime() <= this.TRIP_CONTINUITY_PERF_WINDOW_MS,
      );
      // Fall back to the full fetched window if the time-filtered window is empty
      // (sparse data, first tick, or very slow device) to prevent false POSSIBLE_END.
      const evalCore = recentCore.length > 0 ? recentCore : corePoints.slice(-3);
      const analyticsGuardWindowFrom = new Date(
        Math.max(
          startAt.getTime() - this.BACKFILL_MS,
          now.getTime() - 5 * 60_000,
        ),
      );

      const clickhouseAvailable = this.hasClickHouseAnalyticsDetectors();
      const continuityPolicy = this.policyResolver.resolve({
        phase: DETECTION_PHASES.ACTIVE_TRIP,
        profile: det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN,
        dataQuality: {
          snapshotFreshness: telemetry?.updatedAt ? 'FRESH' : 'MISSING',
          ignitionAvailable: telemetry?.isIgnitionOn != null,
          speedAvailable: telemetry?.speedKmh != null,
          odometerAvailable: telemetry?.odometerKm != null,
          telemetryDensity:
            evalCore.length >= 4
              ? 'HIGH'
              : evalCore.length >= 2
                ? 'MEDIUM'
                : evalCore.length === 1
                  ? 'LOW'
                  : 'NONE',
          routeCoverage:
            routePoints.length >= 4
              ? 'FULL'
              : routePoints.length > 0
                ? 'PARTIAL'
                : 'NONE',
          highFrequencyAvailable: clickhouseAvailable,
        },
        anomalyContext: {
          clickhouseAvailable,
        },
      });

      // ── PHASE 2 SEAM: ContinuityAssessmentDetector ───────────────────────────
      let priorSummaryForCore =
        (det.lastEvidenceSummary as Record<string, unknown> | null) ?? {};
      const priorStopBoundaryProvenance = readStopBoundaryProvenance(priorSummaryForCore);
      const priorTrustedStopBoundaryAt =
        priorStopBoundaryProvenance?.trust === true
          ? priorStopBoundaryProvenance.boundaryAt
          : null;
      const priorStopBoundaryAt = readActiveStopBoundaryAt(priorSummaryForCore);
      let persistedStopBoundaryAt = priorStopBoundaryAt;

      const vlsTelemetryForBoundary = telemetry
        ? {
            isIgnitionOn: telemetry.isIgnitionOn,
            speedKmh: telemetry.speedKmh,
            engineLoad: telemetry.engineLoad,
            sourceTimestamp: telemetry.sourceTimestamp,
          }
        : null;
      const providerStopCandidate = resolveProviderStopBoundaryCandidate({
        telemetry: vlsTelemetryForBoundary,
        profile,
        workerNow: now,
        lastMeaningfulMovementAt: det.lastMeaningfulMovementAt,
        existingStopBoundaryAt: priorStopBoundaryAt,
        existingStopBoundarySummary: priorSummaryForCore,
        maxFreshObservationAgeMs: this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS,
      });
      if (providerStopCandidate) {
        priorSummaryForCore = mergeProviderStopBoundaryCandidate(
          priorSummaryForCore,
          providerStopCandidate,
        );
        persistedStopBoundaryAt = readActiveStopBoundaryAt(priorSummaryForCore);
        if (
          now.getTime() - providerStopCandidate.boundaryAt.getTime() <
          this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS
        ) {
          priorSummaryForCore = mergePauseDetectedAt(
            priorSummaryForCore,
            providerStopCandidate.boundaryAt,
            'provider_stationary_vls',
          );
        }
      }

      const continuityStopBoundaryAt = priorTrustedStopBoundaryAt;

      const continuityFindings = await this.detectorRegistry.runAll(
        continuityPolicy.detectors,
        {
          vehicleId,
          dimoTokenId,
          profile: det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN,
          phase: DETECTION_PHASES.ACTIVE_TRIP,
          timeWindow: { from: coreFrom, to: now },
          coreDataPoints: evalCore,
          performanceReadings: recentPerf,
          resumeAfterStopAt: continuityStopBoundaryAt,
          anomalyContext: {
            clickhouseAvailable,
          },
        },
        continuityPolicy.timeoutMs,
      );

      const continuityDecision = this.decisionEngine.evaluateContinuity(continuityFindings);
      const continuityFinding = continuityFindings.find(
        (f) => f.detectorName === 'ContinuityAssessmentDetector',
      );
      const continuitySummary = continuityFinding?.evidence?.summary;
      let effectiveContinuityDecision = continuityDecision;
      let effectiveContinuitySummary =
        continuitySummary as Record<string, unknown> | undefined;

      if (
        clickhouseAvailable &&
        continuityDecision.verdict === 'POSSIBLE_END' &&
        continuityDecision.endConfidence !== 'HIGH'
      ) {
        const ambiguousContinuityPolicy = this.policyResolver.resolve({
          phase: DETECTION_PHASES.ACTIVE_TRIP,
          profile: det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN,
          dataQuality: {
            snapshotFreshness: telemetry?.updatedAt ? 'FRESH' : 'MISSING',
            ignitionAvailable: telemetry?.isIgnitionOn != null,
            speedAvailable: telemetry?.speedKmh != null,
            odometerAvailable: telemetry?.odometerKm != null,
            telemetryDensity:
              evalCore.length >= 4
                ? 'HIGH'
                : evalCore.length >= 2
                  ? 'MEDIUM'
                  : evalCore.length === 1
                    ? 'LOW'
                    : 'NONE',
            routeCoverage:
              routePoints.length >= 4
                ? 'FULL'
                : routePoints.length > 0
                  ? 'PARTIAL'
                  : 'NONE',
            highFrequencyAvailable: clickhouseAvailable,
          },
          anomalyContext: {
            ambiguousContinuity: true,
            clickhouseAvailable,
          },
        });

        const ambiguousFindings = await this.detectorRegistry.runAll(
          ambiguousContinuityPolicy.detectors,
          {
            vehicleId,
            dimoTokenId,
            profile: det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN,
            phase: DETECTION_PHASES.ACTIVE_TRIP,
            timeWindow: { from: analyticsGuardWindowFrom, to: now },
            anomalyContext: {
              ambiguousContinuity: true,
              clickhouseAvailable,
            },
          },
          ambiguousContinuityPolicy.timeoutMs,
        );
        const activityWindowFinding = ambiguousFindings.find(
          (f) => f.detectorName === 'ActivityWindowDetector',
        );
        const clickhouseGuard = resolveClickHouseContinuityGuard(
          activityWindowFinding,
        );

        runTripObservabilitySafely(this.logger, 'active_continuity_evidence', () => {
          this.tripMetrics?.tripEvidencePaths.inc({
            phase: 'active_continuity',
            path: clickhouseGuard.evidencePath,
          });
        });

        if (clickhouseGuard.keepTripOpen) {
          effectiveContinuityDecision = {
            verdict: 'ACTIVE',
            reason: 'ClickHouse activity guard kept trip open',
            findings: ambiguousFindings,
          };
          effectiveContinuitySummary = {
            ...(effectiveContinuitySummary ?? {}),
            clickhouseGuard: clickhouseGuard.summary,
          };
        }
      }

      // R12: STOP OBSERVATION != END DECISION — first trusted stop boundary of the
      // episode (including WORKER_TIME → PROVIDER upgrade) must not authorize
      // continuity POSSIBLE_END in the same tick.
      const trustedBoundaryEstablishedThisTick =
        providerStopCandidate != null &&
        priorStopBoundaryProvenance?.trust !== true;
      if (
        trustedBoundaryEstablishedThisTick &&
        effectiveContinuityDecision.verdict === 'POSSIBLE_END'
      ) {
        effectiveContinuityDecision = {
          verdict: 'ACTIVE',
          reason:
            'Stop boundary observation tick — defer end until a later tick',
          findings: continuityFindings,
        };
      }

      const stateUpdateBase = {
        lastCoreProcessedAt: now,
        lastRouteProcessedAt: now,
        lastDrivingProcessedAt: now,
      };

      // Track the last moment meaningful movement was observed (EVENT_TIME only).
      const chGuardSummary = (effectiveContinuitySummary as any)?.clickhouseGuard;
      const impliesMovement = continuityStopBoundaryAt
        ? continuityImpliesCrediblePostBoundaryMovement({
            recentPoints: evalCore,
            profile,
            continuitySummary: effectiveContinuitySummary,
            clickhouseGuardSummary: chGuardSummary,
            stopBoundaryAt: continuityStopBoundaryAt,
            workerNow: now,
          })
        : continuityImpliesMeaningfulMovement(
            effectiveContinuitySummary,
            chGuardSummary,
          );
      const movementEventAt =
        effectiveContinuityDecision.verdict === 'ACTIVE' && impliesMovement
          ? resolveLatestMeaningfulMovementEventAt({
              recentPoints: evalCore,
              profile,
              continuitySummary: effectiveContinuitySummary,
              clickhouseGuardSummary: chGuardSummary,
              workerNow: now,
              resumeAfterAt: continuityStopBoundaryAt,
            })
          : null;

      let continuityEvidencePatch = priorSummaryForCore;
      if (movementEventAt) {
        if (readPauseDetectedAt(continuityEvidencePatch)) {
          const resumeShadowPatch = runShadowObservabilitySafely(this.logger, 
            'shadow_pause_resume_active_continuity',
            () =>
              runShadowResumeObservation({
                vehicleId,
                tripId,
                activeTripId: det.activeTripId,
                fsmState: det.state,
                workerNow: now,
                movementEvidenceSource: 'active_continuity_meaningful_movement',
                priorSummary: continuityEvidencePatch,
              }),
          );
          if (resumeShadowPatch) {
            continuityEvidencePatch = mergeShadowEvidencePatch(
              continuityEvidencePatch,
              resumeShadowPatch,
            );
          }
        }
        continuityEvidencePatch = mergeLastProviderActivityAt(
          continuityEvidencePatch,
          movementEventAt,
        );
        continuityEvidencePatch = clearPauseEvidence(continuityEvidencePatch);
        continuityEvidencePatch = retireActiveStopBoundaryAfterMovement(
          continuityEvidencePatch,
          movementEventAt,
        );
      }

      switch (effectiveContinuityDecision.verdict) {
        case 'ACTIVE':
          resultState = TripDetectionState.ACTIVE_TRIP;
          await this.transitionState(
            vehicleId,
            TripDetectionState.ACTIVE_TRIP,
            {
              ...stateUpdateBase,
              lastActivityAt: now,
              ...(movementEventAt && { lastMeaningfulMovementAt: movementEventAt }),
              lastEvidenceSummary: continuityEvidencePatch,
            },
          );
          await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);
          break;

        case 'IDLE':
          resultState = TripDetectionState.IDLE_WITHIN_TRIP;
          {
            const idleBoundaryProvenance = resolveIdleStopBoundaryAt({
                movementEventAt,
                lastMeaningfulMovementAt: det.lastMeaningfulMovementAt,
                lastActivityAt: det.lastActivityAt,
                workerNow: now,
                telemetry: telemetry
                  ? {
                      isIgnitionOn: telemetry.isIgnitionOn,
                      speedKmh: telemetry.speedKmh,
                      engineLoad: telemetry.engineLoad,
                      sourceTimestamp: telemetry.sourceTimestamp,
                    }
                  : null,
                profile,
                maxFreshObservationAgeMs:
                  this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS,
              });
            let idleEvidence = mergeStopBoundaryAt(
              continuityEvidencePatch,
              idleBoundaryProvenance.boundaryAt,
              idleBoundaryProvenance.source,
              idleBoundaryProvenance.clockAuthority,
            );
            idleEvidence = mergeLastProviderActivityAt(
              idleEvidence,
              idleBoundaryProvenance.boundaryAt,
            );
            const idlePauseShadowPatch = runShadowObservabilitySafely(this.logger, 
              'shadow_pause_start_idle_within_trip',
              () =>
                runShadowPauseStartObservation({
                  vehicleId,
                  tripId,
                  activeTripId: det.activeTripId,
                  fsmState: TripDetectionState.IDLE_WITHIN_TRIP,
                  workerNow: now,
                  episodeStartSource: 'idle_within_trip_stop_boundary',
                  stopAnchorAt: idleBoundaryProvenance.boundaryAt,
                  possibleEndAt: det.possibleEndAt,
                  completedAt: null,
                  restingAt: null,
                  priorSummary: idleEvidence,
                }),
            );
            if (idlePauseShadowPatch) {
              idleEvidence = mergeShadowEvidencePatch(
                idleEvidence,
                idlePauseShadowPatch,
              );
            }
            await this.transitionState(
              vehicleId,
              TripDetectionState.IDLE_WITHIN_TRIP,
              {
                ...stateUpdateBase,
                lastActivityAt: now,
                lastEvidenceSummary: idleEvidence,
              },
            );
          }
          await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);
          break;

        case 'POSSIBLE_END':
          resultState = TripDetectionState.POSSIBLE_END;
          {
            const enteredAt = now;
            const persistedStopBoundaryProvenance =
              readStopBoundaryProvenance(continuityEvidencePatch);
            const endBoundary = resolvePossibleEndBoundaryCandidate({
              stopBoundaryProvenance: persistedStopBoundaryProvenance,
              lastMeaningfulMovementAt: det.lastMeaningfulMovementAt,
              lastActivityAt: det.lastActivityAt,
              workerNow: now,
            });
            await this.transitionState(
              vehicleId,
              TripDetectionState.POSSIBLE_END,
              {
                ...stateUpdateBase,
                possibleEndAt: endBoundary.boundaryAt,
                possibleEndEnteredAt: enteredAt,
                endValidationAttempts: resolveEndValidationAttemptsOnPossibleEndReentry({
                  priorState: det.state,
                  endValidationAttempts: det.endValidationAttempts,
                  priorSummary: continuityEvidencePatch,
                  workerNow: now,
                  lastMeaningfulMovementAt: det.lastMeaningfulMovementAt,
                  candidateStopBoundary: persistedStopBoundaryProvenance,
                }),
                endDetectionMode:
                  effectiveContinuityDecision.endMode ?? END_DETECTION_MODES.COMPOSITE_INACTIVITY,
                endConfidence:
                  effectiveContinuityDecision.endConfidence === 'HIGH'
                    ? DetectionConfidence.HIGH
                    : effectiveContinuityDecision.endConfidence === 'MEDIUM'
                      ? DetectionConfidence.MEDIUM
                      : DetectionConfidence.LOW,
                lastEvidenceSummary: {
                  ...continuityEvidencePatch,
                  endCandidateClockSource: endBoundary.clockSource,
                },
              },
            );
            await this.schedulePossibleEndCheck(
              vehicleId,
              organizationId,
              dimoTokenId,
            );
            runTripObservabilitySafely(this.logger,'continuity_end_candidate', () => {
              this.observePossibleEndCandidateLatency({
                priorState: det.state,
                profile: String(det.detectionProfile ?? profile),
                evidencePath: 'CONTINUITY',
                clockSource: endBoundary.clockSource,
                candidateAt: endBoundary.boundaryAt,
                enteredAt,
              });
              this.tripMetrics?.tripEvidencePaths?.inc({
                phase: 'end_candidate',
                path: 'CONTINUITY',
              });
              this.logTripEndTimeline('possible_end_entered', {
                vehicleId,
                tripId,
                lastMeaningfulMovementAt: det.lastMeaningfulMovementAt,
                possibleEndAt: endBoundary.boundaryAt,
                possibleEndEnteredAt: enteredAt,
              });
            });
          }
          break;
      }

      await this.logTrackingRun({
        vehicleId,
        organizationId,
        tripId,
        stateAtRun: det.state,
        runType: TripTrackingRunType.ACTIVE_TRACKING,
        requestedFrom: coreFrom,
        requestedTo: now,
        corePointsCount: corePoints.length,
        routePointsCount: routePoints.length,
        drivingPointsCount: perfReadings.length,
        resultState,
        resultSummary: {
          ...(effectiveContinuitySummary ?? {}),
          fetchOutcome: coreFetchOutcome(corePoints.length),
          stopBoundaryAt: persistedStopBoundaryAt?.toISOString() ?? null,
          priorStopBoundaryAt: priorStopBoundaryAt?.toISOString() ?? null,
        },
        durationMs: Date.now() - startedMs,
      });
    } catch (err) {
      this.logger.warn(`ACTIVE_TICK error for ${vehicleId}: ${err}`);
      const detOnError = await this.getOrCreateDetectionState(
        vehicleId,
        organizationId,
      ).catch(() => null);
      const errorSummary =
        (detOnError?.lastEvidenceSummary as Record<string, unknown> | null) ?? {};
      const errorStreak = readEmptyCoreDeferralStreak(errorSummary) + 1;
      const errorDelayMs = computeEmptyCoreBackoffMs({
        baseIntervalMs: this.TRACKING_INTERVAL_MS,
        consecutiveDeferrals: errorStreak,
        backoffBaseMs: this.TRIP_EMPTY_CORE_BACKOFF_BASE_MS,
        backoffMaxMs: this.TRIP_EMPTY_CORE_BACKOFF_MAX_MS,
        jitterRatio: this.TRIP_EMPTY_CORE_BACKOFF_JITTER_RATIO,
      });
      if (detOnError) {
        await this.transitionState(vehicleId, detOnError.state, {
          lastEvidenceSummary: mergeEmptyCoreDeferral(errorSummary, {
            streak: errorStreak,
            nextCheckDelayMs: errorDelayMs,
            innerGateReason: 'active_tick_fetch_error',
          }),
        }).catch(() => {});
      }
      await this.logTrackingRun({
        vehicleId,
        organizationId,
        stateAtRun: TripDetectionState.ACTIVE_TRIP,
        runType: TripTrackingRunType.ACTIVE_TRACKING,
        errorMessage: err instanceof Error ? err.message : String(err),
        resultSummary: {
          fetchOutcome: 'FETCH_ERROR',
          fetchErrorClass: classifyFetchError(err),
          innerGateReason: 'active_tick_fetch_error',
          nextCheckDelayMs: errorDelayMs,
          emptyCoreDeferralStreak: errorStreak,
        },
        durationMs: Date.now() - startedMs,
      }).catch(() => {});

      await this.scheduleActiveTick(
        vehicleId,
        organizationId,
        dimoTokenId,
        errorDelayMs,
      ).catch(() => {});
    } finally {
      await this.releaseWorkerLock(vehicleId, lock.runToken);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  PROCESS: POSSIBLE_END_CHECK
  // ══════════════════════════════════════════════════════════

  async processPossibleEndCheck(data: TripTrackingJobData): Promise<void> {
    const { vehicleId, dimoTokenId, organizationId } = data;
    const lock = await this.acquireWorkerLock(vehicleId);
    if (!lock.acquired) {
      if (isTripTrackingHandoffJob(data)) {
        throw new TripTrackingHandoffLockContentionError();
      }
      this.logger.debug(`Lock not acquired for POSSIBLE_END_CHECK ${vehicleId}`);
      return;
    }

    const startedMs = Date.now();
    let resultState: TripDetectionState | undefined;
    let deferredEndValidation: {
      vehicleId: string;
      organizationId: string | null;
      dimoTokenId: number;
    } | null = null;

    try {
      const det = await this.getOrCreateDetectionState(vehicleId, organizationId);
      if (det.state !== TripDetectionState.POSSIBLE_END) return;

      const peRecovery = await this.maybeRecoverLifecycleInvariant({
        det,
        organizationId,
        dimoTokenId,
      });
      if (peRecovery !== 'continue') {
        return;
      }

      const profile = String(det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN);
      const now = new Date();
      const durableDet = await this.ensurePossibleEndClockDurability(
        vehicleId,
        det,
        now,
      );
      const endBoundaryAt = resolvePossibleEndBoundaryAnchor(durableDet, now);
      const fsmEnteredAt = resolvePossibleEndFsmDwellAnchor(durableDet, now);
      const fsmDwellMs = now.getTime() - fsmEnteredAt.getTime();
      const physicalInactivityMs = now.getTime() - endBoundaryAt.getTime();
      const priorSummary =
        (durableDet.lastEvidenceSummary as Record<string, unknown> | null) ?? {};
      let resumeCheckOutcome: PecResumeCheckOutcome = 'NO_RESUME_EVIDENCE';

      // ── Step 1: Check if activity has resumed ──
      try {
        const recentFrom = new Date(now.getTime() - 90_000);
        const recentPoints = await this.segments.fetchRawTripCoreData(
          dimoTokenId,
          recentFrom,
          now,
          this.dimoProviderContext(dimoTokenId, vehicleId, organizationId),
        );

        const activityResumed = await this.checkDimoActivityResumed({
          vehicleId,
          dimoTokenId,
          profile: det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN,
          now,
          corePoints: recentPoints,
          resumeAfterAt: endBoundaryAt,
        });

        if (activityResumed) {
          resumeCheckOutcome = 'RESUMED';
          resultState = TripDetectionState.ACTIVE_TRIP;
          this.logger.log(
            `Activity resumed for ${vehicleId} [${profile}], cancelling POSSIBLE_END`,
          );
          const resumedMovementAt = resolveLatestMeaningfulMovementEventAt({
            recentPoints,
            profile,
            workerNow: now,
            resumeAfterAt: endBoundaryAt,
          });
          await this.transitionState(vehicleId, TripDetectionState.ACTIVE_TRIP, {
            ...buildPossibleEndToActiveReset({
              workerNow: now,
              lastMeaningfulMovementAt: resumedMovementAt,
              priorSummary,
              reopenReason: 'ACTIVITY_RESUMED',
            }),
          });
          await this.cancelPendingEndCycleJobs(vehicleId, det.activeTripId);
          await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);

          await this.logTrackingRun({
            vehicleId, organizationId,
            tripId: det.activeTripId,
            stateAtRun: TripDetectionState.POSSIBLE_END,
            runType: TripTrackingRunType.POSSIBLE_END_CHECK,
            requestedFrom: recentFrom, requestedTo: now,
            corePointsCount: recentPoints.length,
            resultState,
            resultSummary: {
              reason: 'activity_resumed',
              resumeCheckOutcome,
              profile,
            },
            durationMs: Date.now() - startedMs,
          });
          return;
        }
      } catch {
        resumeCheckOutcome = 'FETCH_ERROR';
      }

      if (resumeCheckOutcome === 'FETCH_ERROR') {
        if (fsmDwellMs >= this.TRIP_END_TIMEOUT_MS) {
          this.logger.warn(
            `POSSIBLE_END timeout reached for ${vehicleId} (${Math.round(fsmDwellMs / 60000)} min), forcing finalize`,
          );
          resultState = TripDetectionState.RESTING;
          await this.scheduleFinalize(vehicleId, organizationId, dimoTokenId);
          await this.logTrackingRun({
            vehicleId, organizationId,
            tripId: det.activeTripId,
            stateAtRun: TripDetectionState.POSSIBLE_END,
            runType: TripTrackingRunType.POSSIBLE_END_CHECK,
            resultState,
            resultSummary: {
              reason: 'hard_timeout_fallback',
              resumeCheckOutcome,
              fsmDwellMs,
              physicalInactivityMs,
              profile,
            },
            durationMs: Date.now() - startedMs,
          });
          this.recordEndValidationObservability({
            organizationId,
            vehicleId,
            det,
            workerNow: now,
            processPhase: 'POSSIBLE_END_CHECK',
            outcome: TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.FSM_HARD_TIMEOUT_FALLBACK,
            transitionToState: TripDetectionState.RESTING,
            endDetectionMode: det.endDetectionMode ?? END_DETECTION_MODES.NO_ACTIVITY_TIMEOUT,
            decisionReason: 'hard_timeout_fallback',
          });
          return;
        }

        await this.schedulePossibleEndCheck(vehicleId, organizationId, dimoTokenId);
        await this.logTrackingRun({
          vehicleId, organizationId,
          tripId: det.activeTripId,
          stateAtRun: TripDetectionState.POSSIBLE_END,
          runType: TripTrackingRunType.POSSIBLE_END_CHECK,
          resultSummary: {
            reason: 'resume_check_fetch_error_reschedule',
            resumeCheckOutcome,
            fsmDwellMs,
            physicalInactivityMs,
          },
          durationMs: Date.now() - startedMs,
        });
        return;
      }

      // ── Step 2: Hard timeout fallback (FSM dwell — last resort only) ──
      if (fsmDwellMs >= this.TRIP_END_TIMEOUT_MS) {
        this.logger.warn(
          `POSSIBLE_END timeout reached for ${vehicleId} (${Math.round(fsmDwellMs / 60000)} min), forcing finalize`,
        );
        resultState = TripDetectionState.RESTING;
        await this.scheduleFinalize(vehicleId, organizationId, dimoTokenId);
        await this.logTrackingRun({
          vehicleId, organizationId,
          tripId: det.activeTripId,
          stateAtRun: TripDetectionState.POSSIBLE_END,
          runType: TripTrackingRunType.POSSIBLE_END_CHECK,
          resultState,
          resultSummary: {
            reason: 'hard_timeout_fallback',
            fsmDwellMs,
            physicalInactivityMs,
            profile,
          },
          durationMs: Date.now() - startedMs,
        });
        this.recordEndValidationObservability({
          organizationId,
          vehicleId,
          det,
          workerNow: now,
          processPhase: 'POSSIBLE_END_CHECK',
          outcome: TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.FSM_HARD_TIMEOUT_FALLBACK,
          transitionToState: TripDetectionState.RESTING,
          endDetectionMode: det.endDetectionMode ?? END_DETECTION_MODES.NO_ACTIVITY_TIMEOUT,
          decisionReason: 'hard_timeout_fallback',
        });
        return;
      }

      // ── Step 3: Stability / inactivity gates before CUSUM ──
      const chEndAssist =
        det.endDetectionMode === END_DETECTION_MODES.CLICKHOUSE_END_ASSIST;
      const stabilitySatisfied = chEndAssist
        ? fsmDwellMs >= this.TRIP_END_CH_ASSIST_STABILITY_MS
        : fsmDwellMs >= this.TRIP_END_STABILITY_WINDOW_MS &&
          physicalInactivityMs >= this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS;

      if (!stabilitySatisfied) {
        await this.schedulePossibleEndCheck(vehicleId, organizationId, dimoTokenId);
        await this.logTrackingRun({
          vehicleId, organizationId,
          tripId: det.activeTripId,
          stateAtRun: TripDetectionState.POSSIBLE_END,
          runType: TripTrackingRunType.POSSIBLE_END_CHECK,
          resultSummary: {
            reason: 'stability_window_waiting',
            fsmDwellMs,
            physicalInactivityMs,
            stabilityWindowMs: this.TRIP_END_STABILITY_WINDOW_MS,
            minInactivityMs: this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS,
            chAssistStabilityMs: this.TRIP_END_CH_ASSIST_STABILITY_MS,
            chEndAssist,
          },
          durationMs: Date.now() - startedMs,
        });
        return;
      }

      // ── Step 4: Gate elapsed — schedule CUSUM end validation (attempt unchanged) ──
      const attempts = det.endValidationAttempts ?? 0;
      if (attempts < this.TRIP_END_VALIDATION_MAX_ATTEMPTS) {
        await this.transitionState(vehicleId, TripDetectionState.POSSIBLE_END, {
          lastEvidenceSummary: buildEndValidationScheduledEvidence({
            priorSummary,
            workerNow: now,
            possibleEndEnteredAt:
              durableDet.possibleEndEnteredAt ??
              readPossibleEndEnteredAtFromEvidence(priorSummary) ??
              undefined,
          }),
        });
        this.logTripEndTimeline('end_validation_scheduled', {
          vehicleId,
          tripId: durableDet.activeTripId,
          lastMeaningfulMovementAt: durableDet.lastMeaningfulMovementAt,
          possibleEndAt: durableDet.possibleEndAt ?? endBoundaryAt,
          possibleEndEnteredAt: durableDet.possibleEndEnteredAt ?? fsmEnteredAt,
          endValidationScheduledAt: now,
          completedAttempts: attempts,
          maxAttempts: this.TRIP_END_VALIDATION_MAX_ATTEMPTS,
        });
        deferredEndValidation = { vehicleId, organizationId, dimoTokenId };
        await this.logTrackingRun({
          vehicleId, organizationId,
          tripId: det.activeTripId,
          stateAtRun: TripDetectionState.POSSIBLE_END,
          runType: TripTrackingRunType.POSSIBLE_END_CHECK,
          resultSummary: {
            reason: 'triggering_cusum_validation',
            completedAttempts: attempts,
            maxAttempts: this.TRIP_END_VALIDATION_MAX_ATTEMPTS,
            fsmDwellMs,
            physicalInactivityMs,
            resumeCheckOutcome,
          },
          durationMs: Date.now() - startedMs,
        });
        return;
      }

      // ── Step 5: Max completed CUSUM cycles — fallback finalize with explicit forensics ──
      runTripObservabilitySafely(this.logger, 'possible_end_stuck_gauge', () => {
        this.tripMetrics?.possibleEndStuck.set(
          { vehicle_profile: String(det.detectionProfile ?? 'UNKNOWN') },
          1,
        );
      });
      this.logger.log(
        `CUSUM max completed attempts (${attempts}) for ${vehicleId}, fallback finalize`,
      );
      await this.transitionState(vehicleId, TripDetectionState.POSSIBLE_END, {
        endDetectionMode: END_DETECTION_MODES.COMPOSITE_INACTIVITY,
        endConfidence: DetectionConfidence.LOW,
        lastEvidenceSummary: buildMaxAttemptFallbackEvidence({
          priorSummary,
          completedAttemptCount: attempts,
          resumeCheckOutcome,
        }),
      });
      resultState = TripDetectionState.RESTING;
      await this.scheduleFinalize(vehicleId, organizationId, dimoTokenId);
      await this.logTrackingRun({
        vehicleId, organizationId,
        tripId: det.activeTripId,
        stateAtRun: TripDetectionState.POSSIBLE_END,
        runType: TripTrackingRunType.POSSIBLE_END_CHECK,
        resultState,
        resultSummary: {
          reason: 'max_completed_cusum_attempts_fallback',
          completedAttempts: attempts,
          resumeCheckOutcome,
          fsmDwellMs,
          physicalInactivityMs,
          profile,
        },
        durationMs: Date.now() - startedMs,
      });
      this.recordEndValidationObservability({
        organizationId,
        vehicleId,
        det: {
          ...det,
          endDetectionMode: END_DETECTION_MODES.COMPOSITE_INACTIVITY,
          endValidationAttempts: attempts,
        },
        workerNow: now,
        processPhase: 'POSSIBLE_END_CHECK',
        outcome: TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.COMPOSITE_MAX_ATTEMPT_FALLBACK,
        transitionToState: TripDetectionState.RESTING,
        endDetectionMode: END_DETECTION_MODES.COMPOSITE_INACTIVITY,
        decisionReason: 'max_completed_cusum_attempts_fallback',
        retryCount: attempts,
      });
    } catch (err) {
      this.logger.warn(`POSSIBLE_END_CHECK error for ${vehicleId}: ${err}`);
      await this.schedulePossibleEndCheck(vehicleId, organizationId, dimoTokenId).catch(() => {});
    } finally {
      await this.releaseWorkerLock(vehicleId, lock.runToken);
      // Must run inside finally: early `return` paths in try skip any code placed after try/finally.
      if (deferredEndValidation) {
        await this.scheduleEndValidation(
          deferredEndValidation.vehicleId,
          deferredEndValidation.organizationId,
          deferredEndValidation.dimoTokenId,
        );
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  //  PROCESS: END_VALIDATION (CUSUM targeted validation)
  // ══════════════════════════════════════════════════════════

  async processEndValidation(data: TripTrackingJobData): Promise<void> {
    const { vehicleId, dimoTokenId, organizationId } = data;
    const lock = await this.acquireWorkerLock(vehicleId);
    if (!lock.acquired) {
      throw new TripTrackingHandoffLockContentionError();
    }

    const startedMs = Date.now();
    let resultState: TripDetectionState | undefined;
    let det: Awaited<ReturnType<typeof this.getOrCreateDetectionState>> | undefined;
    let validationStartedAt: Date | null = null;
    let priorSummaryForFailure: Record<string, unknown> = {};
    let deferredFinalize: {
      vehicleId: string;
      organizationId: string | null;
      dimoTokenId: number;
    } | null = null;

    try {
      det = await this.getOrCreateDetectionState(vehicleId, organizationId);
      if (det.state !== TripDetectionState.POSSIBLE_END) return;

      const endCycleCheck = evaluateEndCycleJobAdmission({ det, job: data });
      if (endCycleCheck !== 'ok') {
        this.logger.debug(
          `END_VALIDATION skipped for ${vehicleId}: ${endCycleCheck}`,
        );
        return;
      }

      const now = new Date();
      det = await this.ensurePossibleEndClockDurability(vehicleId, det, now);
      const endCandidateAt = resolvePossibleEndBoundaryAnchor(det, now);
      let priorSummary =
        (det.lastEvidenceSummary as Record<string, unknown> | null) ?? {};
      priorSummaryForFailure = priorSummary;

      // ── CH end assist (MEDIUM): segment end already validated — skip CUSUM ──
      if (
        det.endDetectionMode === END_DETECTION_MODES.CLICKHOUSE_END_ASSIST &&
        det.cusumSegmentEnd
      ) {
        const validatedEndTime = det.cusumSegmentEnd;
        const endConfEnum = det.endConfidence ?? DetectionConfidence.MEDIUM;
        const chSkipRevalidation = await this.evaluateClickHouseSkipResumeRevalidation({
          vehicleId,
          organizationId,
          dimoTokenId,
          det,
          now,
          candidateEndAt: validatedEndTime,
          priorSummary,
        });

        if (chSkipRevalidation.outcome === 'RESUME_CONFIRMED') {
          await this.cancelPossibleEndForResumedActivity({
            vehicleId,
            organizationId,
            dimoTokenId,
            now,
            activeTripId: det.activeTripId,
            priorSummary,
          });
          await this.logTrackingRun({
            vehicleId,
            organizationId,
            tripId: det.activeTripId,
            stateAtRun: TripDetectionState.POSSIBLE_END,
            runType: TripTrackingRunType.END_VALIDATION,
            resultState: TripDetectionState.ACTIVE_TRIP,
            resultSummary: {
              reason: 'clickhouse_end_assist_skip_resume_invalidated',
              validatedEndTime: validatedEndTime.toISOString(),
              chSkipResumeRevalidationOutcome: chSkipRevalidation.outcome,
            },
            durationMs: Date.now() - startedMs,
          });
          this.recordEndValidationObservability({
            organizationId,
            vehicleId,
            det,
            workerNow: now,
            processPhase: 'END_VALIDATION',
            outcome:
              TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CLICKHOUSE_END_ASSIST_RESUME_INVALIDATED,
            transitionToState: TripDetectionState.ACTIVE_TRIP,
            endDetectionMode: END_DETECTION_MODES.CLICKHOUSE_END_ASSIST,
            decisionReason: 'clickhouse_end_assist_skip_resume_invalidated',
            canonicalEndBoundaryAt: validatedEndTime,
            workerConfirmationAt: now,
          });
          return;
        }

        if (
          chSkipRevalidation.outcome === 'NO_RESUME_EVIDENCE_IMMATURE' ||
          chSkipRevalidation.outcome === 'FETCH_UNCERTAIN'
        ) {
          await this.transitionState(vehicleId, TripDetectionState.POSSIBLE_END, {
            lastEvidenceSummary: buildChSkipResumeRevalidationDeferredEvidence({
              priorSummary,
              workerNow: now,
              deferCount: chSkipRevalidation.deferCount,
              relatchEnteredAt: chSkipRevalidation.relatchEnteredAt,
              candidateEndAt: validatedEndTime,
              immaturityBoundMs: chSkipRevalidation.immaturityBoundMs,
              outcome: chSkipRevalidation.outcome,
            }),
          });
          await this.scheduleEndValidation(
            vehicleId,
            organizationId,
            dimoTokenId,
            this.TRIP_END_VALIDATION_RETRY_MS,
          );
          await this.logTrackingRun({
            vehicleId,
            organizationId,
            tripId: det.activeTripId,
            stateAtRun: TripDetectionState.POSSIBLE_END,
            runType: TripTrackingRunType.END_VALIDATION,
            resultSummary: {
              reason: 'clickhouse_end_assist_skip_resume_revalidation_deferred',
              validatedEndTime: validatedEndTime.toISOString(),
              chSkipResumeRevalidationOutcome: chSkipRevalidation.outcome,
              chSkipResumeRevalidationDeferCount: chSkipRevalidation.deferCount,
              chSkipResumeRevalidationImmaturityBoundMs:
                chSkipRevalidation.immaturityBoundMs,
            },
            durationMs: Date.now() - startedMs,
          });
          this.recordEndValidationObservability({
            organizationId,
            vehicleId,
            det,
            workerNow: now,
            processPhase: 'END_VALIDATION',
            outcome: TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CLICKHOUSE_END_ASSIST_DEFERRED,
            decisionReason: String(chSkipRevalidation.outcome),
            endDetectionMode: END_DETECTION_MODES.CLICKHOUSE_END_ASSIST,
            canonicalEndBoundaryAt: validatedEndTime,
          });
          return;
        }

        if (chSkipRevalidation.outcome === 'HANDOFF_TO_CUSUM_VALIDATION') {
          const dwellMs =
            now.getTime() - chSkipRevalidation.relatchEnteredAt.getTime();
          const handoffReason = resolveChSkipResumeRevalidationHandoffReason({
            fetchUncertain: chSkipRevalidation.fetchUncertain,
            immaturityElapsed: dwellMs >= chSkipRevalidation.immaturityBoundMs,
            deferBudgetExhausted:
              chSkipRevalidation.deferCount >=
                resolveChSkipResumeRevalidationMaxDeferCount(
                  this.TRIP_END_VALIDATION_MAX_ATTEMPTS,
                ) &&
              resolveChSkipResumeRevalidationMaxDeferCount(
                this.TRIP_END_VALIDATION_MAX_ATTEMPTS,
              ) > 0,
          });
          await this.transitionState(vehicleId, TripDetectionState.POSSIBLE_END, {
            endDetectionMode: null,
            lastEvidenceSummary: buildChSkipResumeRevalidationHandoffEvidence({
              priorSummary,
              workerNow: now,
              candidateEndAt: validatedEndTime,
              relatchEnteredAt: chSkipRevalidation.relatchEnteredAt,
              handoffReason,
              priorDeferCount: chSkipRevalidation.deferCount,
            }),
          });
          await this.logTrackingRun({
            vehicleId,
            organizationId,
            tripId: det.activeTripId,
            stateAtRun: TripDetectionState.POSSIBLE_END,
            runType: TripTrackingRunType.END_VALIDATION,
            resultSummary: {
              reason: 'clickhouse_end_assist_skip_resume_handoff_cusum',
              validatedEndTime: validatedEndTime.toISOString(),
              chSkipResumeRevalidationOutcome: chSkipRevalidation.outcome,
              chSkipResumeRevalidationHandoffReason: handoffReason,
              chSkipResumeRevalidationDeferCount: chSkipRevalidation.deferCount,
            },
            durationMs: Date.now() - startedMs,
          });
          det = await this.getOrCreateDetectionState(vehicleId, organizationId);
          priorSummary =
            (det.lastEvidenceSummary as Record<string, unknown> | null) ?? {};
          priorSummaryForFailure = priorSummary;
          this.recordEndValidationObservability({
            organizationId,
            vehicleId,
            det,
            workerNow: now,
            processPhase: 'END_VALIDATION',
            outcome:
              TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CLICKHOUSE_END_ASSIST_HANDOFF_CUSUM,
            decisionReason: handoffReason,
            canonicalEndBoundaryAt: validatedEndTime,
          });
        } else {
        this.logTripEndTimeline('clickhouse_end_assist_confirmed', {
          vehicleId,
          tripId: det.activeTripId,
          lastMeaningfulMovementAt: det.lastMeaningfulMovementAt,
          possibleEndAt: det.possibleEndAt,
          finalizedAt: validatedEndTime,
          endSource: 'clickhouse_segment_end',
        });

        await this.transitionState(vehicleId, TripDetectionState.POSSIBLE_END, {
          cusumValidatedAt: now,
          endDetectionMode: END_DETECTION_MODES.CLICKHOUSE_END_ASSIST,
          endConfidence: endConfEnum,
        });

        resultState = TripDetectionState.RESTING;
        deferredFinalize = { vehicleId, organizationId, dimoTokenId };

        await this.logTrackingRun({
          vehicleId,
          organizationId,
          tripId: det.activeTripId,
          stateAtRun: TripDetectionState.POSSIBLE_END,
          runType: TripTrackingRunType.END_VALIDATION,
          resultState,
          resultSummary: {
            reason: 'clickhouse_end_assist_skip_cusum',
            validatedEndTime: validatedEndTime.toISOString(),
          },
          durationMs: Date.now() - startedMs,
        });
        this.recordEndValidationObservability({
          organizationId,
          vehicleId,
          det: {
            ...det,
            cusumValidatedAt: now,
            endDetectionMode: END_DETECTION_MODES.CLICKHOUSE_END_ASSIST,
          },
          workerNow: now,
          processPhase: 'END_VALIDATION',
          outcome: TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CLICKHOUSE_END_ASSIST_CONFIRMED,
          transitionToState: TripDetectionState.RESTING,
          endDetectionMode: END_DETECTION_MODES.CLICKHOUSE_END_ASSIST,
          decisionReason: 'clickhouse_end_assist_skip_cusum',
          canonicalEndBoundaryAt: validatedEndTime,
          workerConfirmationAt: now,
        });
        return;
        }
      }

      const scheduledAt = this.parseEvidenceTimestamp(
        priorSummary,
        'endValidationScheduledAt',
      )?.toISOString() ?? null;

      validationStartedAt = new Date();
      await this.transitionState(vehicleId, TripDetectionState.POSSIBLE_END, {
        lastEvidenceSummary: buildEndValidationStartedEvidence({
          priorSummary,
          validationStartedAt,
        }),
      });

      // Fetch a bounded window of data centred on the POSSIBLE_END candidate
      const corePoints = await this.segments.fetchEndValidationWindow(
        dimoTokenId,
        endCandidateAt,
        this.TRIP_END_SEGMENT_LOOKBACK_MS,
        this.TRIP_END_SEGMENT_LOOKAHEAD_MS,
        this.dimoProviderContext(dimoTokenId, vehicleId, organizationId),
      );

      this.logger.debug(
        `END_VALIDATION for ${vehicleId}: fetched ${corePoints.length} points around ${endCandidateAt.toISOString()}`,
      );

      const endFindings = await this.detectorRegistry.runAll(
        ['ChangePointEndDetector'],
        {
          vehicleId,
          dimoTokenId,
          profile: det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN,
          phase: DETECTION_PHASES.POSSIBLE_END,
          coreDataPoints: corePoints,
          possibleEndAt: endCandidateAt,
          endValidationAttempts: det.endValidationAttempts ?? 0,
        },
      );

      const endFinding = endFindings.find((f) => f.detectorName === 'ChangePointEndDetector');
      const findingOutcome = classifyChangePointEndFinding(endFinding);

      if (findingOutcome !== 'VALID_DECISION') {
        const failureReason =
          findingOutcome === 'DETECTOR_MISSING'
            ? 'change_point_end_detector_missing'
            : String(endFinding?.evidence?.error ?? 'detector_execution_failure');
        this.logger.warn(
          `END_VALIDATION detector failure for ${vehicleId}: ${failureReason}`,
        );
        await this.transitionState(vehicleId, TripDetectionState.POSSIBLE_END, {
          lastEvidenceSummary: buildEndValidationFailureEvidence({
            priorSummary,
            validationStartedAt,
            failureReason,
            failureOutcome: findingOutcome,
          }),
        });
        await this.schedulePossibleEndCheck(
          vehicleId,
          organizationId,
          dimoTokenId,
          this.TRIP_END_VALIDATION_RETRY_MS,
        );
        await this.logTrackingRun({
          vehicleId,
          organizationId,
          tripId: det.activeTripId,
          stateAtRun: TripDetectionState.POSSIBLE_END,
          runType: TripTrackingRunType.END_VALIDATION,
          corePointsCount: corePoints.length,
          resultSummary: {
            reason: 'detector_execution_failure',
            failureOutcome: findingOutcome,
            failureReason,
            completedAttempts: det.endValidationAttempts ?? 0,
          },
          durationMs: Date.now() - startedMs,
        });
        this.recordEndValidationObservability({
          organizationId,
          vehicleId,
          det,
          workerNow: now,
          processPhase: 'END_VALIDATION',
          outcome: TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CUSUM_DETECTOR_FAILURE,
          detectorOutcome: findingOutcome,
          decisionReason: failureReason,
          coreWindowPointCount: corePoints.length,
        });
        return;
      }

      const endDecision = this.decisionEngine.evaluateEndCandidate(endFindings);
      const validationCompletedAt = new Date();
      const endConfEnum =
        endDecision.confidence === 'HIGH'
          ? DetectionConfidence.HIGH
          : endDecision.confidence === 'MEDIUM'
            ? DetectionConfidence.MEDIUM
            : DetectionConfidence.LOW;
      const completedAttempt = (det.endValidationAttempts ?? 0) + 1;

      // ── Still ongoing? → back to ACTIVE_TRIP (cycle completed; counter reset) ──
      if (endDecision.shouldReopen && endDecision.endMode !== 'CUSUM_VALIDATED') {
        resultState = TripDetectionState.ACTIVE_TRIP;
        this.logger.log(
          `CUSUM: trip ${vehicleId} still appears ongoing — returning to ACTIVE_TRIP (completedAttempt=${completedAttempt})`,
        );

        const lastMovementStr = endFinding?.evidence?.cusumLastMovementAt as
          | string
          | undefined;
        const lastMovementAt = validateCusumMovementEventTime(
          lastMovementStr,
          now,
        );

        const activeReopenReset = buildPossibleEndToActiveReset({
          workerNow: now,
          lastMeaningfulMovementAt: lastMovementAt,
          priorSummary,
          reopenReason: 'CUSUM_STILL_ONGOING',
          completedEndValidationAttempts: completedAttempt,
        });
        await this.transitionState(vehicleId, TripDetectionState.ACTIVE_TRIP, {
          ...activeReopenReset,
        });
        await this.cancelPendingEndCycleJobs(vehicleId, det.activeTripId);
        await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);

        await this.logTrackingRun({
          vehicleId, organizationId,
          tripId: det.activeTripId,
          stateAtRun: TripDetectionState.POSSIBLE_END,
          runType: TripTrackingRunType.END_VALIDATION,
          corePointsCount: corePoints.length,
          resultState,
          resultSummary: {
            reason: 'cusum_still_ongoing',
            endDecisionReason: endDecision.reason,
            completedAttempt,
            persistedAttemptsAfterReset:
              (activeReopenReset.endValidationAttempts as number | undefined) ?? 0,
          },
          durationMs: Date.now() - startedMs,
        });
        this.recordEndValidationObservability({
          organizationId,
          vehicleId,
          det,
          workerNow: now,
          processPhase: 'END_VALIDATION',
          outcome: TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CUSUM_STILL_ONGOING_REOPEN,
          transitionToState: TripDetectionState.ACTIVE_TRIP,
          decisionReason: endDecision.reason,
          cusumReason: endDecision.reason,
          retryCount: completedAttempt,
          coreWindowPointCount: corePoints.length,
        });
        return;
      }
      if (endDecision.shouldEnd && endDecision.detectedEndAt) {
        const validatedEndTime = endDecision.detectedEndAt;
        const lastMovementStr = endFinding?.evidence?.cusumLastMovementAt as
          | string
          | undefined;
        const lastMovementAt = validateCusumMovementEventTime(
          lastMovementStr,
          now,
        );

        this.logger.log(
          `CUSUM: change-point detected for ${vehicleId} at ${validatedEndTime.toISOString()} [${endDecision.confidence}] (completedAttempt=${completedAttempt})`,
        );

        this.logTripEndTimeline('cusum_confirmed', {
          vehicleId,
          tripId: det.activeTripId,
          lastMeaningfulMovementAt: det.lastMeaningfulMovementAt,
          possibleEndAt: det.possibleEndAt,
          endValidationStartedAt: validationStartedAt,
          finalizedAt: validatedEndTime,
          completedEndValidationAttempt: completedAttempt,
          latencyFromMovementMs:
            det.lastMeaningfulMovementAt != null
              ? validatedEndTime.getTime() - det.lastMeaningfulMovementAt.getTime()
              : null,
          endSource: 'cusum_segment_end',
        });

        await this.transitionState(vehicleId, TripDetectionState.POSSIBLE_END, {
          endValidationAttempts: completedAttempt,
          cusumValidatedAt: now,
          cusumSegmentStart: corePoints.length > 0 ? new Date(corePoints[0].timestamp) : null,
          cusumSegmentEnd: validatedEndTime,
          endDetectionMode: END_DETECTION_MODES.CUSUM_VALIDATED,
          endConfidence: endConfEnum,
          ...(lastMovementAt && { lastMeaningfulMovementAt: lastMovementAt }),
          lastEvidenceSummary: buildEndValidationCompletionEvidence({
            priorSummary,
            validationStartedAt,
            validationCompletedAt,
            completedAttempt,
            scheduledAt,
          }),
        });

        resultState = TripDetectionState.RESTING;
        deferredFinalize = { vehicleId, organizationId, dimoTokenId };

        await this.logTrackingRun({
          vehicleId, organizationId,
          tripId: det.activeTripId,
          stateAtRun: TripDetectionState.POSSIBLE_END,
          runType: TripTrackingRunType.END_VALIDATION,
          corePointsCount: corePoints.length,
          resultState,
          resultSummary: {
            reason: 'cusum_change_point_confirmed',
            validatedEndTime: validatedEndTime.toISOString(),
            confidence: endDecision.confidence,
            endDecisionReason: endDecision.reason,
            lastMovementAt: lastMovementAt?.toISOString(),
            completedAttempt,
          },
          durationMs: Date.now() - startedMs,
        });
        observeEndValidationCusumValidated({
          logger: this.logger,
          service: this.endValidationObservability,
          organizationId,
          vehicleId,
          det,
          workerNow: now,
          validatedEndTime,
          completedAttempt,
          retryBudgetMax: this.TRIP_END_VALIDATION_MAX_ATTEMPTS,
          decisionReason: endDecision.reason,
          cusumReason: endDecision.reason,
          coreWindowPointCount: corePoints.length,
          workerConfirmationAt: now,
        });
        return;
      }
      this.logger.debug(
        `CUSUM inconclusive for ${vehicleId}: ${endDecision.reason} — rescheduling (completedAttempt=${completedAttempt})`,
      );
      await this.transitionState(vehicleId, TripDetectionState.POSSIBLE_END, {
        endValidationAttempts: completedAttempt,
        lastEvidenceSummary: buildEndValidationCompletionEvidence({
          priorSummary,
          validationStartedAt,
          validationCompletedAt,
          completedAttempt,
          scheduledAt,
        }),
      });
      await this.schedulePossibleEndCheck(
        vehicleId, organizationId, dimoTokenId,
        this.TRIP_END_VALIDATION_RETRY_MS,
      );

      await this.logTrackingRun({
        vehicleId, organizationId,
        tripId: det.activeTripId,
        stateAtRun: TripDetectionState.POSSIBLE_END,
        runType: TripTrackingRunType.END_VALIDATION,
        corePointsCount: corePoints.length,
        resultSummary: {
          reason: 'cusum_inconclusive',
          endDecisionReason: endDecision.reason,
          completedAttempt,
        },
        durationMs: Date.now() - startedMs,
      });
      this.recordEndValidationObservability({
        organizationId,
        vehicleId,
        det: { ...det, endValidationAttempts: completedAttempt },
        workerNow: now,
        processPhase: 'END_VALIDATION',
        outcome: TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CUSUM_INCONCLUSIVE_RETRY,
        decisionReason: endDecision.reason,
        cusumReason: endDecision.reason,
        retryCount: completedAttempt,
        coreWindowPointCount: corePoints.length,
      });
    } catch (err) {
      this.logger.warn(`END_VALIDATION error for ${vehicleId}: ${err}`);
      const failureMsg = err instanceof Error ? err.message : String(err);
      if (det?.state === TripDetectionState.POSSIBLE_END) {
        await this.transitionState(vehicleId, TripDetectionState.POSSIBLE_END, {
          lastEvidenceSummary: buildEndValidationFetchFailureEvidence({
            priorSummary: priorSummaryForFailure,
            validationStartedAt,
            failureReason: failureMsg,
          }),
        }).catch(() => {});
      }
      await this.schedulePossibleEndCheck(vehicleId, organizationId, dimoTokenId,
        this.TRIP_END_VALIDATION_RETRY_MS,
      ).catch(() => {});
      if (det) {
        this.recordEndValidationObservability({
          organizationId,
          vehicleId,
          det,
          workerNow: new Date(),
          processPhase: 'END_VALIDATION',
          outcome: TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CUSUM_FETCH_FAILURE,
          decisionReason: failureMsg,
        });
      }
    } finally {
      await this.releaseWorkerLock(vehicleId, lock.runToken);
      // Must run inside finally: schedule after lock release so concurrent BullMQ
      // workers cannot pick FINALIZE while END_VALIDATION still holds the lock.
      if (deferredFinalize) {
        await this.scheduleFinalize(
          deferredFinalize.vehicleId,
          deferredFinalize.organizationId,
          deferredFinalize.dimoTokenId,
        );
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  //  PROCESS: FINALIZE
  // ══════════════════════════════════════════════════════════

  async processFinalize(data: TripTrackingJobData): Promise<void> {
    const { vehicleId, organizationId } = data;
    const lock = await this.acquireWorkerLock(vehicleId);
    if (!lock.acquired) {
      throw new TripTrackingHandoffLockContentionError();
    }

    const startedMs = Date.now();
    // 'complete' | 'discard' | 'timeout' — used to select smart cooldown window
    let restingReason = 'complete';
    let restWindowAnchorAt: Date | null = null;
    // Set when a trip is persisted as COMPLETED — after the RESTING transition
    // commits we hand the finalized trip to Battery V2 so the LV rest window
    // opens without requiring another provider observation.
    let finalizedTripForRestWindow: { tripId: string; startTime: Date; endTime: Date } | null =
      null;
    let terminalLifecycleCommit: TerminalLifecycleCommit = 'NONE';
    let terminalLifecycleIntent: TerminalLifecycleIntent = 'NONE';
    let terminalTripId: string | null = null;
    let restingTransitionSucceeded = false;
    let detectionProfileLabel = 'UNKNOWN';
    let finalizeQualityObservability: Record<string, unknown> | null = null;

    try {
      const det = await this.getOrCreateDetectionState(vehicleId, organizationId);
      detectionProfileLabel = String(det.detectionProfile ?? 'UNKNOWN');
      const tripId = det.activeTripId;

      const endRecovery = await this.maybeRecoverLifecycleInvariant({
        det,
        organizationId,
        dimoTokenId: data.dimoTokenId,
      });
      if (endRecovery !== 'continue') {
        return;
      }

      const endCycleCheck = evaluateEndCycleJobAdmission({ det, job: data });
      if (endCycleCheck !== 'ok') {
        const reason = mapEndCycleStaleFinalizeReason(endCycleCheck);
        this.logger.log(
          `FINALIZE skipped for ${vehicleId}: ${reason}` +
            (data.endCycleToken ? ` jobToken=${data.endCycleToken}` : '') +
            (data.requestedAt ? ` requestedAt=${data.requestedAt}` : ''),
        );
        await this.logTrackingRun({
          vehicleId,
          organizationId,
          tripId: det.activeTripId,
          stateAtRun: det.state,
          runType: TripTrackingRunType.FINALIZATION_CHECK,
          resultSummary: {
            reason,
            jobEndCycleToken: data.endCycleToken ?? null,
            expectedEndCycleToken: resolveEndCycleToken(det),
            jobRequestedAt: data.requestedAt ?? null,
          },
          durationMs: Date.now() - startedMs,
        });
        return;
      }

      if (tripId) {
        const trip = await this.prisma.vehicleTrip.findUnique({
          where: { id: tripId },
        });

        if (trip) {
          const [waypoints, waypointCountLegacy] = await Promise.all([
            this.prisma.vehicleTripWaypoint.findMany({
              where: { tripId },
              orderBy: { recordedAt: 'asc' },
              select: {
                latitude: true,
                longitude: true,
                speedKmh: true,
                recordedAt: true,
              },
            }),
            this.prisma.vehicleTripWaypoint.count({ where: { tripId } }),
          ]);
          const waypointCount = waypoints.length || waypointCountLegacy;
          const profileLabel = String(det.detectionProfile ?? 'UNKNOWN');
          const routeMovement = analyzePersistedRouteMovement(
            waypoints,
            profileLabel,
          );
          const earliestWaypoint = waypoints[0] ?? null;
          const latestWaypoint =
            waypoints.length > 0 ? waypoints[waypoints.length - 1]! : null;

          const routeDisplacementM = computePersistedRouteDisplacementM(
            earliestWaypoint,
            latestWaypoint,
          );

          const resolvedEnd = resolveFinalizeEndTime({
            cusumSegmentEnd: (det as any).cusumSegmentEnd ?? null,
            lastMeaningfulMovementAt: (det as any).lastMeaningfulMovementAt ?? null,
            latestCredibleMovementAt: routeMovement.latestCredibleMovementAt,
            possibleEndAt: det.possibleEndAt ?? null,
            tripStartTime: trip.startTime,
            fallbackNow: new Date(),
          });
          const endTime = resolvedEnd.endTime;
          const chosenEndSource =
            det.endDetectionMode === END_DETECTION_MODES.CLICKHOUSE_END_ASSIST &&
            (det as any).cusumSegmentEnd
              ? 'clickhouse_segment_end'
              : resolvedEnd.source;

          const boundaryWaypoint =
            latestWaypoint &&
            latestWaypoint.recordedAt.getTime() <= endTime.getTime()
              ? latestWaypoint
              : await this.prisma.vehicleTripWaypoint.findFirst({
                  where: {
                    tripId,
                    recordedAt: { lte: endTime },
                  },
                  orderBy: { recordedAt: 'desc' },
                });

          const durationMs = endTime.getTime() - trip.startTime.getTime();
          // Keep the latest known trip end as rest-window anchor for Battery V2.
          restWindowAnchorAt = endTime;
          // Tracks why we are entering RESTING, for smart cooldown in next evaluation.
          restingReason = 'complete';

          // Derive a practical maxConsecutiveActive proxy from waypoint count.
          // Any trip that made it to finalize has already survived
          // POSSIBLE_START → ACTIVE_TRIP → POSSIBLE_END, so passing a hardcoded
          // 0 here would discard every finalizing trip whose distance < 100m
          // regardless of real movement — catastrophic for urban short trips.
          // waypointCount reflects actual route density without re-evaluating
          // core points. A trip with 0–1 waypoints is genuinely suspect and
          // still legitimately subject to the `no_meaningful_movement` rule.
          const qualityCheck = checkTripQuality(
            durationMs,
            trip.distanceKm,
            waypointCount,
            null,
            trip.startTime,
            {
              routeDisplacementM,
              hasMeaningfulPersistedRouteMovement: routeMovement.hasMeaningfulMovement,
              movementAuthority: routeMovement.movementAuthority,
              cumulativeRouteMovementM: routeMovement.cumulativeCredibleRouteMovementM,
            },
          );
          const qualityMeaningfulMovement = hasPersistedMeaningfulMovementForQuality({
            hasMeaningfulPersistedRouteMovement: routeMovement.hasMeaningfulMovement,
          });
          finalizeQualityObservability = {
            QUALITY_DURATION_MS: durationMs,
            QUALITY_DISTANCE_KM: trip.distanceKm,
            QUALITY_WAYPOINT_COUNT: waypointCount,
            QUALITY_MEANINGFUL_MOVEMENT: qualityMeaningfulMovement,
            QUALITY_MOVEMENT_AUTHORITY: routeMovement.movementAuthority,
            QUALITY_ROUTE_MOVEMENT_METERS: routeMovement.cumulativeCredibleRouteMovementM,
            QUALITY_DECISION: qualityCheck.shouldDiscard
              ? 'discard'
              : qualityCheck.shouldMergeWithPrevious
                ? 'merge'
                : 'keep',
            QUALITY_REASON: qualityCheck.reason ?? null,
            FINALIZE_END_SOURCE: chosenEndSource,
            FINALIZE_END_EVENT_AT: endTime.toISOString(),
          };

          // ── Delegate all lifecycle mutations to TripDecisionEngine ──────────

          if (qualityCheck.shouldDiscard) {
            terminalLifecycleIntent = 'CANCEL';
            terminalTripId = tripId;
            await this.decisionEngine.discardTrip(
              tripId,
              qualityCheck.reason ?? 'quality_check_failed',
            );
            terminalLifecycleCommit = 'CANCELLED';
            // Smart cooldown: discard → short 30s cooldown
            restingReason = 'discard';
            runTripObservabilitySafely(
              this.logger,
              'discard_post_commit_observability',
              () => {
                this.logger.log(
                  `Trip ${tripId} discarded for ${vehicleId}: ${qualityCheck.reason}`,
                );
                this.tripMetrics?.tripDiscarded.inc({
                  reason: qualityCheck.reason ?? 'quality_check_failed',
                });
                this.tripMetrics?.tripQualityAnomalies.inc({
                  anomaly_type: qualityCheck.reason ?? 'quality_check_failed',
                });
              },
            );
          } else {
            const r5EndForensics = extractR5EndForensicsForPersistence(
              det.lastEvidenceSummary as Record<string, unknown> | null,
              det.endValidationAttempts ?? 0,
            );
            const endRecognizedAt = new Date();
            const endCoords = resolveBoundaryConsistentEndCoordinate({
              canonicalEndAt: endTime,
              waypointAtOrBefore: boundaryWaypoint,
            });
            const evidenceSummary =
              (det.lastEvidenceSummary as Record<string, unknown> | null) ?? {};
            const startForensics = resolveStartForensicProvenance({
              evidenceSummary,
              detPossibleStartAt: det.possibleStartAt,
              detPossibleStartEnteredAt: det.possibleStartEnteredAt,
              tripCanonicalStartAt: trip.startTime,
              priorRawDetectionMeta: trip.rawDetectionMeta,
            });
            const tripFsmForensics = buildTripFsmForensicsR8V1({
              startCandidateAt: startForensics.startCandidateAt,
              startCandidateClockSource: startForensics.startCandidateClockSource,
              startCandidateEnteredAt: startForensics.startCandidateEnteredAt,
              startRecognizedAt: startForensics.startRecognizedAt,
              canonicalStartAt: startForensics.startEpisodeCanonicalAt,
              tripCanonicalStartAt: trip.startTime,
              startBoundarySource: startForensics.startBoundarySource,
              startEvidencePath: startForensics.startEvidencePath,
              startBoundaryAdjustedMs: startForensics.startBoundaryAdjustedMs,
              endCandidateAt: det.possibleEndAt,
              endCandidateClockSource:
                typeof evidenceSummary.endCandidateClockSource === 'string'
                  ? evidenceSummary.endCandidateClockSource
                  : null,
              endCandidateEnteredAt: det.possibleEndEnteredAt,
              endRecognizedAt,
              canonicalEndAt: endTime,
              endBoundarySource: chosenEndSource,
              endDetectionMode: det.endDetectionMode ?? null,
              endConfidence: det.endConfidence ?? null,
            });
            const shadowFinalize = runShadowObservabilitySafely(this.logger, 
              'shadow_finalize_terminal_summary',
              () =>
                runShadowFinalizeObservation({
                  vehicleId,
                  priorSummary: det.lastEvidenceSummary as Record<string, unknown> | null,
                  realEndPath: chosenEndSource,
                }),
            );
            const finalizeLayer = {
              detectionProfile: det.detectionProfile,
              startDetectionMode: det.startDetectionMode,
              startBoundarySource: startForensics.startBoundarySource,
              startCandidateAt:
                startForensics.flatStartCandidateAt ??
                (typeof evidenceSummary.startCandidateAt === 'string'
                  ? evidenceSummary.startCandidateAt
                  : null),
              startBoundaryAdjustedMs: startForensics.startBoundaryAdjustedMs,
              startEvidencePath: startForensics.startEvidencePath,
              endDetectionMode: det.endDetectionMode,
              startConfidence: det.startConfidence,
              endConfidence: det.endConfidence,
              endTimeSource: chosenEndSource,
              possibleStartAt: det.possibleStartAt?.toISOString(),
              possibleEndAt: det.possibleEndAt?.toISOString(),
              lastActivityAt: det.lastActivityAt?.toISOString(),
              lastMeaningfulMovementAt:
                (det as any).lastMeaningfulMovementAt?.toISOString() ?? null,
              cusumValidatedAt: (det as any).cusumValidatedAt?.toISOString() ?? null,
              cusumSegmentStart: (det as any).cusumSegmentStart?.toISOString() ?? null,
              cusumSegmentEnd: (det as any).cusumSegmentEnd?.toISOString() ?? null,
              endValidationAttempts: (det as any).endValidationAttempts ?? 0,
              startOdometerKm: det.startOdometerKm,
              startFuelLevel: det.startFuelLevel,
              startEvSoc: det.startEvSoc,
              endRecognizedAt: endRecognizedAt.toISOString(),
              endCoordinateSource: endCoords.endCoordinateSource,
              endCoordinateObservedAt: endCoords.endCoordinateObservedAt,
              tripFsmForensics,
              ...r5EndForensics,
              ...(shadowFinalize?.terminalSummary
                ? { shadowObservability: shadowFinalize.terminalSummary }
                : {}),
            };
            terminalLifecycleIntent = 'COMPLETE';
            terminalTripId = tripId;

            const preWriteDet = await this.getOrCreateDetectionState(
              vehicleId,
              organizationId,
            );
            const preWriteAdmission = evaluateEndCycleJobAdmission({
              det: preWriteDet,
              job: data,
            });
            if (preWriteAdmission !== 'ok') {
              const reason = mapEndCycleStaleFinalizeReason(preWriteAdmission);
              this.logger.log(
                `FINALIZE pre-write admission blocked for ${vehicleId}: ${reason}`,
              );
              await this.logTrackingRun({
                vehicleId,
                organizationId,
                tripId: preWriteDet.activeTripId,
                stateAtRun: preWriteDet.state,
                runType: TripTrackingRunType.FINALIZATION_CHECK,
                resultSummary: {
                  reason: `${reason}_pre_write`,
                  jobEndCycleToken: data.endCycleToken ?? null,
                  expectedEndCycleToken: resolveEndCycleToken(preWriteDet),
                  jobRequestedAt: data.requestedAt ?? null,
                },
                durationMs: Date.now() - startedMs,
              });
              return;
            }

            observeFinalizeCommitted({
              logger: this.logger,
              service: this.endValidationObservability,
              organizationId,
              vehicleId,
              det,
              workerNow: endRecognizedAt,
              canonicalEndAt: endTime,
              endRecognizedAt,
              retryBudgetMax: this.TRIP_END_VALIDATION_MAX_ATTEMPTS,
            });

            await this.decisionEngine.finalizeTrip(tripId, {
              endTime,
              endLatitude: endCoords.endLatitude,
              endLongitude: endCoords.endLongitude,
              endDetectionMode:
                det.endDetectionMode ?? END_DETECTION_MODES.NO_ACTIVITY_TIMEOUT,
              endConfidence:
                (det.endConfidence as 'LOW' | 'MEDIUM' | 'HIGH' | null) ?? undefined,
              cusumSegmentStart: (det as any).cusumSegmentStart ?? null,
              cusumSegmentEnd: (det as any).cusumSegmentEnd ?? null,
              durationMs,
              rawDetectionMeta: mergeFinalizeRawDetectionMeta({
                priorRaw: trip.rawDetectionMeta,
                finalizeLayer,
              }),
            });
            terminalLifecycleCommit = 'COMPLETED';
            terminalTripId = tripId;
            finalizedTripForRestWindow = { tripId, startTime: trip.startTime, endTime };
            runTripObservabilitySafely(
              this.logger,
              'finalize_post_commit_observability',
              () => {
              this.logger.log(
                `Trip ${tripId} finalized for ${vehicleId} [endSource=${chosenEndSource} mode=${det.endDetectionMode}]`,
              );
              this.tripMetrics?.tripFinalized.inc({
                profile: profileLabel,
                quality: 'ok',
                source: 'v2_live',
              });
              this.tripMetrics?.tripEvidencePaths?.inc({
                phase: 'end_finalization',
                path: chosenEndSource.toUpperCase(),
              });
              observeTripDuration(this.tripMetrics, {
                profile: profileLabel,
                startAt: trip.startTime,
                endAt: endTime,
              });
              observeEndRecognitionLatency(this.tripMetrics, {
                profile: profileLabel,
                commitConfirmation: 'direct',
                recognizedAt: endRecognizedAt,
                canonicalEndAt: endTime,
              });
              observeEndBoundaryAdjustment(this.tripMetrics, {
                profile: profileLabel,
                endSource: chosenEndSource,
                candidateAt: det.possibleEndAt,
                canonicalEndAt: endTime,
              });
              this.tripMetrics?.tripFinalizeLatency?.observe(
                { profile: profileLabel },
                durationMs / 1000,
              );
              const movementAnchor =
                (det as any).lastMeaningfulMovementAt ??
                det.possibleEndAt ??
                null;
              if (movementAnchor) {
                const latencyFromMovementMs =
                  endTime.getTime() - movementAnchor.getTime();
                if (latencyFromMovementMs >= 0) {
                  this.tripMetrics?.tripEndLatencyFromMovement?.observe(
                    { profile: profileLabel, end_source: chosenEndSource },
                    latencyFromMovementMs / 1000,
                  );
                }
              }
              const endTimelineFields = buildEndTimelineFields({
                possibleEndAt: det.possibleEndAt,
                possibleEndEnteredAt: det.possibleEndEnteredAt,
                canonicalEndAt: endTime,
                endRecognizedAt,
              });
              this.logTripEndTimeline('trip_finalized', {
                vehicleId,
                tripId,
                lastMeaningfulMovementAt: (det as any).lastMeaningfulMovementAt ?? null,
                possibleEndAt: det.possibleEndAt,
                possibleEndEnteredAt: det.possibleEndEnteredAt,
                endValidationStartedAt: this.parseEvidenceTimestamp(
                  det.lastEvidenceSummary,
                  'endValidationStartedAt',
                ),
                canonicalEndAt: endTime,
                endRecognizedAt,
                endSource: chosenEndSource,
                candidateLatencySec: endTimelineFields.candidateLatencySec,
                recognitionLatencySec: endTimelineFields.recognitionLatencySec,
                boundaryAdjustmentSec: endTimelineFields.boundaryAdjustmentSec,
                latencyFromMovementMs:
                  movementAnchor != null
                    ? endTime.getTime() - movementAnchor.getTime()
                    : null,
              });
            });

            // Durable V2 analysis init (awaited) after persisted finalize.
            await this.postFinalizeAnalysisProducer.produceAfterPersistedCompletion({
              tripId,
              vehicleId,
              organizationId,
              source: 'LIVE_FINALIZE',
            });

            // Legacy enrichment path — retained until V2 pipeline fully replaces it.
            this.enrichmentOrchestrator
              .enqueueBehaviorEnrichment(tripId, vehicleId, organizationId)
              .catch((e) => this.logger.error(`V2 finalize: failed to enqueue enrichment for trip ${tripId}: ${e}`));
          }
        }
      }

      await this.transitionState(vehicleId, TripDetectionState.RESTING, {
        activeTripId: null,
        ...clearPossibleStartClockFields(),
        ...clearPossibleEndClockFields(),
        lastActivityAt: restWindowAnchorAt,
        lastMeaningfulMovementAt: null,
        lastCoreProcessedAt: null,
        lastRouteProcessedAt: null,
        lastDrivingProcessedAt: null,
        startOdometerKm: null,
        startFuelLevel: null,
        startEvSoc: null,
        startDetectionMode: null,
        startConfidence: null,
        endDetectionMode: null,
        endConfidence: null,
        endValidationAttempts: 0,
        cusumValidatedAt: null,
        cusumSegmentStart: null,
        cusumSegmentEnd: null,
        // Store resting reason for smart cooldown selection on next snapshot
        lastEvidenceSummary: { lastRestingReason: restingReason },
      });
      restingTransitionSucceeded = true;

      if (finalizedTripForRestWindow) {
        void runDtc02AdaptiveShadowOnTripFsmEvent({
          prisma: this.prisma,
          observability: this.dtc02Observability,
          redis: this.redis,
          vehicleId,
          tripId: finalizedTripForRestWindow.tripId,
          eventKind: 'trip_end_finalized',
          evaluatedAtMs: Date.now(),
          logger: this.logger,
        });
      }

      // ── Battery V2 LV rest window (observation-independent primary path) ──
      // Enqueued only after both the COMPLETED trip and the RESTING transition
      // are persisted, so the consumer reads authoritative finalized state.
      // Durable + idempotent (lv-rest-open:{vehicleId}:{anchorMs}); failures
      // never affect the trip lifecycle — reconciliation self-heals misses.
      if (finalizedTripForRestWindow && organizationId) {
        const {
          tripId: finalizedTripId,
          startTime: finalizedStartTime,
          endTime: finalizedEndTime,
        } = finalizedTripForRestWindow;
        try {
          await this.batteryLvRestSessionProducer.enqueueSessionOpenForFinalizedTrip({
            organizationId,
            vehicleId,
            tripId: finalizedTripId,
            tripEndedAt: finalizedEndTime,
          });
        } catch (e) {
          this.logger.warn(
            `V2 finalize: LV rest session open enqueue failed for trip ${finalizedTripId}: ${e}`,
          );
        }

        try {
          await this.shutdownEvidenceTripContext?.captureAtTripFinalization({
            organizationId,
            vehicleId,
            tripId: finalizedTripId,
            tripEndedAt: finalizedEndTime,
          });
        } catch (e) {
          this.logger.warn(
            `V2 finalize: shutdown evidence trip context capture failed for trip ${finalizedTripId}: ${e}`,
          );
        }

        if (this.diBoundaryAdmission) {
          try {
            await this.diBoundaryAdmission.releaseLiveFsmSplitSegmentsAfterFinalization(
              organizationId,
              vehicleId,
              finalizedTripId,
            );
          } catch (e) {
            this.logger.warn(
              `V2 finalize: DI boundary admission LIVE_FSM settlement release failed for vehicle ${vehicleId}: ${e}`,
            );
          }
        }

        if (this.tripReconciliation) {
          try {
            await this.tripReconciliation.reconcileAdmissionAfterFinalization(
              vehicleId,
              finalizedStartTime,
              finalizedEndTime,
            );
          } catch (e) {
            this.logger.warn(
              `V2 finalize: post-finalize DI admission reconcile failed for vehicle ${vehicleId} trip ${finalizedTripId}: ${e}`,
            );
          }
        }
      }

      await this.logTrackingRun({
        vehicleId,
        organizationId,
        tripId,
        stateAtRun: det.state,
        runType: TripTrackingRunType.FINALIZATION_CHECK,
        resultState: TripDetectionState.RESTING,
        resultSummary: {
          terminalLifecycleCommit,
          ...(finalizeQualityObservability ?? {}),
        },
        durationMs: Date.now() - startedMs,
      });
    } catch (err) {
      this.logger.warn(`FINALIZE error for ${vehicleId}: ${err}`);

      let durableTerminalOutcome = null;
      if (
        terminalLifecycleCommit === 'NONE' &&
        terminalLifecycleIntent !== 'NONE' &&
        terminalTripId
      ) {
        durableTerminalOutcome = await readDurableTerminalOutcome(this.prisma, {
          intent: terminalLifecycleIntent,
          tripId: terminalTripId,
        });
      }

      const recovery = resolveTerminalRestingRecoveryWake({
        restingTransitionSucceeded,
        terminalTripId,
        terminalLifecycleCommit,
        terminalLifecycleIntent,
        durableOutcome: durableTerminalOutcome,
      });

      if (recovery.shouldWake && terminalTripId) {
        try {
          await this.scheduleFinalize(
            vehicleId,
            organizationId,
            data.dimoTokenId,
          );
          const commitLabel =
            recovery.effectiveCommit !== 'NONE'
              ? recovery.effectiveCommit
              : `AMBIGUOUS(${terminalLifecycleIntent})`;
          this.logger.warn(
            `FINALIZE terminal orphan recovery wake scheduled vehicle=${vehicleId} ` +
              `trip=${terminalTripId} commit=${commitLabel}` +
              (durableTerminalOutcome ? ` durable=${durableTerminalOutcome}` : ''),
          );
          if (
            durableTerminalOutcome === 'TERMINAL_EXPECTED' &&
            terminalLifecycleIntent === 'COMPLETE' &&
            recovery.effectiveCommit !== 'NONE'
          ) {
            try {
              const durableTrip = await this.prisma.vehicleTrip.findUnique({
                where: { id: terminalTripId },
                select: {
                  tripStatus: true,
                  endTime: true,
                  rawDetectionMeta: true,
                  startTime: true,
                },
              });
              const recognizedAt = readPersistedEndRecognizedAt(
                durableTrip?.rawDetectionMeta,
              );
              if (
                durableTrip?.tripStatus === TripStatus.COMPLETED &&
                durableTrip.endTime &&
                recognizedAt
              ) {
                runTripObservabilitySafely(this.logger,'finalize_durable_recognition_metric', () => {
                  observeEndRecognitionLatency(this.tripMetrics, {
                    profile: detectionProfileLabel,
                    commitConfirmation: 'durable',
                    recognizedAt,
                    canonicalEndAt: durableTrip.endTime!,
                  });
                });
              }
            } catch (metricErr) {
              this.logger.warn(
                `FINALIZE durable recognition metric skipped trip=${terminalTripId}: ${metricErr}`,
              );
            }
          }
        } catch (enqueueErr) {
          this.logger.warn(
            `FINALIZE terminal orphan recovery enqueue failed vehicle=${vehicleId} ` +
              `trip=${terminalTripId}: ${enqueueErr}`,
          );
        }
      }
    } finally {
      await this.releaseWorkerLock(vehicleId, lock.runToken);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  TRIP LIFECYCLE HELPERS
  // ══════════════════════════════════════════════════════════

  private hasClickHouseAnalyticsDetectors(): boolean {
    if (!isClickHouseTripAssistEnabled()) return false;
    if (!this.clickHouse?.isAvailable) return false;
    return (
      this.detectorRegistry.get('ActivityWindowDetector') != null &&
      this.detectorRegistry.get('IgnitionSegmentDetector') != null
    );
  }

  /**
   * Bounded post-boundary resume revalidation immediately before CH skip terminalization.
   * Reuses TRIP_END_VALIDATION_RETRY_MS + TRIP_END_CH_ASSIST_STABILITY_MS immaturity bound
   * and a separate defer counter so #1627 attempt budget is not consumed.
   */
  private async evaluateClickHouseSkipResumeRevalidation(params: {
    vehicleId: string;
    organizationId: string | null;
    dimoTokenId: number;
    det: DetState;
    now: Date;
    candidateEndAt: Date;
    priorSummary: Record<string, unknown>;
  }): Promise<{
    outcome: ChSkipResumeRevalidationOutcome;
    deferCount: number;
    relatchEnteredAt: Date;
    immaturityBoundMs: number;
    fetchUncertain: boolean;
  }> {
    const profile =
      params.det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN;
    const relatchEnteredAt = resolveChSkipResumeRevalidationRelatchEnteredAt({
      detPossibleEndEnteredAt: params.det.possibleEndEnteredAt,
      priorSummary: params.priorSummary,
      fallbackNow: params.now,
      endDetectionMode: params.det.endDetectionMode,
    });
    const immaturityBoundMs = resolveChSkipResumeRevalidationImmaturityBoundMs({
      validationRetryMs: this.TRIP_END_VALIDATION_RETRY_MS,
      chAssistStabilityMs: this.TRIP_END_CH_ASSIST_STABILITY_MS,
    });
    const priorDeferCount = readChSkipResumeRevalidationDeferCount(
      params.priorSummary,
    );
    const maxDeferCount = resolveChSkipResumeRevalidationMaxDeferCount(
      this.TRIP_END_VALIDATION_MAX_ATTEMPTS,
    );

    let resumeObserved = false;
    let fetchUncertain = false;
    try {
      resumeObserved = await this.checkDimoActivityResumed({
        vehicleId: params.vehicleId,
        dimoTokenId: params.dimoTokenId,
        profile,
        now: params.now,
        resumeAfterAt: params.candidateEndAt,
      });
    } catch {
      fetchUncertain = true;
    }

    const outcome = evaluateChSkipResumeRevalidationMaturity({
      nowMs: params.now.getTime(),
      relatchEnteredAtMs: relatchEnteredAt.getTime(),
      immaturityBoundMs,
      resumeObserved,
      fetchUncertain,
      priorDeferCount,
      maxDeferCount,
    });

    const deferCount =
      outcome === 'NO_RESUME_EVIDENCE_IMMATURE' || outcome === 'FETCH_UNCERTAIN'
        ? Math.min(priorDeferCount + 1, maxDeferCount)
        : priorDeferCount;

    return {
      outcome,
      deferCount,
      relatchEnteredAt,
      immaturityBoundMs,
      fetchUncertain,
    };
  }

  /**
   * DIMO recent-core resume check shared by CH end assist and POSSIBLE_END_CHECK.
   */
  private async checkDimoActivityResumed(params: {
    vehicleId: string;
    dimoTokenId: number;
    profile: VehicleDetectionProfile;
    now: Date;
    corePoints?: Awaited<ReturnType<DimoSegmentsService['fetchRawTripCoreData']>>;
    /** Only points strictly after this boundary may reopen the trip. */
    resumeAfterAt?: Date | null;
  }): Promise<boolean> {
    const recentFrom = new Date(params.now.getTime() - 90_000);
    const recentPoints =
      params.corePoints != null
        ? params.corePoints.filter(
            (p) => new Date(p.timestamp).getTime() >= recentFrom.getTime(),
          )
        : await this.segments.fetchRawTripCoreData(
            params.dimoTokenId,
            recentFrom,
            params.now,
            this.dimoProviderContext(params.dimoTokenId, params.vehicleId),
          );

    const resumeFindings = await this.detectorRegistry.runAll(
      ['EndContinuityDetector'],
      {
        vehicleId: params.vehicleId,
        dimoTokenId: params.dimoTokenId,
        profile: params.profile,
        phase: DETECTION_PHASES.POSSIBLE_END,
        coreDataPoints: recentPoints,
        possibleEndAt: params.resumeAfterAt ?? null,
      },
    );
    return resumeFindings.some(
      (f) =>
        f.detectorName === 'EndContinuityDetector' && f.verdict === 'TRIGGERED',
    );
  }

  private async cancelPossibleEndForResumedActivity(params: {
    vehicleId: string;
    organizationId: string | null;
    dimoTokenId: number;
    now: Date;
    activeTripId?: string | null;
    priorSummary?: Record<string, unknown> | null;
  }): Promise<void> {
    await this.transitionState(params.vehicleId, TripDetectionState.ACTIVE_TRIP, {
      ...buildPossibleEndToActiveReset({
        workerNow: params.now,
        priorSummary: params.priorSummary,
        reopenReason: 'ACTIVITY_RESUMED',
      }),
    });
    await this.cancelPendingEndCycleJobs(
      params.vehicleId,
      params.activeTripId ?? null,
    );
    await this.scheduleActiveTick(
      params.vehicleId,
      params.organizationId,
      params.dimoTokenId,
    );
  }

  private async resolveContinuityFindingForEndAssist(params: {
    vehicleId: string;
    dimoTokenId: number;
    profile: VehicleDetectionProfile;
    tripStartAt: Date;
    now: Date;
    corePoints: Awaited<ReturnType<DimoSegmentsService['fetchRawTripCoreData']>>;
  }): Promise<DetectorFinding | undefined> {
    const nowMs = params.now.getTime();
    const recentCore =
      params.corePoints.length > 0
        ? params.corePoints.filter(
            (p) => nowMs - new Date(p.timestamp).getTime() <= this.TRIP_CONTINUITY_CORE_WINDOW_MS,
          )
        : [];
    const evalCore =
      recentCore.length > 0 ? recentCore : params.corePoints.slice(-3);

    const continuityFindings = await this.detectorRegistry.runAll(
      ['ContinuityAssessmentDetector'],
      {
        vehicleId: params.vehicleId,
        dimoTokenId: params.dimoTokenId,
        profile: params.profile,
        phase: DETECTION_PHASES.ACTIVE_TRIP,
        timeWindow: { from: params.tripStartAt, to: params.now },
        coreDataPoints: evalCore,
        performanceReadings: [],
      },
    );
    return continuityFindings.find(
      (f) => f.detectorName === 'ContinuityAssessmentDetector',
    );
  }

  /**
   * ClickHouse-first trip end assist. Returns true when an end path was
   * scheduled (caller should stop the active tick). FSM/CUSUM remains fallback.
   */
  private async tryApplyClickHouseAssistedEnd(params: {
    vehicleId: string;
    organizationId: string | null;
    dimoTokenId: number;
    tripId: string;
    det: DetState;
    profile: string;
    tripStartAt: Date;
    now: Date;
    telemetry: VehicleLatestState | null;
    corePoints: Awaited<ReturnType<DimoSegmentsService['fetchRawTripCoreData']>>;
  }): Promise<boolean> {
    if (!this.hasClickHouseAnalyticsDetectors()) return false;

    const currentTelemetry = params.telemetry
      ? {
          isIgnitionOn: params.telemetry.isIgnitionOn,
          speedKmh: params.telemetry.speedKmh,
          engineLoad: params.telemetry.engineLoad,
        }
      : null;

    if (!isCurrentTelemetryInactive(currentTelemetry)) return false;

    const profileEnum =
      params.det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN;

    const isEvProfile =
      params.profile === 'EV' ||
      params.profile === 'HYBRID' ||
      params.profile === 'UNKNOWN';
    if (isEvProfile && !this.detectorRegistry.get('MotionSegmentDetector')) {
      this.logger.debug(
        `CH end assist skipped for ${params.vehicleId}: MotionSegmentDetector unavailable for EV profile`,
      );
      return false;
    }

    const endAssistPolicy = this.policyResolver.resolve({
      phase: DETECTION_PHASES.ACTIVE_TRIP,
      profile: profileEnum,
      dataQuality: {
        snapshotFreshness: params.telemetry?.updatedAt ? 'FRESH' : 'MISSING',
        ignitionAvailable: params.telemetry?.isIgnitionOn != null,
        speedAvailable: params.telemetry?.speedKmh != null,
        odometerAvailable: params.telemetry?.odometerKm != null,
        telemetryDensity: params.corePoints.length >= 4 ? 'HIGH' : 'LOW',
        routeCoverage: 'NONE',
        highFrequencyAvailable: true,
      },
      anomalyContext: {
        confirmingEnd: true,
        clickhouseAvailable: true,
      },
    });

    const segmentDetectorNames = endAssistPolicy.detectors.filter(
      (name) => name !== 'ActivityWindowDetector',
    );

    const segmentFindings = await this.detectorRegistry.runAll(
      segmentDetectorNames,
      {
        vehicleId: params.vehicleId,
        dimoTokenId: params.dimoTokenId,
        profile: profileEnum,
        phase: DETECTION_PHASES.ACTIVE_TRIP,
        timeWindow: { from: params.tripStartAt, to: params.now },
        anomalyContext: { confirmingEnd: true, clickhouseAvailable: true },
      },
      endAssistPolicy.timeoutMs,
    );

    const ignitionSegment = segmentFindings.find(
      (f) => f.detectorName === 'IgnitionSegmentDetector',
    );
    const motionSegment = segmentFindings.find(
      (f) => f.detectorName === 'MotionSegmentDetector',
    );

    const preliminaryEnd = extractLatestSegmentEnd(
      { ignitionSegment, motionSegment },
      params.tripStartAt,
      params.now,
      isEvProfile,
    );

    let activityWindow = undefined;
    if (preliminaryEnd) {
      const postStopFrom = new Date(
        Math.max(
          preliminaryEnd.endAt.getTime(),
          params.now.getTime() - 5 * 60_000,
        ),
      );
      const activityFindings = await this.detectorRegistry.runAll(
        ['ActivityWindowDetector'],
        {
          vehicleId: params.vehicleId,
          dimoTokenId: params.dimoTokenId,
          profile: profileEnum,
          phase: DETECTION_PHASES.ACTIVE_TRIP,
          timeWindow: { from: postStopFrom, to: params.now },
          anomalyContext: { confirmingEnd: true, clickhouseAvailable: true },
        },
        endAssistPolicy.timeoutMs,
      );
      activityWindow = activityFindings.find(
        (f) => f.detectorName === 'ActivityWindowDetector',
      );
    }

    const continuityFinding = await this.resolveContinuityFindingForEndAssist({
      vehicleId: params.vehicleId,
      dimoTokenId: params.dimoTokenId,
      profile: profileEnum,
      tripStartAt: params.tripStartAt,
      now: params.now,
      corePoints: params.corePoints,
    });

    const endDecision = resolveAnalyticsAssistedEndDecision({
      continuityFinding,
      activityWindow,
      ignitionSegment,
      motionSegment,
      profile: params.profile,
      tripStartAt: params.tripStartAt,
      now: params.now,
      currentTelemetry,
      minStationaryAfterSegmentMs: this.TRIP_END_CH_ASSIST_MIN_STATIONARY_MS,
      minTripDurationMs: this.TRIP_END_CH_ASSIST_MIN_TRIP_DURATION_MS,
      highConfidenceStationaryMs: this.TRIP_END_CH_ASSIST_HIGH_STATIONARY_MS,
    });

    if (!endDecision.confirmed || !endDecision.detectedEndAt) return false;

    const recentFrom = new Date(params.now.getTime() - 90_000);
    const recentPoints =
      params.corePoints.length > 0
        ? params.corePoints.filter(
            (p) => new Date(p.timestamp).getTime() >= recentFrom.getTime(),
          )
        : undefined;

    if (
      await this.checkDimoActivityResumed({
        vehicleId: params.vehicleId,
        dimoTokenId: params.dimoTokenId,
        profile: profileEnum,
        now: params.now,
        corePoints: recentPoints,
        resumeAfterAt: endDecision.detectedEndAt,
      })
    ) {
      return false;
    }

    const endConfEnum =
      endDecision.confidence === 'HIGH'
        ? DetectionConfidence.HIGH
        : endDecision.confidence === 'MEDIUM'
          ? DetectionConfidence.MEDIUM
          : DetectionConfidence.LOW;

    const detectedEndAt = endDecision.detectedEndAt;

    runTripObservabilitySafely(this.logger,'ch_end_assist_pre', () => {
      this.tripMetrics?.tripEvidencePaths?.inc({
        phase: 'end_assist',
        path: endDecision.evidencePath,
      });
      this.logger.log(
        `CH end assist for ${params.vehicleId}: end at ${detectedEndAt.toISOString()} ` +
          `[${endDecision.confidence}] path=${endDecision.evidencePath}`,
      );
      this.logTripEndTimeline('clickhouse_end_assist', {
        vehicleId: params.vehicleId,
        tripId: params.tripId,
        lastMeaningfulMovementAt: (params.det as any).lastMeaningfulMovementAt,
        possibleEndAt: detectedEndAt,
        finalizedAt: detectedEndAt,
        endSource: 'clickhouse_segment_end',
        confidence: endDecision.confidence,
      });
    });

    await this.transitionState(params.vehicleId, TripDetectionState.POSSIBLE_END, {
      possibleEndAt: detectedEndAt,
      possibleEndEnteredAt: params.now,
      endValidationAttempts: 0,
      cusumValidatedAt: null,
      cusumSegmentStart: params.tripStartAt,
      cusumSegmentEnd: detectedEndAt,
      endDetectionMode: END_DETECTION_MODES.CLICKHOUSE_END_ASSIST,
      endConfidence: endConfEnum,
      lastMeaningfulMovementAt: detectedEndAt,
      lastEvidenceSummary: {
        clickhouseEndAssist: endDecision.summary,
        clickhouseEndEvidencePath: endDecision.evidencePath,
        dimoContinuityCorroborated:
          endDecision.evidencePath === 'DIMO_PLUS_CLICKHOUSE',
        endCandidateClockSource: 'PROVIDER_EVENT_TIME',
        ...(params.corePoints.length === 0
          ? {
              clickhouseEndAssistRelatchEmptyCore: true,
              noCoreStream: true,
              chSkipResumeRevalidationRelatchEnteredAt: params.now.toISOString(),
            }
          : {}),
      },
    });

    if (endDecision.confidence === 'HIGH') {
      if (
        await this.checkDimoActivityResumed({
          vehicleId: params.vehicleId,
          dimoTokenId: params.dimoTokenId,
          profile: profileEnum,
          now: params.now,
          corePoints: recentPoints,
          resumeAfterAt: detectedEndAt,
        })
      ) {
        this.logger.log(
          `CH end assist HIGH cancelled for ${params.vehicleId}: DIMO activity resumed before finalize`,
        );
        await this.cancelPossibleEndForResumedActivity({
          vehicleId: params.vehicleId,
          organizationId: params.organizationId,
          dimoTokenId: params.dimoTokenId,
          now: params.now,
          activeTripId: params.tripId,
        });
        return false;
      }

      await this.transitionState(params.vehicleId, TripDetectionState.POSSIBLE_END, {
        cusumValidatedAt: params.now,
      });
      await this.scheduleFinalize(
        params.vehicleId,
        params.organizationId,
        params.dimoTokenId,
      );
    } else {
      await this.schedulePossibleEndCheck(
        params.vehicleId,
        params.organizationId,
        params.dimoTokenId,
        0,
      );
    }

    runTripObservabilitySafely(this.logger,'ch_end_candidate', () => {
      this.observePossibleEndCandidateLatency({
        priorState: params.det.state,
        profile: String(params.profile),
        evidencePath: endDecision.evidencePath,
        clockSource: 'PROVIDER_EVENT_TIME',
        candidateAt: detectedEndAt,
        enteredAt: params.now,
      });
      this.tripMetrics?.tripEvidencePaths?.inc({
        phase: 'end_candidate',
        path: endDecision.evidencePath,
      });
    });

    return true;
  }

  // ══════════════════════════════════════════════════════════
  //  MID-TRIP GAP DETECTION
  // ══════════════════════════════════════════════════════════

  /**
   * Scans a batch of DIMO core points for a mid-trip stationary silence
   * sandwiched between "stopped" and "moving" samples. The anchor is the
   * detection-state's `lastMeaningfulMovementAt`, which represents the
   * previous tick's latest confirmed motion timestamp — so we also detect
   * cross-tick gaps (silence spanning the entire fetch window).
   *
   * Returns the gap boundary and the indicative pre/post coordinates,
   * or `null` if no qualifying gap is present.
   *
   * NOTE: This is evidence only. The orchestrator MUST additionally check
   * GPS drift via `computeMidGapPositionDrift` before actually splitting.
   */
  private findMidTripGap(
    corePoints: Awaited<ReturnType<DimoSegmentsService['fetchRawTripCoreData']>>,
    det: DetState,
    vehicleId: string,
  ): {
    gapMs: number;
    firstEndAt: Date;
    firstEndLatitude: number | null;
    firstEndLongitude: number | null;
    secondStartAt: Date;
    secondStartLatitude: number | null;
    secondStartLongitude: number | null;
  } | null {
    if (corePoints.length === 0) return null;

    const anchorAt =
      (det as any).lastMeaningfulMovementAt ??
      det.lastActivityAt ??
      null;

    // Sort defensively (service already sorts but guard anyway).
    const sorted = [...corePoints].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    const telemetrySilenceHardeningEnabled =
      isTripMidGapTelemetrySilenceHardeningEnabledForVehicle(vehicleId);

    const candidate = findMidTripGapCandidateWithPolicy({
      corePoints: sorted.map((p) => ({
        timestamp: p.timestamp,
        speed: p.speed ?? null,
        isIgnitionOn: p.isIgnitionOn ?? null,
      })),
      anchorAt: anchorAt ? new Date(anchorAt) : null,
      maxSameTripQualifiedStopMs: this.maxSameTripQualifiedStopMs,
      stoppedSpeedKmh: 5,
      telemetrySilenceHardeningEnabled,
    });
    if (!candidate) {
      return null;
    }

    return {
      gapMs: candidate.gapMs,
      firstEndAt: candidate.firstEndAt,
      firstEndLatitude: candidate.firstEndLatitude,
      firstEndLongitude: candidate.firstEndLongitude,
      secondStartAt: candidate.secondStartAt,
      secondStartLatitude: candidate.secondStartLatitude,
      secondStartLongitude: candidate.secondStartLongitude,
    };
  }

  /**
   * Resolves GPS drift evidence for a live mid-gap split candidate.
   * Uses persisted waypoints first; falls back to the current route batch
   * only when timestamp-bounded pre/post coordinates are unambiguous.
   */
  private async resolveLiveMidGapDriftEvidence(
    tripId: string,
    firstEndAt: Date,
    secondStartAt: Date,
    routePoints: Array<{
      timestamp: string;
      latitude: number;
      longitude: number;
    }>,
  ) {
    const [preDb, postDb] = await Promise.all([
      this.prisma.vehicleTripWaypoint.findFirst({
        where: { tripId, recordedAt: { lte: firstEndAt } },
        orderBy: { recordedAt: 'desc' },
        select: { latitude: true, longitude: true },
      }),
      this.prisma.vehicleTripWaypoint.findFirst({
        where: { tripId, recordedAt: { gte: secondStartAt } },
        orderBy: { recordedAt: 'asc' },
        select: { latitude: true, longitude: true },
      }),
    ]);

    const preFromRoute = selectRoutePointAtOrBefore(routePoints, firstEndAt);
    const postFromRoute = selectRoutePointAtOrAfter(routePoints, secondStartAt);

    return computeMidGapDriftEvidence({
      pre: preDb
        ? { latitude: preDb.latitude, longitude: preDb.longitude }
        : preFromRoute
          ? {
              latitude: preFromRoute.latitude,
              longitude: preFromRoute.longitude,
            }
          : null,
      post: postDb
        ? { latitude: postDb.latitude, longitude: postDb.longitude }
        : postFromRoute
          ? {
              latitude: postFromRoute.latitude,
              longitude: postFromRoute.longitude,
            }
          : null,
      maxAllowedDriftM: this.TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M,
      haversineMeters: this.haversineMeters.bind(this),
    });
  }

  private haversineMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  private async resolveConfirmedStartBoundary(input: {
    dimoTokenId: number;
    vehicleId: string;
    organizationId?: string | null;
    candidateStartAt: Date;
    confirmedAt: Date;
    corePoints: Awaited<ReturnType<DimoSegmentsService['fetchRawTripCoreData']>>;
    profile: string;
  }): Promise<{
    legacy: {
      startAt: Date;
      source:
        | 'DIMO_SEGMENT'
        | 'ROUTE_ACTIVITY'
        | 'CORE_ACTIVITY'
        | 'SNAPSHOT_CANDIDATE';
      startLatitude: number | null;
      startLongitude: number | null;
      adjustedMs: number;
      dimoSegmentId: string | null;
    };
    evidence: StartBoundaryEvidenceContext;
  }> {
    const boundaryWindowFrom = computeStartBoundaryWindowFrom(
      input.candidateStartAt,
      input.confirmedAt,
      this.tripStartBoundaryMaxLookbackMs,
    );
    const providerContext = this.dimoProviderContext(
      input.dimoTokenId,
      input.vehicleId,
      input.organizationId,
    );
    const segments = await this.segments.fetchTripSegments(
      input.dimoTokenId,
      boundaryWindowFrom,
      input.confirmedAt,
      undefined,
      providerContext,
    );

    let routePoints: Awaited<
      ReturnType<DimoSegmentsService['fetchRouteEnrichment']>
    > = [];
    let legacyRouteFetchPerformed = false;

    const preMatch = resolveLegacyConfirmedStartBoundary({
      boundaryWindowFrom,
      candidateStartAt: input.candidateStartAt,
      confirmedAt: input.confirmedAt,
      corePoints: input.corePoints,
      profile: input.profile,
      segments,
      routePoints: [],
      legacyRouteFetchPerformed: false,
    });

    if (!preMatch.evidence.matchingSegment) {
      routePoints = await this.segments.fetchRouteEnrichment(
        input.dimoTokenId,
        boundaryWindowFrom,
        input.confirmedAt,
        providerContext,
      );
      legacyRouteFetchPerformed = true;
    }

    return resolveLegacyConfirmedStartBoundary({
      boundaryWindowFrom,
      candidateStartAt: input.candidateStartAt,
      confirmedAt: input.confirmedAt,
      corePoints: input.corePoints,
      profile: input.profile,
      segments,
      routePoints,
      legacyRouteFetchPerformed,
    });
  }

  private async fetchAndStoreStartTemperature(
    tokenId: number,
    tripId: string,
    startTime: Date,
    requestContext?: DimoProviderRequestContext,
  ): Promise<void> {
    const from = new Date(startTime.getTime() - 5 * 60_000);
    const to = new Date(startTime.getTime() + 5 * 60_000);
    const readings = await this.segments.fetchEnvironmentTemperature(
      tokenId,
      from,
      to,
      requestContext,
    );

    if (readings.length > 0) {
      const closest = DimoSegmentsService.closestReading(
        readings,
        startTime,
      );
      if (closest) {
        await this.prisma.vehicleTrip.update({
          where: { id: tripId },
          data: {
            outsideTemperatureStartC:
              Math.round(closest.temperatureC * 10) / 10,
          },
        });
      }
    }
  }

  private async fetchAndStoreInitialRoute(
    tokenId: number,
    tripId: string,
    from: Date,
    to: Date,
    requestContext?: DimoProviderRequestContext,
  ): Promise<void> {
    const routePoints = await this.segments.fetchRouteEnrichment(
      tokenId,
      from,
      to,
      requestContext,
    );
    if (routePoints.length === 0) return;

    await this.prisma.vehicleTripWaypoint.createMany({
      data: routePoints.map((p) => ({
        tripId,
        latitude: p.latitude,
        longitude: p.longitude,
        speedKmh: p.speedKmh,
        recordedAt: new Date(p.timestamp),
      })),
    });

    const first = routePoints[0];
    const last = routePoints[routePoints.length - 1];
    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        startLatitude: first.latitude,
        startLongitude: first.longitude,
        endLatitude: last.latitude,
        endLongitude: last.longitude,
        routeTrackingStartedAt: new Date(),
      },
    });
  }

  // ══════════════════════════════════════════════════════════
  //  OBSERVABILITY
  // ══════════════════════════════════════════════════════════

  private parseEvidenceTimestamp(
    summary: unknown,
    key: string,
  ): Date | null {
    if (!summary || typeof summary !== 'object') return null;
    const raw = (summary as Record<string, unknown>)[key];
    return parseStrictEvidenceTimestamp(raw);
  }

  private observePossibleEndCandidateLatency(params: {
    priorState: TripDetectionState;
    profile: string;
    evidencePath: string;
    clockSource: string;
    candidateAt: Date;
    enteredAt: Date;
  }): void {
    if (params.priorState === TripDetectionState.POSSIBLE_END) {
      return;
    }
    observeEndCandidateLatency(this.tripMetrics, params);
  }

  private logTripStartTimeline(
    phase: 'active_trip_confirmed',
    input: {
      vehicleId: string;
      tripId?: string | null;
      startCandidateAt?: Date | null;
      startCandidateEnteredAt?: Date | null;
      canonicalStartAt?: Date | null;
      startRecognizedAt?: Date | null;
      boundarySource?: string | null;
      evidencePath?: string | null;
    },
  ): void {
    runTripObservabilitySafely(this.logger,'trip_start_timeline', () => {
      const fmt = (d?: Date | null) =>
        d && Number.isFinite(d.getTime()) ? d.toISOString() : '—';
      const fields = buildStartTimelineFields(input);
      this.logger.log(
        `TRIP_START_TIMELINE phase=${phase} vehicle=${input.vehicleId}` +
          (input.tripId ? ` trip=${input.tripId}` : '') +
          ` startCandidateAt=${fmt(input.startCandidateAt)}` +
          ` startCandidateEnteredAt=${fmt(input.startCandidateEnteredAt)}` +
          ` canonicalStartAt=${fmt(input.canonicalStartAt)}` +
          ` startRecognizedAt=${fmt(input.startRecognizedAt)}` +
          (input.boundarySource ? ` boundarySource=${input.boundarySource}` : '') +
          (input.evidencePath ? ` evidencePath=${input.evidencePath}` : '') +
          (fields.candidateLatencySec != null
            ? ` candidateLatencySec=${Math.round(fields.candidateLatencySec)}`
            : '') +
          (fields.recognitionLatencySec != null
            ? ` recognitionLatencySec=${Math.round(fields.recognitionLatencySec)}`
            : '') +
          (fields.boundaryAdjustmentSec != null
            ? ` boundaryAdjustmentSec=${Math.round(fields.boundaryAdjustmentSec)}`
            : ''),
      );
    });
  }

  private logTripEndTimeline(
    phase:
      | 'possible_end_entered'
      | 'end_validation_scheduled'
      | 'end_validation_started'
      | 'clickhouse_end_assist'
      | 'clickhouse_end_assist_confirmed'
      | 'cusum_confirmed'
      | 'trip_finalized',
    input: {
      vehicleId: string;
      tripId?: string | null;
      lastMeaningfulMovementAt?: Date | null;
      possibleEndAt?: Date | null;
      possibleEndEnteredAt?: Date | null;
      endValidationStartedAt?: Date | null;
      endValidationScheduledAt?: Date | null;
      /** @deprecated Use canonicalEndAt — boundary time, not worker recognition. */
      finalizedAt?: Date | null;
      canonicalEndAt?: Date | null;
      endRecognizedAt?: Date | null;
      candidateLatencySec?: number | null;
      recognitionLatencySec?: number | null;
      boundaryAdjustmentSec?: number | null;
      endSource?: string;
      confidence?: string;
      latencyFromMovementMs?: number | null;
      attempt?: number;
      completedAttempts?: number;
      completedEndValidationAttempt?: number;
      maxAttempts?: number;
    },
  ): void {
    runTripObservabilitySafely(this.logger,'trip_end_timeline', () => {
      const fmt = (d?: Date | null) =>
        d && Number.isFinite(d.getTime()) ? d.toISOString() : '—';
      const latencySec =
        input.latencyFromMovementMs != null
          ? Math.round(input.latencyFromMovementMs / 1000)
          : null;
      const canonicalEndAt = input.canonicalEndAt ?? input.finalizedAt ?? null;

      this.logger.log(
        `TRIP_END_TIMELINE phase=${phase} vehicle=${input.vehicleId}` +
          (input.tripId ? ` trip=${input.tripId}` : '') +
          ` lastMeaningfulMovementAt=${fmt(input.lastMeaningfulMovementAt)}` +
          ` possibleEndAt=${fmt(input.possibleEndAt)}` +
          ` possibleEndEnteredAt=${fmt(input.possibleEndEnteredAt)}` +
          ` endValidationStartedAt=${fmt(input.endValidationStartedAt)}` +
          ` canonicalEndAt=${fmt(canonicalEndAt)}` +
          ` endRecognizedAt=${fmt(input.endRecognizedAt)}` +
          (input.finalizedAt
            ? ` finalizedAt=${fmt(input.finalizedAt)}`
            : '') +
          (input.candidateLatencySec != null
            ? ` candidateLatencySec=${Math.round(input.candidateLatencySec)}`
            : '') +
          (input.recognitionLatencySec != null
            ? ` recognitionLatencySec=${Math.round(input.recognitionLatencySec)}`
            : '') +
          (input.boundaryAdjustmentSec != null
            ? ` boundaryAdjustmentSec=${Math.round(input.boundaryAdjustmentSec)}`
            : '') +
          (latencySec != null ? ` latencyFromMovementSec=${latencySec}` : '') +
          (input.endSource ? ` endSource=${input.endSource}` : '') +
          (input.confidence ? ` confidence=${input.confidence}` : '') +
          (input.attempt != null
            ? ` cusumAttempt=${input.attempt}/${input.maxAttempts ?? '?'}`
            : ''),
      );
    });
  }

  async logTrackingRun(input: {
    vehicleId: string;
    organizationId?: string | null;
    tripId?: string | null;
    stateAtRun: TripDetectionState;
    runType: TripTrackingRunType;
    requestedFrom?: Date | null;
    requestedTo?: Date | null;
    corePointsCount?: number | null;
    routePointsCount?: number | null;
    drivingPointsCount?: number | null;
    resultState?: TripDetectionState | null;
    resultSummary?: Record<string, unknown> | null;
    errorMessage?: string | null;
    durationMs?: number | null;
  }): Promise<void> {
    try {
      await this.prisma.vehicleTripTrackingRun.create({
        data: {
          vehicleId: input.vehicleId,
          organizationId: input.organizationId ?? null,
          tripId: input.tripId ?? null,
          stateAtRun: input.stateAtRun,
          runType: input.runType,
          requestedFrom: input.requestedFrom ?? null,
          requestedTo: input.requestedTo ?? null,
          corePointsCount: input.corePointsCount ?? null,
          routePointsCount: input.routePointsCount ?? null,
          drivingPointsCount: input.drivingPointsCount ?? null,
          resultState: input.resultState ?? input.stateAtRun,
          resultSummary: (input.resultSummary as any) ?? null,
          errorMessage: input.errorMessage ?? null,
          durationMs: input.durationMs ?? null,
        },
      });
    } catch (e) {
      this.logger.warn(`Failed to log tracking run: ${e}`);
    }
  }
}
