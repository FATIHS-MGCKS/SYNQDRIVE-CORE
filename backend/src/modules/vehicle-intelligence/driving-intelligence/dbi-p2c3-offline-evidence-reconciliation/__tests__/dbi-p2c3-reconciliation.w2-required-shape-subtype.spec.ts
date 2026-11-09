import { reconcileDbiP2c2OfflineEvidenceBundleV1 } from '../index.v1';
import {
  adaptColdEnginePlaneFromS09,
  adaptColdEnginePositiveCandidatePlane,
  adaptKickdownPlaneFromScenario,
  adaptRevvingIdlePlaneFromS12,
  assembleP2c2Bundle,
  cloneMutablePlane,
  adaptA1DescriptivePlaneFromS14,
} from './dbi-p2c3-reconciliation.test-helpers';

function expectFailure(bundle: ReturnType<typeof assembleP2c2Bundle>, code: string) {
  const out = reconcileDbiP2c2OfflineEvidenceBundleV1(bundle);
  expect(out.ok).toBe(false);
  if (out.ok) return;
  expect(out.diagnosticCodes).toContain(code);
  if ('pairwiseDecisions' in out && Array.isArray((out as { pairwiseDecisions: unknown[] }).pairwiseDecisions)) {
    expect((out as { pairwiseDecisions: unknown[] }).pairwiseDecisions).toHaveLength(0);
  }
}

describe('W2 required nested fields (P1-01)', () => {
  it('rejects A1 missing semanticGuards', () => {
    const descriptive = adaptA1DescriptivePlaneFromS14();
    if (!descriptive) throw new Error('a1');
    const part = descriptive.participant;
    const tampered = {
      ...descriptive,
      participant: {
        ...part,
        moduleAssessability: {
          ...part.moduleAssessability,
          semanticGuards: undefined as never,
        },
      },
    };
    expectFailure(
      assembleP2c2Bundle({ descriptive: tampered, powertrainProxies: [adaptKickdownPlaneFromScenario()] }),
      'BUNDLE_NESTED_SHAPE_INVALID',
    );
  });

  it('rejects B1 missing originalAbstainReasons', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const p = plane.participant as Record<string, unknown>;
    delete p.originalAbstainReasons;
    expectFailure(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane as never] }), 'BUNDLE_NESTED_SHAPE_INVALID');
  });

  it('rejects missing candidateLimitationCodes array', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const p = plane.participant as Record<string, unknown>;
    delete p.candidateLimitationCodes;
    expectFailure(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane as never] }), 'BUNDLE_NESTED_SHAPE_INVALID');
  });

  it('rejects B4 missing facet assessability', () => {
    const plane = cloneMutablePlane(adaptRevvingIdlePlaneFromS12());
    const participant = plane.participant;
    if (participant.sourceModule !== 'P2-B4') throw new Error('b4');
    plane.participant = {
      ...participant,
      facetA: { ...participant.facetA, assessability: undefined as never },
    };
    expectFailure(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }), 'BUNDLE_NESTED_SHAPE_INVALID');
  });

  it('rejects B4 missing facet tripEvidenceClassification', () => {
    const plane = cloneMutablePlane(adaptRevvingIdlePlaneFromS12());
    const participant = plane.participant;
    if (participant.sourceModule !== 'P2-B4') throw new Error('b4');
    plane.participant = {
      ...participant,
      facetB: { ...participant.facetB, tripEvidenceClassification: undefined as never },
    };
    expectFailure(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }), 'BUNDLE_NESTED_SHAPE_INVALID');
  });

  it('accepts adapter-generated kickdown bundle', () => {
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [adaptKickdownPlaneFromScenario()] }),
    );
    expect(out.ok).toBe(true);
  });
});

describe('W2 B2 subtype completeness (P1-02)', () => {
  it('empty subtypeAssessability with positive candidate fails closed', () => {
    const plane = cloneMutablePlane(adaptColdEnginePositiveCandidatePlane());
    const p = plane.participant;
    if (p.sourceModule !== 'P2-B2') throw new Error('b2');
    plane.participant = { ...p, subtypeAssessability: {} as never };
    expectFailure(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }), 'B2_SUBTYPE_ASSESSABILITY_INCOMPLETE');
  });

  it('positive candidate with missing subtype entry fails closed', () => {
    const plane = cloneMutablePlane(adaptColdEnginePositiveCandidatePlane());
    const p = plane.participant;
    if (p.sourceModule !== 'P2-B2') throw new Error('b2');
    const { COLD_ENGINE_HIGH_RPM: _removed, ...rest } = p.subtypeAssessability;
    plane.participant = { ...p, subtypeAssessability: rest as typeof p.subtypeAssessability };
    expectFailure(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }), 'B2_SUBTYPE_ASSESSABILITY_INCOMPLETE');
  });

  it('forged unknown subtype status fails closed', () => {
    const plane = cloneMutablePlane(adaptColdEnginePositiveCandidatePlane());
    const p = plane.participant;
    if (p.sourceModule !== 'P2-B2') throw new Error('b2');
    plane.participant = {
      ...p,
      subtypeAssessability: {
        ...p.subtypeAssessability,
        COLD_ENGINE_HIGH_RPM: { status: 'FAKE' as never, reasonCodes: [] },
      },
    };
    expectFailure(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }), 'B2_SUBTYPE_STATUS_INVALID');
  });

  it('positive candidate under NOT_ASSESSABLE subtype fails closed', () => {
    const plane = cloneMutablePlane(adaptColdEnginePositiveCandidatePlane());
    const p = plane.participant;
    if (p.sourceModule !== 'P2-B2') throw new Error('b2');
    const positive = plane.candidates.find((c) => c.sourceModule === 'P2-B2' && 'proxyKind' in c);
    if (!positive || positive.sourceModule !== 'P2-B2') throw new Error('cand');
    plane.participant = {
      ...p,
      subtypeAssessability: {
        ...p.subtypeAssessability,
        [positive.proxyKind]: { status: 'NOT_ASSESSABLE', reasonCodes: ['R1'] },
      },
    };
    expectFailure(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }),
      'B2_PARTICIPANT_SUBTYPE_ASSESSABILITY_CONTRADICTION',
    );
  });

  it('genuine mixed subtype states remain admissible', () => {
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [adaptColdEnginePlaneFromS09()] }),
    );
    expect(out.ok).toBe(true);
  });

  it('valid positive B2 bundle remains admitted', () => {
    const out = reconcileDbiP2c2OfflineEvidenceBundleV1(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [adaptColdEnginePositiveCandidatePlane()] }),
    );
    expect(out.ok).toBe(true);
  });
});
