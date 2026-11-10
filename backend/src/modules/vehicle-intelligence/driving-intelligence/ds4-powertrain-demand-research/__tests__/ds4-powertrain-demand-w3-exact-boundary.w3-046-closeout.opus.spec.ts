/**
 * W3-046 exact-boundary closeout: strict v1b continuity (gap > sequenceMaxGapSeconds*1000).
 */
import {
  gapCrossesAdmittedSequenceBoundary,
  splitBucketsAtAdmittedSequenceBoundaries,
} from '../ds4-powertrain-demand-multichannel-sequence-boundary.v1';
import { DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY } from '../ds4-powertrain-demand-sustained-load-reference.v1';
import { DS4_REVIVING_IDLE_DUAL_FACET_POLICY } from '../ds4-powertrain-demand-revving-idle-reference.v1';
import { detectGapAwareSustainedLoadCandidates } from '../ds4-powertrain-demand-sustained-load-gap-aware.v1';
import { computeDs4PowertrainDemandSustainedLoadResearchV1 } from '../ds4-powertrain-demand-sustained-load.kernel.v1';
import { computeDs4PowertrainDemandRevvingIdleResearchV1 } from '../ds4-powertrain-demand-revving-idle.kernel.v1';
import { computeLongestLoadPresentRunLabelCount } from '../ds4-powertrain-demand-sustained-load-negative-evidence.v1';
import { canonicalizeMultichannelObservations } from '../ds4-powertrain-demand-multichannel-canonicalize.v1';
import { detectRevvingIdleDualFacetCandidates } from '../ds4-powertrain-demand-revving-idle-dual-facet.v1';
import {
  buildBoundPowertrainInput,
  buildObservationSeries,
} from './ds4-powertrain-demand-research.test-helpers';

const SEQ_S = 2;
const STEP_MS = 1000;
const B3_LABELS = 21;
const TRIP = 'trip-w3-exact-boundary';

function oldDangerWindowWouldSplit(gapMs: number, maxAdjacent: number): boolean {
  const seqMaxMs = SEQ_S * 1000;
  return gapMs > seqMaxMs && gapMs < maxAdjacent;
}

function buildTwoHighLoadBlocks(interBlockGapMs: number) {
  const start = Date.parse('2026-01-01T10:00:20.000Z');
  const block = (t0: number) =>
    Array.from({ length: B3_LABELS }, (_, i) => ({
      recordedAtIso: new Date(t0 + i * STEP_MS).toISOString(),
      loadPct: i === 0 ? 80 : 72,
      rpm: 2000,
      throttlePct: 35,
      speedKmh: 60,
    }));
  const a = block(start);
  const bStart = start + (B3_LABELS - 1) * STEP_MS + interBlockGapMs;
  const prefix = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, () => ({
    rpm: 1500,
    loadPct: 18,
    throttlePct: 10,
    speedKmh: 40,
  }));
  const suffix = buildObservationSeries('2026-01-01T10:01:30.000Z', 12, 1, () => ({
    rpm: 1500,
    loadPct: 12,
    throttlePct: 8,
    speedKmh: 35,
  }));
  return [...prefix, ...a, ...block(bStart), ...suffix];
}

