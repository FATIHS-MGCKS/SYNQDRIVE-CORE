import {
  DetectionConfidence,
  TripDetectionState,
  TripTrackingRunType,
  VehicleDetectionProfile,
} from '@prisma/client';

import { TRIP_TRACKING_TRIGGERS } from './trip-detection.types';
import { END_DETECTION_MODES } from './trip-detection.types';
import type { TripTrackingJobData } from './trip-detection.types';
import { TripDetectionOrchestrationService } from './trip-detection-orchestration.service';
import { END_CYCLE_TRANSIENT_EVIDENCE_KEYS } from './trip-end-cycle-reset';

const VEHICLE = 'veh-r5';
const ORG = 'org-r5';
const TOKEN = 99;
const WORKER_NOW = new Date('2026-09-06T12:00:00.000Z');

function jobData(trigger: TripTrackingJobData['trigger']): TripTrackingJobData {
  return {
    vehicleId: VEHICLE,
    organizationId: ORG,
    dimoTokenId: TOKEN,
    trigger,
    requestedAt: WORKER_NOW.toISOString(),
  };
}

function baseDet(overrides: Record<string, unknown> = {}) {
  return {
    vehicleId: VEHICLE,
    organizationId: ORG,
    state: TripDetectionState.POSSIBLE_END,
    detectionProfile: VehicleDetectionProfile.ICE,
    activeTripId: 'trip-1',
    possibleEndAt: new Date(WORKER_NOW.getTime() - 130_000),
    possibleEndEnteredAt: new Date(WORKER_NOW.getTime() - 100_000),
    lastMeaningfulMovementAt: new Date(WORKER_NOW.getTime() - 130_000),
    lastActivityAt: new Date(WORKER_NOW.getTime() - 130_000),
    endValidationAttempts: 0,
    endDetectionMode: null,
    endConfidence: null,
    cusumValidatedAt: null,
    cusumSegmentStart: null,
    cusumSegmentEnd: null,
    lastEvidenceSummary: null,
    ...overrides,
  };
}

function buildOrchestrationHarness(detOverrides: Record<string, unknown> = {}) {
  const det = baseDet(detOverrides);
  const proto = TripDetectionOrchestrationService.prototype as unknown as Record<
    string,
    (...args: never[]) => unknown
  >;
  const transitionState = jest.fn().mockResolvedValue({});
  const scheduleActiveTick = jest.fn().mockResolvedValue(undefined);
  const schedulePossibleEndCheck = jest.fn().mockResolvedValue(undefined);
  const scheduleEndValidation = jest.fn().mockResolvedValue(undefined);
  const scheduleFinalize = jest.fn().mockResolvedValue(undefined);
  const cancelPendingEndCycleJobs = jest.fn().mockResolvedValue(undefined);
  const logTrackingRun = jest.fn().mockResolvedValue(undefined);
  const fetchRawTripCoreData = jest.fn().mockResolvedValue([]);
  const fetchEndValidationWindow = jest.fn().mockResolvedValue([
    { timestamp: WORKER_NOW.toISOString(), speed: 0 },
  ]);
  const runAll = jest.fn();
  const evaluateEndCandidate = jest.fn();
  const checkDimoActivityResumed = jest.fn().mockResolvedValue(false);

  const svc = {
    logger: { log: jest.fn(), debug: jest.fn(), warn: jest.fn() },
    TRIP_END_TIMEOUT_MS: 1_800_000,
    TRIP_END_STABILITY_WINDOW_MS: 90_000,
    TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS: 120_000,
    TRIP_END_VALIDATION_RETRY_MS: 60_000,
    TRIP_END_VALIDATION_MAX_ATTEMPTS: 3,
    TRIP_END_SEGMENT_LOOKBACK_MS: 900_000,
    TRIP_END_SEGMENT_LOOKAHEAD_MS: 300_000,
    TRIP_END_CH_ASSIST_STABILITY_MS: 30_000,
    getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
    acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
    releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
    maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
    transitionState,
    scheduleActiveTick,
    schedulePossibleEndCheck,
    scheduleEndValidation,
    scheduleFinalize,
    cancelPendingEndCycleJobs,
    logTrackingRun,
    logTripEndTimeline: jest.fn(),
    tripMetrics: { possibleEndStuck: { set: jest.fn() } },
    segments: {
      fetchRawTripCoreData,
      fetchEndValidationWindow,
    },
    detectorRegistry: { runAll },
    decisionEngine: { evaluateEndCandidate },
    dimoProviderContext: jest.fn().mockReturnValue({}),
    checkDimoActivityResumed,
    cancelPossibleEndForResumedActivity: proto.cancelPossibleEndForResumedActivity,
    evaluateClickHouseSkipResumeRevalidation:
      proto.evaluateClickHouseSkipResumeRevalidation,
    parseEvidenceTimestamp: jest.fn().mockReturnValue(null),
    ensurePossibleEndClockDurability: jest
      .fn()
      .mockImplementation(async (_vehicleId: string, d: typeof det) => d),
    recordEndValidationObservability: proto.recordEndValidationObservability,
    endValidationObservability: {
      isEnabledForVehicle: () => false,
      record: jest.fn().mockResolvedValue({ inserted: false, deduped: true }),
    },
  };

  return {
    svc: svc as unknown as TripDetectionOrchestrationService,
    det,
    transitionState,
    scheduleActiveTick,
    schedulePossibleEndCheck,
    scheduleEndValidation,
    scheduleFinalize,
    cancelPendingEndCycleJobs,
    fetchRawTripCoreData,
    fetchEndValidationWindow,
    runAll,
    evaluateEndCandidate,
    checkDimoActivityResumed,
  };
}

