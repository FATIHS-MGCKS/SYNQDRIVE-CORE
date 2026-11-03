import { joinDs4EventsWithRpmEvidenceV1 } from '../ds4-rpm-shadow-correlation-temporal-join.v1';
import type { Ds4RpmShadowCorrelationInputV1 } from '../ds4-rpm-shadow-correlation-v1.contract';
import type { Ds4RpmHfV1bShadowResultV1 } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import { DS4_RPM_HF_V1B_CONTRACT_VERSION } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import { validateDs4RpmShadowCorrelationInput } from '../ds4-rpm-shadow-correlation-input-validation.v1';
import {
  classifyEventContextFromTemporalSupport,
  computeEventTemporalSupportV1,
  parseHalfOpenEventWindowMs,
} from '../ds4-rpm-shadow-correlation-event-temporal-support.v1';

const baseV1bSummary: Ds4RpmHfV1bShadowResultV1 = {
  contractVersion: DS4_RPM_HF_V1B_CONTRACT_VERSION,
  organizationId: 'org-a',
  vehicleId: 'veh-a',
  tripId: 'trip-a',
  providerSourceLinkId: 'link-a',
  v1aContractVersion: 'ds4-rpm-hf-v1a-v1' as const,
  engineVersion: 'ds4-rpm-hf-v1b-engine-v1-tier-aware' as const,
  shadowVariant: 'tier-aware' as const,
  inputFingerprint: 'fp-1',
  computedAtIso: '2026-11-03T12:00:00.000Z',
  vsiTripClassification: {
    source: 'VSI_ROLLING_TRIP_CLASSIFICATION_LIST' as const,
    tripId: 'trip-a',
    tripRpmProfile: 'RPM_1HZ',
    snapshotTripClassifications: [],
    vehicleActiveRpmProfile: 'RPM_1HZ',
  },
  readCompleteness: {
    clickHouseReadStatus: 'SUCCESS',
    hfReadCompletenessLabel: 'COMPLETE',
    totalMatchingCount: 3,
    returnedPointCount: 3,
  },
  admission: {
    processingStatus: 'ENABLED',
    processingAllowed: true,
    reasonCode: 'OK',
    iceRpmApplicability: 'APPLICABLE',
    tripRpmProfile: 'RPM_1HZ',
    qualityExposure: {
      contractVersion: 'ds4-rpm-hf-v1b-admission-quality-v1',
      cadenceTier: 'RPM_1S',
      cadenceConfidence: 'HIGH',
      analysisMode: 'HIGH_RESOLUTION',
      analysisReadiness: 'TIER_ANALYTICS_OK',
      tripCoverageBand: 'FULL_SPAN',
      observedBucketCoverageRatio: 0.9,
      qualityScope: 'OBSERVED_HF_TEMPORAL',
      tierAnalyticsReady: true,
      impliesFullTripCoverage: false,
    },
  },
  temporalTripWindow: {
    tripStartIso: '2026-01-01T00:00:00.000Z',
    tripEndIso: '2026-01-01T00:01:00.000Z',
    tripDurationSeconds: 60,
    firstRpmOffsetSeconds: 0,
    lastRpmToTripEndSeconds: 0,
  },
  rpmValues: { validPointCount: 3, invalidValueCount: 0, duplicateTimestampCount: 0, rpmMin: 1000, rpmMax: 1100, rpmMedian: 1050 },
  temporalCoverage: {
    eligibleOneSecondBuckets: 60,
    observedUniqueOneSecondBuckets: 3,
    observedBucketCoverageRatio: 0.05,
    missingBucketCount: 57,
    leadingMissingSeconds: 0,
    trailingMissingSeconds: 0,
    internalMissingBucketCount: 0,
    bucketSemanticsNote: 'DIMO_1S_AVG_BUCKETS_NOT_OEM_CAN_HZ',
    gapInterpretationPolicy: 'MISSING_DATA_NOT_ENGINE_OFF',
  },
  intervalStats: {
    medianIntervalSeconds: 1,
    p95IntervalSeconds: 1,
    maxIntervalSeconds: 1,
    gapCountOver2Seconds: 0,
    longestObservedGapSeconds: null,
  },
  sequenceStats: {
    continuousSequenceCount: 1,
    longestContinuousSequenceSeconds: 3,
    observedSequenceDurationSeconds: 2,
    sequenceGapRuleSeconds: 2,
  },
  processingOutcome: 'SUCCEEDED' as const,
  deferReasonCode: null,
  rejectionReasonCode: null,
  readOnly: true as const,
  productionActivationForbidden: true as const,
};