describe('W3-046 exact boundary closeout', () => {
  describe('helper unit semantics', () => {
    it('equal at sequenceMaxGap does not split; strictly above does', () => {
      expect(gapCrossesAdmittedSequenceBoundary({ labelGapMs: 2000, sequenceMaxGapSeconds: SEQ_S })).toBe(false);
      expect(gapCrossesAdmittedSequenceBoundary({ labelGapMs: 2001, sequenceMaxGapSeconds: SEQ_S })).toBe(true);
    });

    it('red-before: gap exactly B3 detector cluster max (5000) was not a danger-window split', () => {
      expect(oldDangerWindowWouldSplit(5000, DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.maxAdjacentLabelGapMs)).toBe(
        false,
      );
      expect(gapCrossesAdmittedSequenceBoundary({ labelGapMs: 5000, sequenceMaxGapSeconds: SEQ_S })).toBe(true);
    });

    it('red-before: facet A exact 4000ms cluster max ignored v1b break', () => {
      expect(oldDangerWindowWouldSplit(4000, DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetA.maxAdjacentLabelGapMs)).toBe(
        false,
      );
      expect(gapCrossesAdmittedSequenceBoundary({ labelGapMs: 4000, sequenceMaxGapSeconds: SEQ_S })).toBe(true);
    });
  });

  describe('B3 exact 5000ms inter-block (green-after)', () => {
    it('does not merge across sequence break at detector cluster equality', () => {
      const grid = buildTwoHighLoadBlocks(5000);
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
      );
      expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(2);
      const longest = computeLongestLoadPresentRunLabelCount(
        canonicalizeMultichannelObservations(grid).buckets,
        DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.maxAdjacentLabelGapMs,
        SEQ_S,
      );
      expect(longest).toBeLessThanOrEqual(B3_LABELS);
    });

    it('direct detect splits active run at 5001ms interior gap inside would-be cluster', () => {
      const start = Date.parse('2026-01-01T10:00:20.000Z');
      const rows = [
        ...Array.from({ length: B3_LABELS }, (_, i) => ({
          recordedAtIso: new Date(start + i * STEP_MS).toISOString(),
          loadPct: 80,
          rpm: 2000,
          throttlePct: 70,
          speedKmh: 60,
        })),
        {
          recordedAtIso: new Date(start + (B3_LABELS - 1) * STEP_MS + 5001).toISOString(),
          loadPct: 80,
          rpm: 2000,
          throttlePct: 70,
          speedKmh: 60,
        },
      ];
      const detect = detectGapAwareSustainedLoadCandidates({
        tripId: TRIP,
        providerSourceLinkId: 'link',
        fuelType: 'GASOLINE',
        isEvPowertrain: false,
        canon: canonicalizeMultichannelObservations(rows),
        sequenceMaxGapSeconds: SEQ_S,
      });
      expect(detect.candidates.length).toBeGreaterThanOrEqual(1);
      expect(detect.candidates.every((c) => c.observedLabelCount <= B3_LABELS)).toBe(true);
    });
  });

  describe('B4 Facet A exact 4000ms', () => {
    it('stationary facet cannot merge across 4000ms v1b break', () => {
      const prefix = buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, () => ({
        rpm: 1800,
        speedKmh: 40,
        throttlePct: 20,
        loadPct: 30,
      }));
      const start = Date.parse('2026-01-01T10:00:12.000Z');
      const mk = (t: number) => ({
        recordedAtIso: new Date(t).toISOString(),
        speedKmh: 0,
        rpm: 2100,
      });
      const rows = [
        ...prefix,
        mk(start),
        mk(start + 1000),
        mk(start + 2000),
        mk(start + 6000),
        mk(start + 7000),
        ...buildObservationSeries('2026-01-01T10:02:00.000Z', 8, 1, () => ({
          rpm: 1500,
          speedKmh: 40,
          throttlePct: 10,
          loadPct: 20,
        })),
      ];
      const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: rows, tripId: TRIP }),
      );
      expect(out.revvingIdle.facetA.deduplicatedCandidateCount).toBe(0);
      expect(
        splitBucketsAtAdmittedSequenceBoundaries(
          canonicalizeMultichannelObservations(rows).buckets,
          SEQ_S,
        ).length,
      ).toBeGreaterThan(2);
    });
  });

  describe('B4 Facet B exact 10000ms', () => {
    it('idle-band facet splits across 10s break (equals cluster max)', () => {
      const idleRow = () => ({ speedKmh: 0, rpm: 850 });
      const blockA = buildObservationSeries('2026-01-01T10:00:12.000Z', 201, 1, idleRow);
      const blockB = buildObservationSeries('2026-01-01T10:03:42.000Z', 201, 1, idleRow);
      const grid = [
        ...buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, () => ({
          rpm: 1800,
          speedKmh: 40,
          throttlePct: 20,
          loadPct: 30,
        })),
        ...blockA,
        ...blockB,
      ];
      const groups = splitBucketsAtAdmittedSequenceBoundaries(
        canonicalizeMultichannelObservations(grid).buckets,
        SEQ_S,
      );
      expect(groups.length).toBeGreaterThanOrEqual(3);
      const positive = computeDs4PowertrainDemandRevvingIdleResearchV1(
        buildBoundPowertrainInput({
          multichannelObservations: [
            ...buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, () => ({
              rpm: 1800,
              speedKmh: 40,
            })),
            ...blockA,
          ],
          tripId: TRIP,
        }),
      );
      expect(positive.revvingIdle.facetB.deduplicatedCandidateCount).toBe(1);
      const detect = detectRevvingIdleDualFacetCandidates({
        tripId: TRIP,
        providerSourceLinkId: 'link',
        fuelType: 'GASOLINE',
        isEvPowertrain: false,
        canon: canonicalizeMultichannelObservations(grid),
        sequenceMaxGapSeconds: SEQ_S,
      });
      expect(detect.facetB.candidates.length).toBe(2);
    });
  });
});
