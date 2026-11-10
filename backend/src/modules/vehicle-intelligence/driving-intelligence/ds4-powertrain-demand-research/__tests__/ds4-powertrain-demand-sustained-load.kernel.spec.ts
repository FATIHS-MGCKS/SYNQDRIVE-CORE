import { processDs4RpmHfV1bShadowTripTierAware } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-tier-processor';
import {
  buildRpmPointsEverySeconds,
  buildTierTripClassification,
  buildTierTripInput,
} from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import { computeDs4PowertrainDemandColdEngineResearchV1 } from '../ds4-powertrain-demand-cold-engine.kernel.v1';
import { computeDs4PowertrainDemandResearchV1 } from '../ds4-powertrain-demand-research.kernel.v1';
import {
  SUSTAINED_HIGH_LOAD_SHADOW_POLICY,
  SUSTAINED_HIGH_LOAD_SHADOW_POLICY_VERSION,
} from '../../../shadow-detector/detectors/sustained-high-load-shadow.policy';
import {
  detectGapAwareSustainedLoadCandidates,
  resolveSustainedLoadEntryBranch,
} from '../ds4-powertrain-demand-sustained-load-gap-aware.v1';
import { DS4_SUSTAINED_LOAD_GAP_AWARE_RESEARCH_POLICY_VERSION } from '../ds4-powertrain-demand-research.contract.v1';
import {
  DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY,
  DS4_SUSTAINED_LOAD_RESEARCH_MIN_OBSERVATIONS,
} from '../ds4-powertrain-demand-sustained-load-reference.v1';
import { computeDs4PowertrainDemandSustainedLoadResearchV1 } from '../ds4-powertrain-demand-sustained-load.kernel.v1';
import { canonicalizeMultichannelObservations } from '../ds4-powertrain-demand-multichannel-canonicalize.v1';
import { computeMultichannelContentFingerprint } from '../ds4-powertrain-demand-research.input-binding.v1';
import { resolveTelemetrySourceFamily } from '../../../telemetry-source-family';
import {
  buildBoundPowertrainInput,
  buildColdEngineBoundInput,
  buildObservationSeries,
  positiveKickdownGrid,
  R1_DIMO,
} from './ds4-powertrain-demand-research.test-helpers';