function buildInput(
  overrides: Partial<Ds4RpmShadowCorrelationInputV1> & {
    rpmPoints?: Array<{ recordedAtIso: string; valueRpm: number }>;
  } = {},
): Ds4RpmShadowCorrelationInputV1 {
  return {
    contractVersion: 'ds4-rpm-shadow-correlation-v1',
    organizationId: 'org-a',
    vehicleId: 'veh-a',
    tripId: 'trip-a',
    motion: { runId: 'm1', ...(overrides.motion ?? {}) },
    events: overrides.events ?? [
      {
        kind: 'ACCELERATION',
        startLabel: '2026-01-01T00:00:05.000Z',
        endLabel: '2026-01-01T00:00:08.000Z',
        startSpeedKmh: 10,
        endSpeedKmh: 20,
        deltaKmh: 10,
        quality: 'OK',
        flags: [],
      },
    ],
    v1b: overrides.v1b ?? {
      runId: 'r1',
      engineVersion: 'ds4-rpm-hf-v1b-engine-v1-tier-aware',
      inputFingerprint: 'fp-1',
      summary: baseV1bSummary,
    },
    rpmSamples: overrides.rpmSamples ?? {
      source: 'PINNED_FIXTURE',
      inputFingerprint: 'fp-1',
      providerSourceLinkId: 'link-a',
      points: overrides.rpmPoints ?? [
        { recordedAtIso: '2026-01-01T00:00:05.000Z', valueRpm: 1400 },
        { recordedAtIso: '2026-01-01T00:00:06.000Z', valueRpm: 1500 },
        { recordedAtIso: '2026-01-01T00:00:07.000Z', valueRpm: 1600 },
        { recordedAtIso: '2026-01-01T00:00:08.000Z', valueRpm: 1700 },
      ],
      invalidValueCount: 0,
      duplicateTimestampCount: 0,
    },
    ...overrides,
  };
}

