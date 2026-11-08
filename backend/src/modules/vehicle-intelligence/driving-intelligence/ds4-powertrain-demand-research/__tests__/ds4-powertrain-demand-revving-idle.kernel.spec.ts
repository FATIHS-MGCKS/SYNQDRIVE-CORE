import {
  EXCESSIVE_IDLING_SHADOW_POLICY,
  EXCESSIVE_IDLING_SHADOW_POLICY_VERSION,
} from '../../../shadow-detector/detectors/excessive-idling-shadow.policy';
import {
  HIGH_RPM_STATIONARY_SHADOW_POLICY,
  HIGH_RPM_STATIONARY_SHADOW_POLICY_VERSION,
} from '../../../shadow-detector/detectors/high-rpm-stationary-shadow.policy';
import { computeDs4PowertrainDemandColdEngineResearchV1 } from '../ds4-powertrain-demand-cold-engine.kernel.v1';
import { computeDs4PowertrainDemandResearchV1 } from '../ds4-powertrain-demand-research.kernel.v1';
import { computeDs4PowertrainDemandSustainedLoadResearchV1 } from '../ds4-powertrain-demand-sustained-load.kernel.v1';
import { DS4_REVIVING_IDLE_DUAL_FACET_RESEARCH_POLICY_VERSION } from '../ds4-powertrain-demand-research.contract.v1';
import {
  DS4_REVIVING_IDLE_DUAL_FACET_POLICY,
  detectRevvingIdleDualFacetCandidates,
} from '../ds4-powertrain-demand-revving-idle-dual-facet.v1';
import { computeDs4PowertrainDemandRevvingIdleResearchV1 } from '../ds4-powertrain-demand-revving-idle.kernel.v1';
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

const TRIP = 'trip-revving-idle-b4';

function v1bPrefixGrid() {
  return buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, () => ({
    rpm: 850,
    speedKmh: 2,
    throttlePct: 8,
    loadPct: 12,
  }));
}

function v1bMovingPrefixGrid() {
  return buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, () => ({
    rpm: 1800,
    speedKmh: 40,
    throttlePct: 20,
    loadPct: 30,
  }));
}

function withPrefix(run: ReturnType<typeof buildObservationSeries>) {
  return [...v1bPrefixGrid(), ...run];
}

