import {
  tryCanonicalJsonStringify,
  tryCanonicalizeJsonValue,
} from '../dbi-p2c3-reconciliation.canonical-json.v1';
import {
  buildCandidateEnvelopeIdentityPayload,
  tryBuildCandidateEnvelopeIdentityPayload,
} from '../dbi-p2c3-reconciliation.canonical.v1';
import {
  adaptKickdownPlaneFromScenario,
  assembleP2c2Bundle,
  baselineMatchingMultiModuleBundle,
  cloneMutablePlane,
} from './dbi-p2c3-reconciliation.test-helpers';
import type { DbiP2c2ProxyCandidateEnvelopeV1 } from '../../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import { reconcileDbiP2c2OfflineEvidenceBundleV1 } from '../index.v1';

function locateCanonicalFailure(value: unknown, path = 'root'): string | null {
  const probe = tryCanonicalizeJsonValue(value);
  if (probe.ok) return null;
  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        const nested = locateCanonicalFailure(entry, `${path}[${index}]`);
        if (nested) return nested;
      });
      return `${path}:${probe.reason}`;
    }
    for (const key of Object.keys(value as object)) {
      const nested = locateCanonicalFailure(
        (value as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
      if (nested) return nested;
    }
  }
  return `${path}:${probe.reason}`;
}

describe('dbi-p2c3 lossless canonical identity', () => {
  it('baseline adapter candidates are canonicalizable', () => {
    for (const plane of baselineMatchingMultiModuleBundle().powertrainProxies) {
      for (const cand of plane.candidates) {
        const built = tryBuildCandidateEnvelopeIdentityPayload(cand);
        if (!built.ok) {
          const path = locateCanonicalFailure(cand.originalCandidate, 'originalCandidate');
          throw new Error(`module=${cand.sourceModule} reason=${built.reason} at=${path}`);
        }
        expect(built.ok).toBe(true);
      }
    }
  });

  it('null is canonical; undefined and NaN are rejected', () => {
    expect(tryCanonicalizeJsonValue(null)).toEqual({ ok: true, canonical: null });
    expect(tryCanonicalizeJsonValue(undefined)).toEqual({ ok: false, reason: 'UNDEFINED' });
    expect(tryCanonicalizeJsonValue(Number.NaN)).toEqual({ ok: false, reason: 'NON_FINITE_NUMBER' });
    expect(tryCanonicalizeJsonValue({ a: null, b: 1 })).toMatchObject({ ok: true });
    expect(tryCanonicalizeJsonValue({ a: undefined })).toEqual({ ok: false, reason: 'UNDEFINED' });
    expect(tryCanonicalJsonStringify({ x: null })).not.toEqual(tryCanonicalJsonStringify({ x: Number.NaN }));
  });

  it('bigint and non-plain objects are rejected', () => {
    expect(tryCanonicalizeJsonValue(1n)).toEqual({ ok: false, reason: 'BIGINT' });
    expect(tryCanonicalizeJsonValue(new Date())).toEqual({ ok: false, reason: 'UNSUPPORTED_OBJECT' });
    expect(tryCanonicalJsonStringify('1')).toEqual({ ok: true, json: '"1"' });
    expect(tryCanonicalizeJsonValue(1n)).toEqual({ ok: false, reason: 'BIGINT' });
  });

  it('nested property permutation preserves identical canonical payload', () => {
    const forward = { outer: { z: 1, a: { b: true, a: false } }, module: 'P2-B1' };
    const reversed = { module: 'P2-B1', outer: { z: 1, a: { a: false, b: true } } };
    const f = tryCanonicalJsonStringify(forward);
    const r = tryCanonicalJsonStringify(reversed);
    expect(f.ok && r.ok).toBe(true);
    if (!f.ok || !r.ok) return;
    expect(f.json).toBe(r.json);
  });

  it('rejects candidate envelopes with non-finite numeric identity fields', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const base = plane.candidates[0];
    if (!base || base.sourceModule !== 'P2-B1') throw new Error('b1');
    const broken = {
      ...structuredClone(base),
      originalCandidate: {
        ...structuredClone(base.originalCandidate),
        peakThrottlePct: Number.NaN,
      },
    } as DbiP2c2ProxyCandidateEnvelopeV1;
    expect(tryBuildCandidateEnvelopeIdentityPayload(broken).ok).toBe(false);
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [{ ...plane, candidates: [broken] }] }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('CANDIDATE_PAYLOAD_CANONICAL_INVALID');
  });

  it('does not emit SAME_SOURCE_DUPLICATE for semantically different valid payloads', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const base = plane.candidates[0];
    if (!base || base.sourceModule !== 'P2-B1') throw new Error('b1');
    const twin = {
      ...structuredClone(base),
      sourceEpisodeKey: `${base.originalCandidate.episodeKey}:other`,
      originalCandidate: {
        ...structuredClone(base.originalCandidate),
        episodeKey: `${base.originalCandidate.episodeKey}:other`,
      },
    } as DbiP2c2ProxyCandidateEnvelopeV1;
    plane.candidates = [base, twin];
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.pairwiseDecisions.some((d) => d.relationshipDecision === 'SAME_SOURCE_DUPLICATE')).toBe(false);
    expect(buildCandidateEnvelopeIdentityPayload(base)).not.toBe(buildCandidateEnvelopeIdentityPayload(twin));
  });

  it('allows acyclic shared object references in canonical JSON', () => {
    const shared = { channel: 'rpm', present: true };
    const payload = { left: shared, right: shared, module: 'P2-B1' };
    const result = tryCanonicalJsonStringify(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.json).toContain('"rpm"');
  });

  it('rejects self-referential object cycles', () => {
    const cyclic: { v: number; self?: unknown } = { v: 1 };
    cyclic.self = cyclic;
    expect(tryCanonicalizeJsonValue(cyclic)).toEqual({ ok: false, reason: 'CYCLIC_REFERENCE' });
  });

  it('rejects nested mutual object cycles', () => {
    const a: { b?: object } = {};
    const b: { a?: object } = {};
    a.b = b;
    b.a = a;
    expect(tryCanonicalizeJsonValue(a)).toEqual({ ok: false, reason: 'CYCLIC_REFERENCE' });
  });

  it('null field versus omitted field do not collapse to false duplicate identity', () => {
    const a = tryCanonicalJsonStringify({ rpm: null });
    const b = tryCanonicalJsonStringify({});
    const c = tryCanonicalJsonStringify({ rpm: undefined });
    expect(a.ok && b.ok).toBe(true);
    expect(c.ok).toBe(false);
    if (!a.ok || !b.ok) return;
    expect(a.json).not.toBe(b.json);
  });
});
