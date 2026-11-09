import { computeDs4RpmEpisodeResearchV1 } from '../../ds4-rpm-episode-research/ds4-rpm-episode-research.kernel.v1';
import {
  buildBoundResearchInput,
  rpmAtU,
} from '../../ds4-rpm-episode-research/__tests__/ds4-rpm-episode-research.test-helpers';
import { buildRpmPointsEverySeconds } from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import { computeDs4PowertrainDemandColdEngineResearchV1 } from '../ds4-powertrain-demand-cold-engine.kernel.v1';
import { computeDs4PowertrainDemandResearchV1 } from '../ds4-powertrain-demand-research.kernel.v1';
import { computeDs4PowertrainDemandRevvingIdleResearchV1 } from '../ds4-powertrain-demand-revving-idle.kernel.v1';
import { computeDs4PowertrainDemandSustainedLoadResearchV1 } from '../ds4-powertrain-demand-sustained-load.kernel.v1';
import { isSoleInsufficientLoadLabelBindingFailure } from '../ds4-powertrain-demand-sustained-load.kernel.v1';
import type { Ds4PowertrainDemandRevvingIdleResultV1 } from '../ds4-powertrain-demand-research.contract.v1';
import {
  buildBoundPowertrainInput,
  buildColdEngineBoundInput,
  buildObservationSeries,
  coldEctGrid,
} from './ds4-powertrain-demand-research.test-helpers';

const TRIP = 'trip-p2c1-consumer-gating';
const REVVING_IDLE_COVERAGE_KEYS = [
  'gridBucketCount',
  'rpmAndSpeedPresentBucketCount',
  'rpmMissingBucketCount',
  'speedMissingBucketCount',
  'loadPresentBucketCount',
  'coolantPresentBucketCount',
] as const;

function assertSixKeyCoverage(out: Ds4PowertrainDemandRevvingIdleResultV1) {
  expect(Object.keys(out.revvingIdle.coverageEvidence).sort()).toEqual([...REVVING_IDLE_COVERAGE_KEYS].sort());
}

