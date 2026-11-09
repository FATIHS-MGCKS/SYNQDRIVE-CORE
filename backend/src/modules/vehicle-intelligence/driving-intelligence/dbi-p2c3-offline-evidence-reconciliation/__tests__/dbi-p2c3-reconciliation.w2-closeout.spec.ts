import { reconcileDbiP2c2OfflineEvidenceBundleV1 } from '../index.v1';
import {
  adaptA1DescriptivePlaneFromS14,
  adaptColdEnginePositiveCandidatePlane,
  adaptKickdownPlaneFromScenario,
  adaptRevvingIdlePlaneFromS12,
  assembleP2c2Bundle,
  cloneMutablePlane,
} from './dbi-p2c3-reconciliation.test-helpers';

function expectFailure(bundle: ReturnType<typeof assembleP2c2Bundle>, code: string) {
  const out = reconcileDbiP2c2OfflineEvidenceBundleV1(bundle);
  expect(out.ok).toBe(false);
  if (out.ok) return;
  expect(out.diagnosticCodes).toContain(code);
}

describe('P2-C3 W2 closeout — deep shape, status enum, duplicate identity', () => {
  it('rejects B2 plane missing subtypeAssessability before pairwise', () => {
    const plane = cloneMutablePlane(adaptColdEnginePositiveCandidatePlane());
    const p = plane.participant as Record<string, unknown>;
    delete p.subtypeAssessability;
    expectFailure(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane as never] }), 'BUNDLE_NESTED_SHAPE_INVALID');
  });

  it('rejects B4 plane missing facetA', () => {
    const plane = cloneMutablePlane(adaptRevvingIdlePlaneFromS12());
    const p = plane.participant as Record<string, unknown>;
    delete p.facetA;
    expectFailure(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane as never] }), 'BUNDLE_NESTED_SHAPE_INVALID');
  });

  it('rejects A1 missing moduleAssessability', () => {
    const descriptive = adaptA1DescriptivePlaneFromS14();
    if (!descriptive) throw new Error('a1');
    const p = descriptive.participant as Record<string, unknown>;
    delete p.moduleAssessability;
    expectFailure(
      assembleP2c2Bundle({ descriptive: descriptive as never, powertrainProxies: [] }),
      'BUNDLE_NESTED_SHAPE_INVALID',
    );
  });

  it('rejects candidate with missing originalCandidate', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const base = plane.candidates[0];
    if (!base) throw new Error('cand');
    plane.candidates = [{ ...structuredClone(base), originalCandidate: null as never }];
    expectFailure(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }), 'BUNDLE_NESTED_SHAPE_INVALID');
  });

  it('rejects null slot in candidates array', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    plane.candidates = [null as never];
    expectFailure(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }), 'BUNDLE_NESTED_SHAPE_INVALID');
  });

  it('rejects malformed originalAbstainReasons array', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    plane.participant = { ...plane.participant, originalAbstainReasons: [1 as never] };
    expectFailure(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }), 'BUNDLE_NESTED_SHAPE_INVALID');
  });

  it('forged UNRECOGNIZED_STATUS with duplicate positives fails closed', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const base = plane.candidates[0];
    if (!base) throw new Error('cand');
    plane.candidates = [structuredClone(base), structuredClone(base)];
    plane.participant = {
      ...plane.participant,
      originalKernelStatus: 'UNRECOGNIZED_STATUS' as never,
      adapterClaimsPositiveEvidence: false,
    };
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('PARTICIPANT_KERNEL_STATUS_INVALID');
    expect('pairwiseDecisions' in out).toBe(false);
  });

  it('duplicate planes: same identity different declared status', () => {
    const a = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const b = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    b.participant = { ...b.participant, originalKernelStatus: 'ABSTAINED' as const };
    expectFailure(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [a, b] }), 'DUPLICATE_PARTICIPANT_PLANE_IDENTITY');
  });

  it('different genuine identities remain admissible', () => {
    const a = adaptKickdownPlaneFromScenario();
    const b = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    b.participant = {
      ...b.participant,
      identity: { ...b.participant.identity, tripId: `${b.participant.identity.tripId}-alt` },
    };
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [a, b] }),
    );
    expect(out.ok).toBe(true);
  });

  it('A1 highEpisodesMeta vs moduleAssessability mismatch', () => {
    const descriptive = adaptA1DescriptivePlaneFromS14();
    if (!descriptive) throw new Error('a1');
    const part = descriptive.participant;
    const tampered = {
      ...descriptive,
      participant: {
        ...part,
        highEpisodesMeta: { ...part.highEpisodesMeta, status: 'NOT_OBSERVED' as const },
      },
    };
    expectFailure(
      assembleP2c2Bundle({ descriptive: tampered, powertrainProxies: [adaptKickdownPlaneFromScenario()] }),
      'A1_METADATA_STATUS_MISMATCH',
    );
  });

  it('B4 forged facet candidate count mismatch', () => {
    const plane = cloneMutablePlane(adaptRevvingIdlePlaneFromS12());
    const participant = plane.participant;
    if (participant.sourceModule !== 'P2-B4') throw new Error('b4');
    plane.participant = {
      ...participant,
      facetA: { ...participant.facetA, deduplicatedCandidateCount: 99 },
    };
    expectFailure(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }), 'B4_FACET_CANDIDATE_COUNT_MISMATCH');
  });
});
