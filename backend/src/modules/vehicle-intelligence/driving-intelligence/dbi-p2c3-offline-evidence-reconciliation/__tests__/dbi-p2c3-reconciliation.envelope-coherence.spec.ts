import {
  adaptColdEnginePositiveCandidatePlane,
  adaptKickdownPlaneFromScenario,
  adaptRevvingIdleB4DualFacetPlaneFromS01,
  adaptSustainedLoadPlaneFromS11,
  assembleP2c2Bundle,
  cloneMutablePlane,
} from './dbi-p2c3-reconciliation.test-helpers';
import type { DbiP2c2ProxyCandidateEnvelopeV1 } from '../../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import { reconcileDbiP2c2OfflineEvidenceBundleV1 } from '../index.v1';

function expectIncoherent(plane: ReturnType<typeof cloneMutablePlane>): void {
  const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
    assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
  );
  expect(out.ok).toBe(false);
  if (out.ok) return;
  expect(out.diagnosticCodes).toEqual(
    expect.arrayContaining(['CANDIDATE_ENVELOPE_INCOHERENT']),
  );
}

describe('dbi-p2c3 candidate envelope coherence', () => {
  it('rejects B1 support tier drift', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const cand = plane.candidates[0];
    if (!cand || cand.sourceModule !== 'P2-B1') throw new Error('b1');
    const wrongTier =
      cand.originalCandidate.candidateSupportTier === 'STRONG' ? 'WEAK' : 'STRONG';
    plane.candidates = [
      {
        ...structuredClone(cand),
        originalCandidateSupportTier: wrongTier,
      } as DbiP2c2ProxyCandidateEnvelopeV1,
    ];
    expectIncoherent(plane);
  });

  it('rejects B2 proxyKind drift', () => {
    const plane = cloneMutablePlane(adaptColdEnginePositiveCandidatePlane());
    const cand = plane.candidates[0];
    if (!cand || cand.sourceModule !== 'P2-B2') throw new Error('b2');
    if (plane.participant.sourceModule !== 'P2-B2' || cand.sourceModule !== 'P2-B2') {
      throw new Error('expected P2-B2');
    }
    const alt = (
      Object.keys(plane.participant.subtypeAssessability) as Array<typeof cand.proxyKind>
    ).find((k) => k !== cand.proxyKind);
    if (!alt) throw new Error('no alternate proxy kind');
    plane.candidates = [
      {
        ...structuredClone(cand),
        proxyKind: alt,
      } as DbiP2c2ProxyCandidateEnvelopeV1,
    ];
    expectIncoherent(plane);
  });

  it('rejects B3 episode key drift', () => {
    const plane = cloneMutablePlane(adaptSustainedLoadPlaneFromS11());
    const baseline = {
      sourceModule: 'P2-B3' as const,
      sourceEpisodeKey: 'b3-coherence-ep',
      originalClassification: 'GAP_AWARE_SUSTAINED_PROXY_CANDIDATE' as const,
      originalCandidate: {
        episodeKey: 'b3-coherence-ep',
        classification: 'GAP_AWARE_SUSTAINED_PROXY_CANDIDATE' as const,
        startProviderBucketLabelIso: '2026-01-01T10:00:01.000Z',
        endProviderBucketLabelIso: '2026-01-01T10:00:05.000Z',
        observedLabelCount: 4,
        researchLabelSpanMs: 4000,
        maxObservedLabelGapMs: 1000,
        peakObservedLoadPct: 12,
        entryBranch: 'BOTH' as const,
        limitationCodes: [] as string[],
        requiredChannelPresence: { load: true, rpm: true, speed: true, throttle: true },
      },
    };
    plane.candidates = [
      {
        ...baseline,
        sourceEpisodeKey: `${baseline.sourceEpisodeKey}:tamper`,
      },
    ];
    expectIncoherent(plane);
  });

  it('rejects B4 facet A envelope carrying facet B candidate shape', () => {
    const plane = cloneMutablePlane(adaptRevvingIdleB4DualFacetPlaneFromS01());
    const facetB = plane.candidates.find(
      (c) => c.sourceModule === 'P2-B4' && c.facet === 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY',
    );
    const facetA = plane.candidates.find(
      (c) => c.sourceModule === 'P2-B4' && c.facet === 'HIGH_RPM_STATIONARY_LIKE_PROXY',
    );
    if (!facetB || !facetA || facetB.sourceModule !== 'P2-B4' || facetA.sourceModule !== 'P2-B4') {
      throw new Error('b4 facets');
    }
    plane.candidates = [
      {
        ...structuredClone(facetA),
        originalCandidate: structuredClone(facetB.originalCandidate),
        originalClassification: facetB.originalClassification,
      } as DbiP2c2ProxyCandidateEnvelopeV1,
    ];
    expectIncoherent(plane);
  });

  it('rejects B4 facet B envelope with facet A candidate shape', () => {
    const plane = cloneMutablePlane(adaptRevvingIdleB4DualFacetPlaneFromS01());
    const facetB = plane.candidates.find(
      (c) => c.sourceModule === 'P2-B4' && c.facet === 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY',
    );
    const facetA = plane.candidates.find(
      (c) => c.sourceModule === 'P2-B4' && c.facet === 'HIGH_RPM_STATIONARY_LIKE_PROXY',
    );
    if (!facetB || !facetA || facetB.sourceModule !== 'P2-B4' || facetA.sourceModule !== 'P2-B4') {
      throw new Error('b4 facets');
    }
    plane.candidates = [
      {
        ...structuredClone(facetB),
        originalCandidate: structuredClone(facetA.originalCandidate),
        originalClassification: facetA.originalClassification,
      } as DbiP2c2ProxyCandidateEnvelopeV1,
    ];
    expectIncoherent(plane);
  });

  it('rejects B4 classification disagreement', () => {
    const plane = cloneMutablePlane(adaptRevvingIdleB4DualFacetPlaneFromS01());
    const facetA = plane.candidates.find(
      (c) => c.sourceModule === 'P2-B4' && c.facet === 'HIGH_RPM_STATIONARY_LIKE_PROXY',
    );
    if (!facetA || facetA.sourceModule !== 'P2-B4') throw new Error('b4a');
    plane.candidates = [
      {
        ...structuredClone(facetA),
        originalClassification: 'SYNTHETIC_MISMATCH',
      } as DbiP2c2ProxyCandidateEnvelopeV1,
    ];
    expectIncoherent(plane);
  });
});
