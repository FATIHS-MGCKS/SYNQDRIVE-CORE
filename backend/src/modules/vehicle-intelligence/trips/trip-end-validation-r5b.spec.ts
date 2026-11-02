import {
  DetectionConfidence,
  TripDetectionState,
  VehicleDetectionProfile,
} from '@prisma/client';

import { TRIP_TRACKING_TRIGGERS } from './trip-detection.types';
import { END_DETECTION_MODES } from './trip-detection.types';
import type { TripTrackingJobData } from './trip-detection.types';
import { TripDetectionOrchestrationService } from './trip-detection-orchestration.service';
import { defaultFinalizeHarnessRouteWaypoints } from './trip-finalize-harness-waypoints.fixture';
import {
  buildEndValidationScheduledEvidence,
  clearEndValidationAttemptLocalEvidence,
  extractR5EndForensicsForPersistence,
} from './trip-end-cycle-reset';

const VEHICLE = 'veh-r5b';
const ORG = 'org-r5b';
const TOKEN = 88;
const T0 = new Date('2026-09-06T12:00:00.000Z');
const T1 = new Date('2026-09-06T12:00:05.000Z');
const T2 = new Date('2026-09-06T12:01:00.000Z');
const SCHEDULED1 = '2026-09-06T11:59:50.000Z';
const SCHEDULED2 = '2026-09-06T12:00:55.000Z';

function jobData(trigger: TripTrackingJobData['trigger']): TripTrackingJobData {
  return {
    vehicleId: VEHICLE,
    organizationId: ORG,
    dimoTokenId: TOKEN,
    trigger,
    requestedAt: T0.toISOString(),
  };
}

function episodeProvenance() {
  return {
    endCandidateClockSource: 'PROVIDER_EVENT_TIME',
    noCoreEmptyCoreForensics: { decision: 'POSSIBLE_END', vlsEvidenceState: 'INACTIVE' },
    emptyCoreReason: 'empty_core_corroborated_inactivity',
  };
}

function buildStatefulHarness(initial: Record<string, unknown> = {}) {
  const det = {
    vehicleId: VEHICLE,
    organizationId: ORG,
    state: TripDetectionState.POSSIBLE_END,
    detectionProfile: VehicleDetectionProfile.ICE,
    activeTripId: 'trip-r5b',
    possibleEndAt: new Date(T0.getTime() - 130_000),
    possibleEndEnteredAt: new Date(T0.getTime() - 200_000),
    lastMeaningfulMovementAt: new Date(T0.getTime() - 130_000),
    lastActivityAt: new Date(T0.getTime() - 130_000),
    endValidationAttempts: 0,
    lastEvidenceSummary: episodeProvenance(),
    ...initial,
  };

  const transitionState = jest.fn().mockImplementation(
    async (_vehicleId: string, _state: TripDetectionState, payload: Record<string, unknown>) => {
      if (payload.endValidationAttempts !== undefined) {
        det.endValidationAttempts = payload.endValidationAttempts as number;
      }
      if (payload.lastEvidenceSummary !== undefined) {
        det.lastEvidenceSummary = payload.lastEvidenceSummary as typeof det.lastEvidenceSummary;
      }
      return {};
    },
  );

  const schedulePossibleEndCheck = jest.fn().mockResolvedValue(undefined);
  const scheduleEndValidation = jest.fn().mockResolvedValue(undefined);
  const fetchEndValidationWindow = jest.fn().mockResolvedValue([
    { timestamp: T0.toISOString(), speed: 0 },
  ]);
  const runAll = jest.fn();
  const evaluateEndCandidate = jest.fn();
  let parseScheduledAt: Date | null = null;
  const proto = TripDetectionOrchestrationService.prototype as unknown as Record<
    string,
    (...args: never[]) => unknown
  >;

  const svc = {
    logger: { log: jest.fn(), debug: jest.fn(), warn: jest.fn() },
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
    schedulePossibleEndCheck,
    scheduleEndValidation,
    scheduleFinalize: jest.fn(),
    scheduleActiveTick: jest.fn(),
    logTrackingRun: jest.fn().mockResolvedValue(undefined),
    logTripEndTimeline: jest.fn(),
    segments: { fetchEndValidationWindow, fetchRawTripCoreData: jest.fn().mockResolvedValue([]) },
    detectorRegistry: { runAll },
    decisionEngine: { evaluateEndCandidate },
    dimoProviderContext: jest.fn().mockReturnValue({}),
    checkDimoActivityResumed: jest.fn().mockResolvedValue(false),
    parseEvidenceTimestamp: jest.fn().mockImplementation((_summary, key) => {
      if (key === 'endValidationScheduledAt' && parseScheduledAt) {
        return parseScheduledAt;
      }
      return null;
    }),
    tripMetrics: { possibleEndStuck: { set: jest.fn() } },
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
    det,
    svc,
    transitionState,
    scheduleEndValidation,
    schedulePossibleEndCheck,
    fetchEndValidationWindow,
    runAll,
    evaluateEndCandidate,
    setParseScheduledAt: (d: Date | null) => {
      parseScheduledAt = d;
    },
  };
}

