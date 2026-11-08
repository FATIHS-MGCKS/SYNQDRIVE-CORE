import { COLD_ENGINE_SHADOW_POLICY } from '../../../shadow-detector/detectors/cold-engine-shadow.policy';
import { buildDs4RpmReferenceIntelligenceV1ReferenceBlock } from '../../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1-reference-input';
import { processDs4RpmHfV1bShadowTripTierAware } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-tier-processor';
import {
  buildRpmPointsEverySeconds,
  buildTierTripClassification,
  buildTierTripInput,
  TIER_TEST_ORG,
  TIER_TEST_VEHICLE,
} from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import { computeDs4PowertrainDemandColdEngineResearchV1 } from '../ds4-powertrain-demand-cold-engine.kernel.v1';
import { DS4_COLD_ENGINE_MAX_RPM_SANITY_UPPER } from '../ds4-powertrain-demand-cold-engine-reference.v1';
import {
  buildColdEngineBoundInput,
  buildObservationSeries,
  buildTrustedVehicleRpmReference,
  coldEctGrid,
} from './ds4-powertrain-demand-research.test-helpers';

describe('ds4-powertrain-demand cold-engine P2-B2 adversarial', () => {
  const highRpmThreshold = (max: number) => max * COLD_ENGINE_SHADOW_POLICY.highLoadRpmPctOfMax;

  it('authentic RPM-less cold stationary high load computes without V1B', () => {
    const grid = coldEctGrid(12, (i) => {
      if (i >= 2 && i <= 4) return { loadPct: 88, rpm: null };
      return { loadPct: 10, rpm: null };
    });
    const input = buildColdEngineBoundInput({ multichannelObservations: grid });
    expect(input.v1bResult).toBeNull();
    const out = computeDs4PowertrainDemandColdEngineResearchV1(input);
    expect(out.status).toBe('COMPUTED');
    expect(out.bindings.v1bInputFingerprint).toBeNull();
  });

  it('multichannel RPM present but V1B missing abstains', () => {
    const grid = coldEctGrid(12, (i) => ({ rpm: 1500 + i * 10, loadPct: 40 }));
    const input = buildColdEngineBoundInput({ multichannelObservations: grid });
    input.v1bResult = null;
    const out = computeDs4PowertrainDemandColdEngineResearchV1(input);
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('V1B_REQUIRED_FOR_RPM_EVIDENCE');
  });

  it('empty RPM read with contradicting V1B abstains', () => {
    const grid = coldEctGrid(12, () => ({ loadPct: 88, rpm: null }));
    const input = buildColdEngineBoundInput({ multichannelObservations: grid });
    const rpmPoints = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 8, 1);
    const tripInput = buildTierTripInput({
      rpmPoints,
      tierRow: buildTierTripClassification({ tier: 'RPM_1S' } as never),
    });
    const tierOut = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 1,
      computedAt: new Date('2026-01-01T11:00:00.000Z'),
      existingSucceededFingerprint: null,
    });
    if (tierOut.kind !== 'SUCCEEDED') throw new Error('fixture v1b');
    input.v1bResult = tierOut.result;
    const out = computeDs4PowertrainDemandColdEngineResearchV1(input);
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('V1B_RPM_EVIDENCE_CONTRADICTS_EMPTY_READ');
  });

  it('USER_CONFIRMED maxRpm without vehicle binding is not assessable', () => {
    const refMax = 6000;
    const grid = coldEctGrid(12, (i) => ({
      rpm: i >= 2 && i <= 4 ? highRpmThreshold(refMax) + 50 : 900,
      loadPct: 45,
    }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({
        multichannelObservations: grid,
        vehicleRpmReference: buildTrustedVehicleRpmReference(refMax),
        vehicleRpmReferenceBinding: null,
      }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_RPM.status).toBe('NOT_ASSESSABLE');
    expect(out.coldEngine.candidates.every((c) => c.proxyKind !== 'COLD_ENGINE_HIGH_RPM')).toBe(true);
  });

  it('reference bound to another vehicle is not assessable', () => {
    const refMax = 6000;
    const grid = coldEctGrid(12, (i) => ({
      rpm: i >= 2 && i <= 4 ? highRpmThreshold(refMax) + 50 : 900,
      loadPct: 45,
    }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({
        multichannelObservations: grid,
        vehicleRpmReference: buildTrustedVehicleRpmReference(refMax),
        vehicleRpmReferenceBinding: { organizationId: TIER_TEST_ORG, vehicleId: 'other-vehicle' },
      }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_RPM.reasonCodes).toContain(
      'VEHICLE_REFERENCE_BINDING_MISMATCH',
    );
  });

  it('non-finite reference max RPM is not assessable', () => {
    const grid = coldEctGrid(12, (i) => ({ rpm: 4000 + i * 10, loadPct: 40 }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({
        multichannelObservations: grid,
        vehicleRpmReference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
          idleRpm: 750,
          maxRpm: Number.NaN,
          idleRpmProvenance: { category: 'USER_CONFIRMED' },
          maxRpmProvenance: { category: 'USER_CONFIRMED' },
          iceRpmApplicability: 'APPLICABLE',
        }),
      }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_RPM.status).toBe('NOT_ASSESSABLE');
  });

  it('unreasonable reference max RPM is not assessable', () => {
    const grid = coldEctGrid(12, (i) => ({ rpm: 4000 + i * 10, loadPct: 40 }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({
        multichannelObservations: grid,
        vehicleRpmReference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
          idleRpm: 750,
          maxRpm: DS4_COLD_ENGINE_MAX_RPM_SANITY_UPPER + 1,
          idleRpmProvenance: { category: 'USER_CONFIRMED' },
          maxRpmProvenance: { category: 'USER_CONFIRMED' },
          iceRpmApplicability: 'APPLICABLE',
        }),
      }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_RPM.reasonCodes).toContain(
      'REFERENCE_PAIR_INCONSISTENT',
    );
  });

  it('missing load channel makes HIGH_LOAD NOT_ASSESSABLE', () => {
    const grid = coldEctGrid(12, () => ({ rpm: 1800, loadPct: null, throttlePct: 50 }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_LOAD.status).toBe('NOT_ASSESSABLE');
  });

  it('incomplete HF read abstains on genuine-empty path', () => {
    const grid = coldEctGrid(12, () => ({ loadPct: 88, rpm: null }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({
        multichannelObservations: grid,
        rpmCompletenessLabel: 'INCOMPLETE_MORE_POINTS_AVAILABLE',
      }),
    );
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('HF_READ_INCOMPLETE');
  });

  it('warm sufficient ECT yields NOT_OBSERVED under zero-RPM path', () => {
    const grid = coldEctGrid(12, () => ({ coolantC: 90, loadPct: 90, rpm: null }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid }),
    );
    expect(out.status).toBe('NOT_OBSERVED');
  });

  it('high RPM pattern without trusted reference is NOT_ASSESSABLE at subtype', () => {
    const grid = coldEctGrid(12, (i) => ({
      rpm: i >= 2 && i <= 4 ? 5500 : 900,
      loadPct: 40,
    }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({
        multichannelObservations: grid,
        vehicleRpmReference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
          idleRpm: 750,
          maxRpm: 6000,
          idleRpmProvenance: { category: 'USER_CONFIRMED' },
          maxRpmProvenance: { category: 'KNOWLEDGE_ONLY' },
          iceRpmApplicability: 'APPLICABLE',
        }),
        vehicleRpmReferenceBinding: { organizationId: TIER_TEST_ORG, vehicleId: TIER_TEST_VEHICLE },
      }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_RPM.status).toBe('NOT_ASSESSABLE');
  });
});
