import {
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
  DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2,
} from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import { DS4_ASSESSMENT_FLEET_VEHICLES_V1 } from '../ds4-assessment-fleet-admission.v1';
import { computeDs4DrivingImpactV2 } from '../ds4-driving-impact-v2.engine';
import type { Ds4ReferenceDistributionLookupV1 } from '../ds4-reference-distribution.v1';
import { DS4_REFERENCE_DISTRIBUTION_V1_UNCALIBRATED } from '../ds4-reference-distribution.v1';
import { DS4_ASSESSMENT_QUALITY_POLICY_V1_DEFAULT } from '../ds4-assessment-quality-policy.v1';
import { computeDs4TripAssessmentV1 } from '../ds4-trip-assessment-v1.engine';

const TIGUAN = DS4_ASSESSMENT_FLEET_VEHICLES_V1[1]!;
const SCOPE_TRIP_ID = '00000000-0000-4000-8000-00000000000a';

function admissibleIntensity(overrides: Partial<{ meanAccelMps2: number; durationS: number; steps: number; coverageRatio: number }> = {}) {
  return {
    meanAccelMps2: 1.85,
    durationS: 3,
    steps: 3,
    coverageRatio: 1,
    startUncertaintyS: '±1s',
    endUncertaintyS: '±1s',
    ...overrides,
  };
}

function drivingExposureFixture() {
  const fsmLabels = [
    { bucketLabelUtc: '2026-01-01T10:00:00Z', state: 'MOVING' as const, evidenceQuality: 'DIRECT' as const, reason: 'r', flags: [] },
    { bucketLabelUtc: '2026-01-01T10:00:01Z', state: 'MOVING' as const, evidenceQuality: 'DIRECT' as const, reason: 'r', flags: [] },
    { bucketLabelUtc: '2026-01-01T10:00:02Z', state: 'MOVING' as const, evidenceQuality: 'DIRECT' as const, reason: 'r', flags: [] },
    { bucketLabelUtc: '2026-01-01T10:00:03Z', state: 'MOVING' as const, evidenceQuality: 'DIRECT' as const, reason: 'r', flags: [] },
  ];
  const speeds = [
    { bucketLabelUtc: '2026-01-01T10:00:00Z', speedKmh: 36, quality: 'OK' as const, estimator: 'C4', flags: [], support: [] },
    { bucketLabelUtc: '2026-01-01T10:00:01Z', speedKmh: 36, quality: 'OK' as const, estimator: 'C4', flags: [], support: [] },
    { bucketLabelUtc: '2026-01-01T10:00:02Z', speedKmh: 36, quality: 'OK' as const, estimator: 'C4', flags: [], support: [] },
    { bucketLabelUtc: '2026-01-01T10:00:03Z', speedKmh: 36, quality: 'OK' as const, estimator: 'C4', flags: [], support: [] },
  ];
  return { fsmLabels, speeds, labelCount: 4, speedNumericCount: 4 };
}

function basePayload(overrides: Partial<DiV0MotionCoreShadowPayloadV1> = {}): DiV0MotionCoreShadowPayloadV1 {
  const exposure = drivingExposureFixture();
  return {
    contract: {
      algorithmVersions: { c4: 'c4', c5_1: null, c5_1ProductionSafety: null, c5_1AlgorithmFileSha256: null, fsm: 'fsm', gapBridgeV1: null, fsmAuxBinding: null, events: 'ev', bundle: 'b1' },
      speedAuthority: 'C4_ONLY',
      persistence: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2,
      timeSemantics: {
        processingMode: 'POST_TRIP_RETROSPECTIVE',
        c4ValueSupportForwardS: 1,
        c4FullFinalizationForwardS: 1,
        fsmMode: 'RETROSPECTIVE',
        eventFinalizationNote: 'test',
        computedAtUtc: '2026-01-01T00:00:00.000Z',
      },
      sparse: { channelOutcome: null, comparable: false, sampleCount: 0, samples: [], limitations: [] },
      comparisonHints: {
        artefactSuspectExcludedFromAcceptedManoeuvreCounts: true,
        inferredNeverPromotedToDirect: true,
        unknownNotCountedAsConfirmedStandstill: true,
      },
    },
    speeds: exposure.speeds,
    fsmLabels: exposure.fsmLabels,
    stopEpisodes: [],
    events: [
      {
        kind: 'ACCELERATION',
        startLabel: '2026-01-01T10:00:00Z',
        endLabel: '2026-01-01T10:00:03Z',
        startSpeedKmh: 10,
        endSpeedKmh: 30,
        deltaKmh: 20,
        quality: 'OK',
        flags: [],
        intensity: admissibleIntensity(),
      },
    ],
    summary: {
      labelCount: exposure.labelCount,
      speedNumericCount: exposure.speedNumericCount,
      eventCount: 1,
      eventAcceptedCount: 1,
      eventArtefactSuspectCount: 0,
      stopEpisodeCount: 0,
    },
    ...overrides,
  } as DiV0MotionCoreShadowPayloadV1;
}

