import { computeDs4PowertrainDemandSustainedLoadResearchV1 } from '../ds4-powertrain-demand-sustained-load.kernel.v1';
import { buildBoundPowertrainInput, buildObservationSeries } from './ds4-powertrain-demand-research.test-helpers';

describe('P2-B3 load coverage gate (Opus P1-03)', () => {
  it('5 load labels scattered in 300 buckets yield INSUFFICIENT_OBSERVATIONS not NOT_OBSERVED', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 300, 1, (i) => {
      const sparseLoad = i % 60 === 0 && i < 300 ? { loadPct: 20 as number } : {};
      return { rpm: 3000, throttlePct: 90, speedKmh: 55, ...sparseLoad };
    });
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid }),
    );
    expect(out.sustainedLoad.tripEvidenceClassification).toBe('INSUFFICIENT_OBSERVATIONS');
    expect(out.status).toBe('COMPUTED');
    expect(out.sustainedLoad.coverageEvidence.loadPresentBucketCount).toBe(5);
  });

  it('five load labels 60s apart must not support local NOT_OBSERVED', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 250, 1, (i) => {
      const base = { rpm: 3000, throttlePct: 90, speedKmh: 55 };
      if ([0, 60, 120, 180, 240].includes(i)) return { ...base, loadPct: 20 };
      return base;
    });
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid }),
    );
    expect(out.sustainedLoad.tripEvidenceClassification).toBe('INSUFFICIENT_OBSERVATIONS');
    expect(out.sustainedLoad.tripEvidenceClassification).not.toBe('NOT_OBSERVED');
  });

  it('four cadence-adjacent load labels plus distant fifth do not count as five', () => {
    const runOfFour = buildObservationSeries('2026-01-01T10:00:01.000Z', 4, 1, () => ({
      rpm: 2500,
      throttlePct: 40,
      speedKmh: 55,
      loadPct: 25,
    }));
    const filler = buildObservationSeries('2026-01-01T10:00:05.000Z', 8, 1, () => ({
      rpm: 2500,
      throttlePct: 40,
      speedKmh: 55,
    }));
    const distant = buildObservationSeries('2026-01-01T10:02:00.000Z', 1, 1, () => ({
      rpm: 2500,
      throttlePct: 40,
      speedKmh: 55,
      loadPct: 25,
    }));
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: [...runOfFour, ...filler, ...distant] }),
    );
    expect(out.sustainedLoad.tripEvidenceClassification).toBe('INSUFFICIENT_OBSERVATIONS');
  });

  it('valid sustained-load positive candidate unchanged', () => {
    const prefix = buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, () => ({
      rpm: 1500,
      throttlePct: 12,
      speedKmh: 45,
      loadPct: 18,
    }));
    const baseMs = Date.parse('2026-01-01T10:00:12.000Z');
    const run = Array.from({ length: 21 }, (_, seq) => ({
      recordedAtIso: new Date(baseMs + seq * 1000).toISOString(),
      rpm: seq === 0 ? 2000 : 1900,
      throttlePct: 35,
      speedKmh: 60,
      loadPct: seq === 0 ? 80 : 72,
    }));
    const suffix = buildObservationSeries('2026-01-01T10:02:00.000Z', 4, 1, () => ({
      rpm: 1500,
      loadPct: 15,
      throttlePct: 10,
    }));
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: [...prefix, ...run, ...suffix] }),
    );
    expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(1);
    expect(out.sustainedLoad.tripEvidenceClassification).toBe('GAP_AWARE_SUSTAINED_PROXY_CANDIDATE');
  });

  it('contiguous sub-threshold load without entry remains NOT_OBSERVED when opportunity is adequate', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, () => ({
      rpm: 2500,
      throttlePct: 40,
      speedKmh: 55,
      loadPct: 25,
    }));
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid }),
    );
    expect(out.sustainedLoad.tripEvidenceClassification).toBe('NOT_OBSERVED');
    expect(out.sustainedLoad.entryLabelCount).toBe(0);
    expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(0);
  });
});
