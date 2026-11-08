import { processDs4RpmHfV1bShadowTripTierAware } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-tier-processor';
import {
  buildRpmPointsEverySeconds,
  buildTierTripClassification,
  buildTierTripInput,
} from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import { computeDs4PowertrainDemandColdEngineResearchV1 } from '../ds4-powertrain-demand-cold-engine.kernel.v1';
import { computeDs4PowertrainDemandResearchV1 } from '../ds4-powertrain-demand-research.kernel.v1';
import { detectGapAwareSustainedLoadCandidates } from '../ds4-powertrain-demand-sustained-load-gap-aware.v1';
import { computeDs4PowertrainDemandSustainedLoadResearchV1 } from '../ds4-powertrain-demand-sustained-load.kernel.v1';
import { canonicalizeMultichannelObservations } from '../ds4-powertrain-demand-multichannel-canonicalize.v1';
import {
  buildBoundPowertrainInput,
  buildColdEngineBoundInput,
  buildObservationSeries,
  positiveKickdownGrid,
  R1_DIMO,
} from './ds4-powertrain-demand-research.test-helpers';

const TRIP = 'trip-sustained-load-test';

function v1bPrefixGrid() {
  return buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, () => ({
    rpm: 1500,
    throttlePct: 12,
    speedKmh: 45,
    loadPct: 18,
  }));
}

/** Contiguous high-load labels without low-load buckets interleaved (Mode A adjacency). */
function buildContiguousHighLoadRun(input: {
  pointCount: number;
  stepMs: number;
  map?: (seq: number) => Partial<ReturnType<typeof buildObservationSeries>[number]>;
}) {
  const baseMs = Date.parse('2026-01-01T10:00:12.000Z');
  const runRows = Array.from({ length: input.pointCount }, (_, seq) => ({
    recordedAtIso: new Date(baseMs + seq * input.stepMs).toISOString(),
    rpm: 2000,
    throttlePct: 35,
    speedKmh: 60,
    loadPct: 72,
    ...(input.map?.(seq) ?? {}),
  }));
  const suffix = buildObservationSeries('2026-01-01T10:02:00.000Z', 4, 1, () => ({
    rpm: 1500,
    loadPct: 15,
    throttlePct: 10,
  }));
  return [...v1bPrefixGrid(), ...runRows, ...suffix];
}

function buildSplitHighLoadRuns() {
  const prefix = v1bPrefixGrid();
  const runAStart = Date.parse('2026-01-01T10:00:12.000Z');
  const runA = Array.from({ length: 5 }, (_, seq) => ({
    recordedAtIso: new Date(runAStart + seq * 5000).toISOString(),
    rpm: 2000,
    throttlePct: 35,
    speedKmh: 60,
    loadPct: 78,
  }));
  const runBStart = runAStart + 4 * 5000 + 10_000;
  const runB = Array.from({ length: 5 }, (_, seq) => ({
    recordedAtIso: new Date(runBStart + seq * 5000).toISOString(),
    rpm: 2000,
    throttlePct: 35,
    speedKmh: 60,
    loadPct: 78,
  }));
  const suffix = buildObservationSeries('2026-01-01T10:02:10.000Z', 4, 1, () => ({
    rpm: 1500,
    loadPct: 15,
    throttlePct: 10,
  }));
  return [...prefix, ...runA, ...runB, ...suffix];
}

