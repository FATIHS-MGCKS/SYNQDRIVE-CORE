import { joinDs4EventsWithRpmEvidenceV1 } from '../ds4-rpm-shadow-correlation-temporal-join.v1';
import type { Ds4RpmShadowCorrelationInputV1 } from '../ds4-rpm-shadow-correlation-v1.contract';
import type { Ds4RpmHfV1bShadowResultV1 } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import { DS4_RPM_HF_V1B_CONTRACT_VERSION } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import { validateDs4RpmShadowCorrelationInput } from '../ds4-rpm-shadow-correlation-input-validation.v1';
import { validateDs4RpmShadowCorrelationProvenanceGate } from '../ds4-rpm-shadow-correlation-provenance-gate.v1';
import {
  classifyEventContextFromTemporalSupport,
  computeEventTemporalSupportV1,
  parseHalfOpenEventWindowMs,
} from '../ds4-rpm-shadow-correlation-event-temporal-support.v1';
import { attachCanonicalFingerprints } from './ds4-rpm-shadow-correlation-test-provenance.util';

const baseV1bSummary: Ds4RpmHfV1bShadowResultV1 = {
  contractVersion: DS4_RPM_HF_V1B_CONTRACT_VERSION,
  organizationId: 'org-a',
  vehicleId: 'veh-a',
  tripId: 'trip-a',
  providerSourceLinkId: 'link-a',
  v1aContractVersion: 'ds4-rpm-hf-v1a-v1' as const,
  engineVersion: 'ds4-rpm-hf-v1b-engine-v1-tier-aware' as const,
  shadowVariant: 'tier-aware' as const,
  inputFingerprint: 'placeholder-synced-in-test',
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
): ReturnType<typeof attachCanonicalFingerprints> {
  const raw: Ds4RpmShadowCorrelationInputV1 = {
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
      inputFingerprint: 'placeholder-synced-in-test',
      summary: baseV1bSummary,
    },
    rpmSamples: overrides.rpmSamples ?? {
      source: 'PINNED_FIXTURE',
      inputFingerprint: 'placeholder-synced-in-test',
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
  return attachCanonicalFingerprints(raw);
}

describe('ds4-rpm-shadow-correlation temporal join', () => {
  it('fail-closed on tenancy mismatch', () => {
    const { input, joinOptions } = buildInput({ organizationId: 'org-b' });
    const validation = validateDs4RpmShadowCorrelationInput(input);
    expect(validation.ok).toBe(false);
    const joined = joinDs4EventsWithRpmEvidenceV1(input, joinOptions);
    expect(joined[0]!.contextClassification).toBe('UNAVAILABLE');
    expect(joined[0]!.reasonCodes).toContain('TENANCY_MISMATCH');
  });

  it('marks AVAILABLE when admitted RPM sequence covers event window', () => {
    const { input, joinOptions } = buildInput();
    const joined = joinDs4EventsWithRpmEvidenceV1(input, joinOptions);
    expect(joined[0]!.contextClassification).toBe('AVAILABLE');
    expect(joined[0]!.observedRpmPointCountInWindow).toBeGreaterThan(1);
    expect(joined[0]!.rpmMedian).not.toBeNull();
    expect(joined[0]!.sourceTimestampPhase).toBe('UNKNOWN');
    expect(joined[0]!.eventTemporalSupport.v1bAdmittedEventSpanVerified).toBe(false);
    expect(joined[0]!.alignmentSensitivity.every((d) => d.researchDiagnosticOnly)).toBe(true);
  });

  it('single RPM point in window is PARTIAL not AVAILABLE', () => {
    const { input, joinOptions } = buildInput({
      rpmPoints: [{ recordedAtIso: '2026-01-01T00:00:06.000Z', valueRpm: 1500 }],
    });
    const joined = joinDs4EventsWithRpmEvidenceV1(input, joinOptions);
    expect(joined[0]!.contextClassification).toBe('PARTIAL');
    expect(joined[0]!.reasonCodes).toContain('INSUFFICIENT_ADMITTED_TEMPORAL_SUPPORT');
  });

  it('does not promote NO overlap to PARTIAL from trip aggregates', () => {
    const { input, joinOptions } = buildInput({
      rpmPoints: [{ recordedAtIso: '2026-01-01T00:05:00.000Z', valueRpm: 1500 }],
    });
    const joined = joinDs4EventsWithRpmEvidenceV1(input, joinOptions);
    expect(joined[0]!.contextClassification).toBe('UNAVAILABLE');
    expect(joined[0]!.reasonCodes).toContain('NO_TEMPORAL_OVERLAP');
  });

  it('conflicting duplicate timestamps yield AMBIGUOUS without min/median/max', () => {
    const { input, joinOptions } = buildInput({
      rpmPoints: [
        { recordedAtIso: '2026-01-01T00:00:06.000Z', valueRpm: 1500 },
        { recordedAtIso: '2026-01-01T00:00:06.000Z', valueRpm: 2500 },
        { recordedAtIso: '2026-01-01T00:00:07.000Z', valueRpm: 1600 },
        { recordedAtIso: '2026-01-01T00:00:08.000Z', valueRpm: 1700 },
      ],
    });
    const joined = joinDs4EventsWithRpmEvidenceV1(input, joinOptions);
    expect(joined[0]!.contextClassification).toBe('AMBIGUOUS');
    expect(joined[0]!.rpmMin).toBeNull();
  });

  it('uses half-open window — boundary at end exclusive', () => {
    const { input, joinOptions } = buildInput({
      rpmPoints: [{ recordedAtIso: '2026-01-01T00:00:09.000Z', valueRpm: 1000 }],
    });
    const joined = joinDs4EventsWithRpmEvidenceV1(input, joinOptions);
    expect(joined[0]!.contextClassification).toBe('UNAVAILABLE');
  });

  it('valid motion run with zero manoeuvres returns empty join (not failed motion run)', () => {
    const { input, joinOptions } = buildInput({ events: [] });
    const validation = validateDs4RpmShadowCorrelationInput(input);
    expect(validation.ok).toBe(true);
    const joined = joinDs4EventsWithRpmEvidenceV1(input, joinOptions);
    expect(joined).toEqual([]);
  });

  it('never marks AVAILABLE for SPARSE cadence tier', () => {
    const sparseSummary: Ds4RpmHfV1bShadowResultV1 = {
      ...baseV1bSummary,
      admission: {
        ...baseV1bSummary.admission,
        qualityExposure: {
          ...baseV1bSummary.admission.qualityExposure,
          cadenceTier: 'SPARSE',
          analysisReadiness: 'TIER_ANALYTICS_OK',
        },
      },
    };
    const { input, joinOptions } = buildInput({
      v1b: {
        runId: 'r1',
        engineVersion: 'ds4-rpm-hf-v1b-engine-v1-tier-aware',
        inputFingerprint: 'placeholder-synced-in-test',
        summary: sparseSummary,
      },
    });
    const joined = joinDs4EventsWithRpmEvidenceV1(input, joinOptions);
    expect(joined[0]!.contextClassification).not.toBe('AVAILABLE');
    expect(joined[0]!.reasonCodes).toContain('V1B_CADENCE_TIER_NOT_AUTHORITATIVE');
  });

  it('does not mutate DS4 event count', () => {
    const { input, joinOptions } = buildInput({
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
    const joined = joinDs4EventsWithRpmEvidenceV1(input, {
      ...joinOptions,
      provenanceGate: {
        ...joinOptions.provenanceGate,
        canonicalTripRpmPoints: undefined,
      },
    });
    expect(joined.length).toBe(2);
  });
});

describe('ds4-rpm-shadow-correlation adversarial validation', () => {
  it('rejects forged fingerprint that matches string but not recompute', () => {
    const { input } = buildInput();
    const gate = {
      recomputedV1bInputFingerprint: 'forged-fingerprint',
      evidenceKind: 'SYNTHETIC_FIXTURE' as const,
      canonicalTripRpmPoints: input.rpmSamples!.points,
    };
    const validation = validateDs4RpmShadowCorrelationProvenanceGate(input, gate);
    expect(validation.ok).toBe(false);
  });

  it('rejects persisted summary fingerprint mismatch', () => {
    const { input, joinOptions } = buildInput();
    input.v1b!.summary.inputFingerprint = 'mismatch-persisted';
    const validation = validateDs4RpmShadowCorrelationProvenanceGate(input, joinOptions.provenanceGate);
    expect(validation.ok).toBe(false);
  });

  it('rejects modified RPM points under canonical digest', () => {
    const { input, joinOptions } = buildInput();
    input.rpmSamples!.points[0]!.valueRpm = 9999;
    const validation = validateDs4RpmShadowCorrelationProvenanceGate(input, joinOptions.provenanceGate);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.reasonCodes).toContain('RPM_SAMPLE_POINTS_DIGEST_MISMATCH');
    }
  });

  it('rejects AUTHORIZED_CLICKHOUSE_READ under SYNTHETIC_FIXTURE evidence kind', () => {
    const { input, joinOptions } = buildInput({
      rpmSamples: {
        source: 'AUTHORIZED_CLICKHOUSE_READ',
        inputFingerprint: 'placeholder-synced-in-test',
        providerSourceLinkId: 'link-a',
        points: [{ recordedAtIso: '2026-01-01T00:00:06.000Z', valueRpm: 1500 }],
        invalidValueCount: 0,
        duplicateTimestampCount: 0,
      },
    });
    const validation = validateDs4RpmShadowCorrelationProvenanceGate(input, joinOptions.provenanceGate);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.reasonCodes).toContain('UNVERIFIED_EVIDENCE_SOURCE_CLAIM');
    }
  });

  it('rejects missing provider source link identity', () => {
    const { input, joinOptions } = buildInput({
      rpmSamples: {
        source: 'PINNED_FIXTURE',
        inputFingerprint: 'placeholder-synced-in-test',
        providerSourceLinkId: null,
        points: [{ recordedAtIso: '2026-01-01T00:00:06.000Z', valueRpm: 1500 }],
        invalidValueCount: 0,
        duplicateTimestampCount: 0,
      },
    });
    const synced = attachCanonicalFingerprints(input);
    const validation = validateDs4RpmShadowCorrelationProvenanceGate(
      synced.input,
      synced.joinOptions.provenanceGate,
    );
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.reasonCodes).toContain('SOURCE_LINK_BINDING_UNPROVEN');
    }
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
    expect(support.missingIntervalSecondsInWindow).toBeLessThanOrEqual(support.eventWindowDurationSeconds);
    const classification = classifyEventContextFromTemporalSupport({
      hasValueConflicts: false,
      hasDuplicateTimestamps: false,
      temporalSupport: support,
      eventDurationMs: window.durationMs,
      defensibleCadenceAllowed: true,
    });
    expect(classification).toBe('PARTIAL');
  });
});
