import { DBI_P2C3_V1_AUTHORIZED_POSITIVE_RELATIONSHIPS, reconcileDbiP2c2OfflineEvidenceBundleV1 } from '../index.v1';
import {
  adaptA1DescriptivePlaneFromS14,
  adaptColdEnginePositiveCandidatePlane,
  adaptKickdownPlaneFromScenario,
  adaptRevvingIdleB4FacetAPlaneFromS01,
  adaptRevvingIdlePlaneFromS12,
  adaptSustainedLoadPlaneFromS11,
  assembleP2c2Bundle,
  cloneMutablePlane,
  DBI_P2C15_LINK_ALT,
  withIdentityOverride,
} from './dbi-p2c3-reconciliation.test-helpers';

function expectFailure(bundle: ReturnType<typeof assembleP2c2Bundle>, code: string) {
  const out = reconcileDbiP2c2OfflineEvidenceBundleV1(bundle);
  expect(out.ok).toBe(false);
  if (out.ok) return;
  expect(out.diagnosticCodes).toContain(code);
  if ('pairwiseDecisions' in out) {
    expect(out.pairwiseDecisions).toHaveLength(0);
  }
}

function duplicateKickdownCandidatesOnPlane() {
  const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
  const base = plane.candidates[0];
  if (!base || base.sourceModule !== 'P2-B1') throw new Error('need B1 candidate');
  plane.candidates = [structuredClone(base), structuredClone(base)];
  return plane;
}