describe('DBI P2-C1 cross-kernel consumer gating', () => {
  it('1 B4 COMPUTED without assessable facet is not an evaluated positive result', () => {
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
    expect(out.revvingIdle.facetA.deduplicatedCandidateCount).toBe(0);
    expect(out.revvingIdle.facetB.deduplicatedCandidateCount).toBe(0);
    expect(out.revvingIdle.facetA.tripEvidenceClassification).not.toMatch(/CANDIDATE$/);
    expect(out.revvingIdle.facetB.tripEvidenceClassification).not.toMatch(/CANDIDATE$/);
    assertSixKeyCoverage(out);
  });

  it('2 B4 assessable facets with no candidates remain NOT_OBSERVED', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 201, 1, (i) =>
      i >= 60 && i < 136 ? { speedKmh: 0, rpm: 850 } : { speedKmh: 45, rpm: 1800 },
    );
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
    );
    expect(out.status).toBe('NOT_OBSERVED');
    expect(out.revvingIdle.facetA.assessability).toBe('ASSESSABLE');
    expect(out.revvingIdle.facetB.assessability).toBe('ASSESSABLE');
    expect(out.revvingIdle.facetA.tripEvidenceClassification).toBe('NOT_OBSERVED');
    expect(out.revvingIdle.facetB.tripEvidenceClassification).toBe('NOT_OBSERVED');
    assertSixKeyCoverage(out);
  });

  it('3 B3 insufficient-load abstain differs from global fingerprint failure', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, (i) => ({
      rpm: 2000,
      throttlePct: 40,
      loadPct: i < 3 ? 80 : null,
    }));
    const sole = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP }),
    );
    expect(sole.status).toBe('ABSTAINED');
    expect(sole.abstainReasons).toEqual(['INSUFFICIENT_LOAD_LABEL_OBSERVATIONS']);
    expect(isSoleInsufficientLoadLabelBindingFailure(sole.abstainReasons)).toBe(true);
    expect(sole.sustainedLoad.coverageEvidence.loadPresentBucketCount).toBe(3);
    expect(sole.sustainedLoad.tripEvidenceClassification).toBe('INSUFFICIENT_OBSERVATIONS');

    const tampered = buildBoundPowertrainInput({ multichannelObservations: grid, tripId: TRIP });
    tampered.multichannelFingerprint = 'forged';
    const forged = computeDs4PowertrainDemandSustainedLoadResearchV1(tampered);
    expect(forged.status).toBe('ABSTAINED');
    expect(forged.abstainReasons).toContain('MULTICHANNEL_FINGERPRINT_MISMATCH');
    expect(forged.sustainedLoad.tripEvidenceClassification).toBe('NOT_ASSESSABLE');
    expect(forged.sustainedLoad.coverageEvidence.loadPresentBucketCount).toBe(0);
  });

  it('4 B2 subtype assessability is not inferable from trip status alone', () => {
    const grid = coldEctGrid(20, () => ({ loadPct: 12, rpm: 900, speedKmh: 0 }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid, tripId: TRIP }),
    );
    expect(out.status).toBe('NOT_OBSERVED');
    expect(out.coldEngine.deduplicatedCandidateCount).toBe(0);
    const assessableKinds = Object.entries(out.coldEngine.subtypeAssessability).filter(
      ([, v]) => v.status === 'ASSESSABLE',
    );
    expect(assessableKinds.length).toBeGreaterThan(0);
    expect(out.provenance.sourceProvenanceVerified).toBe(false);
  });

  it('5 A1 descriptive episodes are not evidence proxy candidates', () => {
    const rpmPoints = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 8, 1).map((p) => ({
      recordedAtIso: p.recordedAtIso,
      valueRpm: rpmAtU(0.7),
    }));
    const out = computeDs4RpmEpisodeResearchV1(buildBoundResearchInput({ rpmPoints }));
    expect(out.semanticGuards.notEvidenceCandidate).toBe(true);
    expect(out.semanticGuards.labelsNotForCrossDomainJoin).toBe(true);
    for (const item of out.highEpisodes.items) {
      expect(item).not.toHaveProperty('classification');
      expect(item).not.toHaveProperty('proxyKind');
    }
  });

  it('6 binding and provenance limitations remain visible', () => {
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({
        multichannelObservations: buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, () => ({
          rpm: 1800,
          speedKmh: 40,
          throttlePct: 20,
          loadPct: 30,
        })),
        tripId: TRIP,
      }),
    );
    expect(out.provenance.sourceProvenanceVerified).toBe(false);
    expect(out.unsupportedScientificClaims).toContain('SOURCE_ATTESTATION_NOT_INDEPENDENTLY_VERIFIED');
    expect(out.kickdown).not.toHaveProperty('assessability');
  });

  it('7 absent rpm+speed never produces positive B4 observations', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 30, 1, () => ({
      speedKmh: 0,
      rpm: null,
      loadPct: 20,
    }));
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid, tripId: TRIP }) as never,
    );
    expect(out.revvingIdle.facetA.candidates).toHaveLength(0);
    expect(out.revvingIdle.facetB.candidates).toHaveLength(0);
    expect(out.revvingIdle.coverageEvidence.rpmAndSpeedPresentBucketCount).toBe(0);
  });

  it('B4 abstain coverageEvidence uses exactly six contract keys', () => {
    const input = buildBoundPowertrainInput({
      multichannelObservations: buildObservationSeries('2026-01-01T10:00:01.000Z', 10, 1, () => ({
        speedKmh: 0,
        rpm: 2100,
      })),
      tripId: TRIP,
    });
    input.multichannelFingerprint = 'forged';
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(input);
    expect(out.status).toBe('ABSTAINED');
    assertSixKeyCoverage(out);
    expect(out.revvingIdle.distinctMsLabelsInTrip).toBe(0);
    expect(out.revvingIdle.identicalDuplicateCollapsedCount).toBe(0);
    expect(Object.values(out.revvingIdle.coverageEvidence).every((v) => v === 0)).toBe(true);
  });
});
