import { DBI_P2C3_V1_AUTHORIZED_POSITIVE_RELATIONSHIPS, reconcileDbiP2c2OfflineEvidenceBundleV1 } from '../index.v1';
import {
  adaptKickdownPlaneFromScenario,
  assembleP2c2Bundle,
  cloneMutablePlane,
  withIdentityOverride,
  DBI_P2C15_ORG_ALT,
  DBI_P2C15_TRIP_ALT,
  DBI_P2C15_LINK_ALT,
} from './dbi-p2c3-reconciliation.test-helpers';
import { DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION } from '../../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import { buildCandidateEnvelopeIdentityPayload } from '../dbi-p2c3-reconciliation.canonical.v1';

describe('dbi-p2c3 integrity closeout — identity gates and budgets', () => {
  function duplicateKickdownPlane() {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const base = plane.candidates[0];
    if (!base || base.sourceModule !== 'P2-B1') throw new Error('need kickdown candidate');
    plane.candidates = [structuredClone(base), structuredClone(base)];
    return plane;
  }

  it('P1_01 rejected identity blocks relationship reconciliation even for identical payloads', () => {
    const dup = duplicateKickdownPlane();
    const otherOrg = withIdentityOverride(adaptKickdownPlaneFromScenario(), { organizationId: DBI_P2C15_ORG_ALT });
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [dup, otherOrg] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.identityAdmission.verdict).toBe('REJECTED');
    expect(out.relationshipReconciliation).toEqual({ performed: false, skipReason: 'IDENTITY_REJECTED' });
    expect(out.pairwiseDecisions).toHaveLength(0);
    expect(out.pairwiseDecisions.some((d) => d.relationshipDecision === 'SAME_SOURCE_DUPLICATE')).toBe(false);
  });

  it('P1_01 trip mismatch with identical payload produces no SAME_SOURCE_DUPLICATE', () => {
    const dup = duplicateKickdownPlane();
    const tripAlt = withIdentityOverride(adaptKickdownPlaneFromScenario(), { tripId: DBI_P2C15_TRIP_ALT });
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [dup, tripAlt] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.identityAdmission.verdict).toBe('REJECTED');
    expect(out.pairwiseDecisions).toHaveLength(0);
  });

  it('P1_01 source link mismatch with shared episode key still blocks edges', () => {
    const a = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const b = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const shared = a.candidates[0];
    if (!shared) throw new Error('candidate');
    a.candidates = [structuredClone(shared)];
    b.candidates = [structuredClone(shared)];
    const linkAlt = withIdentityOverride(b, { providerSourceLinkId: DBI_P2C15_LINK_ALT });
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [a, linkAlt] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.identityAdmission.verdict).toBe('REJECTED');
    expect(out.pairwiseDecisions).toHaveLength(0);
  });

  it('P1_01 inconclusive fingerprint blocks positive edges; admitted duplicate still works', () => {
    const admittedDup = duplicateKickdownPlane();
    const admitOut = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [admittedDup] }),
    );
    expect(admitOut.ok).toBe(true);
    if (!admitOut.ok) return;
    expect(admitOut.identityAdmission.verdict).toBe('ADMITTED');
    expect(admitOut.relationshipReconciliation.performed).toBe(true);
    expect(
      admitOut.pairwiseDecisions.some((d) => d.relationshipDecision === 'SAME_SOURCE_DUPLICATE'),
    ).toBe(true);

    const inconclusivePlane = withIdentityOverride(adaptKickdownPlaneFromScenario(), {
      multichannelFingerprint: null,
    });
    const b1 = withIdentityOverride(adaptKickdownPlaneFromScenario(), {});
    const incOut = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [inconclusivePlane, b1] }),
    );
    expect(incOut.ok).toBe(true);
    if (!incOut.ok) return;
    expect(incOut.identityAdmission.verdict).toBe('INCONCLUSIVE');
    expect(incOut.relationshipReconciliation).toEqual({
      performed: false,
      skipReason: 'IDENTITY_INCONCLUSIVE',
    });
    expect(
      incOut.pairwiseDecisions.some((d) =>
        DBI_P2C3_V1_AUTHORIZED_POSITIVE_RELATIONSHIPS.includes(d.relationshipDecision),
      ),
    ).toBe(false);
  });

  it('P1_02 both null required fingerprints are inconclusive not admitted', () => {
    const p = withIdentityOverride(adaptKickdownPlaneFromScenario(), {
      v1bInputFingerprint: null,
      multichannelFingerprint: null,
    });
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [p] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.identityAdmission.verdict).toBe('INCONCLUSIVE');
    expect(out.identityAdmission.requiredBindingAssessment.requiredFingerprintsSatisfied).toBe(false);
  });

  it('P1_02 conflicting reported fingerprints reject', () => {
    const b1 = adaptKickdownPlaneFromScenario();
    const fp = b1.participant.identity.multichannelFingerprint;
    if (typeof fp !== 'string') throw new Error('fp');
    const b2 = withIdentityOverride(adaptKickdownPlaneFromScenario(), { multichannelFingerprint: `${fp}-x` });
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [b1, b2] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.identityAdmission.verdict).toBe('REJECTED');
  });

  it('P1_02 legitimate absent sourceBundleId can still admit when fingerprints present', () => {
    const p = withIdentityOverride(adaptKickdownPlaneFromScenario(), { sourceBundleId: null });
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [p] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.identityAdmission.verdict).toBe('ADMITTED');
    expect(out.identityAdmission.requiredBindingAssessment.optionalSourceBundleConsistentlyAbsent).toBe(true);
  });

  it('P1_02 empty required core binding fails closed before success', () => {
    const plane = withIdentityOverride(adaptKickdownPlaneFromScenario(), { organizationId: '   ' });
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('REQUIRED_CORE_BINDING_EMPTY');
  });

  it('P1_03 rejects invalid budget options without partial output', () => {
    const bundle = assembleP2c2Bundle({ descriptive: null, powertrainProxies: [adaptKickdownPlaneFromScenario()] });
    for (const maxCandidatePairs of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) {
      const out = reconcileDbiP2c2OfflineEvidenceBundleV1(bundle, { maxCandidatePairs });
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.diagnosticCodes).toContain('BUDGET_OPTION_INVALID');
    }
  });

  it('P1_03 early pair budget blocks before relationship output', () => {
    const plane = duplicateKickdownPlane();
    const many = cloneMutablePlane(plane);
    const base = many.candidates[0]!;
    if (base.sourceModule !== 'P2-B1') throw new Error('b1');
    const kick = base.originalCandidate;
    many.candidates = Array.from({ length: 100 }, (_, i) => ({
      ...structuredClone(base),
      sourceEpisodeKey: `${base.sourceEpisodeKey}-n${i}`,
      originalCandidate: {
        ...structuredClone(kick),
        episodeKey: `${kick.episodeKey}-n${i}`,
      },
    }));
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [many] }),
      { maxCandidatePairs: 10 },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('BUDGET_CANDIDATE_PAIR_COUNT_EXCEEDED');
  });

  it('P1_04 invalid bundle contract version fails closed', () => {
    const bundle = assembleP2c2Bundle({ descriptive: null, powertrainProxies: [adaptKickdownPlaneFromScenario()] });
    const tampered = { ...bundle, contractVersion: 'wrong-version' as typeof DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION };
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(tampered);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('INVALID_BUNDLE_CONTRACT_VERSION');
  });

  it('P2_01 duplicate episodeKey different payload sorts deterministically by canonical payload', () => {
    const forward = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const reverse = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const base = forward.candidates[0];
    if (!base || base.sourceModule !== 'P2-B1') throw new Error('b1');
    const sharedKey = 'tie-key';
    const kick = base.originalCandidate;
    const low = {
      ...structuredClone(base),
      sourceEpisodeKey: sharedKey,
      originalCandidate: { ...structuredClone(kick), episodeKey: sharedKey, startBucketIndex: kick.startBucketIndex },
    };
    const high = {
      ...structuredClone(base),
      sourceEpisodeKey: sharedKey,
      originalCandidate: {
        ...structuredClone(kick),
        episodeKey: sharedKey,
        startBucketIndex: kick.startBucketIndex + 3,
        endBucketIndex: kick.endBucketIndex + 3,
      },
    };
    forward.candidates = [low, high];
    reverse.candidates = [high, low];
    const outF = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [forward] }),
    );
    const outR = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [reverse] }),
    );
    expect(outF.ok && outR.ok).toBe(true);
    if (!outF.ok || !outR.ok) return;
    expect(outF.resultDigest).toBe(outR.resultDigest);
    const payloads = outF.candidateInventory.map((c) => buildCandidateEnvelopeIdentityPayload(c.candidateEnvelope));
    expect(payloads).toEqual([...payloads].sort());
  });
});