describe('P2-C3 W2 reconciliation integrity (P1-04 and matrix)', () => {
  it('01 P1-04 forged B1 ABSTAINED + duplicate positive kickdown fails closed', () => {
    const plane = duplicateKickdownCandidatesOnPlane();
    plane.participant = {
      ...plane.participant,
      originalKernelStatus: 'ABSTAINED',
      adapterClaimsPositiveEvidence: false,
    };
    expectFailure(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }), 'PARTICIPANT_CONTRADICTORY_POSITIVE_UNDER_ABSTAIN');
  });

  it('02 forged NOT_OBSERVED + positive candidate fails closed', () => {
    const plane = duplicateKickdownCandidatesOnPlane();
    plane.participant = {
      ...plane.participant,
      originalKernelStatus: 'NOT_OBSERVED',
      adapterClaimsPositiveEvidence: false,
    };
    expectFailure(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }), 'PARTICIPANT_CONTRADICTORY_POSITIVE_UNDER_NOT_OBSERVED');
  });

  it('03 forged adapterClaimsPositiveEvidence contradicts abstain inventory', () => {
    const plane = duplicateKickdownCandidatesOnPlane();
    plane.participant = {
      ...plane.participant,
      originalKernelStatus: 'ABSTAINED',
      adapterClaimsPositiveEvidence: true,
    };
    expectFailure(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
      'PARTICIPANT_ADAPTER_POSITIVE_CLAIM_CONTRADICTION',
    );
  });

  it('04 valid B1 descriptive-only throttle steps under abstain-like inventory allowed via adapter', () => {
    const plane = adaptKickdownPlaneFromScenario('S10_INSUFFICIENT_OBSERVATIONS');
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
    );
    expect(out.ok).toBe(true);
  });

  it('05 B2 positive under NOT_ASSESSABLE subtype fails closed', () => {
    const plane = cloneMutablePlane(adaptColdEnginePositiveCandidatePlane());
    const participant = plane.participant;
    if (participant.sourceModule !== 'P2-B2') throw new Error('B2');
    const kind = plane.candidates[0]?.sourceModule === 'P2-B2' ? plane.candidates[0].proxyKind : null;
    if (!kind) throw new Error('proxy kind');
    plane.participant = {
      ...participant,
      subtypeAssessability: {
        ...participant.subtypeAssessability,
        [kind]: { status: 'NOT_ASSESSABLE', reasonCodes: ['FORGED'] },
      },
    };
    expectFailure(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
      'B2_PARTICIPANT_SUBTYPE_ASSESSABILITY_CONTRADICTION',
    );
  });

  it('06 B2 mixed valid assessability with positive remains reconcilable', () => {
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [adaptColdEnginePositiveCandidatePlane()] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const b2 = out.moduleAssessabilitySummary.find((m) => m.sourceModule === 'P2-B2');
    expect(b2?.moduleProjection.kind).toBe('B2_PROXY');
  });

  it('07 B3 valid partial abstention with zero positive candidates', () => {
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [adaptSustainedLoadPlaneFromS11()] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.candidateInventory.every((c) => c.originalClassification !== 'GAP_AWARE_SUSTAINED_PROXY_CANDIDATE')).toBe(
      true,
    );
  });

  it('08 B3 trip classification contradiction with forged positive', () => {
    const plane = cloneMutablePlane(adaptSustainedLoadPlaneFromS11());
    const participant = plane.participant;
    if (participant.sourceModule !== 'P2-B3') throw new Error('B3');
    const forged = {
      episodeKey: 'forged-b3',
      classification: 'GAP_AWARE_SUSTAINED_PROXY_CANDIDATE' as const,
      startProviderBucketLabelIso: '2026-01-01T10:00:01.000Z',
      endProviderBucketLabelIso: '2026-01-01T10:00:05.000Z',
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
    plane.participant = {
      ...participant,
      tripEvidenceClassification: 'INSUFFICIENT_OBSERVATIONS',
      adapterClaimsPositiveEvidence: true,
    };
    expectFailure(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
      'B3_PARTICIPANT_TRIP_CLASSIFICATION_CONTRADICTION',
    );
  });

  it('09 B4 positive under NOT_ASSESSABLE facet fails closed', () => {
    const plane = cloneMutablePlane(adaptRevvingIdleB4FacetAPlaneFromS01());
    const participant = plane.participant;
    if (participant.sourceModule !== 'P2-B4') throw new Error('B4');
    plane.participant = {
      ...participant,
      facetA: { ...participant.facetA, assessability: 'NOT_ASSESSABLE' },
    };
    expectFailure(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
      'B4_PARTICIPANT_FACET_CONSISTENCY_CONTRADICTION',
    );
  });

  it('10 B4 INSUFFICIENT_OBSERVATIONS classification with positive fails closed', () => {
    const plane = cloneMutablePlane(adaptRevvingIdleB4FacetAPlaneFromS01());
    const participant = plane.participant;
    if (participant.sourceModule !== 'P2-B4') throw new Error('B4');
    plane.participant = {
      ...participant,
      facetA: { ...participant.facetA, tripEvidenceClassification: 'INSUFFICIENT_OBSERVATIONS' },
    };
    expectFailure(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
      'B4_PARTICIPANT_FACET_CONSISTENCY_CONTRADICTION',
    );
  });

  it('11 B4 COMPUTED dual NOT_ASSESSABLE zero candidates remains valid', () => {
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [adaptRevvingIdlePlaneFromS12()] }),
    );
    expect(out.ok).toBe(true);
  });

  it('12 A1 descriptive inventory contradiction fails closed', () => {
    const descriptive = adaptA1DescriptivePlaneFromS14();
    if (!descriptive) throw new Error('a1');
    const part = descriptive.participant;
    const tampered = {
      ...descriptive,
      participant: {
        ...part,
        moduleAssessability: {
          ...part.moduleAssessability,
          highEpisodesStatus: 'NOT_ASSESSABLE' as const,
        },
      },
    };
    expectFailure(
      assembleP2c2Bundle({ descriptive: tampered, powertrainProxies: [adaptKickdownPlaneFromScenario()] }),
      'A1_PARTICIPANT_DESCRIPTIVE_INVENTORY_CONTRADICTION',
    );
  });

  it('13 A1 source-link mismatch fails composite bundle admission', () => {
    const a1 = adaptA1DescriptivePlaneFromS14();
    const b1 = withIdentityOverride(adaptKickdownPlaneFromScenario(), {
      providerSourceLinkId: DBI_P2C15_LINK_ALT,
    });
    expectFailure(
      assembleP2c2Bundle({ descriptive: a1, powertrainProxies: [b1] }),
      'A1_PROXY_PROVIDER_SOURCE_LINK_CONTRADICTION',
    );
  });

  it('14 A1 reported v1b fingerprint mismatch fails closed', () => {
    const a1 = adaptA1DescriptivePlaneFromS14();
    const b1 = adaptKickdownPlaneFromScenario();
    const fp = b1.participant.identity.v1bInputFingerprint;
    if (typeof fp !== 'string') throw new Error('fp');
    const tampered = withIdentityOverride(b1, { v1bInputFingerprint: `${fp}-mismatch` });
    expectFailure(
      assembleP2c2Bundle({ descriptive: a1, powertrainProxies: [tampered] }),
      'A1_PROXY_V1B_FINGERPRINT_CONTRADICTION',
    );
  });

  it('15 duplicate participant planes with same identity fail closed', () => {
    const plane = adaptKickdownPlaneFromScenario();
    expectFailure(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane, structuredClone(plane)] }),
      'DUPLICATE_PARTICIPANT_PLANE_IDENTITY',
    );
  });

  it('16 reversed participant order remains deterministic for single plane', () => {
    const forward = duplicateKickdownCandidatesOnPlane();
    const reverse = cloneMutablePlane(forward);
    reverse.candidates = [...forward.candidates].reverse();
    const outF = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [forward] }),
    );
    const outR = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [reverse] }),
    );
    expect(outF.ok && outR.ok).toBe(true);
    if (!outF.ok || !outR.ok) return;
    expect(outF.resultDigest).toBe(outR.resultDigest);
  });

  it('17 malformed nested bundle fails without throwing', () => {
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(null as never);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('BUNDLE_INPUT_SHAPE_INVALID');
  });

  it('18 valid admitted duplicate positives still emit SAME_SOURCE_DUPLICATE', () => {
    const plane = duplicateKickdownCandidatesOnPlane();
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.identityAdmission.verdict).toBe('ADMITTED');
    const dupes = out.pairwiseDecisions.filter((d) => d.relationshipDecision === 'SAME_SOURCE_DUPLICATE');
    expect(dupes.length).toBeGreaterThan(0);
    expect(
      out.pairwiseDecisions.every((d) =>
        DBI_P2C3_V1_AUTHORIZED_POSITIVE_RELATIONSHIPS.includes(d.relationshipDecision)
          ? d.relationshipDecision === 'SAME_SOURCE_DUPLICATE'
          : true,
      ),
    ).toBe(true);
  });
});
