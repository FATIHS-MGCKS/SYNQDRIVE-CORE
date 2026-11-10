/**
 * W3-048 — A1 RPM episode index namespace vs B1/B2 multichannel bucket indices.
 * Documentation-backed consumer guards; no reconciliation behavior changes.
 */
import {
  DBI_P2C3_V1_AUTHORIZED_POSITIVE_RELATIONSHIPS,
  reconcileDbiP2c2OfflineEvidenceBundleV1,
} from '../index.v1';
import {
  adaptA1DescriptivePlaneFromS14,
  adaptKickdownPlaneFromScenario,
  assembleP2c2Bundle,
  cloneMutablePlane,
} from './dbi-p2c3-reconciliation.test-helpers';

function alignedA1WithB1Identity(b1 = adaptKickdownPlaneFromScenario()) {
  const a1 = adaptA1DescriptivePlaneFromS14()!;
  const id = b1.participant.identity;
  return {
    plane: {
      ...a1,
      participant: {
        ...a1.participant,
        identity: {
          ...a1.participant.identity,
          organizationId: id.organizationId,
          vehicleId: id.vehicleId,
          tripId: id.tripId,
          providerSourceLinkId: id.providerSourceLinkId,
          v1bInputFingerprint: id.v1bInputFingerprint,
          multichannelFingerprint: id.multichannelFingerprint,
          sourceBundleId: id.sourceBundleId,
        },
      },
    },
    b1,
  };
}

describe('W3-048 A1 vs multichannel index namespace (consumer guards)', () => {
  it('equal numeric A1 startIdx/endIdx and B1 bucket indices do not imply identity or edges', () => {
    const { plane: a1, b1 } = alignedA1WithB1Identity();
    const kick = b1.candidates.find((c) => c.originalClassification === 'KICKDOWN_LIKE_PROXY_CANDIDATE')!;
    const cand = kick.originalCandidate as {
      startBucketIndex: number;
      endBucketIndex: number;
      providerBucketLabelStartIso: string;
      providerBucketLabelEndIso: string;
    };
    const sharedStart = cand.startBucketIndex;
    const sharedEnd = cand.endBucketIndex;
    const ep = a1.episodes[0]!;
    const src = ep.sourceEpisode as Record<string, unknown>;
    src.startIdx = sharedStart;
    src.endIdx = sharedEnd;
    src.providerBucketLabelStartIso = cand.providerBucketLabelStartIso;
    src.providerBucketLabelEndIso = cand.providerBucketLabelEndIso;

    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: a1, powertrainProxies: [b1] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('expected success');
    expect(out.candidateInventory.every((c) => c.sourceModule !== 'P2-A1')).toBe(true);
    expect(
      out.pairwiseDecisions.every(
        (d) => d.leftSourceModule !== 'P2-A1' && d.rightSourceModule !== 'P2-A1',
      ),
    ).toBe(true);
    const cross = out.pairwiseDecisions.filter((d) => d.leftSourceModule !== d.rightSourceModule);
    for (const d of cross) {
      expect(DBI_P2C3_V1_AUTHORIZED_POSITIVE_RELATIONSHIPS.includes(d.relationshipDecision)).toBe(false);
    }
  });

  it('equal ISO labels across A1 episode and B1 candidate do not establish cross-domain alignment', () => {
    const { plane: a1, b1 } = alignedA1WithB1Identity();
    const kick = b1.candidates[0]!;
    const start = (kick.originalCandidate as { providerBucketLabelStartIso: string }).providerBucketLabelStartIso;
    const end = (kick.originalCandidate as { providerBucketLabelEndIso: string }).providerBucketLabelEndIso;
    const ep0 = a1.episodes[0]!.sourceEpisode as Record<string, unknown>;
    ep0.providerBucketLabelStartIso = start;
    ep0.providerBucketLabelEndIso = end;

    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: a1, powertrainProxies: [b1] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('expected success');
    expect(out.pairwiseDecisions.some((d) => d.relationshipDecision === 'POSSIBLE_LABEL_INTERVAL_OVERLAP')).toBe(
      false,
    );
    expect(out.pairwiseDecisions.some((d) => d.relationshipDecision === 'COMPATIBLE_CO_OBSERVATION')).toBe(false);
    expect(JSON.stringify(out)).not.toContain('overlapLabelCount');
  });

  it('matching proxy fingerprints do not place A1 episodes into candidate inventory', () => {
    const { plane: a1, b1 } = alignedA1WithB1Identity();
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: a1, powertrainProxies: [b1] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('expected success');
    expect(out.participantReferences.some((p) => p.sourceModule === 'P2-A1')).toBe(true);
    expect(out.candidateInventory.some((c) => c.sourceModule === 'P2-A1')).toBe(false);
    const a1Summary = out.moduleAssessabilitySummary.find((m) => m.sourceModule === 'P2-A1');
    expect(a1Summary?.descriptiveOnly).toBe(true);
    if (a1Summary?.moduleProjection.kind === 'A1_DESCRIPTIVE') {
      expect(a1Summary.moduleProjection.kind).toBe('A1_DESCRIPTIVE');
    }
  });

  it('A1 descriptive inventory remains available while proxy B1 inventory is unchanged', () => {
    const { plane: a1, b1 } = alignedA1WithB1Identity();
    const a1Only = reconcileDbiP2c2OfflineEvidenceBundleV1(assembleP2c2Bundle({ descriptive: a1, powertrainProxies: [] }));
    const combined = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: a1, powertrainProxies: [b1] }),
    );
    expect(a1Only.ok && combined.ok).toBe(true);
    if (!a1Only.ok || !combined.ok) throw new Error('expected success');
    const a1PartOnly = a1Only.participantReferences.filter((p) => p.sourceModule === 'P2-A1');
    const a1PartBoth = combined.participantReferences.filter((p) => p.sourceModule === 'P2-A1');
    expect(a1PartBoth).toHaveLength(a1PartOnly.length);
    const b1CountOnly = 0;
    const b1CountBoth = combined.candidateInventory.filter((c) => c.sourceModule === 'P2-B1').length;
    expect(b1CountBoth).toBeGreaterThan(b1CountOnly);
  });

  it('valid B1 duplicate positive reconciliation still emits exactly one SAME_SOURCE_DUPLICATE', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const pos = plane.candidates.find((c) => c.originalClassification === 'KICKDOWN_LIKE_PROXY_CANDIDATE')!;
    plane.candidates = [structuredClone(pos), structuredClone(pos)];
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('expected success');
    expect(out.pairwiseDecisions.filter((d) => d.relationshipDecision === 'SAME_SOURCE_DUPLICATE')).toHaveLength(1);
  });

  it('forged numeric alignment across modules never authorizes A1↔B1 event join', () => {
    const { plane: a1, b1 } = alignedA1WithB1Identity();
    const bucket = (b1.candidates[0]!.originalCandidate as { startBucketIndex: number }).startBucketIndex;
    (a1.episodes[0]!.sourceEpisode as Record<string, unknown>).startIdx = bucket;
    (a1.episodes[0]!.sourceEpisode as Record<string, unknown>).endIdx = bucket + 3;

    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: a1, powertrainProxies: [b1] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('expected success');
    expect(
      out.pairwiseDecisions.filter(
        (d) =>
          (d.leftSourceModule === 'P2-A1' || d.rightSourceModule === 'P2-A1') &&
          d.relationshipDecision === 'SAME_SOURCE_DUPLICATE',
      ),
    ).toHaveLength(0);
  });
});
