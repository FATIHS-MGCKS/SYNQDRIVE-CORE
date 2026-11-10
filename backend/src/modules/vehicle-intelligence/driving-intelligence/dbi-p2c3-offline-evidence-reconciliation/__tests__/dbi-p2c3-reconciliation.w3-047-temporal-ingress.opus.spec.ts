/**
 * W3-047 — P2-C3 temporal ingress integrity (forged P2-C2-shaped bundles, no adapter re-run).
 *
 * RED-BEFORE (pre-gate): structurally valid bundles with malformed provider bucket labels could
 * reach identity admission, candidate inventory, pairwise edges, and digest.
 */
import { reconcileDbiP2c2OfflineEvidenceBundleV1 } from '../index.v1';
import type { DbiP2c2OfflineEvidenceBundleV1 } from '../../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import {
  adaptA1DescriptivePlaneFromS14,
  adaptColdEnginePositiveCandidatePlane,
  adaptKickdownPlaneFromScenario,
  adaptRevvingIdleB4FacetAPlaneFromS01,
  adaptSustainedLoadPlaneFromS11,
  assembleP2c2Bundle,
  baselineMatchingMultiModuleBundle,
  cloneMutablePlane,
} from './dbi-p2c3-reconciliation.test-helpers';

/** One-time materialization for direct structural forgery (tests do not re-invoke adapters). */
const CACHED_B1 = adaptKickdownPlaneFromScenario();
const CACHED_B2 = adaptColdEnginePositiveCandidatePlane();
const CACHED_B3 = adaptSustainedLoadPlaneFromS11();
const CACHED_B4 = adaptRevvingIdleB4FacetAPlaneFromS01();
const CACHED_A1 = adaptA1DescriptivePlaneFromS14();

function expectFailClosed(
  bundle: DbiP2c2OfflineEvidenceBundleV1,
  ...codes: string[]
) {
  const out = reconcileDbiP2c2OfflineEvidenceBundleV1(bundle);
  expect(out.ok).toBe(false);
  if (out.ok) throw new Error('expected reconciliation failure');
  expect(out.diagnosticCodes).toEqual(codes);
  expect(Object.keys(out).sort()).toEqual(['contractVersion', 'diagnosticCodes', 'ok']);
}

function forgedB1(mutate: (c: Record<string, unknown>) => void): DbiP2c2OfflineEvidenceBundleV1 {
  const plane = cloneMutablePlane(CACHED_B1);
  const cand = plane.candidates[0]! as { originalCandidate: Record<string, unknown> };
  mutate(cand.originalCandidate);
  return assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] });
}

function forgedB2(mutate: (c: Record<string, unknown>) => void): DbiP2c2OfflineEvidenceBundleV1 {
  const plane = cloneMutablePlane(CACHED_B2);
  const cand = plane.candidates[0]! as { originalCandidate: Record<string, unknown> };
  mutate(cand.originalCandidate);
  return assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] });
}

function forgedB3(mutate: (c: Record<string, unknown>) => void): DbiP2c2OfflineEvidenceBundleV1 {
  const plane = cloneMutablePlane(CACHED_B3);
  const cand = plane.candidates[0]! as { originalCandidate: Record<string, unknown> };
  if (cand) mutate(cand.originalCandidate);
  return assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] });
}

function forgedB4(mutate: (c: Record<string, unknown>) => void): DbiP2c2OfflineEvidenceBundleV1 {
  const plane = cloneMutablePlane(CACHED_B4);
  const cand = plane.candidates.find((c) => c.sourceModule === 'P2-B4')! as {
    originalCandidate: Record<string, unknown>;
  };
  mutate(cand.originalCandidate);
  return assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] });
}

function forgedA1(mutate: (item: Record<string, unknown>) => void): DbiP2c2OfflineEvidenceBundleV1 {
  const plane = structuredClone(CACHED_A1!) as NonNullable<typeof CACHED_A1>;
  const ep = plane.episodes[0]!;
  mutate(ep.sourceEpisode as unknown as Record<string, unknown>);
  return assembleP2c2Bundle({ descriptive: plane, powertrainProxies: [] });
}

