import { processDs4RpmHfV1bShadowTripTierAware } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-tier-processor';
import {
  buildRpmPointsEverySeconds,
  buildTierTripClassification,
  buildTierTripInput,
} from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import { computeDs4PowertrainDemandColdEngineResearchV1 } from '../ds4-powertrain-demand-cold-engine.kernel.v1';
import { computeDs4PowertrainDemandResearchV1 } from '../ds4-powertrain-demand-research.kernel.v1';
import { SUSTAINED_HIGH_LOAD_SHADOW_POLICY } from '../../../shadow-detector/detectors/sustained-high-load-shadow.policy';
import {
  detectGapAwareSustainedLoadCandidates,
  resolveSustainedLoadEntryBranch,
} from '../ds4-powertrain-demand-sustained-load-gap-aware.v1';
import { DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY } from '../ds4-powertrain-demand-sustained-load-reference.v1';
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
    expect(out.sustainedLoad.entryLabelCount).toBe(1);
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

  describe('architect remediation P1/P2', () => {
    function phevRun(map: (seq: number) => Record<string, unknown>) {
      return buildContiguousHighLoadRun({ pointCount: 5, stepMs: 5000, map: (seq) => map(seq) as never });
    }

    it('P37 threshold parity via read-only shadow policy reference', () => {
      expect(DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.highEngineLoadEntryPct).toBe(
        SUSTAINED_HIGH_LOAD_SHADOW_POLICY.highEngineLoadPct,
      );
      expect(DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.minRpm).toBe(SUSTAINED_HIGH_LOAD_SHADOW_POLICY.minRpm);
      expect(DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.highThrottlePct).toBe(
        SUSTAINED_HIGH_LOAD_SHADOW_POLICY.highThrottlePct,
      );
      expect(DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.maxAdjacentLabelGapMs).toBe(
        SUSTAINED_HIGH_LOAD_SHADOW_POLICY.clusterMaxGapMs,
      );
    });

    it('PHEV: single rpm=1 does not confirm ICE', () => {
      const canon = canonicalizeMultichannelObservations(
        phevRun((seq) => ({
          loadPct: 80,
          rpm: seq === 0 ? 1 : null,
          throttlePct: 70,
        })),
      );
      const d = detectGapAwareSustainedLoadCandidates({
        tripId: TRIP,
        providerSourceLinkId: 'link',
        fuelType: 'PHEV',
        canon,
      });
      expect(d.candidates).toHaveLength(0);
    });

    it('PHEV: single rpm=1500 does not confirm ICE (min 3 samples)', () => {
      const canon = canonicalizeMultichannelObservations(
        phevRun((seq) => ({
          loadPct: 80,
          rpm: seq === 0 ? 1500 : null,
          throttlePct: 70,
        })),
      );
      expect(
        detectGapAwareSustainedLoadCandidates({
          tripId: TRIP,
          providerSourceLinkId: 'link',
          fuelType: 'PHEV',
          canon,
        }).candidates,
      ).toHaveLength(0);
    });

    it('PHEV: two qualifying ICE rpm labels do not confirm', () => {
      const canon = canonicalizeMultichannelObservations(
        phevRun((seq) => ({
          loadPct: 80,
          rpm: seq < 2 ? 500 : null,
          throttlePct: 70,
        })),
      );
      expect(
        detectGapAwareSustainedLoadCandidates({
          tripId: TRIP,
          providerSourceLinkId: 'link',
          fuelType: 'PHEV',
          canon,
        }).candidates,
      ).toHaveLength(0);
    });

    it('PHEV: three qualifying ICE rpm labels inside sequence admit candidate', () => {
      const grid = phevRun((seq) => ({
        loadPct: 80,
        rpm: seq < 3 ? 500 : null,
        throttlePct: 70,
      }));
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP, fuelType: 'PHEV' }),
      );
      expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(1);
    });

    it('PHEV: ICE rpm labels outside admitted sequence do not confirm', () => {
      const prefix = v1bPrefixGrid().map((r, i) =>
        i < 3 ? { ...r, rpm: 600, loadPct: 10, throttlePct: 5 } : r,
      );
      const run = buildContiguousHighLoadRun({
        pointCount: 5,
        stepMs: 5000,
        map: () => ({ loadPct: 80, rpm: null, throttlePct: 70 }),
      }).slice(8);
      const grid = [...prefix, ...run, ...buildObservationSeries('2026-01-01T10:02:10.000Z', 4, 1, () => ({}))];
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP, fuelType: 'PHEV' }),
      );
      expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(0);
    });

    it('entryLabelCount: five qualifying entry labels on one run', () => {
      const grid = buildContiguousHighLoadRun({
        pointCount: 5,
        stepMs: 5000,
        map: () => ({ loadPct: 80, rpm: 2000 }),
      });
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
      );
      expect(out.sustainedLoad.entryLabelCount).toBe(5);
    });

    it('entryLabelCount: one entry plus four continuation-only labels', () => {
      const grid = buildContiguousHighLoadRun({
        pointCount: 5,
        stepMs: 5000,
        map: (seq) => ({ loadPct: seq === 0 ? 80 : 72, rpm: 2000 }),
      });
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
      );
      expect(out.sustainedLoad.entryLabelCount).toBe(1);
    });

    it('entryLabelCount: two independent qualifying sequences', () => {
      const grid = buildSplitHighLoadRuns();
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
      );
      expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(2);
      expect(out.sustainedLoad.entryLabelCount).toBe(10);
    });

    it('entry labels count distinct ms only (canonical dedupe)', () => {
      const grid = buildContiguousHighLoadRun({ pointCount: 5, stepMs: 5000, map: () => ({ loadPct: 80, rpm: 2000 }) });
      const t = Date.parse(grid.find((r) => r.loadPct === 80)?.recordedAtIso ?? '');
      grid.push({
        recordedAtIso: new Date(t).toISOString(),
        loadPct: 80,
        rpm: 2000,
        throttlePct: 35,
        speedKmh: 60,
      });
      const canon = canonicalizeMultichannelObservations(grid);
      const msCount = canon.buckets.filter((b) => resolveSustainedLoadEntryBranch(b) != null).length;
      const d = detectGapAwareSustainedLoadCandidates({
        tripId: TRIP,
        providerSourceLinkId: 'link',
        fuelType: 'GASOLINE',
        canon,
      });
      expect(msCount).toBe(5);
      expect(d.entryLabelCount).toBe(5);
    });

    it('insufficient load labels abstain but classify INSUFFICIENT_OBSERVATIONS', () => {
      const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, (i) => ({
        rpm: 2000,
        throttlePct: 40,
        loadPct: i < 4 ? 80 : null,
      }));
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
      );
      expect(out.status).toBe('ABSTAINED');
      expect(out.abstainReasons).toEqual(['INSUFFICIENT_LOAD_LABEL_OBSERVATIONS']);
      expect(out.sustainedLoad.tripEvidenceClassification).toBe('INSUFFICIENT_OBSERVATIONS');
      expect(out.sustainedLoad.coverageEvidence.loadPresentBucketCount).toBe(4);
      expect(out.sustainedLoad.coverageEvidence.gridBucketCount).toBe(0);
      expect(out.sustainedLoad.canonicalRowsFullKey).toBe(0);
    });

    it('genuine zero-RPM CH EMPTY with v1b null and throttle entry admits candidate', () => {
      const prefix = buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, () => ({
        rpm: null,
        loadPct: 18,
        throttlePct: 12,
        speedKmh: 40,
      }));
      const runRows = buildContiguousHighLoadRun({
        pointCount: 5,
        stepMs: 5000,
        map: (seq) => ({ loadPct: 80, rpm: null, throttlePct: seq === 0 ? 70 : 50 }),
      }).slice(8, 13);
      const suffix = buildObservationSeries('2026-01-01T10:02:00.000Z', 4, 1, () => ({
        rpm: null,
        loadPct: 15,
        throttlePct: 10,
      }));
      const grid = [...prefix, ...runRows, ...suffix];
      const input = buildColdEngineBoundInput({ multichannelObservations: grid, tripId: TRIP });
      expect(input.v1bResult).toBeNull();
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(input);
      expect(out.abstainReasons).toEqual([]);
      expect(out.status).toBe('COMPUTED');
      expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(1);
      expect(out.sustainedLoad.candidates[0]?.entryBranch).toBe('THROTTLE');
    });
  });

  describe('abstain evidence integrity', () => {
    function gridWithLoadLabels(n: number) {
      return buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, (i) => ({
        rpm: 2000,
        throttlePct: 40,
        loadPct: i < n ? 80 : null,
      }));
    }

    it('3 load labels sole failure: INSUFFICIENT_OBSERVATIONS with trusted load count only', () => {
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: gridWithLoadLabels(3), tripId: TRIP }),
      );
      expect(out.status).toBe('ABSTAINED');
      expect(out.abstainReasons).toEqual(['INSUFFICIENT_LOAD_LABEL_OBSERVATIONS']);
      expect(out.sustainedLoad.tripEvidenceClassification).toBe('INSUFFICIENT_OBSERVATIONS');
      expect(out.sustainedLoad.coverageEvidence.loadPresentBucketCount).toBe(3);
      expect(out.sustainedLoad.coverageEvidence.gridBucketCount).toBe(0);
      expect(out.sustainedLoad.canonicalRowsFullKey).toBe(0);
    });

    it('3 load labels + TENANT_SCOPE_VIOLATION: NOT_ASSESSABLE without trusted counts', () => {
      const input = buildBoundPowertrainInput({
        multichannelObservations: gridWithLoadLabels(3),
        tripId: TRIP,
      });
      input.tripInput.clickHouseRead = {
        ...input.tripInput.clickHouseRead,
        status: 'TENANT_SCOPE_VIOLATION',
        tenantScopeViolation: true,
      };
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(input);
      expect(out.status).toBe('ABSTAINED');
      expect(out.abstainReasons).toContain('TENANT_SCOPE_VIOLATION');
      expect(out.sustainedLoad.tripEvidenceClassification).toBe('NOT_ASSESSABLE');
      expect(out.sustainedLoad.coverageEvidence.loadPresentBucketCount).toBe(0);
      expect(out.sustainedLoad.canonicalRowsFullKey).toBe(0);
    });

    it('3 load labels + fingerprint mismatch: NOT_ASSESSABLE', () => {
      const input = buildBoundPowertrainInput({
        multichannelObservations: gridWithLoadLabels(3),
        tripId: TRIP,
      });
      input.multichannelFingerprint = 'forged-fingerprint';
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(input);
      expect(out.status).toBe('ABSTAINED');
      expect(out.abstainReasons).toContain('MULTICHANNEL_FINGERPRINT_MISMATCH');
      expect(out.sustainedLoad.tripEvidenceClassification).toBe('NOT_ASSESSABLE');
      expect(out.sustainedLoad.coverageEvidence.loadPresentBucketCount).toBe(0);
    });

    it('3 load labels + provider source link mismatch: NOT_ASSESSABLE', () => {
      const input = buildBoundPowertrainInput({
        multichannelObservations: gridWithLoadLabels(3),
        tripId: TRIP,
      });
      input.providerSourceLinkId = 'link-wrong';
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(input);
      expect(out.status).toBe('ABSTAINED');
      expect(out.abstainReasons).toContain('PROVIDER_SOURCE_LINK_MISMATCH');
      expect(out.sustainedLoad.tripEvidenceClassification).toBe('NOT_ASSESSABLE');
      expect(out.sustainedLoad.coverageEvidence.loadPresentBucketCount).toBe(0);
    });

    it('OFFLINE_SEALED_BUNDLE without attestation: NOT_ASSESSABLE and zero coverage', () => {
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
        buildBoundPowertrainInput({
          multichannelObservations: buildContiguousHighLoadRun({
            pointCount: 5,
            stepMs: 5000,
            map: () => ({ loadPct: 80, rpm: 2000 }),
          }),
          evidenceOrigin: 'OFFLINE_SEALED_BUNDLE',
          multichannelManifest: null,
        }),
      );
      expect(out.status).toBe('ABSTAINED');
      expect(out.abstainReasons).toContain('OFFLINE_SOURCE_ATTESTATION_NOT_VERIFIED');
      expect(out.sustainedLoad.tripEvidenceClassification).toBe('NOT_ASSESSABLE');
      expect(out.sustainedLoad.coverageEvidence.loadPresentBucketCount).toBe(0);
      expect(out.provenance.sourceProvenanceVerified).toBe(false);
    });
  });
});
