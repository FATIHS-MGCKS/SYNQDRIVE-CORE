import { computeDs4PowertrainDemandResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-research.kernel.v1';
import { computeDs4PowertrainDemandRevvingIdleResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-revving-idle.kernel.v1';
import { computeDs4PowertrainDemandSustainedLoadResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-sustained-load.kernel.v1';
import { buildDbiP2c15ScenarioPackage } from '../../dbi-p2c15-binding-envelope-fixtures/dbi-p2c15-binding-envelope.scenarios.v1';
import { computeDs4RpmEpisodeResearchV1 } from '../../ds4-rpm-episode-research/ds4-rpm-episode-research.kernel.v1';
import { adaptDs4RpmEpisodeResearchToP2c2Evidence } from '../dbi-p2c2-a1-evidence-adapter.v1';
import { adaptDs4KickdownResearchToP2c2Evidence } from '../dbi-p2c2-b1-evidence-adapter.v1';
import { adaptDs4SustainedLoadResearchToP2c2Evidence } from '../dbi-p2c2-b3-evidence-adapter.v1';
import { adaptDs4RevvingIdleResearchToP2c2Evidence } from '../dbi-p2c2-b4-evidence-adapter.v1';
import { adaptDs4ColdEngineResearchToP2c2Evidence } from '../dbi-p2c2-b2-evidence-adapter.v1';
import { computeDs4PowertrainDemandColdEngineResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-cold-engine.kernel.v1';
import {
  buildColdEngineBoundInput,
  coldEctGrid,
} from '../../ds4-powertrain-demand-research/__tests__/ds4-powertrain-demand-research.test-helpers';

const FACET_A_POSITIVE = {
  episodeKey: 'facet-a-pos',
  classification: 'HIGH_RPM_STATIONARY_LIKE_PROXY_CANDIDATE' as const,
  startProviderBucketLabelIso: '2026-01-01T10:00:12.000Z',
  endProviderBucketLabelIso: '2026-01-01T10:00:16.000Z',
  observedLabelCount: 4,
  researchLabelSpanMs: 4000,
  maxObservedLabelGapMs: 1000,
  peakObservedRpm: 2100,
  limitationCodes: [] as string[],
  requiredChannelPresence: {} as Record<string, boolean>,
};

const FACET_B_POSITIVE = {
  episodeKey: 'facet-b-pos',
  classification: 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY_CANDIDATE' as const,
  startProviderBucketLabelIso: '2026-01-01T10:00:12.000Z',
  endProviderBucketLabelIso: '2026-01-01T10:03:12.000Z',
  observedLabelCount: 180,
  researchLabelSpanMs: 180_000,
  maxObservedLabelGapMs: 1000,
  meanObservedRpmInBand: 850,
  limitationCodes: [] as string[],
  requiredChannelPresence: {} as Record<string, boolean>,
};

function s12B4Kernel() {
  const pack = buildDbiP2c15ScenarioPackage('S12_B4_ZERO_ASSESSABLE_FACETS');
  if (pack.payload.kind !== 'MODULE_B4_INPUT') throw new Error('expected B4');
  return computeDs4PowertrainDemandRevvingIdleResearchV1(pack.payload.input);
}

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

  it('B4 ABSTAINED + valid positive Facet A fails closed', () => {
    const tampered = structuredClone(s12B4Kernel());
    tampered.status = 'ABSTAINED';
    tampered.revvingIdle.facetA.assessability = 'ASSESSABLE';
    tampered.revvingIdle.facetA.candidates = [FACET_A_POSITIVE];
    const out = adaptDs4RevvingIdleResearchToP2c2Evidence(tampered);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('CONTRADICTORY_POSITIVE_CANDIDATES_UNDER_ABSTAIN');
  });

  it('B4 NOT_OBSERVED + valid positive Facet B fails closed', () => {
    const tampered = structuredClone(s12B4Kernel());
    tampered.status = 'NOT_OBSERVED';
    tampered.revvingIdle.facetB.assessability = 'ASSESSABLE';
    tampered.revvingIdle.facetB.candidates = [FACET_B_POSITIVE];
    const out = adaptDs4RevvingIdleResearchToP2c2Evidence(tampered);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('CONTRADICTORY_POSITIVE_CANDIDATES_UNDER_NOT_OBSERVED');
  });

  it('B4 Facet B NOT_ASSESSABLE + positive fails closed', () => {
    const tampered = structuredClone(s12B4Kernel());
    tampered.revvingIdle.facetB.candidates = [FACET_B_POSITIVE];
    const out = adaptDs4RevvingIdleResearchToP2c2Evidence(tampered);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('B4_CONTRADICTORY_POSITIVE_UNDER_UNASSESSABLE_FACET_B');
  });

  it('B4 Facet A wrong proxy classification fails closed', () => {
    const tampered = structuredClone(s12B4Kernel());
    tampered.revvingIdle.facetA.assessability = 'ASSESSABLE';
    tampered.revvingIdle.facetA.candidates = [
      {
        ...FACET_A_POSITIVE,
        classification: 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY_CANDIDATE',
      } as unknown as (typeof tampered.revvingIdle.facetA.candidates)[number],
    ];
    const out = adaptDs4RevvingIdleResearchToP2c2Evidence(tampered);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('B4_CONTRADICTORY_FACET_A_CANDIDATE_CLASSIFICATION');
  });

  it('B4 legitimate Facet A positive passes when internally consistent', () => {
    const tampered = structuredClone(s12B4Kernel());
    tampered.status = 'COMPUTED';
    tampered.revvingIdle.facetA.assessability = 'ASSESSABLE';
    tampered.revvingIdle.facetA.tripEvidenceClassification = 'HIGH_RPM_STATIONARY_LIKE_PROXY_CANDIDATE';
    tampered.revvingIdle.facetA.candidates = [FACET_A_POSITIVE];
    const out = adaptDs4RevvingIdleResearchToP2c2Evidence(tampered);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.plane.candidates).toHaveLength(1);
    expect(out.plane.candidates[0]!.sourceEpisodeKey).toBe('facet-a-pos');
  });

  it('B2 NOT_ASSESSABLE subtype with positive candidate of same kind fails closed', () => {
    const grid = coldEctGrid(12, (i) => {
      if (i >= 2 && i <= 4) return { loadPct: 88, rpm: null, throttlePct: 40 };
      return { loadPct: 12, rpm: null };
    });
    const kernel = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid }),
    );
    const tampered = structuredClone(kernel);
    const positive = tampered.coldEngine.candidates.find((c) =>
      c.classification.includes('PROXY_CANDIDATE'),
    );
    if (!positive) throw new Error('expected cold-engine positive candidate');
    tampered.coldEngine.subtypeAssessability[positive.proxyKind] = {
      status: 'NOT_ASSESSABLE',
      reasonCodes: ['INJECTED_TEST'],
    };
    const out = adaptDs4ColdEngineResearchToP2c2Evidence(tampered);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('B2_CONTRADICTORY_POSITIVE_UNDER_NOT_ASSESSABLE_SUBTYPE');
  });

  it('B2 mixed subtype assessability passes without false promotion', () => {
    const grid = coldEctGrid(12, (i) => {
      if (i >= 2 && i <= 4) return { loadPct: 88, rpm: null, throttlePct: 40 };
      return { loadPct: 12, rpm: null };
    });
    const kernel = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid }),
    );
    const tampered = structuredClone(kernel);
    tampered.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_RPM = {
      status: 'NOT_ASSESSABLE',
      reasonCodes: ['MISSING_REFERENCE'],
    };
    const out = adaptDs4ColdEngineResearchToP2c2Evidence(tampered);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const hasHighRpmPositive = out.plane.candidates.some(
      (c) => c.sourceModule === 'P2-B2' && c.proxyKind === 'COLD_ENGINE_HIGH_RPM',
    );
    expect(hasHighRpmPositive).toBe(false);
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
