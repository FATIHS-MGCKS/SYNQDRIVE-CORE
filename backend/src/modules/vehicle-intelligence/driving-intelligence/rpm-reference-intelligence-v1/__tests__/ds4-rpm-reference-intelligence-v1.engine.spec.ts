import {
  buildDs4RpmReferenceIntelligenceV1ReferenceBlock,
  computeDs4RpmReferenceIntelligenceV1,
  DS4_RPM_REF_INTEL_REASON,
  DS4_RPM_REFERENCE_INTELLIGENCE_V1_CONTRACT_VERSION,
  type Ds4RpmReferenceIntelligenceV1AuthoritativeV1bTemporalV1,
} from '../index';
import { buildDs4RpmHfV1bAdmissionQualityExposure } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-quality-exposure';
import {
  DS4_RPM_HF_V1B_TEMPORAL_PROFILE_1S,
  DS4_RPM_HF_V1B_TEMPORAL_PROFILE_2S,
  DS4_RPM_HF_V1B_TEMPORAL_PROFILE_3S,
  resolveTemporalCadenceProfileForTier,
} from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-temporal.engine';

const TRIP_START = '2026-10-30T10:00:00.000Z';
const TRIP_END = '2026-10-30T10:00:30.000Z';

function baseAdmission(overrides?: Partial<{ processingAllowed: boolean }>) {
  return {
    processingAllowed: true,
    iceRpmApplicability: 'APPLICABLE' as const,
    ...overrides,
  };
}

function authoritativeTier(
  tier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S',
): Ds4RpmReferenceIntelligenceV1AuthoritativeV1bTemporalV1 {
  return {
    cadenceTier: tier,
    temporalCadenceProfile: resolveTemporalCadenceProfileForTier(tier),
  };
}

function densePoints(
  startIso: string,
  count: number,
  stepSeconds: number,
  rpm: number,
): { recordedAtIso: string; valueRpm: number }[] {
  const startMs = Date.parse(startIso);
  return Array.from({ length: count }, (_, i) => ({
    recordedAtIso: new Date(startMs + i * stepSeconds * 1000).toISOString(),
    valueRpm: rpm,
  }));
}