function expectEndCycleResetPayload(payload: Record<string, unknown>) {
  expect(payload.possibleEndAt).toBeNull();
  expect(payload.possibleEndEnteredAt).toBeNull();
  expect(payload.endDetectionMode).toBeNull();
  expect(payload.endConfidence).toBeNull();
  expect(payload.endValidationAttempts).toBe(0);
  expect(payload.cusumValidatedAt).toBeNull();
  expect(payload.cusumSegmentStart).toBeNull();
  expect(payload.cusumSegmentEnd).toBeNull();
  const summary = payload.lastEvidenceSummary as Record<string, unknown>;
  if (summary) {
    for (const key of END_CYCLE_TRANSIENT_EVIDENCE_KEYS) {
      expect(summary[key]).toBeUndefined();
    }
  }
}

describe('R5 — processPossibleEndCheck', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: WORKER_NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('1/2/3 — activity-resumed uses shared end-cycle reset', async () => {
    const h = buildOrchestrationHarness({
      endDetectionMode: END_DETECTION_MODES.CUSUM_VALIDATED,
      endConfidence: DetectionConfidence.HIGH,
      endValidationAttempts: 2,
      cusumValidatedAt: WORKER_NOW,
      cusumSegmentStart: WORKER_NOW,
      cusumSegmentEnd: WORKER_NOW,
      lastEvidenceSummary: { endValidationStartedAt: 'old' },
    });
    h.checkDimoActivityResumed.mockResolvedValue(true);

    await TripDetectionOrchestrationService.prototype.processPossibleEndCheck.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK),
    );

    expect(h.transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.ACTIVE_TRIP,
      expect.any(Object),
    );
    expectEndCycleResetPayload(h.transitionState.mock.calls[0][2]);
    expect(h.scheduleActiveTick).toHaveBeenCalled();
    expect(h.scheduleEndValidation).not.toHaveBeenCalled();
  });

  it('7 — scheduling END_VALIDATION does not increment endValidationAttempts', async () => {
    const h = buildOrchestrationHarness({
      possibleEndEnteredAt: new Date(WORKER_NOW.getTime() - 200_000),
      endValidationAttempts: 0,
    });

    await TripDetectionOrchestrationService.prototype.processPossibleEndCheck.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK),
    );

    expect(h.scheduleEndValidation).toHaveBeenCalled();
    const payload = h.transitionState.mock.calls[0][2];
    expect(payload.endValidationAttempts).toBeUndefined();
    expect(payload.lastEvidenceSummary.endValidationScheduledAt).toBe(
      WORKER_NOW.toISOString(),
    );
  });

  it('14/17 — max completed attempts fallback uses LOW confidence and explicit reason', async () => {
    const h = buildOrchestrationHarness({
      possibleEndEnteredAt: new Date(WORKER_NOW.getTime() - 200_000),
      endValidationAttempts: 3,
    });

    await TripDetectionOrchestrationService.prototype.processPossibleEndCheck.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK),
    );

    expect(h.scheduleFinalize).toHaveBeenCalled();
    expect(h.transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.POSSIBLE_END,
      expect.objectContaining({
        endDetectionMode: END_DETECTION_MODES.COMPOSITE_INACTIVITY,
        endConfidence: DetectionConfidence.LOW,
        lastEvidenceSummary: expect.objectContaining({
          maxAttemptFallbackReason: 'max_completed_cusum_attempts',
          completedAttemptCount: 3,
        }),
      }),
    );
  });

  it('16 — resume fetch error at max attempts reschedules PEC without finalize', async () => {
    const h = buildOrchestrationHarness({
      possibleEndEnteredAt: new Date(WORKER_NOW.getTime() - 200_000),
      endValidationAttempts: 3,
    });
    h.fetchRawTripCoreData.mockRejectedValue(new Error('provider down'));

    await TripDetectionOrchestrationService.prototype.processPossibleEndCheck.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK),
    );

    expect(h.scheduleFinalize).not.toHaveBeenCalled();
    expect(h.schedulePossibleEndCheck).toHaveBeenCalled();
  });
});

