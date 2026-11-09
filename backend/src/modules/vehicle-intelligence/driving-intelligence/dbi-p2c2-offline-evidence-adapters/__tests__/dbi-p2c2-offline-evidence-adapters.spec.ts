import { computeDs4RpmEpisodeResearchV1 } from '../../ds4-rpm-episode-research/ds4-rpm-episode-research.kernel.v1';
import { computeDs4PowertrainDemandColdEngineResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-cold-engine.kernel.v1';
import { computeDs4PowertrainDemandResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-research.kernel.v1';
import { computeDs4PowertrainDemandRevvingIdleResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-revving-idle.kernel.v1';
import { computeDs4PowertrainDemandSustainedLoadResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-sustained-load.kernel.v1';
import {
  buildDbiP2c15ScenarioPackage,
  DBI_P2C15_SCENARIO_IDS,
} from '../../dbi-p2c15-binding-envelope-fixtures/dbi-p2c15-binding-envelope.scenarios.v1';
import {
  buildBoundPowertrainInput,
  buildObservationSeries,
  positiveKickdownGrid,
} from '../../ds4-powertrain-demand-research/__tests__/ds4-powertrain-demand-research.test-helpers';
import { DBI_P2C15_TRIP_BASELINE, DBI_P2C15_LINK_BASELINE } from '../../dbi-p2c15-binding-envelope-fixtures/dbi-p2c15-binding-envelope.identity.v1';
import { DBI_P2C2_NOT_REPORTED } from '../dbi-p2c2-evidence-adapter.contract.v1';
import { adaptDs4RpmEpisodeResearchToP2c2Evidence } from '../dbi-p2c2-a1-evidence-adapter.v1';
import { adaptDs4KickdownResearchToP2c2Evidence } from '../dbi-p2c2-b1-evidence-adapter.v1';
import { adaptDs4ColdEngineResearchToP2c2Evidence } from '../dbi-p2c2-b2-evidence-adapter.v1';
import { adaptDs4SustainedLoadResearchToP2c2Evidence } from '../dbi-p2c2-b3-evidence-adapter.v1';
import { adaptDs4RevvingIdleResearchToP2c2Evidence } from '../dbi-p2c2-b4-evidence-adapter.v1';
import type { Ds4KickdownLikeCandidateV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
import type { DbiP2c2B3EvidenceParticipantV1, DbiP2c2B4EvidenceParticipantV1 } from '../dbi-p2c2-evidence-adapter.contract.v1';

describe('dbi-p2c2 offline evidence adapters', () => {
  it('S14 A1 descriptive-only: descriptive plane only, guards and NOT_REPORTED provenance', () => {
    const pack = buildDbiP2c15ScenarioPackage('S14_A1_DESCRIPTIVE_ONLY');
    if (pack.payload.kind !== 'A1_INPUT') throw new Error('expected A1');
    const before = structuredClone(pack.payload.input);
    const kernel = computeDs4RpmEpisodeResearchV1(pack.payload.input);
    expect(pack.payload.input).toEqual(before);

    const out = adaptDs4RpmEpisodeResearchToP2c2Evidence(kernel);
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.plane.evidencePlane).toBe('DESCRIPTIVE_RPM_EPISODES');
    expect(out.plane.participant.adapterClaimsPositiveEvidence).toBe(false);
    expect(out.plane.participant.identity.multichannelFingerprint).toBe(DBI_P2C2_NOT_REPORTED);
    expect(out.plane.participant.provenance.sourceProvenanceVerified).toBe(DBI_P2C2_NOT_REPORTED);
    expect(out.plane.participant.moduleAssessability.semanticGuards.notEvidenceCandidate).toBe(true);
    expect(out.plane.participant.moduleAssessability.semanticGuards.labelsNotForCrossDomainJoin).toBe(true);
    for (const ep of out.plane.episodes) {
      expect(ep.crossDomainJoinEligible).toBe(false);
      expect(ep.adapterLocalReference).toMatch(/^dbi-p2c2:a1-descriptive\/seq=/);
    }
  });

  it('S01 baseline kickdown adapter preserves fingerprints and episode keys', () => {
    const pack = buildDbiP2c15ScenarioPackage('S01_VALID_ICE_BASELINE');
    if (pack.payload.kind !== 'POWERTRAIN_INPUT') throw new Error('expected powertrain');
    const kernelBefore = structuredClone(pack.payload.input);
    const kernel = computeDs4PowertrainDemandResearchV1(pack.payload.input);
    expect(pack.payload.input).toEqual(kernelBefore);

    const out = adaptDs4KickdownResearchToP2c2Evidence(kernel);
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.plane.participant.identity.v1bInputFingerprint).toBe(kernel.bindings.v1bInputFingerprint);
    expect(out.plane.participant.identity.multichannelFingerprint).toBe(kernel.bindings.multichannelFingerprint);
    expect(out.plane.participant.provenance.sourceProvenanceVerified).toBe(kernel.provenance.sourceProvenanceVerified);
    if (out.plane.participant.sourceModule !== 'P2-B1') throw new Error('expected B1');
    expect(out.plane.participant.moduleCoverage.fullTripMovementCoverageVerdict).toBe('UNKNOWN');
  });

  it('S11 B3 sole-insufficient-load: ABSTAINED without positive adapter evidence', () => {
    const pack = buildDbiP2c15ScenarioPackage('S11_B3_SOLE_INSUFFICIENT_LOAD');
    if (pack.payload.kind !== 'MODULE_B3_INPUT') throw new Error('expected B3');
    const kernel = computeDs4PowertrainDemandSustainedLoadResearchV1(pack.payload.input);
    expect(kernel.status).toBe('ABSTAINED');

    const out = adaptDs4SustainedLoadResearchToP2c2Evidence(kernel);
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.plane.participant.adapterClaimsPositiveEvidence).toBe(false);
    const b3 = out.plane.participant as DbiP2c2B3EvidenceParticipantV1;
    expect(b3.tripEvidenceClassification).toBe(kernel.sustainedLoad.tripEvidenceClassification);
    expect(out.plane.participant.originalAbstainReasons.length).toBeGreaterThan(0);
  });

  it('S12 B4 COMPUTED with both facets NOT_ASSESSABLE does not claim positive evidence', () => {
    const pack = buildDbiP2c15ScenarioPackage('S12_B4_ZERO_ASSESSABLE_FACETS');
    if (pack.payload.kind !== 'MODULE_B4_INPUT') throw new Error('expected B4');
    const kernel = computeDs4PowertrainDemandRevvingIdleResearchV1(pack.payload.input);

    const out = adaptDs4RevvingIdleResearchToP2c2Evidence(kernel);
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(kernel.status).toBe('COMPUTED');
    const b4 = out.plane.participant as DbiP2c2B4EvidenceParticipantV1;
    expect(b4.facetA.assessability).toBe('NOT_ASSESSABLE');
    expect(b4.facetB.assessability).toBe('NOT_ASSESSABLE');
    expect(b4.adapterClaimsPositiveEvidence).toBe(false);
    expect(Object.keys(b4.coverageEvidence)).toEqual([
      'gridBucketCount',
      'rpmAndSpeedPresentBucketCount',
      'rpmMissingBucketCount',
      'speedMissingBucketCount',
      'loadPresentBucketCount',
      'coolantPresentBucketCount',
    ]);
    expect(out.plane.participant).not.toHaveProperty('overlapLabelCount');
  });

  it('S09 cold engine B2 preserves per-kind subtypeAssessability', () => {
    const pack = buildDbiP2c15ScenarioPackage('S09_MISSING_REQUIRED_CHANNELS');
    if (pack.payload.kind !== 'MODULE_B2_INPUT') throw new Error('expected B2');
    const kernel = computeDs4PowertrainDemandColdEngineResearchV1(pack.payload.input);
    const out = adaptDs4ColdEngineResearchToP2c2Evidence(kernel);
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    if (out.plane.participant.sourceModule !== 'P2-B2') throw new Error('expected B2 participant');
    expect(out.plane.participant.subtypeAssessability).toEqual(kernel.coldEngine.subtypeAssessability);
    expect(out.plane.participant.moduleCoverage.localCoverageScope).toBe('ECT_LABELLED_BUCKETS_ONLY');
  });

  it('S16 canonical order invariance: ordering digest stable under reversed candidate source order', () => {
    const pack = buildDbiP2c15ScenarioPackage('S16_CANONICAL_ORDER_INVARIANCE');
    if (pack.payload.kind !== 'CANONICAL_ORDER_PAIR') throw new Error('expected S16 pair');
    const forward = computeDs4PowertrainDemandResearchV1(pack.payload.forwardInput);
    const reversed = computeDs4PowertrainDemandResearchV1(pack.payload.reversedInput);

    const forwardAdapt = adaptDs4KickdownResearchToP2c2Evidence(forward);
    const reversedAdapt = adaptDs4KickdownResearchToP2c2Evidence(reversed);
    expect(forwardAdapt.ok && reversedAdapt.ok).toBe(true);
    if (!forwardAdapt.ok || !reversedAdapt.ok) return;

    expect(forwardAdapt.orderingDigest).toBe(reversedAdapt.orderingDigest);
  });

  it('invalid provider bucket label fails closed', () => {
    const pack = buildDbiP2c15ScenarioPackage('S01_VALID_ICE_BASELINE');
    if (pack.payload.kind !== 'POWERTRAIN_INPUT') throw new Error('expected powertrain');
    const kernel = computeDs4PowertrainDemandResearchV1(pack.payload.input);
    const tampered = structuredClone(kernel);
    if (tampered.kickdown.candidates.length === 0) {
      tampered.kickdown.candidates = [
        {
          episodeKey: 'ep-tamper',
          classification: 'NOT_ASSESSABLE',
          candidateSupportTier: 'WEAK',
          providerBucketLabelStartIso: 'not-a-date',
          providerBucketLabelEndIso: pack.payload.input.multichannelObservations[0]?.recordedAtIso ?? '2020-01-01T00:00:00.000Z',
          startBucketIndex: 0,
          endBucketIndex: 0,
          observedBucketSpanCount: 1,
          peakThrottlePct: 0,
          throttleRisePct: 0,
          rpmRiseLabelDelta: null,
          speedRiseLabelDelta: null,
          peakEngineLoadPct: null,
          requiredChannelPresence: {},
          peakThrottleBucketIndexDeltaFromPeakRpm: null,
          limitationCodes: [],
        } satisfies Ds4KickdownLikeCandidateV1,
      ];
    } else {
      tampered.kickdown.candidates[0] = {
        ...tampered.kickdown.candidates[0],
        providerBucketLabelStartIso: 'INVALID',
      };
    }

    const out = adaptDs4KickdownResearchToP2c2Evidence(tampered);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('INVALID_PROVIDER_BUCKET_LABEL');
  });

  it('A1 contradictory semantic guard fails closed', () => {
    const pack = buildDbiP2c15ScenarioPackage('S14_A1_DESCRIPTIVE_ONLY');
    if (pack.payload.kind !== 'A1_INPUT') throw new Error('expected A1');
    const kernel = computeDs4RpmEpisodeResearchV1(pack.payload.input);
    const tampered = structuredClone(kernel);
    tampered.semanticGuards = {
      ...tampered.semanticGuards,
      notEvidenceCandidate: false as unknown as true,
    };
    const out = adaptDs4RpmEpisodeResearchToP2c2Evidence(tampered);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('A1_SEMANTIC_GUARD_NOT_EVIDENCE_CANDIDATE');
  });

  it('B4 facet A and facet B positives preserve classification, keys and facet tags', () => {
    const v1bPrefix = buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, () => ({
      rpm: 850,
      speedKmh: 2,
      throttlePct: 8,
      loadPct: 12,
    }));
    const facetARev = buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, (i) => ({
      speedKmh: 0,
      rpm: 2000 + i * 50,
    }));
    const kernelA = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({
        multichannelObservations: [...v1bPrefix, ...facetARev],
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      }),
    );
    expect(kernelA.revvingIdle.facetA.deduplicatedCandidateCount).toBeGreaterThanOrEqual(1);
    const outA = adaptDs4RevvingIdleResearchToP2c2Evidence(kernelA);
    expect(outA.ok).toBe(true);
    if (!outA.ok) return;
    const aPositives = outA.plane.candidates.filter(
      (c) => c.sourceModule === 'P2-B4' && c.facet === 'HIGH_RPM_STATIONARY_LIKE_PROXY',
    );
    expect(aPositives.length).toBeGreaterThanOrEqual(1);
    expect(aPositives[0]!.originalClassification).toBe('HIGH_RPM_STATIONARY_LIKE_PROXY_CANDIDATE');
    expect(aPositives[0]!.sourceEpisodeKey).toBe(kernelA.revvingIdle.facetA.candidates[0]!.episodeKey);

    const facetBIdle = buildObservationSeries('2026-01-01T10:00:12.000Z', 201, 1, () => ({
      speedKmh: 0,
      rpm: 850,
    }));
    const kernelB = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({
        multichannelObservations: [...v1bPrefix, ...facetBIdle],
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      }),
    );
    expect(kernelB.revvingIdle.facetB.deduplicatedCandidateCount).toBeGreaterThanOrEqual(1);
    const outB = adaptDs4RevvingIdleResearchToP2c2Evidence(kernelB);
    expect(outB.ok).toBe(true);
    if (!outB.ok) return;
    const bPositives = outB.plane.candidates.filter(
      (c) => c.sourceModule === 'P2-B4' && c.facet === 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY',
    );
    expect(bPositives.length).toBeGreaterThanOrEqual(1);
    expect(bPositives[0]!.originalClassification).toBe('EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY_CANDIDATE');
    expect(bPositives[0]!.sourceEpisodeKey).toBe(kernelB.revvingIdle.facetB.candidates[0]!.episodeKey);
  });

  it('synthetic duplicate episode keys: exact source multiplicity preserved', () => {
    const pack = buildDbiP2c15ScenarioPackage('S01_VALID_ICE_BASELINE');
    if (pack.payload.kind !== 'POWERTRAIN_INPUT') throw new Error('expected powertrain');
    const kernel = computeDs4PowertrainDemandResearchV1(pack.payload.input);
    const tampered = structuredClone(kernel);
    const base = tampered.kickdown.candidates[0];
    if (!base) throw new Error('S01 must expose at least one kickdown candidate');
    const sharedKey = 'duplicate-episode-key-x';
    tampered.kickdown.candidates = [
      { ...structuredClone(base), episodeKey: sharedKey },
      {
        ...structuredClone(base),
        episodeKey: sharedKey,
        startBucketIndex: base.startBucketIndex + 1,
        endBucketIndex: base.endBucketIndex + 1,
      },
    ];
    expect(tampered.kickdown.candidates).toHaveLength(2);
    const out = adaptDs4KickdownResearchToP2c2Evidence(tampered);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.plane.candidates).toHaveLength(2);
    expect(out.plane.candidates[0]!.sourceEpisodeKey).toBe(sharedKey);
    expect(out.plane.candidates[1]!.sourceEpisodeKey).toBe(sharedKey);
  });

  it.each(['S01_VALID_ICE_BASELINE', 'S10_INSUFFICIENT_OBSERVATIONS', 'S15_OFFLINE_UNATTESTED_NEGATIVE'] as const)(
    '%s kickdown adapter succeeds for powertrain scenarios',
    (scenarioId) => {
    const pack = buildDbiP2c15ScenarioPackage(scenarioId);
    if (pack.payload.kind !== 'POWERTRAIN_INPUT') return;
    const kernel = computeDs4PowertrainDemandResearchV1(pack.payload.input);
    const out = adaptDs4KickdownResearchToP2c2Evidence(kernel);
    expect(out.ok).toBe(true);
    },
  );

  it('S13 sustained UNKNOWN fail-closed kernel still adapts structurally', () => {
    const pack = buildDbiP2c15ScenarioPackage('S13_POWERTRAIN_UNKNOWN_FAIL_CLOSED');
    if (pack.payload.kind !== 'MODULE_B3_INPUT') throw new Error('expected B3');
    const kernel = computeDs4PowertrainDemandSustainedLoadResearchV1(pack.payload.input);
    const out = adaptDs4SustainedLoadResearchToP2c2Evidence(kernel);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.plane.participant.adapterClaimsPositiveEvidence).toBe(false);
  });

  it('extra synthetic multi-candidate kickdown grid preserves identities', () => {
    const input = buildBoundPowertrainInput({
      multichannelObservations: positiveKickdownGrid(),
      tripId: DBI_P2C15_TRIP_BASELINE,
      linkId: DBI_P2C15_LINK_BASELINE,
    });
    const kernel = computeDs4PowertrainDemandResearchV1(input);
    const source = structuredClone(kernel);
    const base = source.kickdown.candidates[0];
    if (!base) throw new Error('expected at least one kickdown candidate');
    if (source.kickdown.candidates.length < 2) {
      source.kickdown.candidates.push({
        ...structuredClone(base),
        episodeKey: `${base.episodeKey}-secondary`,
        startBucketIndex: base.startBucketIndex + 2,
        endBucketIndex: base.endBucketIndex + 2,
      });
    }
    expect(source.kickdown.candidates.length).toBeGreaterThanOrEqual(2);
    const out = adaptDs4KickdownResearchToP2c2Evidence(source);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.plane.candidates.length).toBe(source.kickdown.candidates.length);
    const sourceKeys = [...source.kickdown.candidates.map((c) => c.episodeKey)].sort();
    const adaptedKeys = [...out.plane.candidates.map((c) => c.sourceEpisodeKey)].sort();
    expect(adaptedKeys).toEqual(sourceKeys);
  });
});
