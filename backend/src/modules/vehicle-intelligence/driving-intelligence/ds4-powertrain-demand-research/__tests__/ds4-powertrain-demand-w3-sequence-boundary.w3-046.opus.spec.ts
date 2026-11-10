/**
 * W3-046 sequence boundary parity oracles (P2-C4 W3A).
 *
 * RED-BEFORE (v1 policy, pre-split): With inter-block gap G where
 * sequenceMaxGapSeconds*1000 < G <= maxAdjacentLabelGapMs, B3/B4 detectors could
 * merge qualifying runs across admitted v1b sequence breaks; negative load runs could
 * overcount longest contiguous load presence; B4 assessability could inflate coherent spans.
 *
 * GREEN-AFTER (v1.1 closeout): strict v1b continuity — gap > sequenceMaxGapSeconds*1000 splits;
 * fixtures use 1s admitted cadence (not 5s-spaced pseudo-sequences).
 */
import { splitBucketsAtAdmittedSequenceBoundaries } from '../ds4-powertrain-demand-multichannel-sequence-boundary.v1';
import { computeLongestLoadPresentRunLabelCount } from '../ds4-powertrain-demand-sustained-load-negative-evidence.v1';
import {
  classifySustainedLoadTripEvidence,
  detectGapAwareSustainedLoadCandidates,
} from '../ds4-powertrain-demand-sustained-load-gap-aware.v1';
import { computeDs4PowertrainDemandSustainedLoadResearchV1 } from '../ds4-powertrain-demand-sustained-load.kernel.v1';
import { computeDs4PowertrainDemandRevvingIdleResearchV1 } from '../ds4-powertrain-demand-revving-idle.kernel.v1';
import { canonicalizeMultichannelObservations } from '../ds4-powertrain-demand-multichannel-canonicalize.v1';
import {
  detectRevvingIdleDualFacetCandidates,
  DS4_REVIVING_IDLE_DUAL_FACET_POLICY,
} from '../ds4-powertrain-demand-revving-idle-dual-facet.v1';
import {
  evaluateRevvingIdleFacetAAssessability,
  evaluateRevvingIdleFacetBAssessability,
} from '../ds4-powertrain-demand-revving-idle-assessability.v1';
import { DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY } from '../ds4-powertrain-demand-sustained-load-reference.v1';
import {
  buildBoundPowertrainInput,
  buildObservationSeries,
} from './ds4-powertrain-demand-research.test-helpers';

const TRIP = 'trip-w3-046-sequence-boundary';
const LINK = 'link-w3-046';
/** v1b RPM_1S binding tier (buildBoundPowertrainInput fixtures). */
const V1B_SEQUENCE_MAX_GAP_SECONDS = 2;
const DETECTOR_CLUSTER_MAX_GAP_MS = DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.maxAdjacentLabelGapMs;
const B3_QUALIFYING_LABELS_PER_BLOCK = 21;

function v1bSuffix() {
  return buildObservationSeries('2026-01-01T10:02:00.000Z', 8, 1, () => ({
    rpm: 1500,
    loadPct: 20,
    throttlePct: 10,
    speedKmh: 40,
  }));
}

function buildDualSustainedLoadBlocks(interBlockGapMs: number) {
  const prefix = buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, () => ({
    rpm: 1500,
    loadPct: 20,
    throttlePct: 10,
    speedKmh: 40,
  }));
  const blockStart = Date.parse('2026-01-01T10:00:12.000Z');
  const block = (startMs: number) =>
    Array.from({ length: B3_QUALIFYING_LABELS_PER_BLOCK }, (_, i) => ({
      recordedAtIso: new Date(startMs + i * 1000).toISOString(),
      loadPct: i === 0 ? 80 : 72,
      rpm: 2000,
      throttlePct: 35,
      speedKmh: 60,
    }));
  const blockA = block(blockStart);
  const blockBStart = blockStart + (B3_QUALIFYING_LABELS_PER_BLOCK - 1) * 1000 + interBlockGapMs;
  return [...prefix, ...blockA, ...block(blockBStart), ...v1bSuffix()];
}

function buildDualFacetAStationaryBlocks(interBlockGapMs: number) {
  const prefix = buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, () => ({
    rpm: 1500,
    speedKmh: 40,
  }));
  const blockStart = Date.parse('2026-01-01T10:00:12.000Z');
  const row = (startMs: number, i: number) => ({
    recordedAtIso: new Date(startMs + i * 1000).toISOString(),
    speedKmh: 0,
    rpm: 2100,
    throttlePct: 20,
    loadPct: 30,
  });
  const blockA = Array.from({ length: 4 }, (_, i) => row(blockStart, i));
  const blockBStart = blockStart + 3 * 1000 + interBlockGapMs;
  const blockB = Array.from({ length: 4 }, (_, i) => row(blockBStart, i));
  return [...prefix, ...blockA, ...blockB, ...v1bSuffix()];
}

