import { computeDs4PowertrainDemandResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-research.kernel.v1';
import { computeDs4PowertrainDemandRevvingIdleResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-revving-idle.kernel.v1';
import { computeDs4PowertrainDemandSustainedLoadResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-sustained-load.kernel.v1';
import { buildDbiP2c15ScenarioPackage } from '../../dbi-p2c15-binding-envelope-fixtures/dbi-p2c15-binding-envelope.scenarios.v1';
import { computeDs4RpmEpisodeResearchV1 } from '../../ds4-rpm-episode-research/ds4-rpm-episode-research.kernel.v1';
import { adaptDs4RpmEpisodeResearchToP2c2Evidence } from '../dbi-p2c2-a1-evidence-adapter.v1';
import { adaptDs4KickdownResearchToP2c2Evidence } from '../dbi-p2c2-b1-evidence-adapter.v1';
import { adaptDs4SustainedLoadResearchToP2c2Evidence } from '../dbi-p2c2-b3-evidence-adapter.v1';
import { adaptDs4RevvingIdleResearchToP2c2Evidence } from '../dbi-p2c2-b4-evidence-adapter.v1';

describe('dbi-p2c2 contradiction gates', () => {
  it('B1 NOT_OBSERVED with positive candidate fails closed', () => {
    const pack = buildDbiP2c15ScenarioPackage('S01_VALID_ICE_BASELINE');
    if (pack.payload.kind !== 'POWERTRAIN_INPUT') throw new Error('expected powertrain');
    const kernel = computeDs4PowertrainDemandResearchV1(pack.payload.input);
    const tampered = structuredClone(kernel);
    tampered.status = 'NOT_OBSERVED';
    if (tampered.kickdown.candidates.length === 0) {
      throw new Error('expected at least one candidate for contradiction test');
    }
    tampered.kickdown.candidates[0] = {
      ...tampered.kickdown.candidates[0],
      classification: 'KICKDOWN_LIKE_PROXY_CANDIDATE',
    };
    const out = adaptDs4KickdownResearchToP2c2Evidence(tampered);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('CONTRADICTORY_POSITIVE_CANDIDATES_UNDER_NOT_OBSERVED');
  });

  it('B3 ABSTAINED with positive candidate fails closed', () => {
    const pack = buildDbiP2c15ScenarioPackage('S01_VALID_ICE_BASELINE');
    if (pack.payload.kind !== 'POWERTRAIN_INPUT') throw new Error('expected powertrain');
    const sustained = computeDs4PowertrainDemandSustainedLoadResearchV1(pack.payload.input);
    const tampered = structuredClone(sustained);
    tampered.status = 'ABSTAINED';
    tampered.sustainedLoad.candidates = [
      {
        episodeKey: 'contradiction-ep',
        classification: 'GAP_AWARE_SUSTAINED_PROXY_CANDIDATE',
        startProviderBucketLabelIso: '2026-01-01T10:00:01.000Z',
        endProviderBucketLabelIso: '2026-01-01T10:00:05.000Z',
        observedLabelCount: 4,
        researchLabelSpanMs: 4000,
        maxObservedLabelGapMs: 1000,
        peakObservedLoadPct: 80,
        entryBranch: 'BOTH',
        limitationCodes: [],
        requiredChannelPresence: {},
      },
    ];
    const out = adaptDs4SustainedLoadResearchToP2c2Evidence(tampered);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('CONTRADICTORY_POSITIVE_CANDIDATES_UNDER_ABSTAIN');
  });

  it('B3 ABSTAINED sole insufficient load without positive candidates remains admissible', () => {
    const pack = buildDbiP2c15ScenarioPackage('S11_B3_SOLE_INSUFFICIENT_LOAD');
    if (pack.payload.kind !== 'MODULE_B3_INPUT') throw new Error('expected B3');
    const kernel = computeDs4PowertrainDemandSustainedLoadResearchV1(pack.payload.input);
    const out = adaptDs4SustainedLoadResearchToP2c2Evidence(kernel);
    expect(out.ok).toBe(true);
  });

  it('B4 dual NOT_ASSESSABLE with injected positive facet A candidate fails closed', () => {
    const pack = buildDbiP2c15ScenarioPackage('S12_B4_ZERO_ASSESSABLE_FACETS');
    if (pack.payload.kind !== 'MODULE_B4_INPUT') throw new Error('expected B4');
    const kernel = computeDs4PowertrainDemandRevvingIdleResearchV1(pack.payload.input);
    const tampered = structuredClone(kernel);
    tampered.revvingIdle.facetA.candidates = [
      {
        episodeKey: 'facet-a-injected',
        classification: 'HIGH_RPM_STATIONARY_LIKE_PROXY_CANDIDATE',
        startProviderBucketLabelIso: '2026-01-01T10:00:12.000Z',
        endProviderBucketLabelIso: '2026-01-01T10:00:16.000Z',
        observedLabelCount: 4,
        researchLabelSpanMs: 4000,
        maxObservedLabelGapMs: 1000,
        peakObservedRpm: 2100,
        limitationCodes: [],
        requiredChannelPresence: {},
      },
    ];
    const out = adaptDs4RevvingIdleResearchToP2c2Evidence(tampered);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('B4_CONTRADICTORY_POSITIVE_UNDER_UNASSESSABLE_FACET_A');
  });

  it('B4 S12 legitimate COMPUTED dual NOT_ASSESSABLE zero candidates passes', () => {
    const pack = buildDbiP2c15ScenarioPackage('S12_B4_ZERO_ASSESSABLE_FACETS');
    if (pack.payload.kind !== 'MODULE_B4_INPUT') throw new Error('expected B4');
    const kernel = computeDs4PowertrainDemandRevvingIdleResearchV1(pack.payload.input);
    const out = adaptDs4RevvingIdleResearchToP2c2Evidence(kernel);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.plane.candidates.length).toBe(0);
  });

  it('A1 ABSTAINED with descriptive episodes fails closed', () => {
    const pack = buildDbiP2c15ScenarioPackage('S14_A1_DESCRIPTIVE_ONLY');
    if (pack.payload.kind !== 'A1_INPUT') throw new Error('expected A1');
    const kernel = computeDs4RpmEpisodeResearchV1(pack.payload.input);
    const tampered = structuredClone(kernel);
    tampered.status = 'ABSTAINED';
    const out = adaptDs4RpmEpisodeResearchToP2c2Evidence(tampered);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('A1_CONTRADICTORY_DESCRIPTIVE_EPISODES_UNDER_ABSTAIN');
  });
});
