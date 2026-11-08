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
import { evaluateRevvingIdleFacetAAssessability } from '../ds4-powertrain-demand-revving-idle-assessability.v1';
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
    expect(out.revvingIdle.facetA.assessability).toBe('ASSESSABLE');
    expect(out.revvingIdle.facetB.assessability).toBe('NOT_ASSESSABLE');
    expect(out.revvingIdle.facetB.tripEvidenceClassification).toBe('INSUFFICIENT_OBSERVATIONS');
    expect(out.revvingIdle.facetB.coverageDiagnostics.assessabilityReasonCodes).toContain(
      'INSUFFICIENT_LABEL_SPAN_OPPORTUNITY',
    );
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
    expect(out.revvingIdle.facetA.assessability).toBe('NOT_ASSESSABLE');
    expect(out.revvingIdle.facetB.assessability).toBe('NOT_ASSESSABLE');
    expect(out.revvingIdle.facetA.tripEvidenceClassification).toBe('NOT_ASSESSABLE');
    expect(out.revvingIdle.coverageEvidence.gridBucketCount).toBe(0);
    expect(out.revvingIdle.facetA.deduplicatedCandidateCount).toBe(0);
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

  it('22 input order determinism (reversed permutation)', () => {
    const rev = withPrefix(
      buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, (i) => ({
        speedKmh: 0,
        rpm: 2000 + i * 50,
      })),
    );
    const reversed = [...rev].reverse();
    const a = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: rev, tripId: TRIP }),
    );
    const b = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: reversed, tripId: TRIP }),
    );
    expect(a.revvingIdle.facetA.candidates[0]?.episodeKey).toBe(b.revvingIdle.facetA.candidates[0]?.episodeKey);
    expect(a.revvingIdle.facetA.deduplicatedCandidateCount).toBe(1);
    expect(b.revvingIdle.facetA.deduplicatedCandidateCount).toBe(1);
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
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetA.shadowPolicyVersion).toBe(
      HIGH_RPM_STATIONARY_SHADOW_POLICY_VERSION,
    );
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetB.shadowPolicyVersion).toBe(
      EXCESSIVE_IDLING_SHADOW_POLICY_VERSION,
    );
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetA.stationarySpeedMaxKmh).toBe(5);
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetB.stationarySpeedMaxKmh).toBe(3);
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetA.maxAdjacentLabelGapMs).toBe(4000);
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetB.maxAdjacentLabelGapMs).toBe(10_000);
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetB.idleRpmBandMaxExclusive).toBe(1200);
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetB.shortIdleMaxResearchLabelSpanMs).toBe(120_000);
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetA.defaultIdleRpm).toBe(800);
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetB.defaultIdleRpm).toBe(800);
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetA.minObservations).toBe(3);
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetA.minResearchLabelSpanMs).toBe(3000);
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetA.rpmEntryThreshold).toBe(2000);
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetA.rpmContinueThreshold).toBe(1440);
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetB.minObservations).toBe(4);
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetB.minResearchLabelSpanMs).toBe(180_000);
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetB.idleRpmBandMinExclusive).toBe(320);
    expect(DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetB.idleRpmBandMaxExclusive).toBe(1200);
  });

  describe('assessability coherence closeout', () => {
    it('P1_01 missing speed at 100s splits Facet B opportunity (two sub-180s runs)', () => {
      const idle = buildObservationSeries('2026-01-01T10:00:01.000Z', 201, 1, (i) => ({
        speedKmh: i === 100 ? null : 0,
        rpm: 850,
      }));
      const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: idle, tripId: TRIP }),
      );
      expect(out.revvingIdle.facetB.assessability).toBe('NOT_ASSESSABLE');
      expect(out.revvingIdle.facetB.tripEvidenceClassification).toBe('INSUFFICIENT_OBSERVATIONS');
      expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(0);
      expect(out.revvingIdle.facetB.coverageDiagnostics.maxQualifyingCoherentResearchLabelSpanMs).toBe(0);
    });

    it('P1_01 missing RPM at 100s splits Facet B opportunity', () => {
      const idle = buildObservationSeries('2026-01-01T10:00:01.000Z', 201, 1, (i) => ({
        speedKmh: 0,
        rpm: i === 100 ? null : 850,
      }));
      const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: idle, tripId: TRIP }),
      );
      expect(out.revvingIdle.facetB.assessability).toBe('NOT_ASSESSABLE');
      expect(out.revvingIdle.facetB.tripEvidenceClassification).not.toBe('NOT_OBSERVED');
      expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(0);
    });

    it('P1_02 dense 100s run plus 190s coarse run: Facet B assessable via second run only', () => {
      const dense = buildObservationSeries('2026-01-01T10:00:01.000Z', 101, 1, () => ({
        speedKmh: 0,
        rpm: 850,
      }));
      const coarse = buildObservationSeries('2026-01-01T10:01:56.000Z', 19, 10, () => ({
        speedKmh: 0,
        rpm: 850,
      }));
      const grid = [...dense, ...coarse];
      const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
      );
      expect(out.revvingIdle.facetB.assessability).toBe('ASSESSABLE');
      expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(1);
      expect(out.revvingIdle.facetB.coverageDiagnostics.longestCoherentRunLabelCount).toBeGreaterThan(100);
      expect(out.revvingIdle.facetB.coverageDiagnostics.maxQualifyingCoherentResearchLabelSpanMs).toBeGreaterThanOrEqual(
        180_000,
      );

      const reversed = [...grid].reverse();
      const outRev = computeDs4PowertrainDemandRevvingIdleResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: reversed, tripId: TRIP }),
      );
      expect(outRev.revvingIdle.facetB.assessability).toBe('ASSESSABLE');
      expect(outRev.revvingIdle.facetB.candidates[0]?.episodeKey).toBe(out.revvingIdle.facetB.candidates[0]?.episodeKey);
    });
  });

  it('24 P2-B1 kickdown regression positive control', () => {
    const kick = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: positiveKickdownGrid() }),
    );
    expect(kick.status).toBe('COMPUTED');
    expect(kick.kickdown.deduplicatedCandidateCount).toBeGreaterThan(0);
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
    expect(out.revvingIdle.facetB.assessability).toBe('NOT_ASSESSABLE');
    expect(out.revvingIdle.facetB.tripEvidenceClassification).toBe('INSUFFICIENT_OBSERVATIONS');
  });

  describe('assessability remediation adversarial matrix', () => {
    it('A four RPM/speed labels across 3s: Facet A candidate, Facet B insufficient window', () => {
      const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
        buildBoundPowertrainInput({
          multichannelObservations: [
            ...v1bMovingPrefixGrid(),
            ...buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, () => ({
              speedKmh: 0,
              rpm: 2100,
            })),
          ],
          tripId: TRIP,
        }),
      );
      expect(out.revvingIdle.facetA.deduplicatedCandidateCount).toBe(1);
      expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(0);
      expect(out.revvingIdle.facetB.tripEvidenceClassification).toBe('INSUFFICIENT_OBSERVATIONS');
    });

    it('B valid 75s idle-like trace: Facet B insufficient 180s window', () => {
      const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
        buildBoundPowertrainInput({
          multichannelObservations: [
            ...v1bMovingPrefixGrid(),
            ...buildObservationSeries('2026-01-01T10:00:12.000Z', 76, 1, () => ({ speedKmh: 0, rpm: 850 })),
          ],
          tripId: TRIP,
        }),
      );
      expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(0);
      expect(out.revvingIdle.facetB.tripEvidenceClassification).toBe('INSUFFICIENT_OBSERVATIONS');
      expect(out.revvingIdle.facetB.coverageDiagnostics.longestCoherentResearchLabelSpanMs).toBeLessThan(180_000);
    });

    it('C valid 200s dense idle: Facet B candidate', () => {
      const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
        buildBoundPowertrainInput({
          multichannelObservations: [
            ...v1bMovingPrefixGrid(),
            ...buildObservationSeries('2026-01-01T10:00:12.000Z', 201, 1, () => ({ speedKmh: 0, rpm: 850 })),
          ],
          tripId: TRIP,
        }),
      );
      expect(out.revvingIdle.facetB.assessability).toBe('ASSESSABLE');
      expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(1);
    });

    it('D 200s moving trace: Facet B NOT_OBSERVED not insufficient', () => {
      const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
        buildBoundPowertrainInput({
          multichannelObservations: [
            ...v1bMovingPrefixGrid(),
            ...buildObservationSeries('2026-01-01T10:00:12.000Z', 201, 1, () => ({
              speedKmh: 45,
              rpm: 1800,
            })),
          ],
          tripId: TRIP,
        }),
      );
      expect(out.revvingIdle.facetB.assessability).toBe('ASSESSABLE');
      expect(out.revvingIdle.facetB.tripEvidenceClassification).toBe('NOT_OBSERVED');
      expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(0);
    });

    it('E 200s sparse labels >10s gaps: Facet B insufficient coverage visible', () => {
      const base = Date.parse('2026-01-01T10:00:12.000Z');
      const sparse = Array.from({ length: 25 }, (_, i) => ({
        recordedAtIso: new Date(base + i * 11_000).toISOString(),
        speedKmh: 0,
        rpm: 850,
      }));
      const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
        buildBoundPowertrainInput({
          multichannelObservations: [...v1bMovingPrefixGrid(), ...sparse],
          tripId: TRIP,
        }),
      );
      expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(0);
      expect(out.revvingIdle.facetB.tripEvidenceClassification).toBe('INSUFFICIENT_OBSERVATIONS');
      expect(out.revvingIdle.facetB.coverageDiagnostics.longestCoherentResearchLabelSpanMs).toBeLessThan(180_000);
    });

    it('F coarse 10s labels over 200s: Facet B may qualify, Facet A not high-res assessable for revving', () => {
      const coarse = buildObservationSeries('2026-01-01T10:00:01.000Z', 29, 10, () => ({
        speedKmh: 0,
        rpm: 850,
      }));
      const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
        buildBoundPowertrainInput({
          multichannelObservations: coarse,
          tripId: TRIP,
        }),
      );
      expect(out.revvingIdle.facetB.assessability).toBe('ASSESSABLE');
      expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(1);
      expect(out.revvingIdle.facetA.assessability).toBe('NOT_ASSESSABLE');
      expect(out.revvingIdle.facetA.tripEvidenceClassification).toBe('INSUFFICIENT_OBSERVATIONS');
    });

    it('G Facet A insufficient, Facet B positive preserved', () => {
      const idleOnly = [
        ...v1bMovingPrefixGrid(),
        ...buildObservationSeries('2026-01-01T10:00:12.000Z', 201, 1, () => ({ speedKmh: 0, rpm: 850 })),
      ];
      const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: idleOnly, tripId: TRIP }),
      );
      expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(1);
      expect(out.revvingIdle.facetA.deduplicatedCandidateCount).toBe(0);
      expect(out.revvingIdle.facetA.tripEvidenceClassification).toBe('NOT_OBSERVED');
    });

    it('H Facet B insufficient, Facet A positive preserved', () => {
      const revOnly = [
        ...v1bMovingPrefixGrid(),
        ...buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, () => ({ speedKmh: 0, rpm: 2100 })),
      ];
      const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: revOnly, tripId: TRIP }),
      );
      expect(out.revvingIdle.facetA.deduplicatedCandidateCount).toBe(1);
      expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(0);
      expect(out.revvingIdle.facetB.tripEvidenceClassification).toBe('INSUFFICIENT_OBSERVATIONS');
    });

    it('I forged fingerprint: both NOT_ASSESSABLE and zero trusted coverage', () => {
      const input = buildBoundPowertrainInput({
        multichannelObservations: [
          ...v1bMovingPrefixGrid(),
          ...buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, () => ({ speedKmh: 0, rpm: 2100 })),
        ],
        tripId: TRIP,
      });
      input.multichannelFingerprint = 'forged';
      const out = computeDs4PowertrainDemandRevvingIdleResearchV1(input);
      expect(out.status).toBe('ABSTAINED');
      expect(out.revvingIdle.facetA.tripEvidenceClassification).toBe('NOT_ASSESSABLE');
      expect(out.revvingIdle.coverageEvidence.rpmAndSpeedPresentBucketCount).toBe(0);
    });
  });

  describe('Opus final semantic closeout', () => {
    const t0 = Date.parse('2026-01-01T10:00:12.000Z');
    const at = (offsetMs: number, o: Record<string, unknown>) => ({
      recordedAtIso: new Date(t0 + offsetMs).toISOString(),
      ...o,
    });
    const movingPad = [5, 6, 7, 8, 9].map((k) =>
      at(60_000 + k * 20_000, { speedKmh: 40, rpm: 1800 }),
    );

    it('K embedded 75s idle in 201s coherent moving trip: Facet B NOT_OBSERVED, trip NOT_OBSERVED', () => {
      const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 201, 1, (i) =>
        i >= 60 && i < 136 ? { speedKmh: 0, rpm: 850 } : { speedKmh: 45, rpm: 1800 },
      );
      const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
      );
      expect(out.revvingIdle.facetB.assessability).toBe('ASSESSABLE');
      expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(0);
      expect(out.revvingIdle.facetB.tripEvidenceClassification).toBe('NOT_OBSERVED');
      expect(out.revvingIdle.facetA.deduplicatedCandidateCount).toBe(0);
      expect(out.revvingIdle.facetA.tripEvidenceClassification).toBe('NOT_OBSERVED');
      expect(out.status).toBe('NOT_OBSERVED');
    });

    it('L zero-RPM admitted synthetic: facets NOT_ASSESSABLE / NOT_ASSESSABLE with RPM_SPEED unavailable', () => {
      const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 30, 1, () => ({
        speedKmh: 0,
        rpm: null,
        loadPct: 20,
      }));
      const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
        buildColdEngineBoundInput({ multichannelObservations: grid, tripId: TRIP }) as never,
      );
      expect(out.status).toBe('COMPUTED');
      expect(out.revvingIdle.facetA.assessability).toBe('NOT_ASSESSABLE');
      expect(out.revvingIdle.facetB.assessability).toBe('NOT_ASSESSABLE');
      expect(out.revvingIdle.facetA.tripEvidenceClassification).toBe('NOT_ASSESSABLE');
      expect(out.revvingIdle.facetB.tripEvidenceClassification).toBe('NOT_ASSESSABLE');
      expect(out.revvingIdle.facetB.coverageDiagnostics.assessabilityReasonCodes).toContain(
        'RPM_SPEED_CO_OBSERVATION_UNAVAILABLE',
      );
      expect(out.revvingIdle.facetA.deduplicatedCandidateCount).toBe(0);
      expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(0);
    });

    it('J mixed coherent runs: NO_SINGLE_COHERENT_RUN_MEETS_LABEL_AND_SPAN on Facet A', () => {
      const grid = [
        at(0, { speedKmh: 0, rpm: 2100 }),
        at(1000, { speedKmh: 0, rpm: 2100 }),
        at(2000, { speedKmh: 0, rpm: 2100 }),
        at(7000, { speedKmh: 0, rpm: 2100 }),
        at(11000, { speedKmh: 0, rpm: 2100 }),
        at(20000, { speedKmh: 0, rpm: 2100 }),
        at(30000, { speedKmh: 0, rpm: 2100 }),
        at(40000, { speedKmh: 0, rpm: 2100 }),
      ];
      const verdict = evaluateRevvingIdleFacetAAssessability(canonicalizeMultichannelObservations(grid));
      expect(verdict.assessable).toBe(false);
      expect(verdict.diagnostics.assessabilityReasonCodes).toContain(
        'NO_SINGLE_COHERENT_RUN_MEETS_LABEL_AND_SPAN',
      );
      expect(verdict.diagnostics.labelsInMaxSpanRun).toBeGreaterThan(0);
      expect(verdict.diagnostics.spanMsInMaxLabelCountRun).toBeGreaterThan(0);
    });

    it('paired diagnostics on mixed runs expose independent maxima', () => {
      const dense = buildObservationSeries('2026-01-01T10:00:01.000Z', 101, 1, () => ({
        speedKmh: 0,
        rpm: 850,
      }));
      const coarse = buildObservationSeries('2026-01-01T10:01:56.000Z', 19, 10, () => ({
        speedKmh: 0,
        rpm: 850,
      }));
      const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
        buildBoundPowertrainInput({ multichannelObservations: [...dense, ...coarse], tripId: TRIP }),
      );
      const d = out.revvingIdle.facetB.coverageDiagnostics;
      expect(d.longestCoherentRunLabelCount).toBeGreaterThan(d.labelsInMaxSpanRun);
      expect(d.longestCoherentResearchLabelSpanMs).toBeGreaterThan(d.spanMsInMaxLabelCountRun);
    });

    describe('Facet A boundary matrix', () => {
      const revRow = (rpm: number) => ({ speedKmh: 0, rpm });
      const pad = () => movingPad;

      it('entry rpm 1999 vs 2000', () => {
        const low = computeDs4PowertrainDemandRevvingIdleResearchV1(
          buildBoundPowertrainInput({
            multichannelObservations: withPrefix([
              at(0, revRow(1999)),
              at(1000, revRow(1999)),
              at(2000, revRow(1999)),
              at(3000, revRow(1999)),
              ...pad(),
            ]),
            tripId: TRIP,
          }),
        );
        const hi = computeDs4PowertrainDemandRevvingIdleResearchV1(
          buildBoundPowertrainInput({
            multichannelObservations: withPrefix([
              at(0, revRow(2000)),
              at(1000, revRow(1440)),
              at(2000, revRow(1440)),
              at(3000, revRow(1440)),
              ...pad(),
            ]),
            tripId: TRIP,
          }),
        );
        expect(low.revvingIdle.facetA.deduplicatedCandidateCount).toBe(0);
        expect(hi.revvingIdle.facetA.deduplicatedCandidateCount).toBe(1);
      });

      it('continuation rpm 1439 vs 1440', () => {
        const lo = computeDs4PowertrainDemandRevvingIdleResearchV1(
          buildBoundPowertrainInput({
            multichannelObservations: withPrefix([
              at(0, revRow(2000)),
              at(1000, revRow(1439)),
              at(2000, revRow(1439)),
              at(3000, revRow(1439)),
              ...pad(),
            ]),
            tripId: TRIP,
          }),
        );
        const hi = computeDs4PowertrainDemandRevvingIdleResearchV1(
          buildBoundPowertrainInput({
            multichannelObservations: withPrefix([
              at(0, revRow(2000)),
              at(1000, revRow(1440)),
              at(2000, revRow(1440)),
              at(3000, revRow(1440)),
              ...pad(),
            ]),
            tripId: TRIP,
          }),
        );
        expect(lo.revvingIdle.facetA.deduplicatedCandidateCount).toBe(0);
        expect(hi.revvingIdle.facetA.deduplicatedCandidateCount).toBe(1);
      });

      it('speed 4.9 vs 5.0', () => {
        const ok = computeDs4PowertrainDemandRevvingIdleResearchV1(
          buildBoundPowertrainInput({
            multichannelObservations: withPrefix([
              at(0, { speedKmh: 4.9, rpm: 2100 }),
              at(1000, { speedKmh: 4.9, rpm: 2100 }),
              at(2000, { speedKmh: 4.9, rpm: 2100 }),
              at(3000, { speedKmh: 4.9, rpm: 2100 }),
              ...pad(),
            ]),
            tripId: TRIP,
          }),
        );
        const high = computeDs4PowertrainDemandRevvingIdleResearchV1(
          buildBoundPowertrainInput({
            multichannelObservations: withPrefix([
              at(0, { speedKmh: 5, rpm: 2100 }),
              at(1000, { speedKmh: 5, rpm: 2100 }),
              at(2000, { speedKmh: 5, rpm: 2100 }),
              at(3000, { speedKmh: 5, rpm: 2100 }),
              ...pad(),
            ]),
            tripId: TRIP,
          }),
        );
        expect(ok.revvingIdle.facetA.deduplicatedCandidateCount).toBe(1);
        expect(high.revvingIdle.facetA.deduplicatedCandidateCount).toBe(0);
      });

      it('gap 4000ms vs 4001ms', () => {
        const allow = computeDs4PowertrainDemandRevvingIdleResearchV1(
          buildBoundPowertrainInput({
            multichannelObservations: withPrefix([
              at(0, revRow(2100)),
              at(4000, revRow(2100)),
              at(8000, revRow(2100)),
              ...pad(),
            ]),
            tripId: TRIP,
          }),
        );
        const split = computeDs4PowertrainDemandRevvingIdleResearchV1(
          buildBoundPowertrainInput({
            multichannelObservations: withPrefix([
              at(0, revRow(2100)),
              at(4001, revRow(2100)),
              at(8002, revRow(2100)),
              ...pad(),
            ]),
            tripId: TRIP,
          }),
        );
        expect(allow.revvingIdle.facetA.deduplicatedCandidateCount).toBe(1);
        expect(split.revvingIdle.facetA.deduplicatedCandidateCount).toBe(0);
      });
    });

    describe('Facet B boundary matrix', () => {
      it('rpm band 320/321 and 1199/1200', () => {
        const run = (rpm: number) =>
          computeDs4PowertrainDemandRevvingIdleResearchV1(
            buildBoundPowertrainInput({
              multichannelObservations: [
                ...v1bMovingPrefixGrid(),
                ...buildObservationSeries('2026-01-01T10:00:12.000Z', 201, 1, () => ({
                  speedKmh: 0,
                  rpm,
                })),
              ],
              tripId: TRIP,
            }),
          ).revvingIdle.facetB.deduplicatedCandidateCount;
        expect(run(320)).toBe(0);
        expect(run(321)).toBe(1);
        expect(run(1200)).toBe(0);
        expect(run(1199)).toBe(1);
      });

      it('speed below 3 vs 3.0', () => {
        const ok = computeDs4PowertrainDemandRevvingIdleResearchV1(
          buildBoundPowertrainInput({
            multichannelObservations: [
              ...v1bMovingPrefixGrid(),
              ...buildObservationSeries('2026-01-01T10:00:12.000Z', 201, 1, () => ({
                speedKmh: 2.9,
                rpm: 850,
              })),
            ],
            tripId: TRIP,
          }),
        );
        const high = computeDs4PowertrainDemandRevvingIdleResearchV1(
          buildBoundPowertrainInput({
            multichannelObservations: [
              ...v1bMovingPrefixGrid(),
              ...buildObservationSeries('2026-01-01T10:00:12.000Z', 201, 1, () => ({
                speedKmh: 3,
                rpm: 850,
              })),
            ],
            tripId: TRIP,
          }),
        );
        expect(ok.revvingIdle.facetB.deduplicatedCandidateCount).toBe(1);
        expect(high.revvingIdle.facetB.deduplicatedCandidateCount).toBe(0);
      });

      it('gap 10000ms vs 10001ms', () => {
        const allow = computeDs4PowertrainDemandRevvingIdleResearchV1(
          buildBoundPowertrainInput({
            multichannelObservations: buildObservationSeries('2026-01-01T10:00:01.000Z', 19, 10, () => ({
              speedKmh: 0,
              rpm: 850,
            })),
            tripId: TRIP,
          }),
        );
        const split = computeDs4PowertrainDemandRevvingIdleResearchV1(
          buildBoundPowertrainInput({
            multichannelObservations: Array.from({ length: 19 }, (_, k) =>
              at(k * 10_001, { speedKmh: 0, rpm: 850 }),
            ),
            tripId: TRIP,
          }),
        );
        expect(allow.revvingIdle.facetB.deduplicatedCandidateCount).toBe(1);
        expect(split.revvingIdle.facetB.deduplicatedCandidateCount).toBe(0);
      });
    });
  });
});