describe('ds4-rpm-shadow-correlation temporal join', () => {
  it('fail-closed on tenancy mismatch', () => {
    const input = buildInput({ organizationId: 'org-b' });
    const validation = validateDs4RpmShadowCorrelationInput(input);
    expect(validation.ok).toBe(false);
    const joined = joinDs4EventsWithRpmEvidenceV1(input);
    expect(joined[0]!.contextClassification).toBe('UNAVAILABLE');
    expect(joined[0]!.reasonCodes).toContain('TENANCY_MISMATCH');
  });

  it('marks AVAILABLE when admitted RPM sequence covers event window', () => {
    const joined = joinDs4EventsWithRpmEvidenceV1(buildInput());
    expect(joined[0]!.contextClassification).toBe('AVAILABLE');
    expect(joined[0]!.observedRpmPointCountInWindow).toBeGreaterThan(1);
    expect(joined[0]!.rpmMedian).not.toBeNull();
    expect(joined[0]!.sourceTimestampPhase).toBe('UNKNOWN');
    expect(joined[0]!.alignmentSensitivity.every((d) => d.researchDiagnosticOnly)).toBe(true);
  });

  it('single RPM point in window is PARTIAL not AVAILABLE', () => {
    const joined = joinDs4EventsWithRpmEvidenceV1(
      buildInput({
        rpmPoints: [{ recordedAtIso: '2026-01-01T00:00:06.000Z', valueRpm: 1500 }],
      }),
    );
    expect(joined[0]!.contextClassification).toBe('PARTIAL');
    expect(joined[0]!.reasonCodes).toContain('INSUFFICIENT_ADMITTED_TEMPORAL_SUPPORT');
  });

  it('does not promote NO overlap to PARTIAL from trip aggregates', () => {
    const joined = joinDs4EventsWithRpmEvidenceV1(
      buildInput({
        rpmPoints: [{ recordedAtIso: '2026-01-01T00:05:00.000Z', valueRpm: 1500 }],
      }),
    );
    expect(joined[0]!.contextClassification).toBe('UNAVAILABLE');
    expect(joined[0]!.reasonCodes).toContain('NO_TEMPORAL_OVERLAP');
    expect(joined[0]!.reasonCodes).not.toContain('AGGREGATE_ONLY_NO_POINT_RECONSTRUCTION');
  });

  it('conflicting duplicate timestamps yield AMBIGUOUS without min/median/max', () => {
    const joined = joinDs4EventsWithRpmEvidenceV1(
      buildInput({
        rpmPoints: [
          { recordedAtIso: '2026-01-01T00:00:06.000Z', valueRpm: 1500 },
          { recordedAtIso: '2026-01-01T00:00:06.000Z', valueRpm: 2500 },
          { recordedAtIso: '2026-01-01T00:00:07.000Z', valueRpm: 1600 },
        ],
      }),
    );
    expect(joined[0]!.contextClassification).toBe('AMBIGUOUS');
    expect(joined[0]!.rpmMin).toBeNull();
    expect(joined[0]!.rpmMedian).toBeNull();
    expect(joined[0]!.rpmMax).toBeNull();
  });

  it('uses half-open window — boundary at end exclusive', () => {
    const window = parseHalfOpenEventWindowMs('2026-01-01T00:00:05.000Z', '2026-01-01T00:00:08.000Z');
    expect(window).not.toBeNull();
    const endExclusiveMs = window!.endExclusiveMs;
    const support = computeEventTemporalSupportV1({
      window: window!,
      pointsInHalfOpenWindow: [],
      cadenceTier: 'RPM_1S',
    });
    expect(support.observedPointCountInWindow).toBe(0);
    const joined = joinDs4EventsWithRpmEvidenceV1(
      buildInput({
        rpmPoints: [{ recordedAtIso: new Date(endExclusiveMs).toISOString(), valueRpm: 1000 }],
      }),
    );
    expect(joined[0]!.contextClassification).toBe('UNAVAILABLE');
  });

  it('empty manoeuvre list uses MOTION_RUN_NO_MANOEUVRES not MOTION_RUN_MISSING', () => {
    const input = buildInput({ events: [] });
    const validation = validateDs4RpmShadowCorrelationInput(input);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.reasonCodes).toContain('MOTION_RUN_NO_MANOEUVRES');
      expect(validation.reasonCodes).not.toContain('MOTION_RUN_MISSING');
    }
  });

  it('does not mutate DS4 event count', () => {
    const input = buildInput({
      v1b: null,
      rpmSamples: null,
      events: [
        {
          kind: 'ACCELERATION',
          startLabel: '2026-01-01T00:00:05.000Z',
          endLabel: '2026-01-01T00:00:08.000Z',
          startSpeedKmh: 10,
          endSpeedKmh: 20,
          deltaKmh: 10,
          quality: 'OK',
          flags: [],
        },
        {
          kind: 'DECELERATION',
          startLabel: '2026-01-01T00:00:20.000Z',
          endLabel: '2026-01-01T00:00:25.000Z',
          startSpeedKmh: 30,
          endSpeedKmh: 10,
          deltaKmh: -20,
          quality: 'OK',
          flags: [],
        },
      ],
    });
    const joined = joinDs4EventsWithRpmEvidenceV1(input);
    expect(joined.length).toBe(2);
  });
});

describe('ds4-rpm-shadow-correlation adversarial validation', () => {
  it('rejects unproven motion run id', () => {
    const input = buildInput({ motion: { runId: '   ' } });
    const validation = validateDs4RpmShadowCorrelationInput(input);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.reasonCodes).toContain('MOTION_RUN_BINDING_UNPROVEN');
    }
  });

  it('rejects fingerprint strings that do not match recompute', () => {
    const input = buildInput();
    const validation = validateDs4RpmShadowCorrelationInput(input, {
      recomputedV1bInputFingerprint: 'different-fp',
    });
    expect(validation.ok).toBe(false);
  });

  it('classifier keeps gap-broken sequences as PARTIAL', () => {
    const window = parseHalfOpenEventWindowMs('2026-01-01T00:00:05.000Z', '2026-01-01T00:00:10.000Z')!;
    const support = computeEventTemporalSupportV1({
      window,
      pointsInHalfOpenWindow: [
        { ms: Date.parse('2026-01-01T00:00:06.000Z'), value: 1000 },
        { ms: Date.parse('2026-01-01T00:00:10.000Z'), value: 1100 },
      ],
      cadenceTier: 'RPM_1S',
    });
    const classification = classifyEventContextFromTemporalSupport({
      hasValueConflicts: false,
      hasDuplicateTimestamps: false,
      temporalSupport: support,
      eventDurationMs: window.durationMs,
    });
    expect(classification).toBe('PARTIAL');
  });
});
