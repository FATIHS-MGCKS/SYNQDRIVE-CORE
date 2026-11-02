import { processDs4RpmHfV1bShadowTrip } from '../ds4-rpm-hf-v1b-processor';
import { processDs4RpmHfV1bShadowTripTierAware } from '../ds4-rpm-hf-v1b-tier-processor';
import {
  DS4_RPM_HF_V1B_QUALITY_SCOPE_OBSERVED_HF_TEMPORAL,
} from '../ds4-rpm-hf-v1b-quality-exposure';
import {
  buildPhase4hTripAInput,
  buildPhase4hTripBInput,
  PHASE4H_TRIP_A,
  PHASE4H_TRIP_B,
} from './ds4-rpm-hf-v1b-phase4h-tiguan-fixtures';
import { buildTierTripInput, buildTierTripClassification } from './ds4-rpm-hf-v1b-tier-fixtures';

const COMPUTED_AT = new Date('2026-10-30T09:43:36.128Z');

describe('ds4-rpm-hf-v1b quality exposure (Phase 4I)', () => {
  it('Trip A: tier-aware exposes readiness and coverage without implying full-trip coverage', () => {
    const tripInput = buildPhase4hTripAInput();
    const out = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 1,
      computedAt: COMPUTED_AT,
      existingSucceededFingerprint: null,
    });
    expect(out.kind).toBe('SUCCEEDED');
    if (out.kind !== 'SUCCEEDED') return;

    const q = out.result.admission.qualityExposure;
    expect(out.result.admission.processingAllowed).toBe(true);
    expect(out.result.tierEvidence?.analysisMode).toBe('HIGH_RESOLUTION');
    expect(q.analysisMode).toBe('HIGH_RESOLUTION');
    expect(q.cadenceTier).toBe('RPM_1S');
    expect(q.cadenceConfidence).toBe('HIGH');
    expect(q.tripCoverageBand).toBe('FULL_SPAN');
    expect(q.analysisReadiness).toBe('TIER_ANALYTICS_OK');
    expect(q.tierAnalyticsReady).toBe(true);
    expect(q.impliesFullTripCoverage).toBe(false);
    expect(q.qualityScope).toBe(DS4_RPM_HF_V1B_QUALITY_SCOPE_OBSERVED_HF_TEMPORAL);
    expect(q.observedBucketCoverageRatio).toBeCloseTo(PHASE4H_TRIP_A.expectedCoverageRatio, 3);
    expect(out.result.temporalCoverage.observedBucketCoverageRatio).toBe(q.observedBucketCoverageRatio);
    expect(out.result.rpmValues.validPointCount).toBe(PHASE4H_TRIP_A.hfPointCount);
  });

  it('Trip B: LIMITED_TRIP remains HIGH_RESOLUTION with explicit non-full-trip guards', () => {
    const tripInput = buildPhase4hTripBInput();
    const out = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 1,
      computedAt: COMPUTED_AT,
      existingSucceededFingerprint: null,
    });
    expect(out.kind).toBe('SUCCEEDED');
    if (out.kind !== 'SUCCEEDED') return;

    const q = out.result.admission.qualityExposure;
    expect(out.result.admission.processingAllowed).toBe(true);
    expect(out.result.tierEvidence?.analysisMode).toBe('HIGH_RESOLUTION');
    expect(q.analysisReadiness).toBe('LIMITED_TRIP');
    expect(q.tripCoverageBand).toBe('PARTIAL_SPAN');
    expect(q.tierAnalyticsReady).toBe(false);
    expect(q.impliesFullTripCoverage).toBe(false);
    expect(q.observedBucketCoverageRatio).toBeCloseTo(PHASE4H_TRIP_B.expectedCoverageRatio, 3);
    expect(out.result.rpmValues.validPointCount).toBe(PHASE4H_TRIP_B.hfPointCount);
  });

  it('legacy and tier-aware preserve identical RPM/temporal numerics on the same HF input (Trip A)', () => {
    const tripInput = buildPhase4hTripAInput();
    const legacy = processDs4RpmHfV1bShadowTrip({
      tripInput,
      attemptCount: 1,
      computedAt: COMPUTED_AT,
      existingSucceededFingerprint: null,
    });
    const tier = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 1,
      computedAt: COMPUTED_AT,
      existingSucceededFingerprint: null,
    });
    expect(legacy.kind).toBe('SUCCEEDED');
    expect(tier.kind).toBe('SUCCEEDED');
    if (legacy.kind !== 'SUCCEEDED' || tier.kind !== 'SUCCEEDED') return;

    expect(tier.result.rpmValues).toEqual(legacy.result.rpmValues);
    expect(tier.result.temporalCoverage).toEqual(legacy.result.temporalCoverage);
    expect(tier.result.intervalStats).toEqual(legacy.result.intervalStats);
    expect(tier.result.sequenceStats).toEqual(legacy.result.sequenceStats);

    expect(legacy.result.admission.processingStatus).toBe(tier.result.admission.processingStatus);
    expect(legacy.result.admission.reasonCode).toBe(tier.result.admission.reasonCode);

    expect(legacy.result.admission.qualityExposure.cadenceTier).toBeNull();
    expect(legacy.result.admission.qualityExposure.analysisMode).toBeNull();
    expect(legacy.result.admission.qualityExposure.tierAnalyticsReady).toBe(false);
    expect(legacy.result.admission.qualityExposure.observedBucketCoverageRatio).toBe(
      tier.result.admission.qualityExposure.observedBucketCoverageRatio,
    );
  });

  it('missing tier evidence: quality exposure null tier fields with safe coverage ratio', () => {
    const tripInput = buildTierTripInput({
      rpmPoints: buildPhase4hTripBInput().rpmPoints,
      tierRow: null,
      tierSnapshot: null,
    });
    const out = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 99,
      computedAt: COMPUTED_AT,
      existingSucceededFingerprint: null,
    });
    expect(out.kind).toBe('TERMINAL');
    if (out.kind !== 'TERMINAL' || !out.result) return;
    const q = out.result.admission.qualityExposure;
    expect(q.cadenceTier).toBeNull();
    expect(q.analysisMode).toBeNull();
    expect(q.tierAnalyticsReady).toBe(false);
    expect(q.impliesFullTripCoverage).toBe(false);
    expect(q.observedBucketCoverageRatio).not.toBeNull();
  });

  it('legacy admission retains flat V1A fields and adds qualityExposure only', () => {
    const row = buildTierTripClassification({ tier: 'RPM_1S' });
    const tripInput = buildTierTripInput({ rpmPoints: [{ recordedAtIso: '2026-01-01T10:00:00.000Z', valueRpm: 1200 }], tierRow: row });
    const out = processDs4RpmHfV1bShadowTrip({
      tripInput,
      attemptCount: 1,
      computedAt: COMPUTED_AT,
      existingSucceededFingerprint: null,
    });
    expect(out.kind).toBe('SUCCEEDED');
    if (out.kind !== 'SUCCEEDED') return;
    expect(out.result.admission.reasonCode).toBe('RPM_1HZ_WITH_HF_DATA');
    expect(out.result.admission.qualityExposure.contractVersion).toBe(
      'ds4-rpm-hf-v1b-admission-quality-v1',
    );
  });
});
