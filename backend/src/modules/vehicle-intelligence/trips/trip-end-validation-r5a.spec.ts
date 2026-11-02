import {
  DetectionConfidence,
  TripDetectionState,
  TripStatus,
  VehicleDetectionProfile,
} from '@prisma/client';

import { TRIP_TRACKING_TRIGGERS } from './trip-detection.types';
import { END_DETECTION_MODES } from './trip-detection.types';
import type { TripTrackingJobData } from './trip-detection.types';
import { TripDetectionOrchestrationService } from './trip-detection-orchestration.service';
import { defaultFinalizeHarnessRouteWaypoints } from './trip-finalize-harness-waypoints.fixture';

const VEHICLE = 'veh-r5a';
const ORG = 'org-r5a';
const TOKEN = 77;
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

function buildEvHarness(detOverrides: Record<string, unknown> = {}) {
  const det = {
    vehicleId: VEHICLE,
    organizationId: ORG,
    state: TripDetectionState.POSSIBLE_END,
    detectionProfile: VehicleDetectionProfile.ICE,
    activeTripId: 'trip-r5a',
    possibleEndAt: new Date(WORKER_NOW.getTime() - 130_000),
    endValidationAttempts: 1,
    lastEvidenceSummary: {
      endCandidateClockSource: 'PROVIDER_EVENT_TIME',
      noCoreEmptyCoreForensics: { vlsEvidenceState: 'INACTIVE' },
    },
    ...detOverrides,
  };
  const transitionState = jest.fn().mockResolvedValue({});
  const schedulePossibleEndCheck = jest.fn().mockResolvedValue(undefined);
  const fetchEndValidationWindow = jest.fn().mockResolvedValue([
    { timestamp: WORKER_NOW.toISOString(), speed: 0 },
  ]);
  const runAll = jest.fn();
  const evaluateEndCandidate = jest.fn();
  const proto = TripDetectionOrchestrationService.prototype as unknown as Record<
    string,
    (...args: never[]) => unknown
  >;

  const svc = {
    logger: { log: jest.fn(), debug: jest.fn(), warn: jest.fn() },
    TRIP_END_SEGMENT_LOOKBACK_MS: 900_000,
    TRIP_END_SEGMENT_LOOKAHEAD_MS: 300_000,
    TRIP_END_VALIDATION_RETRY_MS: 60_000,
    getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
    acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
    releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
    maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
    transitionState,
    schedulePossibleEndCheck,
    scheduleFinalize: jest.fn(),
    scheduleActiveTick: jest.fn(),
    logTrackingRun: jest.fn().mockResolvedValue(undefined),
    logTripEndTimeline: jest.fn(),
    segments: { fetchEndValidationWindow },
    detectorRegistry: { runAll },
    decisionEngine: { evaluateEndCandidate },
    dimoProviderContext: jest.fn().mockReturnValue({}),
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
    svc,
    det,
    transitionState,
    runAll,
    evaluateEndCandidate,
    schedulePossibleEndCheck,
    fetchEndValidationWindow,
  };
}

describe('R5A — processEndValidation detector failure + clocks', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: WORKER_NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('production-shaped evidence.error does not increment attempts', async () => {
    const h = buildEvHarness();
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

    expect(h.transitionState).not.toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.POSSIBLE_END,
      expect.objectContaining({ endValidationAttempts: 2 }),
    );
    expect(h.schedulePossibleEndCheck).toHaveBeenCalled();
  });

  it('missing ChangePointEndDetector finding does not increment attempts', async () => {
    const h = buildEvHarness();
    h.runAll.mockResolvedValue([]);

    await TripDetectionOrchestrationService.prototype.processEndValidation.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(TRIP_TRACKING_TRIGGERS.END_VALIDATION),
    );

    expect(h.transitionState).not.toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.POSSIBLE_END,
      expect.objectContaining({ endValidationAttempts: 2 }),
    );
  });

  it('inconclusive path writes startedAt and completedAt forensic keys', async () => {
    const h = buildEvHarness({ endValidationAttempts: 0 });
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

    const completionPayload = h.transitionState.mock.calls.find(
      (call) => call[2]?.endValidationAttempts === 1,
    )?.[2];
    expect(completionPayload.lastEvidenceSummary.endValidationStartedAt).toBeDefined();
    expect(completionPayload.lastEvidenceSummary.endValidationCompletedAt).toBeDefined();
    expect(completionPayload.lastEvidenceSummary.endCandidateClockSource).toBe(
      'PROVIDER_EVENT_TIME',
    );
  });

  it('fetch failure writes startedAt without completedAt', async () => {
    const h = buildEvHarness();
    h.fetchEndValidationWindow.mockRejectedValue(new Error('fetch failed'));

    await TripDetectionOrchestrationService.prototype.processEndValidation.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(TRIP_TRACKING_TRIGGERS.END_VALIDATION),
    );

    const failurePayload = h.transitionState.mock.calls.at(-1)?.[2];
    expect(failurePayload.lastEvidenceSummary.endValidationStartedAt).toBeDefined();
    expect(failurePayload.lastEvidenceSummary.endValidationCompletedAt).toBeUndefined();
    expect(failurePayload.lastEvidenceSummary.endValidationFetchFailureReason).toBe(
      'fetch failed',
    );
  });
});