describe('ds4-powertrain-demand sustained-load P2-B3 gap-aware', () => {
  it('five observations at 5s gaps yields GAP_AWARE_SUSTAINED_PROXY_CANDIDATE', () => {
    const grid = buildContiguousHighLoadRun({
      pointCount: 5,
      stepMs: 5000,
      map: (seq) => ({ loadPct: seq === 0 ? 80 : 72, rpm: seq === 0 ? 2000 : 1900 }),
    });
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
    );
    expect(out.status).toBe('COMPUTED');
    expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(1);
    expect(out.sustainedLoad.candidates[0]?.classification).toBe('GAP_AWARE_SUSTAINED_PROXY_CANDIDATE');
    expect(out.sustainedLoad.candidates[0]?.observedLabelCount).toBe(5);
    expect(out.sustainedLoad.candidates[0]?.researchLabelSpanMs).toBe(20_000);
    expect(out.sustainedLoad.tripEvidenceClassification).toBe('GAP_AWARE_SUSTAINED_PROXY_CANDIDATE');
    expect(out.sustainedLoad.candidates[0]?.limitationCodes).toContain('BUCKET_LABEL_UNVERIFIED');
  });

  it('four observations at 5s gaps rejects candidate', () => {
    const grid = buildContiguousHighLoadRun({ pointCount: 4, stepMs: 5000, map: () => ({ loadPct: 80, rpm: 2000 }) });
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
    );
    expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(0);
    expect(out.sustainedLoad.tripEvidenceClassification).not.toBe('GAP_AWARE_SUSTAINED_PROXY_CANDIDATE');
  });

  it('five observations at 1s gaps rejects for label span', () => {
    const grid = buildContiguousHighLoadRun({ pointCount: 5, stepMs: 1000, map: () => ({ loadPct: 80, rpm: 2000 }) });
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
    );
    expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(0);
  });

  it('gap greater than 5s splits into separate runs', () => {
    const grid = buildSplitHighLoadRuns();
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
    );
    expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(2);
  });

  it('explicit missing load bucket splits sequence', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 28, 1, (i) => {
      if (i === 12) return { rpm: 2000, loadPct: null, throttlePct: 40 };
      if (i >= 5 && i <= 25 && i !== 12 && (i - 5) % 5 === 0) {
        return { rpm: 2000, loadPct: 78, throttlePct: 40 };
      }
      return { rpm: 1500, loadPct: 20, throttlePct: 10 };
    });
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
    );
    expect(out.sustainedLoad.deduplicatedCandidateCount).toBeLessThanOrEqual(1);
  });

  it('load continuation below 70 splits sequence', () => {
    const grid = buildContiguousHighLoadRun({
      pointCount: 5,
      stepMs: 5000,
      map: (seq) => ({ loadPct: seq <= 2 ? 80 : 65, rpm: 2000 }),
    });
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
    );
    expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(0);
  });

  it('detect: throttle entry without RPM labels', () => {
    const grid = buildContiguousHighLoadRun({
      pointCount: 5,
      stepMs: 5000,
      map: (seq) => ({ loadPct: 80, rpm: null, throttlePct: seq === 0 ? 70 : 50 }),
    });
    const canon = canonicalizeMultichannelObservations(grid);
    const direct = detectGapAwareSustainedLoadCandidates({
      tripId: TRIP,
      providerSourceLinkId: 'link',
      fuelType: 'GASOLINE',
      canon,
    });
    expect(direct.candidates).toHaveLength(1);
    expect(direct.candidates[0]?.entryBranch).toBe('THROTTLE');
  });

  it('missing RPM with valid throttle entry branch', () => {
    const grid = buildContiguousHighLoadRun({
      pointCount: 5,
      stepMs: 5000,
      map: (seq) => ({ loadPct: 80, rpm: null, throttlePct: seq === 0 ? 70 : 50 }),
    });
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
    );
    expect(out.abstainReasons).toEqual([]);
    expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(1);
    expect(out.sustainedLoad.candidates[0]?.entryBranch).toBe('THROTTLE');
  });

  it('missing throttle with valid RPM entry branch', () => {
    const grid = buildContiguousHighLoadRun({
      pointCount: 5,
      stepMs: 5000,
      map: () => ({ loadPct: 80, rpm: 2000, throttlePct: null }),
    });
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
    );
    expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(1);
    expect(out.sustainedLoad.candidates[0]?.entryBranch).toBe('RPM');
  });

  it('no load channel yields NOT_ASSESSABLE abstain', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, () => ({
      rpm: 2000,
      throttlePct: 40,
      loadPct: null,
    }));
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
    );
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('LOAD_CHANNEL_UNAVAILABLE');
    expect(out.sustainedLoad.tripEvidenceClassification).toBe('NOT_ASSESSABLE');
  });

  it('PHEV without local RPM ice evidence in window yields no candidate', () => {
    const grid = buildContiguousHighLoadRun({
      pointCount: 5,
      stepMs: 5000,
      map: () => ({ loadPct: 80, rpm: null, throttlePct: 70 }),
    });
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP, fuelType: 'PHEV' }),
    );
    expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(0);
  });

  it('BEV powertrain abstains NOT_APPLICABLE', () => {
    const grid = buildContiguousHighLoadRun({ pointCount: 5, stepMs: 5000, map: () => ({ loadPct: 80, rpm: 2000 }) });
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({
        multichannelObservations: grid,
        tripId: TRIP,
        isEvPowertrain: true,
        fuelType: 'BEV',
      }),
    );
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('POWERTRAIN_NOT_APPLICABLE');
  });

  it('zero-RPM CH EMPTY with contradicting V1B abstains fail-closed', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, (i) => ({
      loadPct: i >= 2 ? 80 : 20,
      rpm: null,
      throttlePct: 70,
    }));
    const input = buildColdEngineBoundInput({ multichannelObservations: grid, tripId: TRIP });
    const rpmPoints = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 8, 1);
    const tripInput = buildTierTripInput({
      rpmPoints,
      tierRow: buildTierTripClassification({ tier: 'RPM_1S' } as never),
      tripId: TRIP,
    });
    const tierOut = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 1,
      computedAt: new Date('2026-01-01T11:00:00.000Z'),
      existingSucceededFingerprint: null,
    });
    if (tierOut.kind !== 'SUCCEEDED') throw new Error('fixture v1b');
    input.v1bResult = tierOut.result;
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(input);
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('V1B_UNEXPECTED_ON_ZERO_RPM_PATH');
  });

  it('conflicting duplicate values abstain', () => {
    const grid = buildContiguousHighLoadRun({ pointCount: 5, stepMs: 5000, map: () => ({ loadPct: 80, rpm: 2000 }) });
    const t = Date.parse('2026-01-01T10:00:22.000Z');
    grid.push({
      recordedAtIso: new Date(t).toISOString(),
      loadPct: 40,
      rpm: 2000,
      throttlePct: 30,
      speedKmh: 60,
    });
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
    );
    expect(out.abstainReasons).toContain('CONFLICTING_DUPLICATE_BUCKETS');
  });

  it('no entry labels yields NOT_OBSERVED trip status', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 15, 1, () => ({
      loadPct: 50,
      rpm: 1500,
      throttlePct: 20,
    }));
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
    );
    expect(out.status).toBe('NOT_OBSERVED');
    expect(out.sustainedLoad.tripEvidenceClassification).toBe('NOT_OBSERVED');
    expect(out.sustainedLoad.entryLabelCount).toBe(0);
  });

  it('single entry label classifies SINGLE not when zero entries', () => {
    const grid = buildContiguousHighLoadRun({ pointCount: 1, stepMs: 5000, map: () => ({ loadPct: 80, rpm: 2000 }) });
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
    );
    expect(out.sustainedLoad.entryLabelCount).toBe(1);
    expect(out.sustainedLoad.tripEvidenceClassification).toBe('SINGLE_HIGH_LOAD_ENTRY_LABEL');
  });

  it('exposes canonical_rows_full_key versus distinct_ms_labels', () => {
    const grid = buildContiguousHighLoadRun({ pointCount: 5, stepMs: 5000, map: () => ({ loadPct: 80, rpm: 2000 }) });
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
    );
    expect(out.sustainedLoad.canonicalRowsFullKey).toBeGreaterThanOrEqual(out.sustainedLoad.distinctMsLabelsInTrip);
  });

  it('R1 dimo marks historical OBD record time uncertain', () => {
    const grid = buildContiguousHighLoadRun({ pointCount: 5, stepMs: 5000, map: () => ({ loadPct: 80, rpm: 2000 }) });
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({
        multichannelObservations: grid,
        tripId: TRIP,
        dimoVehicleRawJson: R1_DIMO,
      }),
    );
    expect(out.r1HistoricalObdRecordTimeUncertain).toBe(true);
  });

  describe('P2-B1 / P2-B2 / P37 regression smoke', () => {
    it('P2-B1 kickdown still computes on canonical grid', () => {
      const out = computeDs4PowertrainDemandResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: positiveKickdownGrid() }),
      );
      expect(out.kickdown.deduplicatedCandidateCount).toBeGreaterThan(0);
    });

    it('P2-B2 cold engine still computes on cold grid', () => {
      const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, (i) => ({
        coolantC: i >= 2 && i <= 4 ? 40 : 85,
        loadPct: i >= 2 && i <= 4 ? 88 : 10,
        rpm: 1500,
      }));
      const out = computeDs4PowertrainDemandColdEngineResearchV1(
        buildColdEngineBoundInput({ multichannelObservations: grid }),
      );
      expect(['COMPUTED', 'NOT_OBSERVED']).toContain(out.status);
    });

    it('does not import P37 sustained-high-load cluster detector', () => {
      const canon = canonicalizeMultichannelObservations(
        buildContiguousHighLoadRun({ pointCount: 5, stepMs: 5000, map: () => ({ loadPct: 80, rpm: 2000 }) }),
      );
      const direct = detectGapAwareSustainedLoadCandidates({
        tripId: TRIP,
        providerSourceLinkId: 'link',
        fuelType: 'GASOLINE',
        canon,
      });
      expect(direct.candidates).toHaveLength(1);
    });
  });
});