describe('W3-047 P2-C3 temporal ingress (forged bundles)', () => {
  describe('A1 descriptive episodes', () => {
    it('rejects invalid calendar date', () => {
      expectFailClosed(
        forgedA1((s) => {
          s.providerBucketLabelStartIso = '2026-02-30T12:00:00.000Z';
        }),
        'INVALID_PROVIDER_BUCKET_LABEL',
      );
    });

    it('rejects noncanonical ISO precision (no fractional ms)', () => {
      expectFailClosed(
        forgedA1((s) => {
          s.providerBucketLabelEndIso = '2026-01-01T10:00:00Z';
        }),
        'INVALID_PROVIDER_BUCKET_LABEL',
      );
    });

    it('rejects offset instead of Z', () => {
      expectFailClosed(
        forgedA1((s) => {
          s.providerBucketLabelStartIso = '2026-01-01T10:00:00.000+01:00';
        }),
        'INVALID_PROVIDER_BUCKET_LABEL',
      );
    });

    it('rejects end before start', () => {
      expectFailClosed(
        forgedA1((s) => {
          s.providerBucketLabelStartIso = '2026-01-01T10:00:05.000Z';
          s.providerBucketLabelEndIso = '2026-01-01T10:00:01.000Z';
        }),
        'INVALID_TEMPORAL_INTERVAL_ORDER',
      );
    });

    it('rejects startIdx greater than endIdx', () => {
      expectFailClosed(
        forgedA1((s) => {
          s.startIdx = 12;
          s.endIdx = 3;
        }),
        'INVALID_BUCKET_INDEX_ORDER',
      );
    });

    it('rejects wrong-type label field without throwing', () => {
      expectFailClosed(
        forgedA1((s) => {
          s.providerBucketLabelStartIso = 42;
        }),
        'INVALID_PROVIDER_BUCKET_LABEL',
      );
    });

    it.each([
      ['startIdx string', (s: Record<string, unknown>) => (s.startIdx = '3')],
      ['startIdx undefined', (s: Record<string, unknown>) => {
        delete s.startIdx;
      }],
      ['endIdx NaN', (s: Record<string, unknown>) => (s.endIdx = Number.NaN)],
      ['startIdx non-integer', (s: Record<string, unknown>) => (s.startIdx = 1.5)],
      ['startIdx negative', (s: Record<string, unknown>) => (s.startIdx = -1)],
    ])('rejects malformed index contract: %s', (_label, mutate) => {
      expectFailClosed(forgedA1(mutate), 'INVALID_TEMPORAL_BUCKET_INDEX_SHAPE');
    });
  });

  describe('B1 kickdown', () => {
    it.each([
      ['invalid date', (c: Record<string, unknown>) => (c.providerBucketLabelStartIso = 'not-a-date')],
      ['end before start', (c: Record<string, unknown>) => {
        c.providerBucketLabelStartIso = '2026-01-01T10:00:10.000Z';
        c.providerBucketLabelEndIso = '2026-01-01T10:00:01.000Z';
      }],
      ['index order', (c: Record<string, unknown>) => {
        c.startBucketIndex = 9;
        c.endBucketIndex = 2;
      }],
    ])('rejects %s', (_label, mutate) => {
      const codes =
        _label === 'index order'
          ? ['INVALID_BUCKET_INDEX_ORDER']
          : _label === 'end before start'
            ? ['INVALID_TEMPORAL_INTERVAL_ORDER']
            : ['INVALID_PROVIDER_BUCKET_LABEL'];
      expectFailClosed(forgedB1(mutate), ...codes);
    });

    it.each([
      ['startBucketIndex string', (c: Record<string, unknown>) => (c.startBucketIndex = '0')],
      ['startBucketIndex undefined', (c: Record<string, unknown>) => {
        delete c.startBucketIndex;
      }],
      ['endBucketIndex NaN', (c: Record<string, unknown>) => (c.endBucketIndex = Number.NaN)],
      ['startBucketIndex non-integer', (c: Record<string, unknown>) => (c.startBucketIndex = 2.2)],
      ['startBucketIndex negative', (c: Record<string, unknown>) => (c.startBucketIndex = -1)],
    ])('rejects malformed index contract: %s', (_label, mutate) => {
      expectFailClosed(forgedB1(mutate), 'INVALID_TEMPORAL_BUCKET_INDEX_SHAPE');
    });
  });

  describe('B2 cold engine', () => {
    it('rejects malformed provider labels', () => {
      expectFailClosed(
        forgedB2((c) => {
          c.providerBucketLabelEndIso = '2026-01-01T10:00:00.000';
        }),
        'INVALID_PROVIDER_BUCKET_LABEL',
      );
    });

    it('rejects malformed startBucketIndex when end valid', () => {
      expectFailClosed(
        forgedB2((c) => {
          delete c.startBucketIndex;
        }),
        'INVALID_TEMPORAL_BUCKET_INDEX_SHAPE',
      );
    });
  });

  describe('W3-B closeout: sourceModule field-family selection (no cross-family bypass)', () => {
    /**
     * RED-BEFORE: invalid native module labels could be masked by valid labels in another module's field family
     * when selection keyed off presence of B3/B4 keys.
     */
    it('B1 rejects invalid providerBucketLabel* even with valid B3 ISO fields on same object', () => {
      expectFailClosed(
        forgedB1((c) => {
          c.providerBucketLabelStartIso = 'NOT_CANONICAL';
          c.providerBucketLabelEndIso = 'NOT_CANONICAL';
          c.startProviderBucketLabelIso = '2026-01-01T10:00:01.000Z';
          c.endProviderBucketLabelIso = '2026-01-01T10:00:05.000Z';
        }),
        'INVALID_PROVIDER_BUCKET_LABEL',
      );
    });

    it('B2 rejects invalid providerBucketLabel* even with valid B3 ISO fields on same object', () => {
      expectFailClosed(
        forgedB2((c) => {
          c.providerBucketLabelStartIso = '2026-02-30T12:00:00.000Z';
          c.startProviderBucketLabelIso = '2026-01-01T10:00:01.000Z';
          c.endProviderBucketLabelIso = '2026-01-01T10:00:05.000Z';
        }),
        'INVALID_PROVIDER_BUCKET_LABEL',
      );
    });

    it('B3 rejects invalid startProviderBucketLabel* even with valid B1 ISO fields on same object', () => {
      const plane = cloneMutablePlane(CACHED_B3);
      const forged = {
        episodeKey: 'cross-family-b3',
        classification: 'GAP_AWARE_SUSTAINED_PROXY_CANDIDATE' as const,
        startProviderBucketLabelIso: 'INVALID',
        endProviderBucketLabelIso: 'INVALID',
        providerBucketLabelStartIso: '2026-01-01T10:00:01.000Z',
        providerBucketLabelEndIso: '2026-01-01T10:00:05.000Z',
        observedLabelCount: 4,
        researchLabelSpanMs: 4000,
        maxObservedLabelGapMs: 1000,
        peakObservedLoadPct: 90,
        entryBranch: 'BOTH' as const,
        limitationCodes: [],
        requiredChannelPresence: {},
      };
      plane.candidates = [
        {
          sourceModule: 'P2-B3',
          originalCandidate: forged,
          originalClassification: forged.classification,
          sourceEpisodeKey: forged.episodeKey,
        },
      ];
      expectFailClosed(
        assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
        'INVALID_PROVIDER_BUCKET_LABEL',
      );
    });

    it('B4 rejects invalid native labels even with valid B1 ISO fields on same object', () => {
      expectFailClosed(
        forgedB4((c) => {
          c.startProviderBucketLabelIso = '2026-01-01T10:00:00.000';
          c.endProviderBucketLabelIso = '2026-01-01T10:00:05.000Z';
          c.providerBucketLabelStartIso = '2026-01-01T10:00:01.000Z';
          c.providerBucketLabelEndIso = '2026-01-01T10:00:05.000Z';
        }),
        'INVALID_PROVIDER_BUCKET_LABEL',
      );
    });
  });

  describe('B3 sustained load', () => {
    it('rejects temporal interval order when candidate present', () => {
      const plane = cloneMutablePlane(CACHED_B3);
      const forged = {
        episodeKey: 'forged-b3-temporal',
        classification: 'GAP_AWARE_SUSTAINED_PROXY_CANDIDATE' as const,
        startProviderBucketLabelIso: '2026-01-01T10:00:30.000Z',
        endProviderBucketLabelIso: '2026-01-01T10:00:01.000Z',
        observedLabelCount: 4,
        researchLabelSpanMs: 4000,
        maxObservedLabelGapMs: 1000,
        peakObservedLoadPct: 90,
        entryBranch: 'BOTH' as const,
        limitationCodes: [],
        requiredChannelPresence: {},
      };
      plane.candidates = [
        {
          sourceModule: 'P2-B3',
          originalCandidate: forged,
          originalClassification: forged.classification,
          sourceEpisodeKey: forged.episodeKey,
        },
      ];
      expectFailClosed(
        assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
        'INVALID_TEMPORAL_INTERVAL_ORDER',
      );
    });

    it('permits missing index fields on B3 envelope', () => {
      const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
        assembleP2c2Bundle({ descriptive: null, powertrainProxies: [CACHED_B3] }),
      );
      expect(out.ok).toBe(true);
    });
  });

  describe('B4 revving idle', () => {
    it('rejects invalid startProviderBucketLabelIso', () => {
      expectFailClosed(
        forgedB4((c) => {
          c.startProviderBucketLabelIso = 'INVALID';
        }),
        'INVALID_PROVIDER_BUCKET_LABEL',
      );
    });

    it('accepts equal start/end timestamps when canonical', () => {
      const plane = cloneMutablePlane(CACHED_B4);
      const cand = plane.candidates[0]!.originalCandidate as Record<string, unknown>;
      const t = '2026-01-01T10:00:12.000Z';
      cand.startProviderBucketLabelIso = t;
      cand.endProviderBucketLabelIso = t;
      const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
        assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
      );
      expect(out.ok).toBe(true);
    });
  });
});

