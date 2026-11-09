import { DBI_P2C3_V1_AUTHORIZED_POSITIVE_RELATIONSHIPS, reconcileDbiP2c2OfflineEvidenceBundleV1 } from '../index.v1';
import {
  adaptA1DescriptivePlaneFromS14,
  adaptColdEnginePositiveCandidatePlane,
  adaptKickdownPlaneFromScenario,
  adaptRevvingIdlePlaneFromS12,
  adaptSustainedLoadPlaneFromS11,
  assembleP2c2Bundle,
  baselineMatchingMultiModuleBundle,
  DBI_P2C15_LINK_ALT,
  DBI_P2C15_ORG_ALT,
  DBI_P2C15_TRIP_ALT,
  DBI_P2C15_VEHICLE_ALT,
  cloneMutablePlane,
  withIdentityOverride,
} from './dbi-p2c3-reconciliation.test-helpers';
import type { DbiP2c2OfflineEvidenceBundleV1 } from '../../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';

function expectSuccess(
  bundle: DbiP2c2OfflineEvidenceBundleV1,
  options?: Parameters<typeof reconcileDbiP2c2OfflineEvidenceBundleV1>[1],
) {
  const out = reconcileDbiP2c2OfflineEvidenceBundleV1(bundle, options);
  expect(out.ok).toBe(true);
  if (!out.ok) throw new Error(out.diagnosticCodes.join(','));
  return out;
}

