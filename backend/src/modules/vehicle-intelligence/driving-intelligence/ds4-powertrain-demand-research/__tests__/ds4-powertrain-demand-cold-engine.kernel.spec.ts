import { COLD_ENGINE_SHADOW_POLICY } from '../../../shadow-detector/detectors/cold-engine-shadow.policy';
import { computeDs4PowertrainDemandColdEngineResearchV1 } from '../ds4-powertrain-demand-cold-engine.kernel.v1';
import { computeDs4PowertrainDemandResearchV1 } from '../ds4-powertrain-demand-research.kernel.v1';
import { DS4_MULTICHANNEL_MANIFEST_VERSION } from '../ds4-powertrain-demand-research.contract.v1';
import {
  TIER_TEST_LINK,
  TIER_TEST_ORG,
  TIER_TEST_TRIP,
  TIER_TEST_VEHICLE,
} from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import { computeMultichannelContentFingerprint } from '../ds4-powertrain-demand-research.input-binding.v1';
import { buildDs4RpmReferenceIntelligenceV1ReferenceBlock } from '../../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1-reference-input';
import {
  buildBoundPowertrainInput,
  buildColdEngineBoundInput,
  buildObservationSeries,
  buildTrustedVehicleRpmReference,
  coldEctGrid,
  positiveKickdownGrid,
  R1_DIMO,
} from './ds4-powertrain-demand-research.test-helpers';

