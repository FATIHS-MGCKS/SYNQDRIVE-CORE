import { adaptA1DescriptivePlaneFromS14, adaptKickdownPlaneFromScenario, adaptRevvingIdlePlaneFromS12, adaptSustainedLoadPlaneFromS11, assembleP2c2Bundle, baselineMatchingMultiModuleBundle, cloneMutablePlane } from './dbi-p2c3-reconciliation.test-helpers';
import { buildCandidateEnvelopeIdentityPayload } from '../dbi-p2c3-reconciliation.canonical.v1';
import { reconcileDbiP2c2OfflineEvidenceBundleV1 } from '../index.v1';
import type {
  DbiP2c2A1EvidenceParticipantV1,
  DbiP2c2ProxyCandidateEnvelopeV1,
} from '../../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';

describe('dbi-p2c3 canonical and assessability closeout', () => {
  it('P2_01 reversed nested object key order yields identical canonical payload', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const base = plane.candidates[0];
    if (!base || base.sourceModule !== 'P2-B1') throw new Error('b1');
    const forward = {
      ...structuredClone(base),
      originalCandidate: {
        ...structuredClone(base.originalCandidate),
        requiredChannelPresence: { throttle: true, rpm: true, speed: true },
      },
    };
    const reversed = {
      ...structuredClone(base),
      originalCandidate: {
        ...structuredClone(base.originalCandidate),
        requiredChannelPresence: { speed: true, rpm: true, throttle: true },
      },
    };
    expect(buildCandidateEnvelopeIdentityPayload(forward)).toBe(buildCandidateEnvelopeIdentityPayload(reversed));
  });

  it('P2_01 exact duplicate recognized after property-order permutation', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const base = plane.candidates[0];
    if (!base) throw new Error('candidate');
    const a = {
      ...structuredClone(base),
      originalCandidate: {
        ...structuredClone(base.originalCandidate),
        requiredChannelPresence: { a: true, b: true },
      },
    };
    const b = {
      ...structuredClone(base),
      originalCandidate: {
        ...structuredClone(base.originalCandidate),
        requiredChannelPresence: { b: true, a: true },
      },
    };
    plane.candidates = [a, b] as DbiP2c2ProxyCandidateEnvelopeV1[];
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.pairwiseDecisions.some((d) => d.relationshipDecision === 'SAME_SOURCE_DUPLICATE')).toBe(true);
    expect(out.candidateInventory).toHaveLength(2);
  });

  it('P2_02 rejects A1 participant appearing in powertrain proxy plane', () => {
    const kick = adaptKickdownPlaneFromScenario();
    const a1 = adaptA1DescriptivePlaneFromS14();
    if (!a1) throw new Error('a1');
    const broken = cloneMutablePlane(kick);
    (broken.participant as unknown as DbiP2c2A1EvidenceParticipantV1) = a1.participant;
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [broken] }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('A1_IN_POWERTRAIN_PROXY_PLANE');
  });

  it('P1_01 A1 module projection matches P2-C2 participant assessability', () => {
    const a1 = adaptA1DescriptivePlaneFromS14();
  if (!a1) throw new Error('a1');
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: a1, powertrainProxies: [] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const summary = out.moduleAssessabilitySummary.find((m) => m.sourceModule === 'P2-A1');
    expect(summary?.moduleProjection.kind).toBe('A1_DESCRIPTIVE');
    if (summary?.moduleProjection.kind !== 'A1_DESCRIPTIVE') return;
    expect(summary.moduleProjection.highEpisodesStatus).toBe(a1.participant.moduleAssessability.highEpisodesStatus);
    expect(summary.moduleProjection.normalizedEpisodesEligible).toBe(
      a1.participant.moduleAssessability.normalizedEpisodesEligible,
    );
    expect(summary.moduleProjection.semanticGuards).toEqual(a1.participant.moduleAssessability.semanticGuards);
  });

  it('P1_01 B1/B2/B3/B4 module projections mirror P2-C2 participant fields', () => {
    const bundle = baselineMatchingMultiModuleBundle();
    const b1Plane = bundle.powertrainProxies.find((p) => p.participant.sourceModule === 'P2-B1')!;
    const b2Plane = bundle.powertrainProxies.find((p) => p.participant.sourceModule === 'P2-B2')!;
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(bundle);
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    const b1 = out.moduleAssessabilitySummary.find((m) => m.sourceModule === 'P2-B1');
    expect(b1?.moduleProjection.kind).toBe('B1_PROXY');
    if (b1?.moduleProjection.kind === 'B1_PROXY' && b1Plane.participant.sourceModule === 'P2-B1') {
      expect(b1.moduleProjection.moduleCoverage).toEqual(b1Plane.participant.moduleCoverage);
    }

    const b2 = out.moduleAssessabilitySummary.find((m) => m.sourceModule === 'P2-B2');
    expect(b2?.moduleProjection.kind).toBe('B2_PROXY');
    if (b2?.moduleProjection.kind === 'B2_PROXY' && b2Plane.participant.sourceModule === 'P2-B2') {
      expect(b2.moduleProjection.subtypeAssessability).toEqual(b2Plane.participant.subtypeAssessability);
      expect(b2.moduleProjection.moduleCoverage).toEqual(b2Plane.participant.moduleCoverage);
    }

    const b3Plane = adaptSustainedLoadPlaneFromS11();
    const b3Only = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [b3Plane] }),
    );
    expect(b3Only.ok).toBe(true);
    if (!b3Only.ok) return;
    const b3 = b3Only.moduleAssessabilitySummary.find((m) => m.sourceModule === 'P2-B3');
    expect(b3?.moduleProjection.kind).toBe('B3_PROXY');
    if (b3?.moduleProjection.kind === 'B3_PROXY' && b3Plane.participant.sourceModule === 'P2-B3') {
      expect(b3.moduleProjection.tripEvidenceClassification).toBe(b3Plane.participant.tripEvidenceClassification);
      expect(b3.moduleProjection.partialCoverage).toEqual(b3Plane.participant.partialCoverage);
    }

    const b4Plane = adaptRevvingIdlePlaneFromS12();
    const b4Only = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [b4Plane] }),
    );
    expect(b4Only.ok).toBe(true);
    if (!b4Only.ok) return;
    const b4 = b4Only.moduleAssessabilitySummary.find((m) => m.sourceModule === 'P2-B4');
    expect(b4?.moduleProjection.kind).toBe('B4_PROXY');
    if (b4?.moduleProjection.kind === 'B4_PROXY' && b4Plane.participant.sourceModule === 'P2-B4') {
      expect(b4.moduleProjection.facetA.assessability).toBe(b4Plane.participant.facetA.assessability);
      expect(b4.moduleProjection.facetB.assessability).toBe(b4Plane.participant.facetB.assessability);
      expect(b4.moduleProjection.facetA.tripEvidenceClassification).toBe(
        b4Plane.participant.facetA.tripEvidenceClassification,
      );
      expect(b4.moduleProjection.facetB.tripEvidenceClassification).toBe(
        b4Plane.participant.facetB.tripEvidenceClassification,
      );
    }
  });

  it('P2_03 assessability material change alters result digest', () => {
    const base = reconcileDbiP2c2OfflineEvidenceBundleV1(baselineMatchingMultiModuleBundle());
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const baseBundle = baselineMatchingMultiModuleBundle();
    const tamperedProxies = baseBundle.powertrainProxies.map((plane) => {
      if (plane.participant.sourceModule !== 'P2-B2') return plane;
      const mutable = cloneMutablePlane(plane);
      if (mutable.participant.sourceModule !== 'P2-B2') return plane;
      const kind = Object.keys(mutable.participant.subtypeAssessability)[0] as keyof typeof mutable.participant.subtypeAssessability;
      const entry = mutable.participant.subtypeAssessability[kind];
      mutable.participant = {
        ...mutable.participant,
        subtypeAssessability: {
          ...mutable.participant.subtypeAssessability,
          [kind]: {
            ...entry,
            reasonCodes: [...entry.reasonCodes, 'SYNTHETIC_DIGEST_PROBE'],
          },
        },
      };
      return mutable;
    });
    const tampered = assembleP2c2Bundle({ descriptive: null, powertrainProxies: tamperedProxies });
    const changed = reconcileDbiP2c2OfflineEvidenceBundleV1(tampered);
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.resultDigest).not.toBe(base.resultDigest);
  });
});
