import { computeDs4RpmEpisodeResearchV1 } from '../../ds4-rpm-episode-research/ds4-rpm-episode-research.kernel.v1';
import { computeDs4PowertrainDemandColdEngineResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-cold-engine.kernel.v1';
import { computeDs4PowertrainDemandResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-research.kernel.v1';
import { computeDs4PowertrainDemandRevvingIdleResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-revving-idle.kernel.v1';
import { computeDs4PowertrainDemandSustainedLoadResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-sustained-load.kernel.v1';
import { buildDbiP2c15ScenarioPackage } from '../../dbi-p2c15-binding-envelope-fixtures/dbi-p2c15-binding-envelope.scenarios.v1';
import { adaptDs4RpmEpisodeResearchToP2c2Evidence } from '../dbi-p2c2-a1-evidence-adapter.v1';
import { adaptDs4KickdownResearchToP2c2Evidence } from '../dbi-p2c2-b1-evidence-adapter.v1';
import { adaptDs4ColdEngineResearchToP2c2Evidence } from '../dbi-p2c2-b2-evidence-adapter.v1';
import { adaptDs4SustainedLoadResearchToP2c2Evidence } from '../dbi-p2c2-b3-evidence-adapter.v1';
import { adaptDs4RevvingIdleResearchToP2c2Evidence } from '../dbi-p2c2-b4-evidence-adapter.v1';

function assertSourceUnchangedAfterProjectionMutation<T>(
  sourceSnapshot: T,
  sourceAfter: T,
  mutate: (projection: unknown) => void,
  adapt: (source: T) => { ok: boolean },
) {
  expect(sourceAfter).toEqual(sourceSnapshot);
  const out = adapt(sourceAfter);
  expect(out.ok).toBe(true);
  if (!out.ok) return;
  mutate(out);
  expect(sourceAfter).toEqual(sourceSnapshot);
}

describe('dbi-p2c2 projection memory isolation', () => {
  it('A1: mutating projected episode does not mutate source', () => {
    const pack = buildDbiP2c15ScenarioPackage('S14_A1_DESCRIPTIVE_ONLY');
    if (pack.payload.kind !== 'A1_INPUT') throw new Error('expected A1');
    const kernel = computeDs4RpmEpisodeResearchV1(pack.payload.input);
    const snapshot = structuredClone(kernel);
    assertSourceUnchangedAfterProjectionMutation(snapshot, kernel, (out) => {
      const typed = out as Extract<ReturnType<typeof adaptDs4RpmEpisodeResearchToP2c2Evidence>, { ok: true }>;
      if (typed.plane.episodes[0]) {
        typed.plane.episodes[0].sourceEpisode.peakRpm = -1;
        typed.plane.participant.moduleAssessability.semanticGuards.notEvidenceCandidate = false as unknown as true;
      }
    }, adaptDs4RpmEpisodeResearchToP2c2Evidence);
  });

  it('B1: mutating projected candidate does not mutate source', () => {
    const pack = buildDbiP2c15ScenarioPackage('S01_VALID_ICE_BASELINE');
    if (pack.payload.kind !== 'POWERTRAIN_INPUT') throw new Error('expected powertrain');
    const kernel = computeDs4PowertrainDemandResearchV1(pack.payload.input);
    const snapshot = structuredClone(kernel);
    assertSourceUnchangedAfterProjectionMutation(snapshot, kernel, (out) => {
      const typed = out as Extract<ReturnType<typeof adaptDs4KickdownResearchToP2c2Evidence>, { ok: true }>;
      const cand = typed.plane.candidates[0];
      if (cand?.sourceModule === 'P2-B1') {
        (cand.originalCandidate as { peakThrottlePct: number }).peakThrottlePct = -99;
      }
    }, adaptDs4KickdownResearchToP2c2Evidence);
  });

  it('B2: mutating subtypeAssessability does not mutate source', () => {
    const pack = buildDbiP2c15ScenarioPackage('S09_MISSING_REQUIRED_CHANNELS');
    if (pack.payload.kind !== 'MODULE_B2_INPUT') throw new Error('expected B2');
    const kernel = computeDs4PowertrainDemandColdEngineResearchV1(pack.payload.input);
    const snapshot = structuredClone(kernel);
    assertSourceUnchangedAfterProjectionMutation(snapshot, kernel, (out) => {
      const typed = out as Extract<ReturnType<typeof adaptDs4ColdEngineResearchToP2c2Evidence>, { ok: true }>;
      if (typed.plane.participant.sourceModule === 'P2-B2') {
        typed.plane.participant.subtypeAssessability.COLD_ENGINE_HIGH_LOAD.status = 'ASSESSABLE';
      }
    }, adaptDs4ColdEngineResearchToP2c2Evidence);
  });

  it('B3: mutating projected candidate does not mutate source', () => {
    const pack = buildDbiP2c15ScenarioPackage('S11_B3_SOLE_INSUFFICIENT_LOAD');
    if (pack.payload.kind !== 'MODULE_B3_INPUT') throw new Error('expected B3');
    const kernel = computeDs4PowertrainDemandSustainedLoadResearchV1(pack.payload.input);
    const snapshot = structuredClone(kernel);
    assertSourceUnchangedAfterProjectionMutation(snapshot, kernel, (out) => {
      const typed = out as Extract<ReturnType<typeof adaptDs4SustainedLoadResearchToP2c2Evidence>, { ok: true }>;
      if (typed.plane.participant.sourceModule === 'P2-B3') {
        (typed.plane.participant as { partialCoverage: { loadPresentBucketCount: number } }).partialCoverage.loadPresentBucketCount = 999;
      }
    }, adaptDs4SustainedLoadResearchToP2c2Evidence);
  });

  it('B4: mutating coverageDiagnostics does not mutate source', () => {
    const pack = buildDbiP2c15ScenarioPackage('S12_B4_ZERO_ASSESSABLE_FACETS');
    if (pack.payload.kind !== 'MODULE_B4_INPUT') throw new Error('expected B4');
    const kernel = computeDs4PowertrainDemandRevvingIdleResearchV1(pack.payload.input);
    const snapshot = structuredClone(kernel);
    assertSourceUnchangedAfterProjectionMutation(snapshot, kernel, (out) => {
      const typed = out as Extract<ReturnType<typeof adaptDs4RevvingIdleResearchToP2c2Evidence>, { ok: true }>;
      if (typed.plane.participant.sourceModule === 'P2-B4') {
        (typed.plane.participant.facetA.coverageDiagnostics as { rpmSpeedCoObservedLabelCount: number }).rpmSpeedCoObservedLabelCount = -1;
        (typed.plane.participant.coverageEvidence as { gridBucketCount: number }).gridBucketCount = -1;
      }
    }, adaptDs4RevvingIdleResearchToP2c2Evidence);
  });
});