describe('ds4-powertrain-demand cold-engine P2-B2', () => {
  const highRpmThreshold = (max: number) => max * COLD_ENGINE_SHADOW_POLICY.highLoadRpmPctOfMax;

  it('A: cold stationary high load with rpm=null yields HIGH_LOAD proxy candidate', () => {
    const grid = coldEctGrid(12, (i) => {
      if (i >= 2 && i <= 4) {
        return { loadPct: 88, rpm: null, throttlePct: 40 };
      }
      return { loadPct: 12, rpm: null };
    });
    const out = computeDs4PowertrainDemandColdEngineResearchV1(buildColdEngineBoundInput({ multichannelObservations: grid }));
    expect(out.status).toBe('COMPUTED');
    expect(out.coldEngine.candidates.some((c) => c.classification === 'COLD_ENGINE_HIGH_LOAD_PROXY_CANDIDATE')).toBe(
      true,
    );
    expect(out.provenance.sourceProvenanceVerified).toBe(false);
    expect(out.coldEngine.coverageEvidence.fullTripColdStateCoverageVerdict).toBe('UNKNOWN');
  });

  it('B: cold stationary with rpm present can emit HIGH_RPM when reference admitted', () => {
    const refMax = 6000;
    const grid = coldEctGrid(12, (i) => {
      const rpm = i >= 2 && i <= 4 ? highRpmThreshold(refMax) + 100 : 800;
      return { rpm, loadPct: 55 };
    });
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({
        multichannelObservations: grid,
        vehicleRpmReference: buildTrustedVehicleRpmReference(refMax),
      }),
    );
    expect(out.status).toBe('COMPUTED');
    expect(
      out.coldEngine.candidates.some((c) => c.classification === 'COLD_ENGINE_HIGH_RPM_PROXY_CANDIDATE'),
    ).toBe(true);
  });

  it('C: warm ECT yields COMPUTED without abstaining on sufficient ECT labels', () => {
    const grid = coldEctGrid(12, () => ({ coolantC: 85, loadPct: 90, rpm: null }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(buildColdEngineBoundInput({ multichannelObservations: grid }));
    expect(out.status).toBe('COMPUTED');
    expect(out.abstainReasons).toHaveLength(0);
  });

  it('D: insufficient ECT-labelled buckets abstains', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, (i) => ({
      coolantC: i < 5 ? 40 : null,
      loadPct: 90,
    }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(buildColdEngineBoundInput({ multichannelObservations: grid }));
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('INSUFFICIENT_ECT_OBSERVATIONS');
  });

  it('E: long idle without rpm then short cold load burst remains computable', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 203, 1, (i) => {
      if (i >= 200) return { coolantC: 42, loadPct: 88, rpm: null, speedKmh: 0 };
      return { coolantC: 42, rpm: null, loadPct: 0, speedKmh: 0 };
    });
    const out = computeDs4PowertrainDemandColdEngineResearchV1(buildColdEngineBoundInput({ multichannelObservations: grid }));
    expect(out.status).toBe('COMPUTED');
    expect(out.coldEngine.coverageEvidence.rpmTripCoverage).toBeNull();
  });

  it('F: cold full throttle with engine proxy evidence', () => {
    const grid = coldEctGrid(12, (i) => {
      if (i >= 2 && i <= 4) {
        return { throttlePct: 92, loadPct: 45, rpm: 1800 };
      }
      return { throttlePct: 20, loadPct: 15, rpm: 900 };
    });
    const out = computeDs4PowertrainDemandColdEngineResearchV1(buildColdEngineBoundInput({ multichannelObservations: grid }));
    expect(
      out.coldEngine.candidates.some((c) => c.classification === 'COLD_ENGINE_FULL_THROTTLE_PROXY_CANDIDATE'),
    ).toBe(true);
  });

  it('G: throttle-only window without engine proxy does not confirm candidate', () => {
    const grid = coldEctGrid(12, (i) => {
      if (i >= 2 && i <= 4) return { throttlePct: 95, loadPct: 0, rpm: null };
      return { throttlePct: 5, loadPct: 0, rpm: null };
    });
    const out = computeDs4PowertrainDemandColdEngineResearchV1(buildColdEngineBoundInput({ multichannelObservations: grid }));
    expect(out.coldEngine.candidates).toHaveLength(0);
  });

  it('H: PHEV without local rpm ice proxy skips cold high load', () => {
    const grid = coldEctGrid(12, (i) => {
      if (i >= 2 && i <= 4) return { loadPct: 90, rpm: null };
      return { loadPct: 5, rpm: null };
    });
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid, fuelType: 'PHEV' }),
    );
    expect(out.coldEngine.candidates).toHaveLength(0);
  });

  it('I: PHEV with local rpm proxy can compute high load', () => {
    const grid = coldEctGrid(12, (i) => {
      if (i >= 2 && i <= 4) return { loadPct: 90, rpm: 1800 };
      return { loadPct: 5, rpm: 400 };
    });
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid, fuelType: 'PHEV' }),
    );
    expect(out.coldEngine.candidates.length).toBeGreaterThan(0);
  });

  it('J: high rpm pattern without admitted reference is not emitted', () => {
    const grid = coldEctGrid(12, (i) => ({
      rpm: i >= 2 && i <= 4 ? 5000 : 800,
      loadPct: 40,
    }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({
        multichannelObservations: grid,
        vehicleRpmReference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
          idleRpm: 750,
          maxRpm: 6200,
          maxRpmProvenance: { category: 'AI_ESTIMATED' },
          idleRpmProvenance: { category: 'USER_CONFIRMED' },
          iceRpmApplicability: 'APPLICABLE',
        }),
        vehicleRpmReferenceBinding: null,
      }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_RPM.status).toBe('NOT_ASSESSABLE');
    expect(out.coldEngine.candidates.every((c) => c.proxyKind !== 'COLD_ENGINE_HIGH_RPM')).toBe(true);
  });

  it('K: high rpm with USER_CONFIRMED reference emits HIGH_RPM proxy', () => {
    const refMax = 6200;
    const grid = coldEctGrid(12, (i) => ({
      rpm: i >= 2 && i <= 4 ? highRpmThreshold(refMax) + 50 : 900,
      loadPct: 50,
    }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({
        multichannelObservations: grid,
        vehicleRpmReference: buildTrustedVehicleRpmReference(refMax),
      }),
    );
    expect(out.coldEngine.candidates.some((c) => c.proxyKind === 'COLD_ENGINE_HIGH_RPM')).toBe(true);
  });

  it('L: mixed-source rows abstain', () => {
    const grid = coldEctGrid(12, () => ({ loadPct: 88, rpm: null }));
    const input = buildColdEngineBoundInput({ multichannelObservations: grid });
    input.multichannelObservations[0]!.providerSourceLinkId = 'other-link';
    const out = computeDs4PowertrainDemandColdEngineResearchV1(input);
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('MIXED_SOURCE_OBSERVATION');
  });

  it('M: forged independent attestation abstains offline bundles', () => {
    const grid = coldEctGrid(12, () => ({ loadPct: 88, rpm: null }));
    const mcFp = computeMultichannelContentFingerprint({
      organizationId: TIER_TEST_ORG,
      vehicleId: TIER_TEST_VEHICLE,
      tripId: TIER_TEST_TRIP,
      providerSourceLinkId: TIER_TEST_LINK,
      telemetrySourceFamily: 'RUPTELA_R1',
      observations: grid,
    });
    const input = buildColdEngineBoundInput({
      multichannelObservations: grid,
      dimoVehicleRawJson: R1_DIMO,
      evidenceOrigin: 'OFFLINE_SEALED_BUNDLE',
      multichannelManifest: {
        manifestVersion: DS4_MULTICHANNEL_MANIFEST_VERSION,
        organizationId: TIER_TEST_ORG,
        vehicleId: TIER_TEST_VEHICLE,
        tripId: TIER_TEST_TRIP,
        providerSourceLinkId: TIER_TEST_LINK,
        telemetrySourceFamily: 'RUPTELA_R1',
        r1SnapshotVersion: 'DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3',
        channels: [],
        expectedMultichannelFingerprint: mcFp,
        independentFieldValidation: true,
      },
    });
    const out = computeDs4PowertrainDemandColdEngineResearchV1(input);
    expect(out.abstainReasons).toContain('FORGED_INDEPENDENT_ATTESTATION');
  });

  it('N: emits R1 bucket timing uncertainty claim', () => {
    const grid = coldEctGrid(12, () => ({ loadPct: 88, rpm: null }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid, dimoVehicleRawJson: R1_DIMO }),
    );
    expect(out.r1HistoricalObdRecordTimeUncertain).toBe(true);
    if (out.status === 'COMPUTED') {
      expect(out.unsupportedScientificClaims).toContain('R1_HISTORICAL_OBD_RECORD_TIME_UNCERTAIN');
    }
  });

  it('O: no whole-trip RPM coverage admission floor', () => {
    const grid = coldEctGrid(12, (i) => {
      if (i >= 2 && i <= 4) return { loadPct: 88, rpm: null };
      return { loadPct: 5, rpm: null };
    });
    const out = computeDs4PowertrainDemandColdEngineResearchV1(buildColdEngineBoundInput({ multichannelObservations: grid }));
    expect(out.coldEngine.coverageEvidence.rpmTripCoverage).toBeNull();
    expect(out.status).toBe('COMPUTED');
  });

  it('P: kickdown kernel still enforces movement gate (P2-B1 unchanged)', () => {
    const stationaryOnly = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, (i) => ({
      throttlePct: 92,
      rpm: 3200,
      speedKmh: 0,
      loadPct: 78,
      coolantC: 88,
    }));
    const kick = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: stationaryOnly }),
    );
    expect(kick.status).toBe('ABSTAINED');
    expect(kick.abstainReasons).toContain('NO_MOVING_OPPORTUNITY_EVIDENCE');
  });

  it('Q: P2-B1 kickdown regression fixture still computes', () => {
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: positiveKickdownGrid() }),
    );
    expect(out.status).toBe('COMPUTED');
  });
});