describe('R5A — processFinalize rawDetectionMeta persistence', () => {
  it('persists bounded R5 endValidation and emptyCoreEndGate forensics', async () => {
    const finalizeTrip = jest.fn().mockResolvedValue({});
    const det = {
      vehicleId: VEHICLE,
      organizationId: ORG,
      state: TripDetectionState.POSSIBLE_END,
      detectionProfile: VehicleDetectionProfile.ICE,
      activeTripId: 'trip-r5a',
      possibleEndAt: new Date(WORKER_NOW.getTime() - 130_000),
      possibleStartAt: new Date(WORKER_NOW.getTime() - 600_000),
      lastActivityAt: new Date(WORKER_NOW.getTime() - 130_000),
      lastMeaningfulMovementAt: new Date(WORKER_NOW.getTime() - 130_000),
      endDetectionMode: END_DETECTION_MODES.COMPOSITE_INACTIVITY,
      endConfidence: DetectionConfidence.LOW,
      endValidationAttempts: 3,
      cusumSegmentEnd: null,
      cusumSegmentStart: null,
      cusumValidatedAt: null,
      startDetectionMode: null,
      startConfidence: null,
      startOdometerKm: null,
      startFuelLevel: null,
      startEvSoc: null,
      lastEvidenceSummary: {
        endValidationScheduledAt: '2026-09-06T11:59:50.000Z',
        endValidationStartedAt: '2026-09-06T12:00:00.000Z',
        endValidationCompletedAt: '2026-09-06T12:00:05.000Z',
        completedEndValidationAttempt: 3,
        maxAttemptFallbackReason: 'max_completed_cusum_attempts',
        completedAttemptCount: 3,
        resumeCheckOutcome: 'NO_RESUME_EVIDENCE',
        endCandidateClockSource: 'PROVIDER_EVENT_TIME',
        noCoreEmptyCoreForensics: {
          decision: 'POSSIBLE_END',
          reason: 'empty_core_corroborated_inactivity',
          operationalInactiveMs: 150000,
          vlsEvidenceState: 'INACTIVE',
          vlsProviderObservedAt: '2026-09-06T11:58:00.000Z',
          vlsObservationAgeMs: 120000,
          performanceActivity: false,
          routeMotion: false,
        },
      },
    };

    const trip = {
      id: 'trip-r5a',
      startTime: new Date(WORKER_NOW.getTime() - 600_000),
      distanceKm: 5,
    };

    const svc = {
      logger: { log: jest.fn(), warn: jest.fn() },
      getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
      acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
      releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
      maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
      prisma: {
        vehicleTrip: {
          findUnique: jest.fn().mockResolvedValue(trip),
        },
        vehicleTripWaypoint: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue(
            defaultFinalizeHarnessRouteWaypoints(trip.startTime),
          ),
          count: jest.fn().mockResolvedValue(3),
        },
      },
      decisionEngine: {
        finalizeTrip,
        discardTrip: jest.fn(),
      },
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
      'trip-r5a',
      expect.objectContaining({
        rawDetectionMeta: expect.objectContaining({
          endValidation: expect.objectContaining({
            maxAttemptFallbackReason: 'max_completed_cusum_attempts',
            completedAttemptCount: 3,
            resumeCheckOutcome: 'NO_RESUME_EVIDENCE',
          }),
          emptyCoreEndGate: expect.objectContaining({
            vlsEvidenceState: 'INACTIVE',
            decision: 'POSSIBLE_END',
          }),
        }),
      }),
    );
  });
});