describe('R5 — processEndValidation', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: WORKER_NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('2/10 — CUSUM ongoing reopen clears end-cycle fields, preserves trusted boundary', async () => {
    const stopBoundaryAt = new Date(WORKER_NOW.getTime() - 130_000);
    const h = buildOrchestrationHarness({
      endDetectionMode: END_DETECTION_MODES.COMPOSITE_INACTIVITY,
      endConfidence: DetectionConfidence.MEDIUM,
      endValidationAttempts: 1,
      lastEvidenceSummary: {
        endValidationScheduledAt: WORKER_NOW.toISOString(),
        stopBoundaryAt: stopBoundaryAt.toISOString(),
        stopBoundarySource: 'provider_stationary_vls',
        stopBoundaryClockAuthority: 'PROVIDER_EVENT_TIME',
        stopBoundaryTrust: true,
      },
    });
    h.runAll.mockResolvedValue([
      {
        detectorName: 'ChangePointEndDetector',
        verdict: 'NOT_TRIGGERED',
        evidence: {
          cusumLastMovementAt: new Date(WORKER_NOW.getTime() - 140_000).toISOString(),
          appearsOngoing: true,
        },
      },
    ]);
    h.evaluateEndCandidate.mockReturnValue({
      shouldReopen: true,
      shouldEnd: false,
      endMode: 'CUSUM_ONGOING',
      reason: 'CUSUM indicates trip is still active',
    });

    await TripDetectionOrchestrationService.prototype.processEndValidation.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.END_VALIDATION),
    );

    const payload = h.transitionState.mock.calls[1][2];
    expect(payload.possibleEndAt).toBeNull();
    expect(payload.endValidationAttempts).toBe(2);
    const summary = payload.lastEvidenceSummary as Record<string, unknown>;
    expect(summary.stopBoundaryAt).toBe(stopBoundaryAt.toISOString());
    expect(summary.endValidationScheduledAt).toBeUndefined();
    expect(h.scheduleActiveTick).toHaveBeenCalled();
  });

  it('4/5 — valid CUSUM movement timestamp updates lastMeaningfulMovementAt', async () => {
    const movementAt = new Date(WORKER_NOW.getTime() - 15_000);
    const h = buildOrchestrationHarness();
    h.runAll.mockResolvedValue([
      {
        detectorName: 'ChangePointEndDetector',
        verdict: 'NOT_TRIGGERED',
        evidence: { cusumLastMovementAt: movementAt.toISOString() },
      },
    ]);
    h.evaluateEndCandidate.mockReturnValue({
      shouldReopen: true,
      shouldEnd: false,
      endMode: 'COMPOSITE_INACTIVITY',
      reason: 'ongoing',
    });

    await TripDetectionOrchestrationService.prototype.processEndValidation.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.END_VALIDATION),
    );

    expect(h.transitionState.mock.calls[1][2].lastMeaningfulMovementAt).toEqual(
      movementAt,
    );
  });

  it('5/6 — invalid movement timestamp is not written', async () => {
    const h = buildOrchestrationHarness({
      lastMeaningfulMovementAt: new Date(WORKER_NOW.getTime() - 60_000),
    });
    h.runAll.mockResolvedValue([
      {
        detectorName: 'ChangePointEndDetector',
        verdict: 'NOT_TRIGGERED',
        evidence: { cusumLastMovementAt: 'not-a-date' },
      },
    ]);
    h.evaluateEndCandidate.mockReturnValue({
      shouldReopen: true,
      shouldEnd: false,
      endMode: 'COMPOSITE_INACTIVITY',
      reason: 'ongoing',
    });

    await TripDetectionOrchestrationService.prototype.processEndValidation.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.END_VALIDATION),
    );

    expect(h.transitionState.mock.calls[1][2].lastMeaningfulMovementAt).toBeUndefined();
  });

  it('8 — legitimate analytical INCONCLUSIVE increments completed attempts exactly once', async () => {
    const h = buildOrchestrationHarness({ endValidationAttempts: 1 });
    h.runAll.mockResolvedValue([
      {
        detectorName: 'ChangePointEndDetector',
        verdict: 'INCONCLUSIVE',
        evidence: { reason: 'insufficient_points', pointCount: 2 },
      },
    ]);
    h.evaluateEndCandidate.mockReturnValue({
      shouldReopen: false,
      shouldEnd: false,
      reason: 'inconclusive',
    });

    await TripDetectionOrchestrationService.prototype.processEndValidation.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.END_VALIDATION),
    );

    expect(h.transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.POSSIBLE_END,
      expect.objectContaining({ endValidationAttempts: 2 }),
    );
  });

  it('9 — confirmed CUSUM increments attempts before finalize', async () => {
    const endAt = new Date(WORKER_NOW.getTime() - 5_000);
    const h = buildOrchestrationHarness({ endValidationAttempts: 0 });
    h.runAll.mockResolvedValue([{ detectorName: 'ChangePointEndDetector', verdict: 'TRIGGERED' }]);
    h.evaluateEndCandidate.mockReturnValue({
      shouldReopen: false,
      shouldEnd: true,
      detectedEndAt: endAt,
      confidence: 'HIGH',
      endMode: 'CUSUM_VALIDATED',
    });

    await TripDetectionOrchestrationService.prototype.processEndValidation.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.END_VALIDATION),
    );

    expect(h.transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.POSSIBLE_END,
      expect.objectContaining({
        endValidationAttempts: 1,
        endDetectionMode: END_DETECTION_MODES.CUSUM_VALIDATED,
      }),
    );
    expect(h.scheduleFinalize).toHaveBeenCalled();
  });

  it('11 — fetchEndValidationWindow throw leaves attempts unchanged', async () => {
    const h = buildOrchestrationHarness({ endValidationAttempts: 1 });
    h.fetchEndValidationWindow.mockRejectedValue(new Error('fetch failed'));

    await TripDetectionOrchestrationService.prototype.processEndValidation.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.END_VALIDATION),
    );

    expect(h.transitionState).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ endValidationAttempts: 2 }),
    );
    expect(h.schedulePossibleEndCheck).toHaveBeenCalled();
  });

  it('12 — production-shaped detector error does not increment attempts', async () => {
    const h = buildOrchestrationHarness({ endValidationAttempts: 1 });
    h.runAll.mockResolvedValue([
      {
        detectorName: 'ChangePointEndDetector',
        verdict: 'INCONCLUSIVE',
        confidence: 'LOW',
        evidence: { error: 'Detector ChangePointEndDetector timed out' },
      },
    ]);

    await TripDetectionOrchestrationService.prototype.processEndValidation.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.END_VALIDATION),
    );

    expect(h.transitionState).not.toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.POSSIBLE_END,
      expect.objectContaining({ endValidationAttempts: 2 }),
    );
    expect(h.schedulePossibleEndCheck).toHaveBeenCalled();
    expect(h.scheduleFinalize).not.toHaveBeenCalled();
  });

  it('13/25 — CH skip-CUSUM does not increment attempts', async () => {
    const segmentEnd = new Date(WORKER_NOW.getTime() - 60_000);
    const h = buildOrchestrationHarness({
      endDetectionMode: END_DETECTION_MODES.CLICKHOUSE_END_ASSIST,
      cusumSegmentEnd: segmentEnd,
      endValidationAttempts: 2,
    });

    await TripDetectionOrchestrationService.prototype.processEndValidation.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.END_VALIDATION),
    );

    expect(h.scheduleFinalize).toHaveBeenCalled();
    expect(h.fetchEndValidationWindow).not.toHaveBeenCalled();
    expect(h.transitionState).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ endValidationAttempts: 3 }),
    );
  });
});

