/**
 * W3-C / DI-DEF-045 — B1 candidateSupportTier runtime enum guard (STRONG | MODERATE | WEAK).
 */
import type { DbiP2c2ProxyCandidateEnvelopeV1 } from '../../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import { reconcileDbiP2c2OfflineEvidenceBundleV1 } from '../index.v1';
import {
  adaptKickdownPlaneFromScenario,
  assembleP2c2Bundle,
  cloneMutablePlane,
} from './dbi-p2c3-reconciliation.test-helpers';

function expectRejected(
  plane: ReturnType<typeof cloneMutablePlane>,
  code: 'B1_CANDIDATE_SUPPORT_TIER_INVALID' | 'CANDIDATE_ENVELOPE_INCOHERENT',
): void {
  const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
    assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
  );
  expect(out.ok).toBe(false);
  if (out.ok) return;
  expect(out.diagnosticCodes).toContain(code);
}

describe('W3-C B1 candidateSupportTier enum guard', () => {
  it('red-before: matching forged tier values on envelope and candidate are rejected', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const cand = plane.candidates[0];
    if (!cand || cand.sourceModule !== 'P2-B1') throw new Error('expected B1 candidate');
    const forged = {
      ...structuredClone(cand),
      originalCandidateSupportTier: 'FORGED_TIER',
      originalCandidate: {
        ...structuredClone(cand.originalCandidate),
        candidateSupportTier: 'FORGED_TIER',
      },
    } as unknown as DbiP2c2ProxyCandidateEnvelopeV1;
    plane.candidates = [forged];
    expectRejected(plane, 'B1_CANDIDATE_SUPPORT_TIER_INVALID');
  });

  it('rejects matching INVALID on both envelope fields (dual-field forgery)', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const cand = plane.candidates[0];
    if (!cand || cand.sourceModule !== 'P2-B1') throw new Error('expected B1 candidate');
    const forged = {
      ...structuredClone(cand),
      originalCandidateSupportTier: 'INVALID',
      originalCandidate: {
        ...structuredClone(cand.originalCandidate),
        candidateSupportTier: 'INVALID',
      },
    } as unknown as DbiP2c2ProxyCandidateEnvelopeV1;
    plane.candidates = [forged];
    expectRejected(plane, 'B1_CANDIDATE_SUPPORT_TIER_INVALID');
  });

  it('rejects invalid envelope tier even when candidate carries a valid tier', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const cand = plane.candidates[0];
    if (!cand || cand.sourceModule !== 'P2-B1') throw new Error('expected B1 candidate');
    plane.candidates = [
      {
        ...structuredClone(cand),
        originalCandidateSupportTier: 'INVALID',
      } as unknown as DbiP2c2ProxyCandidateEnvelopeV1,
    ];
    expectRejected(plane, 'B1_CANDIDATE_SUPPORT_TIER_INVALID');
  });

  it('rejects invalid candidate tier even when envelope carries a valid tier', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const cand = plane.candidates[0];
    if (!cand || cand.sourceModule !== 'P2-B1') throw new Error('expected B1 candidate');
    plane.candidates = [
      {
        ...structuredClone(cand),
        originalCandidate: {
          ...structuredClone(cand.originalCandidate),
          candidateSupportTier: 'INVALID',
        },
      } as unknown as DbiP2c2ProxyCandidateEnvelopeV1,
    ];
    expectRejected(plane, 'B1_CANDIDATE_SUPPORT_TIER_INVALID');
  });

  it('preserves mismatch rejection between two valid tiers', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const cand = plane.candidates[0];
    if (!cand || cand.sourceModule !== 'P2-B1') throw new Error('expected B1 candidate');
    const wrongTier =
      cand.originalCandidate.candidateSupportTier === 'STRONG' ? 'WEAK' : 'STRONG';
    plane.candidates = [
      {
        ...structuredClone(cand),
        originalCandidateSupportTier: wrongTier,
      } as DbiP2c2ProxyCandidateEnvelopeV1,
    ];
    expectRejected(plane, 'CANDIDATE_ENVELOPE_INCOHERENT');
  });

  it('green-after: valid B1 adapter output remains admitted', () => {
    const plane = adaptKickdownPlaneFromScenario();
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const tiers = plane.candidates
      .filter((c) => c.sourceModule === 'P2-B1')
      .map((c) => c.originalCandidateSupportTier);
    for (const tier of tiers) {
      expect(['STRONG', 'MODERATE', 'WEAK']).toContain(tier);
    }
  });
});