const TRIP = 'trip-sustained-load-test';
/** v1b RPM_1S admitted multichannel sequence boundary (binding-authoritative). */
const V1B_SEQUENCE_MAX_GAP_SECONDS = 2;

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

  it('missing load bucket splits an otherwise qualifying sustained sequence', () => {
    const controlGrid = buildContiguousHighLoadRun({
      pointCount: 5,
      stepMs: 5000,
      map: () => ({ loadPct: 80, rpm: 2000 }),
    });
    const control = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: controlGrid, tripId: TRIP }),
    );
    expect(control.sustainedLoad.deduplicatedCandidateCount).toBe(1);
    expect(control.sustainedLoad.tripEvidenceClassification).toBe('GAP_AWARE_SUSTAINED_PROXY_CANDIDATE');

    const adversarialGrid = buildContiguousHighLoadRun({
      pointCount: 5,
      stepMs: 5000,
      map: (seq) => (seq === 2 ? { loadPct: null, rpm: 2000, throttlePct: 35 } : { loadPct: 80, rpm: 2000 }),
    });
    const adversarial = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: adversarialGrid, tripId: TRIP }),
    );
    expect(adversarial.sustainedLoad.deduplicatedCandidateCount).toBe(0);
    expect(adversarial.sustainedLoad.tripEvidenceClassification).not.toBe('GAP_AWARE_SUSTAINED_PROXY_CANDIDATE');
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
      isEvPowertrain: false,
      canon,
    sequenceMaxGapSeconds: V1B_SEQUENCE_MAX_GAP_SECONDS,
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
        isEvPowertrain: false,
        canon,
      sequenceMaxGapSeconds: V1B_SEQUENCE_MAX_GAP_SECONDS,
      });
      expect(direct.candidates).toHaveLength(1);
    });
  });

  describe('all-paths powertrain classification', () => {
    function hybridRun(map: (seq: number) => Record<string, unknown>) {
      return buildContiguousHighLoadRun({ pointCount: 5, stepMs: 5000, map: (seq) => map(seq) as never });
    }

    it('A: PLUG_IN_HYBRID with one qualifying local RPM and throttle => no candidate', () => {
      const grid = hybridRun((seq) => ({
        loadPct: 80,
        rpm: seq === 0 ? 450 : null,
        throttlePct: 70,
      }));
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP, fuelType: 'PLUG_IN_HYBRID' }),
      );
      expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(0);
    });

    it('B: PLUG_IN_HYBRID with three qualifying local RPM labels => candidate admitted', () => {
      const grid = hybridRun((seq) => ({
        loadPct: 80,
        rpm: seq < 3 ? 500 : null,
        throttlePct: 70,
      }));
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP, fuelType: 'PLUG_IN_HYBRID' }),
      );
      expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(1);
    });

    it('C: HYBRID with insufficient local RPM evidence => no candidate', () => {
      const grid = hybridRun((seq) => ({
        loadPct: 80,
        rpm: seq < 2 ? 500 : null,
        throttlePct: 70,
      }));
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP, fuelType: 'HYBRID' }),
      );
      expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(0);
    });

    it('D: ELECTRIC with isEvPowertrain=false and RPM grid => ABSTAINED NOT_APPLICABLE', () => {
      const grid = buildContiguousHighLoadRun({ pointCount: 5, stepMs: 5000, map: () => ({ loadPct: 80, rpm: 2000 }) });
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
        buildBoundPowertrainInput({
          multichannelObservations: grid,
          tripId: TRIP,
          fuelType: 'ELECTRIC',
          isEvPowertrain: false,
        }),
      );
      expect(out.status).toBe('ABSTAINED');
      expect(out.abstainReasons).toContain('POWERTRAIN_NOT_APPLICABLE');
    });

    it('E: fuelType=null with RPM present => fail closed', () => {
      const grid = buildContiguousHighLoadRun({ pointCount: 5, stepMs: 5000, map: () => ({ loadPct: 80, rpm: 2000 }) });
      const input = buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP });
      input.fuelType = null;
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(input);
      expect(out.status).toBe('ABSTAINED');
      expect(out.abstainReasons).toContain('ICE_OPERATION_NOT_CONFIRMED');
    });

    it('F: GASOLINE with valid RPM evidence => positive control unchanged', () => {
      const grid = buildContiguousHighLoadRun({ pointCount: 5, stepMs: 5000, map: () => ({ loadPct: 80, rpm: 2000 }) });
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP, fuelType: 'GASOLINE' }),
      );
      expect(out.status).toBe('COMPUTED');
      expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(1);
    });
  });

  describe('architect remediation P1/P2', () => {
    function phevRun(map: (seq: number) => Record<string, unknown>) {
      return buildContiguousHighLoadRun({ pointCount: 5, stepMs: 5000, map: (seq) => map(seq) as never });
    }

    it('P37 literal threshold and policy-version pin (independent of live P37 object identity)', () => {
      expect(SUSTAINED_HIGH_LOAD_SHADOW_POLICY_VERSION).toBe('sustained-high-load-shadow-v1');
      expect(DS4_SUSTAINED_LOAD_GAP_AWARE_RESEARCH_POLICY_VERSION).toBe(
        'sustained-load-gap-aware-research-v1.1',
      );
      expect(DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.shadowPolicyVersion).toBe(
        'sustained-high-load-shadow-v1',
      );
      expect(DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.highEngineLoadEntryPct).toBe(75);
      expect(DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.highEngineLoadContinuePct).toBe(70);
      expect(DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.minRpm).toBe(1800);
      expect(DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.highThrottlePct).toBe(65);
      expect(DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.minResearchLabelSpanMs).toBe(20_000);
      expect(DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.maxAdjacentLabelGapMs).toBe(5000);
      expect(DS4_SUSTAINED_LOAD_RESEARCH_MIN_OBSERVATIONS).toBe(5);
      expect(DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.minObservations).toBe(5);
      expect(SUSTAINED_HIGH_LOAD_SHADOW_POLICY.minClusterSamples).toBe(4);
      expect(SUSTAINED_HIGH_LOAD_SHADOW_POLICY.minClusterSamples).not.toBe(
        DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.minObservations,
      );
    });

    describe('direct detector fail-closed (exported API boundary)', () => {
      function gasolineValidCanon() {
        return canonicalizeMultichannelObservations(
          buildContiguousHighLoadRun({ pointCount: 5, stepMs: 5000, map: () => ({ loadPct: 80, rpm: 2000 }) }),
        );
      }

      function phevThreeIceRpmCanon() {
        return canonicalizeMultichannelObservations(
          buildContiguousHighLoadRun({
            pointCount: 5,
            stepMs: 5000,
            map: (seq) => ({ loadPct: 80, rpm: seq < 3 ? 500 : null, throttlePct: 70 }),
          }),
        );
      }

      function throttleOnlyCanon() {
        return canonicalizeMultichannelObservations(
          buildContiguousHighLoadRun({
            pointCount: 5,
            stepMs: 5000,
            map: (seq) => ({ loadPct: 80, rpm: null, throttlePct: seq === 0 ? 70 : 50 }),
          }),
        );
      }

      const emptyDetect = { candidates: [], entryLabelCount: 0, longestRunLabelCount: 0 };

      it('ELECTRIC with RPM labels => zero candidates', () => {
        const d = detectGapAwareSustainedLoadCandidates({
          tripId: TRIP,
          providerSourceLinkId: 'link',
          fuelType: 'ELECTRIC',
          isEvPowertrain: false,
          canon: gasolineValidCanon(),
        sequenceMaxGapSeconds: V1B_SEQUENCE_MAX_GAP_SECONDS,
        });
        expect(d).toEqual(emptyDetect);
      });

      it('ELECTRIC without RPM => zero candidates', () => {
        const d = detectGapAwareSustainedLoadCandidates({
          tripId: TRIP,
          providerSourceLinkId: 'link',
          fuelType: 'ELECTRIC',
          isEvPowertrain: false,
          canon: throttleOnlyCanon(),
        sequenceMaxGapSeconds: V1B_SEQUENCE_MAX_GAP_SECONDS,
        });
        expect(d).toEqual(emptyDetect);
      });

      it('fuelType=null => zero candidates', () => {
        const d = detectGapAwareSustainedLoadCandidates({
          tripId: TRIP,
          providerSourceLinkId: 'link',
          fuelType: null,
          isEvPowertrain: false,
          canon: gasolineValidCanon(),
        sequenceMaxGapSeconds: V1B_SEQUENCE_MAX_GAP_SECONDS,
        });
        expect(d).toEqual(emptyDetect);
      });

      it('UNKNOWN fuel token => zero candidates', () => {
        const d = detectGapAwareSustainedLoadCandidates({
          tripId: TRIP,
          providerSourceLinkId: 'link',
          fuelType: 'UNKNOWN_FUEL_TOKEN',
          isEvPowertrain: false,
          canon: gasolineValidCanon(),
        sequenceMaxGapSeconds: V1B_SEQUENCE_MAX_GAP_SECONDS,
        });
        expect(d).toEqual(emptyDetect);
      });

      it('GASOLINE with isEvPowertrain=true (contradiction) => zero candidates', () => {
        const d = detectGapAwareSustainedLoadCandidates({
          tripId: TRIP,
          providerSourceLinkId: 'link',
          fuelType: 'GASOLINE',
          isEvPowertrain: true,
          canon: gasolineValidCanon(),
        sequenceMaxGapSeconds: V1B_SEQUENCE_MAX_GAP_SECONDS,
        });
        expect(d).toEqual(emptyDetect);
      });

      it('PHEV with 3 qualifying local RPM in sequence => one candidate', () => {
        const d = detectGapAwareSustainedLoadCandidates({
          tripId: TRIP,
          providerSourceLinkId: 'link',
          fuelType: 'PHEV',
          isEvPowertrain: false,
          canon: phevThreeIceRpmCanon(),
        sequenceMaxGapSeconds: V1B_SEQUENCE_MAX_GAP_SECONDS,
        });
        expect(d.candidates).toHaveLength(1);
        expect(d.entryLabelCount).toBeGreaterThan(0);
      });

      it('GASOLINE valid sequence => one candidate', () => {
        const d = detectGapAwareSustainedLoadCandidates({
          tripId: TRIP,
          providerSourceLinkId: 'link',
          fuelType: 'GASOLINE',
          isEvPowertrain: false,
          canon: gasolineValidCanon(),
        sequenceMaxGapSeconds: V1B_SEQUENCE_MAX_GAP_SECONDS,
        });
        expect(d.candidates).toHaveLength(1);
      });
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
        isEvPowertrain: false,
        canon,
      sequenceMaxGapSeconds: V1B_SEQUENCE_MAX_GAP_SECONDS,
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
          isEvPowertrain: false,
          canon,
          sequenceMaxGapSeconds: V1B_SEQUENCE_MAX_GAP_SECONDS,
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
          isEvPowertrain: false,
          canon,
          sequenceMaxGapSeconds: V1B_SEQUENCE_MAX_GAP_SECONDS,
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
        isEvPowertrain: false,
        canon,
      sequenceMaxGapSeconds: V1B_SEQUENCE_MAX_GAP_SECONDS,
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
      expect(out.sustainedLoad.coverageEvidence.loadMissingBucketCount).toBe(8);
      expect(out.sustainedLoad.coverageEvidence.gridBucketCount).toBe(12);
      expect(out.sustainedLoad.canonicalRowsFullKey).toBe(12);
      expect(out.sustainedLoad.distinctMsLabelsInTrip).toBe(12);
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

    it('3 load labels sole failure: INSUFFICIENT_OBSERVATIONS with consistent canonical coverage', () => {
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: gridWithLoadLabels(3), tripId: TRIP }),
      );
      expect(out.status).toBe('ABSTAINED');
      expect(out.abstainReasons).toEqual(['INSUFFICIENT_LOAD_LABEL_OBSERVATIONS']);
      expect(out.sustainedLoad.tripEvidenceClassification).toBe('INSUFFICIENT_OBSERVATIONS');
      expect(out.sustainedLoad.coverageEvidence.loadPresentBucketCount).toBe(3);
      expect(out.sustainedLoad.coverageEvidence.loadMissingBucketCount).toBe(9);
      expect(out.sustainedLoad.coverageEvidence.gridBucketCount).toBe(12);
      expect(out.sustainedLoad.canonicalRowsFullKey).toBe(12);
      expect(out.sustainedLoad.distinctMsLabelsInTrip).toBe(12);
    });

    it('3 load labels + tampered V1B sequenceStats: NOT_ASSESSABLE with zero trusted counts', () => {
      const input = buildBoundPowertrainInput({
        multichannelObservations: gridWithLoadLabels(3),
        tripId: TRIP,
      });
      input.v1bResult = {
        ...input.v1bResult!,
        sequenceStats: {
          ...input.v1bResult!.sequenceStats,
          continuousSequenceCount: 9_999,
        },
      };
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(input);
      expect(out.status).toBe('ABSTAINED');
      expect(out.abstainReasons).toContain('V1B_SEQUENCE_PARITY_MISMATCH');
      expect(out.abstainReasons).toContain('INSUFFICIENT_LOAD_LABEL_OBSERVATIONS');
      expect(out.sustainedLoad.tripEvidenceClassification).toBe('NOT_ASSESSABLE');
      expect(out.sustainedLoad.coverageEvidence.loadPresentBucketCount).toBe(0);
      expect(out.sustainedLoad.canonicalRowsFullKey).toBe(0);
    });

    it('V1A RPM grid stripped while V1A points remain: fail closed', () => {
      const grid = buildContiguousHighLoadRun({
        pointCount: 5,
        stepMs: 5000,
        map: () => ({ loadPct: 80, rpm: 2000 }),
      });
      const input = buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP });
      input.multichannelObservations = input.multichannelObservations.map((row) => ({ ...row, rpm: null }));
      const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson) ?? 'UNKNOWN';
      input.multichannelFingerprint = computeMultichannelContentFingerprint({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tripId: input.tripId,
        providerSourceLinkId: input.providerSourceLinkId,
        telemetrySourceFamily: family,
        observations: input.multichannelObservations,
      });
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(input);
      expect(out.status).toBe('ABSTAINED');
      expect(out.abstainReasons).toContain('RPM_V1A_UNMATCHED_LABEL');
      expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(0);
    });

    it('zero-RPM path: processingAllowed=false abstains', () => {
      const grid = buildContiguousHighLoadRun({
        pointCount: 5,
        stepMs: 5000,
        map: (seq) => ({ loadPct: 80, rpm: null, throttlePct: seq === 0 ? 70 : 50 }),
      }).map((row) => ({ ...row, rpm: null }));
      const input = buildColdEngineBoundInput({ multichannelObservations: grid, tripId: TRIP });
      input.tripInput = {
        ...input.tripInput,
        admission: { ...input.tripInput.admission, processingAllowed: false },
      };
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(input);
      expect(out.abstainReasons).toContain('TRIP_ADMISSION_NOT_ALLOWED');
      expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(0);
    });

    it('zero-RPM path: iceRpmApplicability NOT_APPLICABLE abstains', () => {
      const grid = buildContiguousHighLoadRun({
        pointCount: 5,
        stepMs: 5000,
        map: (seq) => ({ loadPct: 80, rpm: null, throttlePct: seq === 0 ? 70 : 50 }),
      }).map((row) => ({ ...row, rpm: null }));
      const input = buildColdEngineBoundInput({ multichannelObservations: grid, tripId: TRIP });
      input.tripInput = {
        ...input.tripInput,
        admission: { ...input.tripInput.admission, iceRpmApplicability: 'NOT_APPLICABLE' },
      };
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(input);
      expect(out.abstainReasons).toContain('ICE_APPLICABILITY_NOT_ADMITTED');
    });

    function zeroRpmThrottleOnlyGrid() {
      const prefix = buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, () => ({
        rpm: null,
        loadPct: 18,
        throttlePct: 12,
      }));
      const runRows = buildContiguousHighLoadRun({
        pointCount: 5,
        stepMs: 5000,
        map: (seq) => ({ loadPct: 80, rpm: null, throttlePct: seq === 0 ? 70 : 50 }),
      })
        .slice(8, 13)
        .map((row) => ({ ...row, rpm: null }));
      return [...prefix, ...runRows];
    }

    it.each([['PLUG_IN_HYBRID'], ['PHEV'], ['HYBRID'], ['ELECTRIC']] as const)(
      'zero-RPM path: fuelType %s without RPM abstains (fail-closed powertrain)',
      (fuelType) => {
        const input = buildColdEngineBoundInput({
          multichannelObservations: zeroRpmThrottleOnlyGrid(),
          tripId: TRIP,
          fuelType,
          isEvPowertrain: fuelType === 'ELECTRIC' ? false : undefined,
        });
        const out = computeDs4PowertrainDemandSustainedLoadResearchV1(input);
        expect(out.status).toBe('ABSTAINED');
        expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(0);
      },
    );

    it('zero-RPM path: fuelType null without RPM abstains', () => {
      const input = buildColdEngineBoundInput({
        multichannelObservations: zeroRpmThrottleOnlyGrid(),
        tripId: TRIP,
      });
      input.fuelType = null;
      const out = computeDs4PowertrainDemandSustainedLoadResearchV1(input);
      expect(out.status).toBe('ABSTAINED');
      expect(out.abstainReasons).toContain('ICE_OPERATION_NOT_CONFIRMED');
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