function motionRun(overrides: Partial<{ contentFingerprint: string; shadowStatus: string }> = {}) {
  return {
    id: 'run-1',
    organizationId: TIGUAN.organizationId,
    vehicleId: TIGUAN.vehicleId,
    tripId: SCOPE_TRIP_ID,
    shadowStatus: overrides.shadowStatus ?? 'SUCCEEDED',
    pinnedSnapshotHash: 'pin-hash',
    combinedInputIdentity: 'cid',
    contentFingerprint: overrides.contentFingerprint ?? 'fp-1',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    summaryContentFingerprint: overrides.contentFingerprint ?? 'fp-1',
  };
}

describe('computeDs4TripAssessmentV1', () => {
  it('returns FAILED for invalid scope identity', () => {
    const result = computeDs4TripAssessmentV1({
      scope: { organizationId: TIGUAN.organizationId, vehicleId: '00000000-0000-4000-8000-000000000001', tripId: 'not-a-uuid' },
      motionRun: null,
      payload: null,
    });
    expect(result.assessmentStatus).toBe('FAILED');
    expect(result.reasonCodes).toContain('SCOPE_IDENTITY_INVALID');
  });

  it('returns PENDING for onboarded vehicle with valid scope when motion run missing', () => {
    const result = computeDs4TripAssessmentV1({
      scope: {
        organizationId: TIGUAN.organizationId,
        vehicleId: '00000000-0000-4000-8000-000000000099',
        tripId: '00000000-0000-4000-8000-000000000088',
      },
      motionRun: null,
      payload: null,
    });
    expect(result.assessmentStatus).toBe('PENDING');
  });

  it('returns PENDING when motion run missing', () => {
    const result = computeDs4TripAssessmentV1({
      scope: { organizationId: TIGUAN.organizationId, vehicleId: TIGUAN.vehicleId, tripId: SCOPE_TRIP_ID },
      motionRun: null,
      payload: null,
    });
    expect(result.assessmentStatus).toBe('PENDING');
  });

  it('returns FAILED when motion run not succeeded', () => {
    const result = computeDs4TripAssessmentV1({
      scope: { organizationId: TIGUAN.organizationId, vehicleId: TIGUAN.vehicleId, tripId: SCOPE_TRIP_ID },
      motionRun: motionRun({ shadowStatus: 'FAILED' }),
      payload: basePayload(),
    });
    expect(result.assessmentStatus).toBe('FAILED');
  });

  it('returns FAILED on unknown event row contract', () => {
    const payload = basePayload({
      contract: {
        ...basePayload().contract,
        persistence: { eventRowContract: 'FUTURE_UNKNOWN' } as never,
      },
    });
    const result = computeDs4TripAssessmentV1({
      scope: { organizationId: TIGUAN.organizationId, vehicleId: TIGUAN.vehicleId, tripId: SCOPE_TRIP_ID },
      motionRun: motionRun(),
      payload,
    });
    expect(result.assessmentStatus).toBe('FAILED');
    expect(result.reasonCodes).toContain('EVENT_ROW_CONTRACT_UNKNOWN');
  });

  it('returns FAILED on content fingerprint mismatch', () => {
    const payload = basePayload({
      summary: { ...basePayload().summary, contentFingerprint: 'other-fp' } as DiV0MotionCoreShadowPayloadV1['summary'],
    });
    const result = computeDs4TripAssessmentV1({
      scope: { organizationId: TIGUAN.organizationId, vehicleId: TIGUAN.vehicleId, tripId: SCOPE_TRIP_ID },
      motionRun: motionRun({ contentFingerprint: 'fp-1' }),
      payload,
    });
    expect(result.assessmentStatus).toBe('FAILED');
    expect(result.reasonCodes).toContain('SOURCE_IDENTITY_MISMATCH');
  });

  it('returns INSUFFICIENT_EVIDENCE when speed authority ambiguous', () => {
    const payload = basePayload({
      contract: { ...basePayload().contract, speedAuthority: 'INVALID' as never },
    });
    const result = computeDs4TripAssessmentV1({
      scope: { organizationId: TIGUAN.organizationId, vehicleId: TIGUAN.vehicleId, tripId: SCOPE_TRIP_ID },
      motionRun: motionRun(),
      payload,
    });
    expect(result.assessmentStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.reasonCodes).toContain('SPEED_AUTHORITY_AMBIGUOUS');
  });

  it('returns INSUFFICIENT_EVIDENCE when no temporal labels', () => {
    const payload = basePayload({ fsmLabels: [], summary: { ...basePayload().summary, labelCount: 0 } });
    const result = computeDs4TripAssessmentV1({
      scope: { organizationId: TIGUAN.organizationId, vehicleId: TIGUAN.vehicleId, tripId: SCOPE_TRIP_ID },
      motionRun: motionRun(),
      payload,
    });
    expect(result.assessmentStatus).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('returns UNRATED_COUNTS_ONLY when no accepted manoeuvres under observation', () => {
    const payload = basePayload({
      events: [
        {
          kind: 'ACCELERATION',
          startLabel: 'a',
          endLabel: 'b',
          startSpeedKmh: 1,
          endSpeedKmh: 2,
          deltaKmh: 1,
          quality: 'ARTEFACT_SUSPECT',
          flags: [],
        },
      ],
    });
    const result = computeDs4TripAssessmentV1({
      scope: { organizationId: TIGUAN.organizationId, vehicleId: TIGUAN.vehicleId, tripId: SCOPE_TRIP_ID },
      motionRun: motionRun(),
      payload,
    });
    expect(result.assessmentStatus).toBe('UNRATED_COUNTS_ONLY');
    expect(result.eventSummaries.acceptedAccelerationCount).toBe(0);
  });

  it('returns UNRATED_COUNTS_ONLY for V2 intensity without approved ordinal policy', () => {
    const result = computeDs4TripAssessmentV1({
      scope: { organizationId: TIGUAN.organizationId, vehicleId: TIGUAN.vehicleId, tripId: SCOPE_TRIP_ID },
      motionRun: motionRun(),
      payload: basePayload(),
      qualityPolicy: DS4_ASSESSMENT_QUALITY_POLICY_V1_DEFAULT,
    });
    expect(result.assessmentStatus).toBe('UNRATED_COUNTS_ONLY');
    expect(result.eventSummaries.ratedEventCount).toBe(1);
    expect(result.eventSummaries.intensityAcceleration.admissibleEvents).toBe(1);
    expect(result.eventSummaries.intensityAcceleration.fullEligibleEvents).toBe(1);
    expect(result.eventSummaries.drivingExposure.exposureSeconds).toBe(3);
    expect(result.reasonCodes).toContain('INTENSITY_ORDINAL_POLICY_NOT_APPROVED');
    expect(result.reasonCodes).not.toContain('NO_VALID_DRIVING_EXPOSURE');
  });

  it('marks duration=2s intensity as BIN_ONLY admissible', () => {
    const result = computeDs4TripAssessmentV1({
      scope: { organizationId: TIGUAN.organizationId, vehicleId: TIGUAN.vehicleId, tripId: SCOPE_TRIP_ID },
      motionRun: motionRun(),
      payload: basePayload({
        events: [
          {
            kind: 'ACCELERATION',
            startLabel: '2026-01-01T10:00:00Z',
            endLabel: '2026-01-01T10:00:02Z',
            startSpeedKmh: 10,
            endSpeedKmh: 20,
            deltaKmh: 10,
            quality: 'OK',
            flags: [],
            intensity: admissibleIntensity({ durationS: 2, steps: 2 }),
          },
        ],
      }),
    });
    expect(result.eventSummaries.intensityAcceleration.binOnlyEvents).toBe(1);
    expect(result.eventSummaries.intensityAcceleration.fullEligibleEvents).toBe(0);
    expect(result.eventSummaries.ratedEventCount).toBe(1);
  });

  it('returns INSUFFICIENT_EVIDENCE when no valid exposure and no manoeuvres', () => {
    const payload = basePayload({ events: [], summary: { ...basePayload().summary, eventCount: 0, eventAcceptedCount: 0 } });
    payload.speeds = [];
    payload.summary!.speedNumericCount = 0;
    const result = computeDs4TripAssessmentV1({
      scope: { organizationId: TIGUAN.organizationId, vehicleId: TIGUAN.vehicleId, tripId: SCOPE_TRIP_ID },
      motionRun: motionRun(),
      payload,
    });
    expect(result.assessmentStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.reasonCodes).toContain('NO_VALID_DRIVING_EXPOSURE');
  });

  it('returns UNRATED_COUNTS_ONLY with zero events but valid exposure', () => {
    const payload = basePayload({
      events: [],
      summary: { ...basePayload().summary, eventCount: 0, eventAcceptedCount: 0 },
    });
    const result = computeDs4TripAssessmentV1({
      scope: { organizationId: TIGUAN.organizationId, vehicleId: TIGUAN.vehicleId, tripId: SCOPE_TRIP_ID },
      motionRun: motionRun(),
      payload,
    });
    expect(result.assessmentStatus).toBe('UNRATED_COUNTS_ONLY');
    expect(result.reasonCodes).toContain('NO_ACCEPTED_MANOEUVRES_UNDER_OBSERVATION');
    expect(result.eventSummaries.drivingExposure.exposureSeconds).toBe(3);
  });

  it('returns RATED when ordinal policy approved and intensity valid', () => {
    const result = computeDs4TripAssessmentV1({
      scope: { organizationId: TIGUAN.organizationId, vehicleId: TIGUAN.vehicleId, tripId: SCOPE_TRIP_ID },
      motionRun: motionRun(),
      payload: basePayload(),
      qualityPolicy: { ...DS4_ASSESSMENT_QUALITY_POLICY_V1_DEFAULT, ordinalTripRatingApproved: true },
    });
    expect(result.assessmentStatus).toBe('RATED');
    expect(result.eventSummaries.accelerationOrdinalValues.length).toBe(1);
  });

  it('fail-closed: admissible events with zero exposure never RATED even when ordinal policy approved', () => {
    const payload = basePayload();
    payload.speeds = [];
    payload.fsmLabels = [{ bucketLabelUtc: '2026-01-01T10:00:00Z', state: 'MOVING', evidenceQuality: 'DIRECT', reason: 'r', flags: [] }];
    payload.summary!.speedNumericCount = 0;
    const result = computeDs4TripAssessmentV1({
      scope: { organizationId: TIGUAN.organizationId, vehicleId: TIGUAN.vehicleId, tripId: SCOPE_TRIP_ID },
      motionRun: motionRun(),
      payload,
      qualityPolicy: { ...DS4_ASSESSMENT_QUALITY_POLICY_V1_DEFAULT, ordinalTripRatingApproved: true },
    });
    expect(result.assessmentStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.reasonCodes).toContain('NO_VALID_DRIVING_EXPOSURE');
    expect(result.eventSummaries.ratedEventCount).toBe(1);
    expect(result.eventSummaries.intensityAcceleration.admissibleEvents).toBe(1);
  });

  it('legacy V1 payload yields unrated events (no intensity consumption)', () => {
    const payload = basePayload({
      contract: { ...basePayload().contract, persistence: undefined },
      events: [
        {
          kind: 'DECELERATION',
          startLabel: 'a',
          endLabel: 'b',
          startSpeedKmh: 30,
          endSpeedKmh: 10,
          deltaKmh: -20,
          quality: 'OK',
          flags: [],
        },
      ],
    });
    const result = computeDs4TripAssessmentV1({
      scope: { organizationId: TIGUAN.organizationId, vehicleId: TIGUAN.vehicleId, tripId: SCOPE_TRIP_ID },
      motionRun: motionRun(),
      payload,
    });
    expect(result.eventSummaries.unratedEventCount).toBe(1);
    expect(result.eventSummaries.ratedEventCount).toBe(0);
  });
});

describe('computeDs4DrivingImpactV2', () => {
  it('never emits numeric score when reference distribution uncalibrated', () => {
    const assessment = computeDs4TripAssessmentV1({
      scope: { organizationId: TIGUAN.organizationId, vehicleId: TIGUAN.vehicleId, tripId: SCOPE_TRIP_ID },
      motionRun: motionRun(),
      payload: basePayload(),
      qualityPolicy: { ...DS4_ASSESSMENT_QUALITY_POLICY_V1_DEFAULT, ordinalTripRatingApproved: true },
    });
    const impact = computeDs4DrivingImpactV2({ assessment });
    expect(impact.operationalLoadIndex).toBeNull();
    expect(impact.scorePublicationStatus).toBe('DISABLED_MODEL_NOT_CALIBRATED');
    expect(impact.publicationReason).toBe('MODEL_NOT_CALIBRATED');
    expect(impact.scoreAuthority).toBe('DS4');
  });

  it('does not call percentile resolver for UNRATED_COUNTS_ONLY assessments', () => {
    const payload = basePayload({
      events: [],
      summary: { ...basePayload().summary, eventCount: 0, eventAcceptedCount: 0 },
    });
    const assessment = computeDs4TripAssessmentV1({
      scope: { organizationId: TIGUAN.organizationId, vehicleId: TIGUAN.vehicleId, tripId: SCOPE_TRIP_ID },
      motionRun: motionRun(),
      payload,
    });
    expect(assessment.assessmentStatus).toBe('UNRATED_COUNTS_ONLY');
    const resolve = jest.fn(() => 42);
    const reference: Ds4ReferenceDistributionLookupV1 = {
      version: DS4_REFERENCE_DISTRIBUTION_V1_UNCALIBRATED.version,
      calibrated: true,
      resolveOperationalLoadIndexPercentile: resolve,
    };
    const impact = computeDs4DrivingImpactV2({ assessment, referenceDistribution: reference });
    expect(resolve).not.toHaveBeenCalled();
    expect(impact.operationalLoadIndex).toBeNull();
    expect(impact.scorePublicationStatus).toBe('NOT_ELIGIBLE_ASSESSMENT_STATUS');
  });

  it('preserves RATED resolver path but keeps publication disabled under uncalibrated policy', () => {
    const assessment = computeDs4TripAssessmentV1({
      scope: { organizationId: TIGUAN.organizationId, vehicleId: TIGUAN.vehicleId, tripId: SCOPE_TRIP_ID },
      motionRun: motionRun(),
      payload: basePayload(),
      qualityPolicy: { ...DS4_ASSESSMENT_QUALITY_POLICY_V1_DEFAULT, ordinalTripRatingApproved: true },
    });
    expect(assessment.assessmentStatus).toBe('RATED');
    const resolve = jest.fn(() => 55);
    const reference: Ds4ReferenceDistributionLookupV1 = {
      version: DS4_REFERENCE_DISTRIBUTION_V1_UNCALIBRATED.version,
      calibrated: true,
      resolveOperationalLoadIndexPercentile: resolve,
    };
    const impact = computeDs4DrivingImpactV2({ assessment, referenceDistribution: reference });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(impact.operationalLoadIndex).toBe(55);
    expect(impact.scorePublicationStatus).toBe('DISABLED_MODEL_NOT_CALIBRATED');
    expect(impact.publicationReason).toBe('MODEL_NOT_CALIBRATED');
  });
});