describe('W3-046 sequence boundary parity', () => {
  it('documents red-before detector gap window', () => {
    expect(V1B_SEQUENCE_MAX_GAP_SECONDS * 1000).toBeLessThan(3000);
    expect(3000).toBeLessThanOrEqual(DETECTOR_CLUSTER_MAX_GAP_MS);
  });

  describe('O-W3-046 B3 positive', () => {
    it('gap above admitted boundary yields two candidates (not one merged run)', () => {
      const grid = buildDualSustainedLoadBlocks(3000);
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
      );
      expect(out.policyVersion).toBe('sustained-load-gap-aware-research-v1.1');
      expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(2);
      expect(
        out.sustainedLoad.candidates.every((c) => c.observedLabelCount === B3_QUALIFYING_LABELS_PER_BLOCK),
      ).toBe(true);
    });

    it('gap below boundary keeps single admitted sequence behavior', () => {
      const grid = buildDualSustainedLoadBlocks(1500);
      const canon = canonicalizeMultichannelObservations(grid);
      const detect = detectGapAwareSustainedLoadCandidates({
        tripId: TRIP,
        providerSourceLinkId: LINK,
        fuelType: 'GASOLINE',
        isEvPowertrain: false,
        canon,
        sequenceMaxGapSeconds: V1B_SEQUENCE_MAX_GAP_SECONDS,
      });
      expect(detect.candidates).toHaveLength(1);
      expect(detect.candidates[0]?.observedLabelCount).toBe(B3_QUALIFYING_LABELS_PER_BLOCK * 2);
    });

    it('gap exactly at boundary (2s) does not split sequences', () => {
      const grid = buildDualSustainedLoadBlocks(2000);
      const canon = canonicalizeMultichannelObservations(grid);
      const detect = detectGapAwareSustainedLoadCandidates({
        tripId: TRIP,
        providerSourceLinkId: LINK,
        fuelType: 'GASOLINE',
        isEvPowertrain: false,
        canon,
        sequenceMaxGapSeconds: V1B_SEQUENCE_MAX_GAP_SECONDS,
      });
      expect(detect.candidates).toHaveLength(1);
    });

    it('single-sequence control unchanged', () => {
      const grid = buildDualSustainedLoadBlocks(1500);
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
      );
      expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(1);
    });

    it('reordered grid: kernel episode keys stable', () => {
      const grid = buildDualSustainedLoadBlocks(3000);
      const a = computeDs4PowertrainDemandSustainedLoadResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
      );
      const b = computeDs4PowertrainDemandSustainedLoadResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: [...grid].reverse(), tripId: TRIP }),
      );
      expect(a.sustainedLoad.candidates.map((c) => c.episodeKey).sort()).toEqual(
        b.sustainedLoad.candidates.map((c) => c.episodeKey).sort(),
      );
    });
  });

  describe('O-W3-046-NEGATIVE B3 opportunity', () => {
    it('fragmented load across sequence break cannot support NOT_OBSERVED', () => {
      const prefix = buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, () => ({
        rpm: 1500,
        loadPct: null,
      }));
      const aStart = Date.parse('2026-01-01T10:00:12.000Z');
      const blockA = Array.from({ length: 3 }, (_, i) => ({
        recordedAtIso: new Date(aStart + i * 1000).toISOString(),
        loadPct: 40,
        rpm: 1500,
      }));
      const bStart = aStart + 2000 + 3000;
      const blockB = Array.from({ length: 3 }, (_, i) => ({
        recordedAtIso: new Date(bStart + i * 1000).toISOString(),
        loadPct: 40,
        rpm: 1500,
      }));
      const grid = [...prefix, ...blockA, ...blockB];
      const canon = canonicalizeMultichannelObservations(grid);
      const longest = computeLongestLoadPresentRunLabelCount(
        canon.buckets,
        DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.maxAdjacentLabelGapMs,
        V1B_SEQUENCE_MAX_GAP_SECONDS,
      );
      expect(longest).toBe(3);
      const tripClass = classifySustainedLoadTripEvidence({
        entryLabelCount: 0,
        candidateCount: 0,
        longestRunLabelCount: 0,
        longestLoadPresentRunLabelCount: longest,
        loadPresentBucketCount: 6,
      });
      expect(tripClass).toBe('INSUFFICIENT_OBSERVATIONS');
    });
  });

  describe('O-W3-046-B4-A / B4-B', () => {
    it('Facet A: inter-sequence gap yields two facet runs', () => {
      const grid = buildDualFacetAStationaryBlocks(3000);
      const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
      );
      expect(out.policyVersion).toBe('revving-idle-dual-facet-research-v1.1');
      expect(out.revvingIdle.facetA.deduplicatedCandidateCount).toBe(2);
    });

    it('Facet A direct detect respects sequenceMaxGapSeconds', () => {
      const grid = buildDualFacetAStationaryBlocks(3000);
      const canon = canonicalizeMultichannelObservations(grid);
      const detect = detectRevvingIdleDualFacetCandidates({
        tripId: TRIP,
        providerSourceLinkId: LINK,
        fuelType: 'GASOLINE',
        isEvPowertrain: false,
        canon,
        sequenceMaxGapSeconds: V1B_SEQUENCE_MAX_GAP_SECONDS,
      });
      expect(detect.facetA.candidates).toHaveLength(2);
      expect(detect.facetA.candidates.every((c) => c.observedLabelCount === 4)).toBe(true);
    });
  });

  describe('O-W3-046-B4-ASSESSABILITY', () => {
    it('assessability does not merge coherent runs across admitted sequence breaks', () => {
      const dense = buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, () => ({
        rpm: 1500,
        speedKmh: 0,
      }));
      const seqA = buildObservationSeries('2026-01-01T10:00:12.000Z', 5, 1, () => ({
        speedKmh: 0,
        rpm: 2100,
      }));
      const seqB = buildObservationSeries('2026-01-01T10:00:22.000Z', 5, 1, () => ({
        speedKmh: 0,
        rpm: 2100,
      }));
      const grid = [...dense, ...seqA, ...seqB, ...v1bSuffix()];
      const canon = canonicalizeMultichannelObservations(grid);
      const verdict = evaluateRevvingIdleFacetAAssessability(canon, V1B_SEQUENCE_MAX_GAP_SECONDS);
      expect(verdict.assessable).toBe(true);
      expect(verdict.diagnostics.longestCoherentRunLabelCount).toBeGreaterThanOrEqual(5);
      expect(verdict.diagnostics.maxQualifyingCoherentResearchLabelSpanMs).toBeGreaterThanOrEqual(
        DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetA.minResearchLabelSpanMs,
      );
    });

    it('missing rpm channel: facet B assessability unavailable', () => {
      const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, () => ({
        speedKmh: 0,
        rpm: null,
      }));
      const verdict = evaluateRevvingIdleFacetBAssessability(
        canonicalizeMultichannelObservations(grid),
        V1B_SEQUENCE_MAX_GAP_SECONDS,
      );
      expect(verdict.assessable).toBe(false);
      expect(verdict.diagnostics.assessabilityReasonCodes).toContain('RPM_SPEED_CO_OBSERVATION_UNAVAILABLE');
    });
  });

  describe('PHEV local ICE confirmation stays per-sequence', () => {
    it('ICE rpm only in first block does not admit second-block candidate', () => {
      const aStart = Date.parse('2026-01-01T10:00:12.000Z');
      const blockA = Array.from({ length: B3_QUALIFYING_LABELS_PER_BLOCK }, (_, i) => ({
        recordedAtIso: new Date(aStart + i * 1000).toISOString(),
        loadPct: i === 0 ? 80 : 72,
        rpm: 2000,
        throttlePct: 35,
        speedKmh: 60,
      }));
      const bStart = aStart + (B3_QUALIFYING_LABELS_PER_BLOCK - 1) * 1000 + 3000;
      const blockB = Array.from({ length: B3_QUALIFYING_LABELS_PER_BLOCK }, (_, i) => ({
        recordedAtIso: new Date(bStart + i * 1000).toISOString(),
        loadPct: i === 0 ? 80 : 72,
        rpm: 2000,
        throttlePct: 35,
        speedKmh: 60,
      }));
      const canon = canonicalizeMultichannelObservations([...blockA, ...blockB]);
      const groups = splitBucketsAtAdmittedSequenceBoundaries(canon.buckets, V1B_SEQUENCE_MAX_GAP_SECONDS);
      expect(groups).toHaveLength(2);
      const withIce = groups[0]!.map((b) => ({ ...b, rpm: 500, throttlePct: 70 }));
      const throttleOnly = groups[1]!.map((b) => ({ ...b, rpm: null, throttlePct: 70 }));
      const first = detectGapAwareSustainedLoadCandidates({
        tripId: TRIP,
        providerSourceLinkId: LINK,
        fuelType: 'PHEV',
        isEvPowertrain: false,
        canon: { ...canon, buckets: withIce },
        sequenceMaxGapSeconds: V1B_SEQUENCE_MAX_GAP_SECONDS,
      });
      const second = detectGapAwareSustainedLoadCandidates({
        tripId: TRIP,
        providerSourceLinkId: LINK,
        fuelType: 'PHEV',
        isEvPowertrain: false,
        canon: { ...canon, buckets: throttleOnly },
        sequenceMaxGapSeconds: V1B_SEQUENCE_MAX_GAP_SECONDS,
      });
      expect(first.candidates).toHaveLength(1);
      expect(second.candidates).toHaveLength(0);
    });
  });
});