describe('ds4-rpm-reference-intelligence-v1 engine', () => {
  it('computes normalized position and band exposure on valid admitted HF + USER_CONFIRMED spec', () => {
    const reference = buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
      idleRpm: 800,
      maxRpm: 6500,
      idleRpmProvenance: { category: 'USER_CONFIRMED' },
      maxRpmProvenance: { category: 'USER_CONFIRMED' },
      iceRpmApplicability: 'APPLICABLE',
    });

    const points = [
      ...densePoints(TRIP_START, 5, 1, 850),
      ...densePoints('2026-10-30T10:00:05.000Z', 10, 1, 3200),
    ];

    const qualityExposure = buildDs4RpmHfV1bAdmissionQualityExposure({
      shadowVariant: 'tier-aware',
      temporalCoverage: {
        eligibleOneSecondBuckets: 30,
        observedUniqueOneSecondBuckets: 15,
        observedBucketCoverageRatio: 0.5,
        missingBucketCount: 15,
        leadingMissingSeconds: 0,
        trailingMissingSeconds: 15,
        internalMissingBucketCount: 0,
        bucketSemanticsNote: 'DIMO_1S_AVG_BUCKETS_NOT_OEM_CAN_HZ',
        gapInterpretationPolicy: 'MISSING_DATA_NOT_ENGINE_OFF',
      },
      tierEvidence: {
        availability: 'AVAILABLE',
        tripId: 'trip-1',
        tier: 'RPM_1S',
        cadenceConfidence: 'HIGH',
        tripCoverageBand: 'FULL_SPAN',
        analysisMode: 'HIGH_RESOLUTION',
        analysisReadiness: 'TIER_ANALYTICS_OK',
        decisionCode: null,
        temporalCadenceProfile: DS4_RPM_HF_V1B_TEMPORAL_PROFILE_1S,
      },
    });

    const out = computeDs4RpmReferenceIntelligenceV1({
      tripStartIso: TRIP_START,
      tripEndIso: TRIP_END,
      reference,
      hf: {
        points,
        admission: baseAdmission(),
        qualityExposure,
        authoritativeV1bTemporal: authoritativeTier('RPM_1S'),
      },
      minEligibleWeightedSecondsForKnown: 3,
    });

    expect(out.contractVersion).toBe(DS4_RPM_REFERENCE_INTELLIGENCE_V1_CONTRACT_VERSION);
    expect(out.semanticGuard.normalizedRpmIsEngineLoadProxy).toBe(false);
    expect(out.availability).toBe('KNOWN');
    expect(out.referenceQuality.referenceTrustTier).toBe('OEM_USER_CONFIRMED');
    expect(out.hfQuality.authoritativeSequenceMaxGapSeconds).toBe(2);
    expect(out.metrics?.normalizedPosition?.observedSampleCount).toBe(15);
    expect(out.metrics?.normalizedPosition?.rawNormalizedMin).toBeCloseTo((850 - 800) / (6500 - 800), 5);
    expect(out.metrics?.timeWeightedExposure.impliesFullTripCoverage).toBe(false);
    expect(out.metrics?.timeWeightedExposure.totalEligibleWeightedSeconds).toBeGreaterThanOrEqual(3);
    expect(out.hfQuality.qualityExposure?.tierAnalyticsReady).toBe(true);
  });

  it('returns UNKNOWN when HF telemetry is missing', () => {
    const out = computeDs4RpmReferenceIntelligenceV1({
      reference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
        idleRpm: 800,
        maxRpm: 6500,
        iceRpmApplicability: 'APPLICABLE',
      }),
      hf: { points: [], admission: baseAdmission() },
    });

    expect(out.availability).toBe('UNKNOWN');
    expect(out.reasonCodes).toContain(DS4_RPM_REF_INTEL_REASON.HF_TELEMETRY_MISSING);
    expect(out.metrics).toBeNull();
  });

  it('returns UNKNOWN when HF admission is blocked', () => {
    const out = computeDs4RpmReferenceIntelligenceV1({
      tripStartIso: TRIP_START,
      tripEndIso: TRIP_END,
      reference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
        idleRpm: 800,
        maxRpm: 6500,
        iceRpmApplicability: 'APPLICABLE',
      }),
      hf: {
        points: densePoints(TRIP_START, 10, 1, 2000),
        admission: baseAdmission({ processingAllowed: false }),
      },
    });

    expect(out.availability).toBe('UNKNOWN');
    expect(out.reasonCodes).toContain(DS4_RPM_REF_INTEL_REASON.HF_ADMISSION_NOT_ELIGIBLE);
    expect(out.metrics).toBeNull();
  });

  it('returns UNKNOWN when authoritative V1B temporal profile is missing', () => {
    const out = computeDs4RpmReferenceIntelligenceV1({
      tripStartIso: TRIP_START,
      tripEndIso: TRIP_END,
      reference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
        idleRpm: 800,
        maxRpm: 6500,
        iceRpmApplicability: 'APPLICABLE',
      }),
      hf: {
        points: densePoints(TRIP_START, 6, 1, 2000),
        admission: baseAdmission(),
      },
    });

    expect(out.reasonCodes).toContain(DS4_RPM_REF_INTEL_REASON.V1B_TEMPORAL_PROFILE_UNAVAILABLE);
    expect(out.availability).toBe('UNKNOWN');
    expect(out.metrics).toBeNull();
  });

  it('flags sparse gaps without interpolating missing intervals (RPM_1S gap rule)', () => {
    const points = [
      { recordedAtIso: TRIP_START, valueRpm: 900 },
      { recordedAtIso: '2026-10-30T10:00:01.000Z', valueRpm: 950 },
      { recordedAtIso: '2026-10-30T10:00:10.000Z', valueRpm: 3000 },
      { recordedAtIso: '2026-10-30T10:00:11.000Z', valueRpm: 3100 },
    ];

    const out = computeDs4RpmReferenceIntelligenceV1({
      tripStartIso: TRIP_START,
      tripEndIso: TRIP_END,
      reference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
        idleRpm: 800,
        maxRpm: 6000,
        iceRpmApplicability: 'APPLICABLE',
      }),
      hf: {
        points,
        admission: baseAdmission(),
        authoritativeV1bTemporal: authoritativeTier('RPM_1S'),
      },
      minEligibleWeightedSecondsForKnown: 1,
    });

    expect(out.hfQuality.authoritativeSequenceMaxGapSeconds).toBe(2);
    expect(out.hfQuality.eligibleContinuousSequenceCount).toBe(2);
    expect(out.metrics?.timeWeightedExposure.totalEligibleWeightedSeconds).toBe(2);
    expect(out.metrics?.timeWeightedExposure.uncoveredTripMassRatio).toBeGreaterThan(0.9);
  });

  it('uses tier-specific sequence gap limits (RPM_2S vs RPM_3S)', () => {
    const points = [
      { recordedAtIso: TRIP_START, valueRpm: 1000 },
      { recordedAtIso: '2026-10-30T10:00:01.000Z', valueRpm: 1100 },
      { recordedAtIso: '2026-10-30T10:00:05.000Z', valueRpm: 2000 },
      { recordedAtIso: '2026-10-30T10:00:06.000Z', valueRpm: 2100 },
    ];

    const reference = buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
      idleRpm: 800,
      maxRpm: 6000,
      iceRpmApplicability: 'APPLICABLE',
    });

    const rpm2s = computeDs4RpmReferenceIntelligenceV1({
      tripStartIso: TRIP_START,
      tripEndIso: TRIP_END,
      reference,
      hf: {
        points,
        admission: baseAdmission(),
        authoritativeV1bTemporal: authoritativeTier('RPM_2S'),
      },
      minEligibleWeightedSecondsForKnown: 1,
    });
    expect(rpm2s.hfQuality.authoritativeSequenceMaxGapSeconds).toBe(
      DS4_RPM_HF_V1B_TEMPORAL_PROFILE_2S.sequenceMaxGapSeconds,
    );
    expect(rpm2s.hfQuality.eligibleContinuousSequenceCount).toBe(2);

    const rpm3s = computeDs4RpmReferenceIntelligenceV1({
      tripStartIso: TRIP_START,
      tripEndIso: TRIP_END,
      reference,
      hf: {
        points,
        admission: baseAdmission(),
        authoritativeV1bTemporal: authoritativeTier('RPM_3S'),
      },
      minEligibleWeightedSecondsForKnown: 1,
    });
    expect(rpm3s.hfQuality.authoritativeSequenceMaxGapSeconds).toBe(
      DS4_RPM_HF_V1B_TEMPORAL_PROFILE_3S.sequenceMaxGapSeconds,
    );
    expect(rpm3s.hfQuality.eligibleContinuousSequenceCount).toBe(1);
    expect(rpm3s.metrics?.timeWeightedExposure.totalEligibleWeightedSeconds).toBe(6);
  });

  it('returns PARTIAL with spec-unavailable reason when idle/max missing but HF present', () => {
    const out = computeDs4RpmReferenceIntelligenceV1({
      tripStartIso: TRIP_START,
      tripEndIso: TRIP_END,
      reference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
        idleRpm: null,
        maxRpm: 6500,
        iceRpmApplicability: 'APPLICABLE',
      }),
      hf: {
        points: densePoints(TRIP_START, 8, 1, 2500),
        admission: baseAdmission(),
        authoritativeV1bTemporal: authoritativeTier('RPM_1S'),
      },
    });

    expect(out.availability).toBe('PARTIAL');
    expect(out.reasonCodes).toContain(DS4_RPM_REF_INTEL_REASON.REFERENCE_SPEC_UNAVAILABLE);
    expect(out.metrics?.normalizedPosition).toBeNull();
    expect(out.metrics?.operatingBands.observedRpmMedian).toBe(2500);
  });

  it('fail-closes reference-normalized metrics for inconsistent RPM pair', () => {
    const out = computeDs4RpmReferenceIntelligenceV1({
      reference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
        idleRpm: 7000,
        maxRpm: 6500,
        iceRpmApplicability: 'APPLICABLE',
      }),
      hf: {
        points: densePoints(TRIP_START, 6, 1, 2000),
        admission: baseAdmission(),
        authoritativeV1bTemporal: authoritativeTier('RPM_1S'),
      },
    });

    expect(out.reasonCodes).toContain(DS4_RPM_REF_INTEL_REASON.REFERENCE_PAIR_INCONSISTENT);
    expect(out.referenceQuality.pairConsistent).toBe(false);
    expect(out.metrics?.normalizedPosition).toBeNull();
  });

  it('fail-closes for ICE not applicable (BEV)', () => {
    const out = computeDs4RpmReferenceIntelligenceV1({
      reference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
        idleRpm: 800,
        maxRpm: 6500,
        iceRpmApplicability: 'NOT_APPLICABLE',
      }),
      hf: {
        points: densePoints(TRIP_START, 6, 1, 2000),
        admission: baseAdmission(),
        authoritativeV1bTemporal: authoritativeTier('RPM_1S'),
      },
    });

    expect(out.availability).toBe('UNKNOWN');
    expect(out.reasonCodes).toContain(DS4_RPM_REF_INTEL_REASON.ICE_RPM_NOT_APPLICABLE);
    expect(out.metrics).toBeNull();
  });

  it('marks out-of-range observations without clamping raw normalized extrema', () => {
    const out = computeDs4RpmReferenceIntelligenceV1({
      tripStartIso: TRIP_START,
      tripEndIso: TRIP_END,
      reference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
        idleRpm: 800,
        maxRpm: 3000,
        iceRpmApplicability: 'APPLICABLE',
      }),
      hf: {
        points: densePoints(TRIP_START, 6, 1, 4500),
        admission: baseAdmission(),
        authoritativeV1bTemporal: authoritativeTier('RPM_1S'),
      },
      minEligibleWeightedSecondsForKnown: 1,
    });

    expect(out.reasonCodes).toContain(DS4_RPM_REF_INTEL_REASON.NORMALIZED_OUT_OF_RANGE_OBSERVED);
    expect(out.metrics?.normalizedPosition?.rawNormalizedMax).toBeGreaterThan(1);
    expect(out.metrics?.normalizedPosition?.aboveReferenceMaxCount).toBe(6);
    expect(out.metrics?.normalizedPosition?.clampedNormalizedMedian).toBe(1);
  });

  it('adds provenance downgraded and tier-not-ready reasons without blocking HF-only bands', () => {
    const qualityExposure = buildDs4RpmHfV1bAdmissionQualityExposure({
      shadowVariant: 'tier-aware',
      temporalCoverage: {
        eligibleOneSecondBuckets: 10,
        observedUniqueOneSecondBuckets: 8,
        observedBucketCoverageRatio: 0.8,
        missingBucketCount: 2,
        leadingMissingSeconds: 0,
        trailingMissingSeconds: 2,
        internalMissingBucketCount: 0,
        bucketSemanticsNote: 'DIMO_1S_AVG_BUCKETS_NOT_OEM_CAN_HZ',
        gapInterpretationPolicy: 'MISSING_DATA_NOT_ENGINE_OFF',
      },
      tierEvidence: {
        availability: 'AVAILABLE',
        tripId: 'trip-1',
        tier: 'RPM_2S',
        cadenceConfidence: 'MEDIUM',
        tripCoverageBand: 'PARTIAL_SPAN',
        analysisMode: 'HIGH_RESOLUTION',
        analysisReadiness: 'LIMITED_TRIP',
        decisionCode: null,
        temporalCadenceProfile: DS4_RPM_HF_V1B_TEMPORAL_PROFILE_2S,
      },
    });

    const out = computeDs4RpmReferenceIntelligenceV1({
      tripStartIso: TRIP_START,
      tripEndIso: TRIP_END,
      reference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
        idleRpm: 800,
        maxRpm: 6500,
        idleRpmProvenance: { category: 'AI_ESTIMATED' },
        maxRpmProvenance: { category: 'KNOWLEDGE_ONLY' },
        iceRpmApplicability: 'APPLICABLE',
      }),
      hf: {
        points: densePoints(TRIP_START, 8, 1, 2200),
        admission: baseAdmission(),
        qualityExposure,
        authoritativeV1bTemporal: authoritativeTier('RPM_2S'),
      },
      minEligibleWeightedSecondsForKnown: 3,
    });

    expect(out.reasonCodes).toContain(DS4_RPM_REF_INTEL_REASON.REFERENCE_PROVENANCE_DOWNGRADED);
    expect(out.reasonCodes).toContain(DS4_RPM_REF_INTEL_REASON.VSI_TIER_ANALYTICS_NOT_READY);
    expect(out.referenceQuality.referenceTrustTier).toBe('DOWNGRADED_ESTIMATE');
    expect(out.availability).toBe('PARTIAL');
    expect(out.metrics?.operatingBands.observedRpmMedian).toBe(2200);
  });

  it('reports insufficient eligible observation mass', () => {
    const out = computeDs4RpmReferenceIntelligenceV1({
      tripStartIso: TRIP_START,
      tripEndIso: TRIP_END,
      reference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
        idleRpm: 800,
        maxRpm: 6500,
        iceRpmApplicability: 'APPLICABLE',
      }),
      hf: {
        points: [
          { recordedAtIso: TRIP_START, valueRpm: 900 },
          { recordedAtIso: '2026-10-30T10:00:01.000Z', valueRpm: 950 },
        ],
        admission: baseAdmission(),
        authoritativeV1bTemporal: authoritativeTier('RPM_1S'),
      },
      minEligibleWeightedSecondsForKnown: 10,
    });

    expect(out.reasonCodes).toContain(DS4_RPM_REF_INTEL_REASON.INSUFFICIENT_ELIGIBLE_OBSERVATION);
    expect(out.availability).toBe('PARTIAL');
  });
});