describe('R5B — attempt forensic isolation', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: T0 });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('R5B.10 — success then failure does not inherit stale completedAt', async () => {
    const h = buildStatefulHarness();

    // Attempt 1: PEC schedules EV1
    jest.setSystemTime(T0);
    h.setParseScheduledAt(null);
    await TripDetectionOrchestrationService.prototype.processPossibleEndCheck.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK),
    );
    expect(h.scheduleEndValidation).toHaveBeenCalled();
    const schedule1 = h.det.lastEvidenceSummary as Record<string, unknown>;
    expect(schedule1.endValidationScheduledAt).toBe(T0.toISOString());
    expect(schedule1.endValidationCompletedAt).toBeUndefined();
    expect(schedule1.endCandidateClockSource).toBe('PROVIDER_EVENT_TIME');

    // Attempt 1: EV1 analytical INCONCLUSIVE
    jest.setSystemTime(T0);
    h.setParseScheduledAt(new Date(T0));
    h.runAll.mockResolvedValue([
      {
        detectorName: 'ChangePointEndDetector',
        verdict: 'INCONCLUSIVE',
        evidence: { reason: 'threshold_not_crossed' },
      },
    ]);
    h.evaluateEndCandidate.mockReturnValue({
      shouldReopen: false,
      shouldEnd: false,
      reason: 'inconclusive',
    });

    await TripDetectionOrchestrationService.prototype.processEndValidation.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(TRIP_TRACKING_TRIGGERS.END_VALIDATION),
    );

    expect(h.det.endValidationAttempts).toBe(1);
    const attempt1 = h.det.lastEvidenceSummary as Record<string, unknown>;
    expect(attempt1.endValidationStartedAt).toBe(T0.toISOString());
    expect(attempt1.endValidationCompletedAt).toBeDefined();
    expect(attempt1.completedEndValidationAttempt).toBe(1);
    const completedAt1 = attempt1.endValidationCompletedAt as string;

    // Attempt 2: PEC schedules EV2 — clears attempt 1 runtime timestamps
    jest.setSystemTime(T2);
    h.setParseScheduledAt(null);
    await TripDetectionOrchestrationService.prototype.processPossibleEndCheck.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK),
    );
    const schedule2 = h.det.lastEvidenceSummary as Record<string, unknown>;
    expect(schedule2.endValidationScheduledAt).toBe(T2.toISOString());
    expect(schedule2.endValidationStartedAt).toBeUndefined();
    expect(schedule2.endValidationCompletedAt).toBeUndefined();
    expect(schedule2.completedEndValidationAttempt).toBeUndefined();
    expect(schedule2.endCandidateClockSource).toBe('PROVIDER_EVENT_TIME');
    expect(schedule2.emptyCoreReason).toBe('empty_core_corroborated_inactivity');

    // Attempt 2: EV2 starts then detector failure
    jest.setSystemTime(T2);
    h.setParseScheduledAt(new Date(T2));
    h.runAll.mockResolvedValue([
      {
        detectorName: 'ChangePointEndDetector',
        verdict: 'INCONCLUSIVE',
        confidence: 'LOW',
        evidence: { error: 'detector boom' },
      },
    ]);

    await TripDetectionOrchestrationService.prototype.processEndValidation.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(TRIP_TRACKING_TRIGGERS.END_VALIDATION),
    );

    expect(h.det.endValidationAttempts).toBe(1);
    const attempt2 = h.det.lastEvidenceSummary as Record<string, unknown>;
    expect(attempt2.endValidationScheduledAt).toBe(T2.toISOString());
    expect(attempt2.endValidationStartedAt).toBe(T2.toISOString());
    expect(attempt2.endValidationCompletedAt).toBeUndefined();
    expect(attempt2.completedEndValidationAttempt).toBeUndefined();
    expect(attempt2.endValidationFailureOutcome).toBe('DETECTOR_EXECUTION_FAILURE');
    expect(attempt2.endValidationCompletedAt).not.toBe(completedAt1);

    const extracted = extractR5EndForensicsForPersistence(attempt2, h.det.endValidationAttempts);
    expect(extracted.endValidation.completedAttemptCount).toBe(1);
    expect(extracted.endValidation.failureOutcome).toBe('DETECTOR_EXECUTION_FAILURE');
    expect(extracted.endValidation.completedAt).toBeUndefined();
    expect(extracted.endValidation.startedAt).toBe(T2.toISOString());
  });

  it('A — success then fetch failure clears stale completedAt', () => {
    const prior = {
      ...episodeProvenance(),
      endValidationScheduledAt: SCHEDULED1,
      endValidationStartedAt: T0.toISOString(),
      endValidationCompletedAt: T1.toISOString(),
      completedEndValidationAttempt: 1,
    };
    const scheduled = buildEndValidationScheduledEvidence({
      priorSummary: prior,
      workerNow: T2,
    });
    expect(scheduled.endValidationCompletedAt).toBeUndefined();
    expect(scheduled.completedEndValidationAttempt).toBeUndefined();
    expect(scheduled.endValidationScheduledAt).toBe(T2.toISOString());
    expect(scheduled.endCandidateClockSource).toBe('PROVIDER_EVENT_TIME');
  });

  it('B — detector failure then success removes failure fields', () => {
    const prior = {
      ...episodeProvenance(),
      endValidationScheduledAt: SCHEDULED2,
      endValidationStartedAt: T2.toISOString(),
      endValidationFailureOutcome: 'DETECTOR_EXECUTION_FAILURE',
      endValidationFailureReason: 'detector boom',
    };
    const completed = clearEndValidationAttemptLocalEvidence(prior);
    completed.endValidationScheduledAt = SCHEDULED2;
    completed.endValidationStartedAt = T2.toISOString();
    completed.endValidationCompletedAt = T1.toISOString();
    completed.completedEndValidationAttempt = 1;
    expect(completed.endValidationFailureOutcome).toBeUndefined();
    expect(completed.endValidationFailureReason).toBeUndefined();
    expect(completed.endValidationCompletedAt).toBe(T1.toISOString());
  });

  it('F — finalize uses authoritative completedAttemptCount', () => {
    const extracted = extractR5EndForensicsForPersistence(
      {
        endValidationScheduledAt: SCHEDULED2,
        endValidationStartedAt: T2.toISOString(),
        endValidationFailureOutcome: 'DETECTOR_EXECUTION_FAILURE',
        endValidationFailureReason: 'detector boom',
      },
      2,
    );
    expect(extracted.endValidation.completedAttemptCount).toBe(2);
    expect(extracted.endValidation.completedAt).toBeUndefined();
    expect(extracted.endValidation.failureOutcome).toBe('DETECTOR_EXECUTION_FAILURE');
  });

  it('G — latest failure cannot produce completedAt < startedAt', () => {
    const extracted = extractR5EndForensicsForPersistence(
      {
        endValidationStartedAt: T2.toISOString(),
        endValidationFailureOutcome: 'DETECTOR_EXECUTION_FAILURE',
      },
      1,
    );
    expect(extracted.endValidation.completedAt).toBeUndefined();
    expect(extracted.endValidation.startedAt).toBe(T2.toISOString());
  });
});