describe('ds4-powertrain-demand P2-B4 revving-idle dual-facet', () => {
  it('1 revving positive at 2000 RPM stationary', () => {
    const rev = buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, (i) => ({
      speedKmh: 0,
      rpm: 2000 + i * 50,
    }));
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: withPrefix(rev), tripId: TRIP }),
    );
    expect(out.status).toBe('COMPUTED');
    expect(out.revvingIdle.facetA.deduplicatedCandidateCount).toBe(1);
    expect(out.revvingIdle.facetA.tripEvidenceClassification).toBe('HIGH_RPM_STATIONARY_LIKE_PROXY_CANDIDATE');
    expect(out.revvingIdle.facetA.candidates[0]?.researchLabelSpanMs).toBeGreaterThanOrEqual(3000);
  });

  it('2 revving below entry threshold yields no facet A candidate', () => {
    const rev = buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, () => ({
      speedKmh: 0,
      rpm: 1900,
    }));
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: withPrefix(rev), tripId: TRIP }),
    );
    expect(out.revvingIdle.facetA.deduplicatedCandidateCount).toBe(0);
  });

  it('3 revving 4001ms adjacent label gap splits sequence', () => {
    const t0 = Date.parse('2026-01-01T10:00:12.000Z');
    const burstA = [0, 1000, 2000].map((d) => ({
      recordedAtIso: new Date(t0 + d).toISOString(),
      speedKmh: 0,
      rpm: 2100,
    }));
    const burstB = [7000, 8000, 9000].map((d) => ({
      recordedAtIso: new Date(t0 + d).toISOString(),
      speedKmh: 0,
      rpm: 2100,
    }));
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: withPrefix([...burstA, ...burstB]), tripId: TRIP }),
    );
    expect(out.revvingIdle.facetA.deduplicatedCandidateCount).toBe(0);
  });

  it('4 revving short label span rejected', () => {
    const t0 = Date.parse('2026-01-01T10:00:12.000Z');
    const tight = [0, 500, 1000].map((d) => ({
      recordedAtIso: new Date(t0 + d).toISOString(),
      speedKmh: 0,
      rpm: 2200,
    }));
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: withPrefix(tight), tripId: TRIP }),
    );
    expect(out.revvingIdle.facetA.deduplicatedCandidateCount).toBe(0);
  });

  it('5 stationary-like 200s idle band positive facet B', () => {
    const idle = buildObservationSeries('2026-01-01T10:00:12.000Z', 201, 1, () => ({
      speedKmh: 0,
      rpm: 850,
    }));
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: withPrefix(idle), tripId: TRIP }),
    );
    expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(1);
    expect(out.revvingIdle.facetB.tripEvidenceClassification).toBe(
      'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY_CANDIDATE',
    );
  });

  it('6 traffic-light 75s idle negative facet B', () => {
    const ampel = buildObservationSeries('2026-01-01T10:00:12.000Z', 76, 1, () => ({
      speedKmh: 0,
      rpm: 820,
    }));
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: withPrefix(ampel), tripId: TRIP }),
    );
    expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(0);
  });

  it('7 exact 180s label span boundary admits facet B', () => {
    const movingPrefix = buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, () => ({
      rpm: 1800,
      speedKmh: 40,
      throttlePct: 20,
      loadPct: 30,
    }));
    const base = '2026-01-01T10:00:12.000Z';
    const end = '2026-01-01T10:03:12.000Z';
    const idle = [
      ...buildObservationSeries(base, 179, 1, () => ({ speedKmh: 0, rpm: 850 })),
      { recordedAtIso: end, speedKmh: 0, rpm: 850 },
    ];
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: [...movingPrefix, ...idle], tripId: TRIP }),
    );
    expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(1);
    expect(out.revvingIdle.facetB.candidates[0]?.researchLabelSpanMs).toBe(180_000);
  });

  it('8 creep 10 km/h negative for both facets', () => {
    const creep = buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, () => ({
      speedKmh: 10,
      rpm: 2100,
    }));
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: withPrefix(creep), tripId: TRIP }),
    );
    expect(out.revvingIdle.facetA.deduplicatedCandidateCount).toBe(0);
    expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(0);
  });

  it('9 missing speed splits both facets', () => {
    const rev = buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, () => ({
      speedKmh: null,
      rpm: 2100,
    }));
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: withPrefix(rev), tripId: TRIP }),
    );
    expect(out.revvingIdle.facetA.deduplicatedCandidateCount).toBe(0);
    expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(0);
  });

  it('10 missing RPM splits ICE facets', () => {
    const rev = buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, () => ({
      speedKmh: 0,
      rpm: null,
    }));
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: withPrefix(rev), tripId: TRIP }),
    );
    expect(out.revvingIdle.facetA.deduplicatedCandidateCount).toBe(0);
    expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(0);
  });

  it('11 missing load does not split revving sequence', () => {
    const rev = buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, (i) => ({
      speedKmh: 0,
      rpm: 2000 + i * 50,
      loadPct: i === 1 ? null : 20,
    }));
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: withPrefix(rev), tripId: TRIP }),
    );
    expect(out.revvingIdle.facetA.deduplicatedCandidateCount).toBe(1);
  });

  it('12 missing coolant does not split long idle sequence', () => {
    const idle = buildObservationSeries('2026-01-01T10:00:12.000Z', 201, 1, (i) => ({
      speedKmh: 0,
      rpm: 850,
      coolantC: i === 100 ? null : 90,
    }));
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: withPrefix(idle), tripId: TRIP }),
    );
    expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(1);
  });

  it('13 PHEV 1/2 local ICE RPM samples negative', () => {
    const idle = buildObservationSeries('2026-01-01T10:00:12.000Z', 201, 1, (i) => ({
      speedKmh: 0,
      rpm: i < 2 ? 500 : 380,
    }));
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({
        multichannelObservations: [...v1bMovingPrefixGrid(), ...idle],
        tripId: TRIP,
        fuelType: 'PHEV',
      }),
    );
    expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(0);
  });

  it('14 PHEV 3 local ICE RPM samples positive', () => {
    const idle = buildObservationSeries('2026-01-01T10:00:12.000Z', 201, 1, (i) => ({
      speedKmh: 0,
      rpm: i < 3 ? 500 : 380,
    }));
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({
        multichannelObservations: [...v1bMovingPrefixGrid(), ...idle],
        tripId: TRIP,
        fuelType: 'PHEV',
      }),
    );
    expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(1);
  });

  it('15 PHEV ICE evidence across separate sequences cannot be pooled', () => {
    const prefixIce = buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, (i) => ({
      rpm: i < 3 ? 500 : 1800,
      speedKmh: i < 3 ? 0 : 45,
      throttlePct: 10,
      loadPct: 12,
    }));
    const idle = buildObservationSeries('2026-01-01T10:00:12.000Z', 201, 1, () => ({
      speedKmh: 0,
      rpm: 380,
    }));
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({
        multichannelObservations: [...prefixIce, ...idle],
        tripId: TRIP,
        fuelType: 'PHEV',
      }),
    );
    expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(0);
  });

  it('16 BEV and unknown fuel fail-closed at bind', () => {
    const rev = buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, () => ({
      speedKmh: 0,
      rpm: 2100,
    }));
    const bev = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({
        multichannelObservations: withPrefix(rev),
        tripId: TRIP,
        fuelType: 'ELECTRIC',
        isEvPowertrain: true,
      }),
    );
    expect(bev.status).toBe('ABSTAINED');
    expect(bev.abstainReasons).toContain('POWERTRAIN_NOT_APPLICABLE');

    const unknown = buildBoundPowertrainInput({ multichannelObservations: withPrefix(rev), tripId: TRIP });
    unknown.fuelType = null;
    const unk = computeDs4PowertrainDemandRevvingIdleResearchV1(unknown);
    expect(unk.status).toBe('ABSTAINED');
    expect(unk.abstainReasons).toContain('ICE_OPERATION_NOT_CONFIRMED');
  });

  it('17 forged fingerprint abstains', () => {
    const rev = buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, () => ({
      speedKmh: 0,
      rpm: 2100,
    }));
    const input = buildBoundPowertrainInput({ multichannelObservations: withPrefix(rev), tripId: TRIP });
    input.multichannelFingerprint = 'forged';
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(input);
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('MULTICHANNEL_FINGERPRINT_MISMATCH');
  });

  it('18 V1B sequence parity tamper abstains', () => {
    const rev = buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, () => ({
      speedKmh: 0,
      rpm: 2100,
    }));
    const input = buildBoundPowertrainInput({ multichannelObservations: withPrefix(rev), tripId: TRIP });
    input.v1bResult = {
      ...input.v1bResult!,
      sequenceStats: { ...input.v1bResult!.sequenceStats, continuousSequenceCount: 9999 },
    };
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(input);
    expect(out.abstainReasons).toContain('V1B_SEQUENCE_PARITY_MISMATCH');
  });

  it('19 V1A RPM omission abstains', () => {
    const rev = buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, () => ({
      speedKmh: 0,
      rpm: 2100,
    }));
    const input = buildBoundPowertrainInput({ multichannelObservations: withPrefix(rev), tripId: TRIP });
    input.multichannelObservations = input.multichannelObservations.map((r) => ({ ...r, rpm: null }));
    const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson) ?? 'UNKNOWN';
    input.multichannelFingerprint = computeMultichannelContentFingerprint({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      telemetrySourceFamily: family,
      observations: input.multichannelObservations,
    });
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(input);
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('RPM_V1A_UNMATCHED_LABEL');
  });

  it('20 conflicting duplicates abstain', () => {
    const rev = buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, () => ({
      speedKmh: 0,
      rpm: 2100,
    }));
    const grid = withPrefix(rev);
    const dup = { ...grid[8]!, rpm: 9999 };
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({
        multichannelObservations: [...grid, dup],
        tripId: TRIP,
        dimoVehicleRawJson: R1_DIMO,
      }),
    );
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('CONFLICTING_DUPLICATE_BUCKETS');
  });

  describe('21 direct detector powertrain safety', () => {
    const canon = canonicalizeMultichannelObservations(
      withPrefix(
        buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, () => ({ speedKmh: 0, rpm: 2100 })),
      ),
    );

    it('BEV yields zero candidates on direct detect', () => {
      const d = detectRevvingIdleDualFacetCandidates({
        tripId: TRIP,
        providerSourceLinkId: 'link',
        fuelType: 'ELECTRIC',
        isEvPowertrain: true,
        canon,
      });
      expect(d.facetA.candidates).toHaveLength(0);
      expect(d.facetB.candidates).toHaveLength(0);
    });
  });

  it('22 input order determinism', () => {
    const rev = withPrefix(
      buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, (i) => ({
        speedKmh: 0,
        rpm: 2000 + i * 50,
      })),
    );
    const shuffled = [...rev].sort(() => (Math.random() > 0.5 ? 1 : -1));
    const a = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: rev, tripId: TRIP }),
    );
    const b = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: shuffled, tripId: TRIP }),
    );
    expect(a.revvingIdle.facetA.candidates[0]?.episodeKey).toBe(b.revvingIdle.facetA.candidates[0]?.episodeKey);
  });

  it('23 P39 literal policy drift pins', () => {
    expect(HIGH_RPM_STATIONARY_SHADOW_POLICY_VERSION).toBe('high-rpm-stationary-shadow-v1');
    expect(EXCESSIVE_IDLING_SHADOW_POLICY_VERSION).toBe('excessive-idling-shadow-v1');
    expect(DS4_REVIVING_IDLE_DUAL_FACET_RESEARCH_POLICY_VERSION).toBe('revving-idle-dual-facet-research-v1');
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetA.rpmEntryThreshold).toBe(2000);
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetA.rpmContinueThreshold).toBe(1440);
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetB.idleRpmBandMinExclusive).toBe(
      EXCESSIVE_IDLING_SHADOW_POLICY.defaultIdleRpm * EXCESSIVE_IDLING_SHADOW_POLICY.idleRpmMinMultiplier,
    );
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetB.researchContinuationEnforcesIdleBandUpperBound).toBe(true);
    expect(HIGH_RPM_STATIONARY_SHADOW_POLICY.maxSampleSyncDeltaMs).toBe(6000);
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetA.minResearchLabelSpanMs).toBe(
      HIGH_RPM_STATIONARY_SHADOW_POLICY.minClusterDurationMs,
    );
  });

  it('24 P2-B1/B2/B3 regression isolation smoke', () => {
    const kick = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: positiveKickdownGrid() }),
    );
    expect(kick.status).toBe('COMPUTED');

    const coldGrid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, (i) => ({
      rpm: 2500,
      coolantC: 40,
      loadPct: i === 5 ? 85 : 30,
      throttlePct: 20,
      speedKmh: 40,
    }));
    const cold = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: coldGrid }),
    );
    expect(['COMPUTED', 'NOT_OBSERVED', 'ABSTAINED']).toContain(cold.status);

    const loadGrid = buildObservationSeries('2026-01-01T10:00:12.000Z', 5, 5, () => ({
      loadPct: 80,
      rpm: 2000,
      throttlePct: 50,
      speedKmh: 60,
    }));
    const load = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({
        multichannelObservations: [...v1bPrefixGrid(), ...loadGrid],
        tripId: 'trip-sustained-load-regression',
      }),
    );
    expect(load.sustainedLoad.deduplicatedCandidateCount).toBeGreaterThanOrEqual(0);
  });

  it('25 research contract temporal and limitation codes', () => {
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({
        multichannelObservations: withPrefix(
          buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, () => ({ speedKmh: 0, rpm: 2100 })),
        ),
        tripId: TRIP,
      }),
    );
    expect(out.researchOnly).toBe(true);
    expect(out.timeAuthority).toBe('BUCKET_LABEL_UNVERIFIED');
    expect(out.temporalMode).toBe('MODE_A');
    expect(out.revvingIdle.scientificLimitationCodes).toContain('STATIONARY_INFERRED_FROM_SPEED_ONLY');
    expect(out.revvingIdle.scientificLimitationCodes).toContain('NOT_CONFIRMED_IDLE');
    expect(out.revvingIdle.facetA.assessability).toBe('ASSESSABLE');
    expect(out.revvingIdle.facetB.assessability).toBe('ASSESSABLE');
  });
});