describe('R5 — ACTIVE_TICK fetch throw vs empty core', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: WORKER_NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('23 — provider fetch throw reschedules ACTIVE_TICK without POSSIBLE_END', async () => {
    const det = {
      ...baseDet(),
      state: TripDetectionState.ACTIVE_TRIP,
      possibleStartAt: new Date(WORKER_NOW.getTime() - 600_000),
      lastCoreProcessedAt: new Date(WORKER_NOW.getTime() - 60_000),
      lastRouteProcessedAt: new Date(WORKER_NOW.getTime() - 60_000),
      lastDrivingProcessedAt: new Date(WORKER_NOW.getTime() - 60_000),
    };
    const transitionState = jest.fn().mockResolvedValue({});
    const scheduleActiveTick = jest.fn().mockResolvedValue(undefined);
    const fetchRawTripCoreData = jest.fn().mockRejectedValue(new Error('core fetch failed'));

    const svc = {
      logger: { log: jest.fn(), debug: jest.fn(), warn: jest.fn() },
      BACKFILL_MS: 60_000,
      OVERLAP_CORE_MS: 30_000,
      OVERLAP_ROUTE_MS: 15_000,
      OVERLAP_PERF_MS: 30_000,
      TRIP_MID_GAP_MIN_PRE_DURATION_MS: 120_000,
      TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M: 50,
      TRIP_CONTINUITY_CORE_WINDOW_MS: 120_000,
      TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS: 120_000,
      TRACKING_INTERVAL_MS: 30_000,
      getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
      acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
      releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
      maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
      transitionState,
      scheduleActiveTick,
      logTrackingRun: jest.fn().mockResolvedValue(undefined),
      segments: {
        fetchRawTripCoreData,
        fetchRouteEnrichment: jest.fn().mockResolvedValue([]),
        fetchPerformance: jest.fn().mockResolvedValue([]),
      },
      dimoProviderContext: jest.fn().mockReturnValue({}),
      prisma: { vehicleLatestState: { findUnique: jest.fn() } },
      tryApplyClickHouseAssistedEnd: jest.fn().mockResolvedValue(false),
    };

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      svc as unknown as TripDetectionOrchestrationService,
      jobData(TRIP_TRACKING_TRIGGERS.ACTIVE_TICK),
    );

    expect(transitionState).not.toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.POSSIBLE_END,
      expect.anything(),
    );
    expect(scheduleActiveTick).toHaveBeenCalled();
  });
});