describe('R5B — processFinalize after latest failed attempt', () => {
  it('persists authoritative completedAttemptCount with latest failure and no stale completedAt', async () => {
    const finalizeTrip = jest.fn().mockResolvedValue({});
    const det = {
      vehicleId: VEHICLE,
      organizationId: ORG,
      state: TripDetectionState.POSSIBLE_END,
      detectionProfile: VehicleDetectionProfile.ICE,
      activeTripId: 'trip-r5b',
      possibleEndAt: new Date(T0.getTime() - 130_000),
      possibleStartAt: new Date(T0.getTime() - 600_000),
      lastActivityAt: new Date(T0.getTime() - 130_000),
      lastMeaningfulMovementAt: new Date(T0.getTime() - 130_000),
      endDetectionMode: END_DETECTION_MODES.COMPOSITE_INACTIVITY,
      endConfidence: DetectionConfidence.LOW,
      endValidationAttempts: 1,
      cusumSegmentEnd: null,
      cusumSegmentStart: null,
      cusumValidatedAt: null,
      startDetectionMode: null,
      startConfidence: null,
      startOdometerKm: null,
      startFuelLevel: null,
      startEvSoc: null,
      lastEvidenceSummary: {
        ...episodeProvenance(),
        endValidationScheduledAt: SCHEDULED2,
        endValidationStartedAt: T2.toISOString(),
        endValidationFailureOutcome: 'DETECTOR_EXECUTION_FAILURE',
        endValidationFailureReason: 'detector boom',
      },
    };

    const trip = {
      id: 'trip-r5b',
      startTime: new Date(T0.getTime() - 600_000),
      distanceKm: 5,
    };

    const svc = {
      logger: { log: jest.fn(), warn: jest.fn() },
      getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
      acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
      releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
      maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
      prisma: {
        vehicleTrip: { findUnique: jest.fn().mockResolvedValue(trip) },
        vehicleTripWaypoint: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue(
            defaultFinalizeHarnessRouteWaypoints(trip.startTime),
          ),
          count: jest.fn().mockResolvedValue(3),
        },
      },
      decisionEngine: { finalizeTrip, discardTrip: jest.fn() },
      tripMetrics: {
        tripFinalized: { inc: jest.fn() },
        tripFinalizeLatency: { observe: jest.fn() },
        tripEndLatencyFromMovement: { observe: jest.fn() },
        tripDuration: { observe: jest.fn() },
        tripEndRecognitionLatency: { observe: jest.fn() },
        tripEndBoundaryAdjustment: { observe: jest.fn() },
        tripEvidencePaths: { inc: jest.fn() },
        tripDiscarded: { inc: jest.fn() },
        tripQualityAnomalies: { inc: jest.fn() },
      },
      logTripEndTimeline: jest.fn(),
      logTripStartTimeline: jest.fn(),
      parseEvidenceTimestamp: jest.fn().mockReturnValue(null),
      logTrackingRun: jest.fn().mockResolvedValue(undefined),
      transitionState: jest.fn().mockResolvedValue(undefined),
      scheduleActiveTick: jest.fn(),
      postFinalizeAnalysisProducer: { produceAfterPersistedCompletion: jest.fn() },
      enrichmentOrchestrator: { enqueueBehaviorEnrichment: jest.fn().mockResolvedValue(undefined) },
      batteryLvRestSessionProducer: {
        enqueueSessionOpenForFinalizedTrip: jest.fn().mockResolvedValue(undefined),
      },
    };

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      svc as unknown as TripDetectionOrchestrationService,
      jobData(TRIP_TRACKING_TRIGGERS.FINALIZE),
    );

    expect(finalizeTrip).toHaveBeenCalledWith(
      'trip-r5b',
      expect.objectContaining({
        rawDetectionMeta: expect.objectContaining({
          endValidation: expect.objectContaining({
            completedAttemptCount: 1,
            failureOutcome: 'DETECTOR_EXECUTION_FAILURE',
            startedAt: T2.toISOString(),
          }),
        }),
      }),
    );
    const meta = finalizeTrip.mock.calls[0][1].rawDetectionMeta.endValidation;
    expect(meta.completedAt).toBeUndefined();
  });
});
