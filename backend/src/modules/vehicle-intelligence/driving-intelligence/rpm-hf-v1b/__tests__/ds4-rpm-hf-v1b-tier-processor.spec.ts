import { processDs4RpmHfV1bShadowTrip } from '../ds4-rpm-hf-v1b-processor';
import { processDs4RpmHfV1bShadowTripTierAware } from '../ds4-rpm-hf-v1b-tier-processor';
import {
  computeDs4RpmHfV1bInputFingerprint,
  computeDs4RpmHfV1bTierAwareInputFingerprint,
} from '../ds4-rpm-hf-v1b-input-fingerprint';
import { DS4_RPM_HF_V1B_TUNING } from '../ds4-rpm-hf-v1b.config';
import {
  buildRpmPointsEverySeconds,
  buildTierTripClassification,
  buildTierTripInput,
  TIER_TEST_LINK,
  TIER_TEST_TRIP,
} from './ds4-rpm-hf-v1b-tier-fixtures';

describe('ds4-rpm-hf-v1b-tier-processor', () => {
  const computedAt = new Date('2026-01-01T11:00:00.000Z');

  it('legacy golden regression unchanged when tier fields present on trip input', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 10, 1);
    const tripInput = buildTierTripInput({
      rpmPoints: points,
      tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
    });
    const legacy = processDs4RpmHfV1bShadowTrip({
      tripInput,
      attemptCount: 1,
      computedAt,
      existingSucceededFingerprint: null,
    });
    expect(legacy.kind).toBe('SUCCEEDED');
    if (legacy.kind !== 'SUCCEEDED') return;
    expect(legacy.result.shadowVariant).toBe('legacy');
    expect(legacy.result.engineVersion).toBe('ds4-rpm-hf-v1b-engine-v1');
    expect(legacy.result.tierEvidence).toBeUndefined();
  });

  it('RPM_1S tier-aware high-resolution admission succeeds with quality gates', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 20, 1);
    const out = processDs4RpmHfV1bShadowTripTierAware({
      tripInput: buildTierTripInput({
        rpmPoints: points,
        tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
      }),
      attemptCount: 1,
      computedAt,
      existingSucceededFingerprint: null,
    });
    expect(out.kind).toBe('SUCCEEDED');
    if (out.kind !== 'SUCCEEDED') return;
    expect(out.result.shadowVariant).toBe('tier-aware');
    expect(out.result.tierEvidence?.analysisMode).toBe('HIGH_RESOLUTION');
    expect(out.result.tierEvidence?.tier).toBe('RPM_1S');
    expect(out.result.sequenceStats.sequenceGapRuleSeconds).toBe(2);
  });

  it('RPM_2S uses cadence-aware temporal gap rule without fabricating 1s points', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:00.000Z', 5, 2);
    const out = processDs4RpmHfV1bShadowTripTierAware({
      tripInput: buildTierTripInput({
        rpmPoints: points,
        tierRow: buildTierTripClassification({
          tier: 'RPM_2S',
          p50ActiveSeconds: 2,
          p75ActiveSeconds: 2,
          p90ActiveSeconds: 2,
        }),
      }),
      attemptCount: 1,
      computedAt,
      existingSucceededFingerprint: null,
    });
    expect(out.kind).toBe('SUCCEEDED');
    if (out.kind !== 'SUCCEEDED') return;
    expect(out.result.tierEvidence?.analysisMode).toBe('CADENCE_AWARE');
    expect(out.result.rpmValues.validPointCount).toBe(5);
    expect(out.result.sequenceStats.sequenceGapRuleSeconds).toBe(3);
    expect(out.result.sequenceStats.continuousSequenceCount).toBe(1);
    expect(out.result.sequenceStats.observedSequenceDurationSeconds).toBe(8);
  });

  it('RPM_3S observation-only succeeds without high-resolution admission mode', () => {
    const out = processDs4RpmHfV1bShadowTripTierAware({
      tripInput: buildTierTripInput({
        rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:00.000Z', 4, 3),
        tierRow: buildTierTripClassification({ tier: 'RPM_3S', p50ActiveSeconds: 3 }),
      }),
      attemptCount: 1,
      computedAt,
      existingSucceededFingerprint: null,
    });
    expect(out.kind).toBe('SUCCEEDED');
    if (out.kind !== 'SUCCEEDED') return;
    expect(out.result.tierEvidence?.analysisMode).toBe('OBSERVATION_ONLY');
  });

  it('SPARSE and UNKNOWN tiers are rejected for high-resolution admission', () => {
    for (const tier of ['SPARSE', 'UNKNOWN'] as const) {
      const out = processDs4RpmHfV1bShadowTripTierAware({
        tripInput: buildTierTripInput({
          rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 5, 1),
          tierRow: buildTierTripClassification({
            tier,
            analysisReadiness: 'NOT_READY',
            cadenceConfidence: null,
          }),
        }),
        attemptCount: 1,
        computedAt,
        existingSucceededFingerprint: null,
      });
      expect(out.kind).toBe('TERMINAL');
      if (out.kind !== 'TERMINAL') return;
      expect(out.rejectionReasonCode).toMatch(/^TIER_/);
    }
  });

  it('missing tier evidence defers tier-aware evaluation only', () => {
    const tripInput = buildTierTripInput({
      rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 5, 1),
      tierRow: null,
      tierSnapshot: null,
    });
    const legacy = processDs4RpmHfV1bShadowTrip({
      tripInput,
      attemptCount: 1,
      computedAt,
      existingSucceededFingerprint: null,
    });
    const tier = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 1,
      computedAt,
      existingSucceededFingerprint: null,
    });
    expect(legacy.kind).toBe('SUCCEEDED');
    expect(tier.kind).toBe('DEFER');
    if (tier.kind === 'DEFER') {
      expect(tier.deferReasonCode).toBe('TRIP_RPM_TIER_EVIDENCE_MISSING');
    }
  });

  it('post-trip race recovery succeeds once tier row materializes', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 8, 1);
    const missing = buildTierTripInput({ rpmPoints: points, tierRow: null, tierSnapshot: null });
    const defer = processDs4RpmHfV1bShadowTripTierAware({
      tripInput: missing,
      attemptCount: 1,
      computedAt,
      existingSucceededFingerprint: null,
    });
    expect(defer.kind).toBe('DEFER');
    const ready = processDs4RpmHfV1bShadowTripTierAware({
      tripInput: buildTierTripInput({
        rpmPoints: points,
        tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
      }),
      attemptCount: 2,
      computedAt,
      existingSucceededFingerprint: null,
    });
    expect(ready.kind).toBe('SUCCEEDED');
  });

  it('bounded defer expiration records NOT_AVAILABLE without fabricated tier', () => {
    const tripEndIso = '2026-01-01T10:05:00.000Z';
    const tripInput = buildTierTripInput({
      rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 3, 1),
      tierRow: null,
      tierSnapshot: null,
    });
    tripInput.tripEndIso = tripEndIso;
    const out = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: DS4_RPM_HF_V1B_TUNING.maxDeferAttempts,
      computedAt: new Date(Date.parse(tripEndIso) + DS4_RPM_HF_V1B_TUNING.postTripReadinessWindowMs + 1000),
      existingSucceededFingerprint: null,
    });
    expect(out.kind).toBe('TERMINAL');
    if (out.kind !== 'TERMINAL') return;
    expect(out.rejectionReasonCode).toBe('TIER_EVIDENCE_NOT_AVAILABLE');
    expect(out.result?.tierEvidence?.availability).toBe('NOT_AVAILABLE');
    expect(out.result?.tierEvidence?.tier).toBeNull();
  });

  it('source-link isolation: tier row on trip input does not admit foreign link fingerprint', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 4, 1);
    const a = buildTierTripInput({
      rpmPoints: points,
      tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
      providerSourceLinkId: 'link-a',
    });
    const b = buildTierTripInput({
      rpmPoints: points,
      tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
      providerSourceLinkId: 'link-b',
    });
    expect(computeDs4RpmHfV1bTierAwareInputFingerprint(a)).not.toBe(
      computeDs4RpmHfV1bTierAwareInputFingerprint(b),
    );
  });

  it('tier-aware fingerprint stable across rolling summary churn; legacy fingerprint unchanged', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 4, 1);
    const input = buildTierTripInput({
      rpmPoints: points,
      tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
    });
    const fpLegacy = computeDs4RpmHfV1bInputFingerprint(input);
    input.vsiRpmCadenceTierSnapshot = {
      ...input.vsiRpmCadenceTierSnapshot!,
      rollingVehicleTierSummary: {
        tier: 'RPM_2S',
        agreementRatio: 0.4,
        classificationDecisionCode: 'CHURN',
        classificationDecisionSummary: 'must not affect fingerprint',
        sufficientEvidence: false,
      },
    };
    expect(computeDs4RpmHfV1bInputFingerprint(input)).toBe(fpLegacy);
    const tierFp1 = computeDs4RpmHfV1bTierAwareInputFingerprint(input);
    input.vsiRpmCadenceTierSnapshot!.rollingVehicleTierSummary = {
      tier: 'RPM_3S',
      agreementRatio: 0.2,
      classificationDecisionCode: 'CHURN2',
      classificationDecisionSummary: 'still ignored',
      sufficientEvidence: false,
    };
    expect(computeDs4RpmHfV1bTierAwareInputFingerprint(input)).toBe(tierFp1);
  });

  it('concurrent idempotency: duplicate tier-aware fingerprint → IDEMPOTENT', () => {
    const tripInput = buildTierTripInput({
      rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 6, 1),
      tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
    });
    const fp = computeDs4RpmHfV1bTierAwareInputFingerprint(tripInput);
    const out = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 3,
      computedAt,
      existingSucceededFingerprint: fp,
    });
    expect(out.kind).toBe('IDEMPOTENT');
  });

  it('stale tier binding defers until rebound or NOT_AVAILABLE', () => {
    const row = buildTierTripClassification({ tier: 'RPM_1S' });
    row.endMs = Date.parse('2026-01-01T09:00:00.000Z');
    const tripInput = buildTierTripInput({
      rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 4, 1),
      tierRow: row,
    });
    tripInput.tierEvidence = {
      contractVersion: 'ds4-rpm-hf-tier-evidence-v1',
      status: 'STALE_TRIP_BINDING',
      tripId: TIER_TEST_TRIP,
      providerSourceLinkId: TIER_TEST_LINK,
      tripClassification: row,
      blockEvidenceObservedAt: '2026-01-01T10:05:01.000Z',
    };
    const out = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 1,
      computedAt,
      existingSucceededFingerprint: null,
    });
    expect(out.kind).toBe('DEFER');
    if (out.kind === 'DEFER') {
      expect(out.deferReasonCode).toBe('TRIP_RPM_TIER_EVIDENCE_STALE');
    }
  });
});