describe('W3-047 positive controls (P2-C2 adapter path)', () => {
  it('A1 descriptive-only bundle reconciles without temporal rejection', () => {
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: CACHED_A1, powertrainProxies: [] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('expected success');
    expect(out.relationshipReconciliation).toEqual({ performed: false, skipReason: 'IDENTITY_INCONCLUSIVE' });
  });

  it('B1+B2 matching identity yields ADMITTED (cross-module — no SAME_SOURCE_DUPLICATE)', () => {
    const base = baselineMatchingMultiModuleBundle();
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(base);
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('expected success');
    expect(out.identityAdmission.verdict).toBe('ADMITTED');
    expect(out.pairwiseDecisions.every((d) => d.relationshipDecision !== 'SAME_SOURCE_DUPLICATE')).toBe(true);
  });

  it('duplicate B1 positives still emit exactly one SAME_SOURCE_DUPLICATE when admitted', () => {
    const plane = cloneMutablePlane(CACHED_B1);
    const pos = plane.candidates.find((c) => c.originalClassification === 'KICKDOWN_LIKE_PROXY_CANDIDATE')!;
    plane.candidates = [structuredClone(pos), structuredClone(pos)];
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('expected success');
    expect(out.pairwiseDecisions.filter((d) => d.relationshipDecision === 'SAME_SOURCE_DUPLICATE')).toHaveLength(1);
  });

  it('deterministic digest under candidate reorder in bundle', () => {
    const b1 = adaptKickdownPlaneFromScenario();
    const b2 = adaptColdEnginePositiveCandidatePlane();
    const forward = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [b1, b2] }),
    );
    const reverse = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [b2, b1] }),
    );
    expect(forward.ok && reverse.ok).toBe(true);
    if (!forward.ok || !reverse.ok) throw new Error('expected success');
    expect(forward.resultDigest).toBe(reverse.resultDigest);
  });

  it('B1 equal start/end indices accepted when labels valid', () => {
    const plane = cloneMutablePlane(CACHED_B1);
    const c = plane.candidates[0]!.originalCandidate as Record<string, unknown>;
    const t = '2026-01-01T10:00:12.000Z';
    c.providerBucketLabelStartIso = t;
    c.providerBucketLabelEndIso = t;
    c.startBucketIndex = 5;
    c.endBucketIndex = 5;
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
    );
    expect(out.ok).toBe(true);
  });
});
