import { computeDs4PowertrainDemandColdEngineResearchV1 } from '../ds4-powertrain-demand-cold-engine.kernel.v1';
import {
  buildColdEngineBoundInput,
  buildObservationSeries,
  buildTrustedVehicleRpmReference,
  coldEctGrid,
} from './ds4-powertrain-demand-research.test-helpers';

function gridWithLeadingColdTriple(map: (slot: 0 | 1 | 2) => Record<string, unknown>) {
  return buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, (i) => {
    if (i <= 2) {
      return {
        coolantC: 40,
        loadPct: 10,
        throttlePct: 10,
        rpm: 1500,
        ...(map(i as 0 | 1 | 2) as object),
      };
    }
    return { coolantC: 85, loadPct: 5, rpm: 1500 };
  });
}

describe('P2-B2 detector assessability parity', () => {
  it('one RPM label in cold triple => HIGH_RPM NOT_ASSESSABLE', () => {
    const grid = gridWithLeadingColdTriple((slot) => ({
      rpm: slot === 0 ? 2000 : null,
    }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({
        multichannelObservations: grid,
        vehicleRpmReference: buildTrustedVehicleRpmReference(6000),
      }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_RPM.status).toBe('NOT_ASSESSABLE');
  });

  it('two RPM labels in cold triple => HIGH_RPM NOT_ASSESSABLE', () => {
    const grid = gridWithLeadingColdTriple((slot) => ({
      rpm: slot === 2 ? null : 2000,
    }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({
        multichannelObservations: grid,
        vehicleRpmReference: buildTrustedVehicleRpmReference(6000),
      }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_RPM.status).toBe('NOT_ASSESSABLE');
  });

  it('three RPM labels with admitted reference => HIGH_RPM ASSESSABLE', () => {
    const grid = gridWithLeadingColdTriple(() => ({ rpm: 2000 }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({
        multichannelObservations: grid,
        vehicleRpmReference: buildTrustedVehicleRpmReference(6000),
      }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_RPM.status).toBe('ASSESSABLE');
  });

  it('one throttle label in cold triple => FULL_THROTTLE NOT_ASSESSABLE', () => {
    const grid = gridWithLeadingColdTriple((slot) => ({
      throttlePct: slot === 0 ? 50 : null,
    }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_FULL_THROTTLE.status).toBe('NOT_ASSESSABLE');
  });

  it('two throttle labels in cold triple => FULL_THROTTLE NOT_ASSESSABLE', () => {
    const grid = gridWithLeadingColdTriple((slot) => ({
      throttlePct: slot === 2 ? null : 50,
    }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_FULL_THROTTLE.status).toBe('NOT_ASSESSABLE');
  });

  it('three throttle labels in cold triple => FULL_THROTTLE ASSESSABLE', () => {
    const grid = gridWithLeadingColdTriple(() => ({ throttlePct: 50 }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_FULL_THROTTLE.status).toBe('ASSESSABLE');
  });

  it('cold triple without channel evidence => COMPUTED not NOT_OBSERVED', () => {
    const grid = gridWithLeadingColdTriple(() => ({
      loadPct: null,
      throttlePct: null,
      rpm: null,
    }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid }),
    );
    expect(Object.values(out.coldEngine.subtypeAssessability).every((s) => s.status === 'NOT_ASSESSABLE')).toBe(
      true,
    );
    expect(out.status).toBe('COMPUTED');
    expect(out.coldEngine.deduplicatedCandidateCount).toBe(0);
  });

  it('positive HIGH_LOAD candidate unchanged', () => {
    const grid = coldEctGrid(12, (i) => {
      if (i >= 2 && i <= 4) return { loadPct: 88, rpm: null, throttlePct: 40 };
      return { loadPct: 10, rpm: null, throttlePct: 5 };
    });
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid }),
    );
    expect(
      out.coldEngine.candidates.some((c) => c.classification === 'COLD_ENGINE_HIGH_LOAD_PROXY_CANDIDATE'),
    ).toBe(true);
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_LOAD.status).toBe('ASSESSABLE');
  });
});