describe('dbi-p2c3 offline evidence reconciliation adversarial matrix', () => {
  it('01 same trip matching bindings admits proxy identity', () => {
    const out = expectSuccess(baselineMatchingMultiModuleBundle());
    expect(out.identityAdmission.verdict).toBe('ADMITTED');
    expect(out.identityAdmission.contradictionFields).toHaveLength(0);
  });

  it('02 cross-tenant mismatch rejects identity', () => {
    const b1 = adaptKickdownPlaneFromScenario();
    const b2 = withIdentityOverride(adaptKickdownPlaneFromScenario(), { organizationId: DBI_P2C15_ORG_ALT });
    const out = expectSuccess(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [b1, b2] }));
    expect(out.identityAdmission.verdict).toBe('REJECTED');
    expect(out.identityAdmission.contradictionFields).toContain('organizationId');
  });

  it('03 vehicle mismatch rejects identity', () => {
    const b1 = adaptKickdownPlaneFromScenario();
    const b2 = withIdentityOverride(adaptKickdownPlaneFromScenario(), { vehicleId: DBI_P2C15_VEHICLE_ALT });
    const out = expectSuccess(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [b1, b2] }));
    expect(out.identityAdmission.verdict).toBe('REJECTED');
    expect(out.identityAdmission.contradictionFields).toContain('vehicleId');
  });

  it('04 trip mismatch rejects identity', () => {
    const b1 = adaptKickdownPlaneFromScenario();
    const b2 = withIdentityOverride(adaptKickdownPlaneFromScenario(), { tripId: DBI_P2C15_TRIP_ALT });
    const out = expectSuccess(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [b1, b2] }));
    expect(out.identityAdmission.verdict).toBe('REJECTED');
    expect(out.identityAdmission.contradictionFields).toContain('tripId');
  });

  it('05 source-link mismatch rejects identity', () => {
    const b1 = adaptKickdownPlaneFromScenario();
    const b2 = withIdentityOverride(adaptKickdownPlaneFromScenario(), { providerSourceLinkId: DBI_P2C15_LINK_ALT });
    const out = expectSuccess(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [b1, b2] }));
    expect(out.identityAdmission.verdict).toBe('REJECTED');
    expect(out.identityAdmission.contradictionFields).toContain('providerSourceLinkId');
  });

  it('06 fingerprint mismatch rejects identity', () => {
    const b1 = adaptKickdownPlaneFromScenario();
    const fp = b1.participant.identity.multichannelFingerprint;
    if (typeof fp !== 'string') throw new Error('expected reported multichannel fingerprint');
    const b2 = withIdentityOverride(adaptKickdownPlaneFromScenario(), {
      multichannelFingerprint: `${fp}-mismatch`,
    });
    const out = expectSuccess(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [b1, b2] }));
    expect(out.identityAdmission.verdict).toBe('REJECTED');
    expect(out.identityAdmission.contradictionFields).toContain('multichannelFingerprint');
  });

  it('07 missing fingerprint yields inconclusive optional-field alignment', () => {
    const b1 = adaptKickdownPlaneFromScenario();
    const b2 = withIdentityOverride(adaptKickdownPlaneFromScenario(), { multichannelFingerprint: null });
    const out = expectSuccess(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [b1, b2] }));
    expect(out.identityAdmission.verdict).toBe('INCONCLUSIVE');
    expect(out.identityAdmission.inconclusiveFields).toContain('multichannelFingerprint');
  });

  it('08 sourceBundle mismatch rejects when both reported', () => {
    const b1 = adaptKickdownPlaneFromScenario();
    const bundleA = 'bundle-a';
    const bundleB = 'bundle-b';
    const b1p = withIdentityOverride(b1, { sourceBundleId: bundleA });
    const b2p = withIdentityOverride(adaptKickdownPlaneFromScenario(), { sourceBundleId: bundleB });
    const out = expectSuccess(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [b1p, b2p] }));
    expect(out.identityAdmission.verdict).toBe('REJECTED');
    expect(out.identityAdmission.contradictionFields).toContain('sourceBundleId');
  });

  it('09 duplicate exact source records yield SAME_SOURCE_DUPLICATE without suppression', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const base = plane.candidates[0];
    if (!base) throw new Error('need candidate');
    const dupPlane = plane;
    dupPlane.candidates = [structuredClone(base), structuredClone(base)];
    const out = expectSuccess(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [dupPlane] }));
    expect(out.candidateInventory).toHaveLength(2);
    const dupes = out.pairwiseDecisions.filter((d) => d.relationshipDecision === 'SAME_SOURCE_DUPLICATE');
    expect(dupes).toHaveLength(1);
  });

  it('10 same episodeKey different payload records collision not duplicate proof', () => {
    const collisionPlane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const base = collisionPlane.candidates[0];
    if (!base || base.sourceModule !== 'P2-B1') throw new Error('need B1 candidate');
    const sharedKey = 'collision-key-shared';
    const kickBase = base.originalCandidate;
    const first = {
      ...structuredClone(base),
      sourceEpisodeKey: sharedKey,
      originalCandidate: { ...structuredClone(kickBase), episodeKey: sharedKey },
    };
    const second = {
      ...structuredClone(base),
      sourceEpisodeKey: sharedKey,
      originalCandidate: {
        ...structuredClone(kickBase),
        episodeKey: sharedKey,
        startBucketIndex: kickBase.startBucketIndex + 2,
        endBucketIndex: kickBase.endBucketIndex + 2,
      },
    };
    collisionPlane.candidates = [first, second];
    const out = expectSuccess(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [collisionPlane] }));
    expect(out.unresolvedRelationships.some((u) => u.kind === 'EPISODE_KEY_COLLISION')).toBe(true);
    expect(out.pairwiseDecisions.some((d) => d.relationshipDecision === 'POTENTIAL_SEMANTIC_CONFLICT')).toBe(
      false,
    );
  });

  it('11 reversed input participant order yields stable digest', () => {
    const bundle = baselineMatchingMultiModuleBundle();
    const forward = expectSuccess(bundle);
    const reverse = expectSuccess(
      assembleP2c2Bundle({
        descriptive: null,
        powertrainProxies: [...bundle.powertrainProxies].reverse(),
      }),
    );
    expect(forward.resultDigest).toBe(reverse.resultDigest);
  });

  it('12 reversed candidate order preserves inventory multiplicity and digest', () => {
    const plane = adaptKickdownPlaneFromScenario();
    const forwardPlane = cloneMutablePlane(plane);
    const reversePlane = cloneMutablePlane(plane);
    reversePlane.candidates = [...plane.candidates].reverse();
    const forward = expectSuccess(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [forwardPlane] }));
    const reverse = expectSuccess(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [reversePlane] }));
    expect(forward.candidateInventory.length).toBe(reverse.candidateInventory.length);
    expect(forward.resultDigest).toBe(reverse.resultDigest);
  });

  it('13 B2 mixed subtype assessability preserved without invented assessability', () => {
    const out = expectSuccess(baselineMatchingMultiModuleBundle());
    const b2 = out.moduleAssessabilitySummary.find((m) => m.sourceModule === 'P2-B2');
    expect(b2).toBeDefined();
    expect(b2!.descriptiveOnly).toBe(false);
    expect(out.pairwiseDecisions.every((d) => d.relationshipDecision !== 'UNRELATED')).toBe(true);
  });

  it('14 B3 partial trusted abstain does not infer positive evidence', () => {
    const out = expectSuccess(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [adaptSustainedLoadPlaneFromS11()] }));
    const b3 = out.moduleAssessabilitySummary.find((m) => m.sourceModule === 'P2-B3');
    expect(b3?.adapterClaimsPositiveEvidence).toBe(false);
    expect(b3?.originalKernelStatus).toBe('ABSTAINED');
  });

  it('15 B4 dual NOT_ASSESSABLE preserved under COMPUTED status semantics', () => {
    const out = expectSuccess(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [adaptRevvingIdlePlaneFromS12()] }));
    const b4 = out.moduleAssessabilitySummary.find((m) => m.sourceModule === 'P2-B4');
    expect(b4?.originalKernelStatus).toBe('COMPUTED');
    expect(b4?.adapterClaimsPositiveEvidence).toBe(false);
  });

  it('16 A1 descriptive authority emits zero candidate edges and no A1 inventory', () => {
    const a1 = adaptA1DescriptivePlaneFromS14();
    const b1 = adaptKickdownPlaneFromScenario();
    const out = expectSuccess(assembleP2c2Bundle({ descriptive: a1, powertrainProxies: [b1] }));
    expect(out.candidateInventory.every((c) => c.sourceModule !== 'P2-A1')).toBe(true);
    expect(out.pairwiseDecisions).toHaveLength(0);
    expect(out.participantReferences.some((p) => p.sourceModule === 'P2-A1')).toBe(true);
  });

  it('17 matching timestamp ranges without shared labels stay insufficient', () => {
    const b1 = adaptKickdownPlaneFromScenario();
    const b2 = cloneMutablePlane(adaptColdEnginePositiveCandidatePlane());
    const kick = b1.candidates[0];
    const cold = b2.candidates[0];
    if (kick?.sourceModule !== 'P2-B1' || cold?.sourceModule !== 'P2-B2') {
      throw new Error('expected B1/B2 candidates');
    }
    const start = kick.originalCandidate.providerBucketLabelStartIso;
    const end = kick.originalCandidate.providerBucketLabelEndIso;
    b2.candidates[0] = {
      ...structuredClone(cold),
      originalCandidate: {
        ...structuredClone(cold.originalCandidate),
        providerBucketLabelStartIso: start,
        providerBucketLabelEndIso: end,
      },
    };
    const out = expectSuccess(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [b1, b2] }));
    const cross = out.pairwiseDecisions.filter((d) => d.leftSourceModule !== d.rightSourceModule);
    expect(cross.length).toBeGreaterThan(0);
    expect(cross.every((d) => d.relationshipDecision === 'INSUFFICIENT_ALIGNMENT_EVIDENCE')).toBe(true);
    expect(out.pairwiseDecisions.some((d) => d.relationshipDecision === 'POSSIBLE_LABEL_INTERVAL_OVERLAP')).toBe(
      false,
    );
    expect(JSON.stringify(out)).not.toContain('overlapLabelCount');
  });

  it('18 cross-module pairs without valid alignment never authorize positive relationships', () => {
    const out = expectSuccess(baselineMatchingMultiModuleBundle());
    const cross = out.pairwiseDecisions.filter((d) => d.leftSourceModule !== d.rightSourceModule);
    expect(cross.length).toBeGreaterThan(0);
    for (const decision of cross) {
      expect(DBI_P2C3_V1_AUTHORIZED_POSITIVE_RELATIONSHIPS.includes(decision.relationshipDecision)).toBe(false);
    }
  });

  it('19 explicit invalid participant fails closed', () => {
    const plane = adaptKickdownPlaneFromScenario();
    const broken = structuredClone(plane) as unknown as { participant: null };
    broken.participant = null;
    const bundle = assembleP2c2Bundle({
      descriptive: null,
      powertrainProxies: [broken as unknown as typeof plane],
    });
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(bundle);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('MISSING_PARTICIPANT_HEADER');
  });

  it('20 candidate/pair budget exceeded fails closed', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const base = plane.candidates[0];
    if (!base || base.sourceModule !== 'P2-B1') throw new Error('need B1 candidate');
    const kickBase = base.originalCandidate;
    plane.candidates = Array.from({ length: 80 }, (_, i) => ({
      ...structuredClone(base),
      sourceEpisodeKey: `${base.sourceEpisodeKey}-${i}`,
      originalCandidate: {
        ...structuredClone(kickBase),
        episodeKey: `${kickBase.episodeKey}-${i}`,
      },
    }));
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }), {
      maxCandidatePairs: 10,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('BUDGET_CANDIDATE_PAIR_COUNT_EXCEEDED');
  });

  it('21 no candidates but valid participants still reconciles', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    plane.candidates = [];
    const out = expectSuccess(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }));
    expect(out.candidateInventory).toHaveLength(0);
    expect(out.pairwiseDecisions).toHaveLength(0);
    expect(out.identityAdmission.verdict).toBe('ADMITTED');
  });

  it('22 missing participating proxy module yields inconclusive identity', () => {
    const out = expectSuccess(assembleP2c2Bundle({ descriptive: adaptA1DescriptivePlaneFromS14(), powertrainProxies: [] }));
    expect(out.identityAdmission.verdict).toBe('INCONCLUSIVE');
    expect(out.candidateInventory).toHaveLength(0);
  });

  it('does not mutate adapter bundle inputs', () => {
    const bundle = baselineMatchingMultiModuleBundle();
    const before = structuredClone(bundle);
    expectSuccess(bundle);
    expect(bundle).toEqual(before);
  });

  it('provenance safety: reconciliation never establishes attestation', () => {
    const out = expectSuccess(baselineMatchingMultiModuleBundle());
    for (const p of out.provenanceLimitations) {
      expect(p.attestationNotEstablishedByReconciliation).toBe(true);
      expect(p.provenanceCarriedAsReported).toBe(true);
    }
  });
});
