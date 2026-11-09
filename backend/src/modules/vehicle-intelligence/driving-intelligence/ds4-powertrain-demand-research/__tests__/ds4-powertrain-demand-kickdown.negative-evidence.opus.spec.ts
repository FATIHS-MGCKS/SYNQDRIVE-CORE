import { computeDs4PowertrainDemandResearchV1 } from '../ds4-powertrain-demand-research.kernel.v1';
import { detectKickdownBucketGridCandidates } from '../ds4-powertrain-demand-kickdown-bucket-grid.v1';
import { canonicalizeMultichannelObservations } from '../ds4-powertrain-demand-multichannel-canonicalize.v1';
import { buildBoundPowertrainInput, positiveKickdownGrid } from './ds4-powertrain-demand-research.test-helpers';

describe('P2-B1 classification-aware dedupe (Opus P1-02)', () => {
  it('Opus four-bucket counterexample retains KICKDOWN_LIKE candidate', () => {
    const grid = [
      ...positiveKickdownGrid(),
      {
        recordedAtIso: '2026-01-01T10:00:13.000Z',
        throttlePct: 95,
        rpm: null,
        speedKmh: 66,
        loadPct: null,
      },
    ];
    const out = computeDs4PowertrainDemandResearchV1(buildBoundPowertrainInput({ multichannelObservations: grid }));
    expect(out.kickdown.candidates.some((c) => c.classification === 'KICKDOWN_LIKE_PROXY_CANDIDATE')).toBe(
      true,
    );
    expect(out.status).toBe('COMPUTED');
  });

  it('three-bucket positive baseline unchanged', () => {
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: positiveKickdownGrid() }),
    );
    expect(out.kickdown.candidates[0]?.classification).toBe('KICKDOWN_LIKE_PROXY_CANDIDATE');
  });

  it('reversed input order yields identical candidate classification set', () => {
    const rows = positiveKickdownGrid();
    const canonA = canonicalizeMultichannelObservations(rows);
    const canonB = canonicalizeMultichannelObservations([...rows].reverse());
    const args = {
      tripId: 't',
      providerSourceLinkId: 'l',
      sequenceMaxGapSeconds: 3,
      nominalCadenceMs: 1000,
      movementObservedCompleteness: 1,
      r1HistoricalObdRecordTimeUncertain: false,
      fuelType: 'GASOLINE',
    };
    const a = detectKickdownBucketGridCandidates({ ...args, canon: canonA });
    const b = detectKickdownBucketGridCandidates({ ...args, canon: canonB });
    const classes = (xs: typeof a) =>
      xs.candidates.map((c) => c.classification).sort().join('|');
    expect(classes(a)).toBe(classes(b));
  });
});
