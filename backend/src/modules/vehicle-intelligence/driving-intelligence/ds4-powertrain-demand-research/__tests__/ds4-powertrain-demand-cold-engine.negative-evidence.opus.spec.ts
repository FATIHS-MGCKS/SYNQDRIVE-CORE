import { computeDs4PowertrainDemandColdEngineResearchV1 } from '../ds4-powertrain-demand-cold-engine.kernel.v1';
import {
  buildColdEngineBoundInput,
  buildObservationSeries,
  coldEctGrid,
} from './ds4-powertrain-demand-research.test-helpers';

describe('P2-B2 negative assessability (Opus P2)', () => {
  it('warm ECT yields COMPUTED not NOT_OBSERVED when all subtypes are NOT_ASSESSABLE', () => {
    const grid = coldEctGrid(12, () => ({ coolantC: 85, loadPct: 90, rpm: null }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid }),
    );
    expect(out.status).toBe('COMPUTED');
    expect(Object.values(out.coldEngine.subtypeAssessability).every((s) => s.status === 'NOT_ASSESSABLE')).toBe(
      true,
    );
    expect(out.coldEngine.deduplicatedCandidateCount).toBe(0);
  });

  it('single cold bucket does not mark HIGH_LOAD assessable', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, (i) => ({
      coolantC: i === 5 ? 40 : 85,
      loadPct: 90,
      rpm: 2000,
    }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_LOAD.status).toBe('NOT_ASSESSABLE');
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_LOAD.reasonCodes).toContain(
      'INSUFFICIENT_COLD_WINDOW_OPPORTUNITY',
    );
  });

  it('cold triple without load plus isolated cold load bucket keeps HIGH_LOAD NOT_ASSESSABLE', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, (i) => {
      if (i <= 2) return { coolantC: 40, rpm: 1500, throttlePct: 20 };
      if (i === 7) return { coolantC: 40, loadPct: 90, rpm: 1500 };
      return { coolantC: 85, loadPct: 5, rpm: 1500 };
    });
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_LOAD.status).toBe('NOT_ASSESSABLE');
  });

  it('cold triple without throttle plus isolated cold throttle keeps FULL_THROTTLE NOT_ASSESSABLE', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, (i) => {
      if (i <= 2) return { coolantC: 40, rpm: 1500, loadPct: 10 };
      if (i === 7) return { coolantC: 40, throttlePct: 90, loadPct: 10 };
      return { coolantC: 85, loadPct: 5, rpm: 1500 };
    });
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_FULL_THROTTLE.status).toBe('NOT_ASSESSABLE');
  });

  it('cold triple without RPM plus isolated cold RPM keeps HIGH_RPM NOT_ASSESSABLE', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, (i) => {
      if (i <= 2) return { coolantC: 40, loadPct: 10, throttlePct: 10, rpm: null };
      if (i === 7) return { coolantC: 40, loadPct: 10, rpm: 5500 };
      return { coolantC: 85, loadPct: 5, rpm: 1500 };
    });
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_RPM.status).toBe('NOT_ASSESSABLE');
  });

  it('existing B2 positive HIGH_LOAD candidate unchanged', () => {
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
  });

  it('three adjacent cold observations keep assessable opportunity and can yield NOT_OBSERVED when empty', () => {
    const grid = coldEctGrid(12, (i) => ({
      coolantC: 42,
      loadPct: i >= 2 && i <= 4 ? 10 : 5,
      rpm: 1500,
    }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_LOAD.status).toBe('ASSESSABLE');
    expect(out.status).toBe('NOT_OBSERVED');
  });
});
