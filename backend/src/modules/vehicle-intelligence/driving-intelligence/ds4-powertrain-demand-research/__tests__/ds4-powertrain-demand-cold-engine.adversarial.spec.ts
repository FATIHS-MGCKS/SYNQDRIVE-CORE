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
import {
  DS4_COLD_ENGINE_MAX_RPM_SANITY_UPPER,
  evaluateColdEngineHighRpmReferenceAdmission,
} from '../ds4-powertrain-demand-cold-engine-reference.v1';
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
    expect(out.abstainReasons).toContain('V1B_UNEXPECTED_ON_ZERO_RPM_PATH');
  });

  function zeroRpmColdLoadInput() {
    const grid = coldEctGrid(12, (i) => {
      if (i >= 2 && i <= 4) return { loadPct: 88, rpm: null };
      return { loadPct: 8, rpm: null };
    });
    return buildColdEngineBoundInput({ multichannelObservations: grid });
  }

  it('TENANT_SCOPE_VIOLATION status abstains even when tenantScopeViolation flag is false', () => {
    const input = zeroRpmColdLoadInput();
    input.tripInput.clickHouseRead = {
      ...input.tripInput.clickHouseRead,
      status: 'TENANT_SCOPE_VIOLATION',
      tenantScopeViolation: false,
      available: false,
    };
    const out = computeDs4PowertrainDemandColdEngineResearchV1(input);
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('TENANT_SCOPE_VIOLATION');
  });

  it('unknown ClickHouse read status abstains on zero-RPM path', () => {
    const input = zeroRpmColdLoadInput();
    input.tripInput.clickHouseRead = {
      ...input.tripInput.clickHouseRead,
      status: 'SUCCESS',
      available: true,
    };
    const out = computeDs4PowertrainDemandColdEngineResearchV1(input);
    expect(out.abstainReasons).toContain('HF_CLICKHOUSE_READ_STATUS_NOT_ALLOWED');
  });

  it('EMPTY status with available=false is contradictory and abstains', () => {
    const input = zeroRpmColdLoadInput();
    input.tripInput.clickHouseRead = {
      ...input.tripInput.clickHouseRead,
      status: 'EMPTY',
      available: false,
    };
    const out = computeDs4PowertrainDemandColdEngineResearchV1(input);
    expect(out.abstainReasons).toContain('HF_CLICKHOUSE_READ_STATUS_NOT_ALLOWED');
  });

  it('valid upstream EMPTY ClickHouse read admits genuine empty cold load', () => {
    const input = zeroRpmColdLoadInput();
    expect(input.tripInput.clickHouseRead.status).toBe('EMPTY');
    expect(input.tripInput.clickHouseRead.available).toBe(true);
    const out = computeDs4PowertrainDemandColdEngineResearchV1(input);
    expect(out.status).toBe('COMPUTED');
    expect(out.abstainReasons).toHaveLength(0);
  });

  it('QUERY_FAILED with EMPTY semantics abstains on zero-RPM path', () => {
    const input = zeroRpmColdLoadInput();
    input.tripInput.clickHouseRead = {
      ...input.tripInput.clickHouseRead,
      status: 'QUERY_FAILED',
      available: false,
    };
    const out = computeDs4PowertrainDemandColdEngineResearchV1(input);
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('HF_CLICKHOUSE_QUERY_FAILED');
  });

  it('UNAVAILABLE with EMPTY semantics abstains on zero-RPM path', () => {
    const input = zeroRpmColdLoadInput();
    input.tripInput.clickHouseRead = {
      ...input.tripInput.clickHouseRead,
      status: 'UNAVAILABLE',
      available: false,
    };
    const out = computeDs4PowertrainDemandColdEngineResearchV1(input);
    expect(out.abstainReasons).toContain('HF_CLICKHOUSE_UNAVAILABLE');
  });

  it('degraded ClickHouse read abstains on zero-RPM path', () => {
    const input = zeroRpmColdLoadInput();
    input.tripInput.clickHouseRead = {
      ...input.tripInput.clickHouseRead,
      degradedReason: 'PARTIAL_SHARD_TIMEOUT',
    };
    const out = computeDs4PowertrainDemandColdEngineResearchV1(input);
    expect(out.abstainReasons).toContain('HF_CLICKHOUSE_DEGRADED');
  });

  it('nonzero totalMatchingCount abstains on declared empty read', () => {
    const input = zeroRpmColdLoadInput();
    input.tripInput.dataQuality = {
      ...input.tripInput.dataQuality,
      totalMatchingCount: 3,
    };
    const out = computeDs4PowertrainDemandColdEngineResearchV1(input);
    expect(out.abstainReasons).toContain('EMPTY_RPM_DATA_QUALITY_INCONSISTENT');
  });

  it('nonzero returnedPointCount abstains on declared empty read', () => {
    const input = zeroRpmColdLoadInput();
    input.tripInput.dataQuality = {
      ...input.tripInput.dataQuality,
      returnedPointCount: 1,
    };
    const out = computeDs4PowertrainDemandColdEngineResearchV1(input);
    expect(out.abstainReasons).toContain('EMPTY_RPM_DATA_QUALITY_INCONSISTENT');
  });

  it('synthetic fixture HIGH_RPM reference experiment remains assessable', () => {
    const refMax = 6000;
    const grid = coldEctGrid(12, (i) => ({
      rpm: i >= 2 && i <= 4 ? highRpmThreshold(refMax) + 80 : 900,
      loadPct: 45,
    }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({
        multichannelObservations: grid,
        vehicleRpmReference: buildTrustedVehicleRpmReference(refMax),
        evidenceOrigin: 'SYNTHETIC_FIXTURE',
      }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_RPM.status).toBe('ASSESSABLE');
    expect(out.bindings.highRpmReferenceTrustTier).toBe('SYNTHETIC_FIXTURE_ONLY');
    expect(out.provenance.independentFieldValidation).toBe(false);
    expect(out.provenance.sourceProvenanceVerified).toBe(false);
  });

  it('unverified non-synthetic reference cannot admit HIGH_RPM', () => {
    const refMax = 6000;
    const verdict = evaluateColdEngineHighRpmReferenceAdmission({
      organizationId: TIER_TEST_ORG,
      vehicleId: TIER_TEST_VEHICLE,
      vehicleRpmReferenceBinding: { organizationId: TIER_TEST_ORG, vehicleId: TIER_TEST_VEHICLE },
      reference: buildTrustedVehicleRpmReference(refMax),
      evidenceOrigin: 'OFFLINE_SEALED_BUNDLE',
    });
    expect(verdict.admitted).toBe(false);
    expect(verdict.reasonCodes).toContain('REFERENCE_TRUST_REQUIRES_SYNTHETIC_FIXTURE');
    expect(verdict.referenceTrustTier).not.toBe('SYNTHETIC_FIXTURE_ONLY');
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