describe('ds4-rpm-reference-intelligence-v1 reference input', () => {
  it('maps vehicle spec provenance categories', () => {
    const block = buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
      idleRpm: 750,
      maxRpm: 6400,
      idleRpmProvenance: { category: 'USER_CONFIRMED' },
      maxRpmProvenance: { category: 'AI_ESTIMATED' },
      iceRpmApplicability: 'APPLICABLE',
    });
    expect(block.idleRpmProvenance).toBe('USER_CONFIRMED');
    expect(block.maxRpmProvenance).toBe('AI_ESTIMATED');
  });

  it('maps missing and unrecognized provenance to UNKNOWN (not AI_ESTIMATED)', () => {
    const missing = buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
      idleRpm: 800,
      maxRpm: 6500,
      iceRpmApplicability: 'APPLICABLE',
    });
    expect(missing.idleRpmProvenance).toBe('UNKNOWN');
    expect(missing.maxRpmProvenance).toBe('UNKNOWN');

    const unrecognized = buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
      idleRpm: 800,
      maxRpm: 6500,
      idleRpmProvenance: { category: 'VENDOR_GUESS' },
      maxRpmProvenance: { category: 'USER_CONFIRMED' },
      iceRpmApplicability: 'APPLICABLE',
    });
    expect(unrecognized.idleRpmProvenance).toBe('UNKNOWN');
  });

  it('surfaces conflicting USER vs AI provenance without OEM trust', () => {
    const out = computeDs4RpmReferenceIntelligenceV1({
      tripStartIso: TRIP_START,
      tripEndIso: TRIP_END,
      reference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
        idleRpm: 800,
        maxRpm: 6500,
        idleRpmProvenance: { category: 'USER_CONFIRMED' },
        maxRpmProvenance: { category: 'AI_ESTIMATED' },
        iceRpmApplicability: 'APPLICABLE',
      }),
      hf: {
        points: densePoints(TRIP_START, 6, 1, 2000),
        admission: baseAdmission(),
        authoritativeV1bTemporal: authoritativeTier('RPM_1S'),
      },
      minEligibleWeightedSecondsForKnown: 1,
    });

    expect(out.reasonCodes).toContain(DS4_RPM_REF_INTEL_REASON.REFERENCE_PROVENANCE_DOWNGRADED);
    expect(out.reasonCodes).not.toContain(DS4_RPM_REF_INTEL_REASON.REFERENCE_PROVENANCE_UNKNOWN);
    expect(out.referenceQuality.referenceTrustTier).toBe('DOWNGRADED_ESTIMATE');
  });

  it('surfaces UNKNOWN provenance when categories are missing or unrecognized', () => {
    const out = computeDs4RpmReferenceIntelligenceV1({
      tripStartIso: TRIP_START,
      tripEndIso: TRIP_END,
      reference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
        idleRpm: 800,
        maxRpm: 6500,
        idleRpmProvenance: { category: 'VENDOR_GUESS' },
        maxRpmProvenance: undefined,
        iceRpmApplicability: 'APPLICABLE',
      }),
      hf: {
        points: densePoints(TRIP_START, 6, 1, 2000),
        admission: baseAdmission(),
        authoritativeV1bTemporal: authoritativeTier('RPM_1S'),
      },
      minEligibleWeightedSecondsForKnown: 1,
    });

    expect(out.reasonCodes).toContain(DS4_RPM_REF_INTEL_REASON.REFERENCE_PROVENANCE_UNKNOWN);
    expect(out.referenceQuality.idleRpmProvenance).toBe('UNKNOWN');
    expect(out.referenceQuality.maxRpmProvenance).toBe('UNKNOWN');
  });
});
