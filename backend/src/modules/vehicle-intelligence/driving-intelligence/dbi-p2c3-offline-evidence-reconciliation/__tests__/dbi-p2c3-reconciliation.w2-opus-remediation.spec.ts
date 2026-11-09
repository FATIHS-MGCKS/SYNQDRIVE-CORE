/* Opus W2 remediation oracle — replays independent re-audit probes (AUD-01..AUD-40). */
import { reconcileDbiP2c2OfflineEvidenceBundleV1, DBI_P2C3_V1_AUTHORIZED_POSITIVE_RELATIONSHIPS } from '../index.v1';
import {
  adaptA1DescriptivePlaneFromS14,
  adaptColdEnginePlaneFromS09,
  adaptColdEnginePositiveCandidatePlane,
  adaptKickdownPlaneFromScenario,
  adaptRevvingIdleB4DualFacetPlaneFromS01,
  adaptRevvingIdleB4FacetAPlaneFromS01,
  adaptRevvingIdlePlaneFromS12,
  adaptSustainedLoadPlaneFromS11,
  assembleP2c2Bundle,
  baselineMatchingMultiModuleBundle,
  cloneMutablePlane,
} from './dbi-p2c3-reconciliation.test-helpers';

type Out = ReturnType<typeof reconcileDbiP2c2OfflineEvidenceBundleV1>;
function run(bundle: unknown): { out?: Out; thrown?: string } {
  try {
    return { out: reconcileDbiP2c2OfflineEvidenceBundleV1(bundle as never) };
  } catch (e) {
    return { thrown: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}
function report(id: string, r: { out?: Out; thrown?: string }) {
  const out = r.out;
  const summary = r.thrown
    ? `THROWN ${r.thrown}`
    : out!.ok
      ? `ok=true admission=${out!.identityAdmission.verdict} edges=${JSON.stringify(
          out!.pairwiseDecisions.map((d) => d.relationshipDecision),
        )}`
      : `ok=false ${out!.diagnosticCodes.join(',')}`;
   
  console.log(`[AUDIT] ${id} -> ${summary}`);
}
function sameSourceEdges(r: { out?: Out }) {
  return r.out && r.out.ok ? r.out.pairwiseDecisions.filter((d) => d.relationshipDecision === 'SAME_SOURCE_DUPLICATE').length : 0;
}
function expectControlledReject(id: string, bundle: unknown) {
  const r = run(bundle);
  report(id, r);
  expect(r.thrown).toBeUndefined();
  expect(r.out?.ok).toBe(false);
}

function requirePositiveKickdownCandidate(plane: ReturnType<typeof cloneMutablePlane>) {
  const pos = plane.candidates.find((c) => c.originalClassification === 'KICKDOWN_LIKE_PROXY_CANDIDATE');
  expect(pos).toBeDefined();
  if (!pos) throw new Error('precondition: expected KICKDOWN_LIKE_PROXY_CANDIDATE in S01 B1 plane');
  return pos;
}

function nestPlainObjectDepth(depth: number): Record<string, unknown> {
  let node: Record<string, unknown> = { marker: 'leaf' };
  for (let i = 0; i < depth; i += 1) {
    node = { [`level_${i}`]: node };
  }
  return node;
}

function forgeB1Classification(cls: string, status: 'ABSTAINED' | 'NOT_OBSERVED' | 'COMPUTED') {
  const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
  const base = plane.candidates[0]!;
  const forged = structuredClone(base) as typeof base & { originalCandidate: { classification: string } };
  (forged as { originalClassification: string }).originalClassification = cls;
  (forged.originalCandidate as { classification: string }).classification = cls;
  plane.candidates = [forged, structuredClone(forged)];
  plane.participant = { ...plane.participant, originalKernelStatus: status, adapterClaimsPositiveEvidence: false };
  return plane;
}

function syntheticB3(tripClass: string, status: string, nCands: number) {
  const plane = cloneMutablePlane(adaptSustainedLoadPlaneFromS11());
  const cand = {
    sourceModule: 'P2-B3',
    sourceEpisodeKey: 'audit-b3-ep',
    originalClassification: 'GAP_AWARE_SUSTAINED_PROXY_CANDIDATE',
    originalCandidate: {
      episodeKey: 'audit-b3-ep',
      classification: 'GAP_AWARE_SUSTAINED_PROXY_CANDIDATE',
      providerBucketLabelStartIso: '2026-01-01T10:00:00.000Z',
      providerBucketLabelEndIso: '2026-01-01T10:00:30.000Z',
    },
  };
  plane.candidates = Array.from({ length: nCands }, () => structuredClone(cand)) as never;
  plane.participant = {
    ...plane.participant,
    originalKernelStatus: status as never,
    originalAbstainReasons: [],
    tripEvidenceClassification: tripClass as never,
    adapterClaimsPositiveEvidence: status === 'COMPUTED' && nCands > 0,
  } as never;
  return plane;
}

function alignedA1(): NonNullable<ReturnType<typeof adaptA1DescriptivePlaneFromS14>> & { participant: Record<string, unknown> } {
  const d = adaptA1DescriptivePlaneFromS14()!;
  const b1 = adaptKickdownPlaneFromScenario();
  const id = b1.participant.identity;
  return {
    ...d,
    participant: {
      ...d.participant,
      identity: {
        ...d.participant.identity,
        organizationId: id.organizationId,
        vehicleId: id.vehicleId,
        tripId: id.tripId,
        providerSourceLinkId: id.providerSourceLinkId,
        v1bInputFingerprint: id.v1bInputFingerprint,
      },
    },
  } as never;
}

describe('INDEPENDENT REAUDIT — W2 adversarial', () => {
  it('AUD-01 legit multi-module adapter bundle accepted; only authorized edges', () => {
    const r = run(baselineMatchingMultiModuleBundle());
    report('AUD-01', r);
    expect(r.out?.ok).toBe(true);
    if (r.out?.ok) {
      for (const d of r.out.pairwiseDecisions) {
        if (d.relationshipDecision !== 'INSUFFICIENT_ALIGNMENT_EVIDENCE') {
          expect(DBI_P2C3_V1_AUTHORIZED_POSITIVE_RELATIONSHIPS).toContain(d.relationshipDecision);
        }
        if (d.relationshipDecision === 'SAME_SOURCE_DUPLICATE') expect(d.leftSourceModule).toBe(d.rightSourceModule);
      }
    }
  });

  it('AUD-02 legit planes individually accepted (no over-rejection)', () => {
    const planes = {
      B1: adaptKickdownPlaneFromScenario(),
      B1_S10: adaptKickdownPlaneFromScenario('S10_INSUFFICIENT_OBSERVATIONS'),
      B2_S09: adaptColdEnginePlaneFromS09(),
      B2_POS: adaptColdEnginePositiveCandidatePlane(),
      B3_S11: adaptSustainedLoadPlaneFromS11(),
      B4_S12: adaptRevvingIdlePlaneFromS12(),
      B4_FA: adaptRevvingIdleB4FacetAPlaneFromS01(),
      B4_DUAL: adaptRevvingIdleB4DualFacetPlaneFromS01(),
    };
    for (const [k, p] of Object.entries(planes)) {
      const r = run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [p] }));
      report(`AUD-02 ${k}`, r);
      expect(r.out?.ok).toBe(true);
    }
  });

  it('AUD-03 forged ABSTAINED + duplicate candidates with UNKNOWN classification yields no SAME_SOURCE_DUPLICATE', () => {
    const r = run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [forgeB1Classification('FORGED_UNKNOWN_CLASS', 'ABSTAINED')] }));
    report('AUD-03', r);
    expect(sameSourceEdges(r)).toBe(0);
    expect(r.out?.ok).toBe(false);
  });

  it('AUD-04 forged ABSTAINED + duplicate legit non-positive THROTTLE_STEP_OBSERVED yields no SAME_SOURCE_DUPLICATE', () => {
    const r = run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [forgeB1Classification('THROTTLE_STEP_OBSERVED', 'ABSTAINED')] }));
    report('AUD-04', r);
    expect(sameSourceEdges(r)).toBe(0);
    expect(r.out?.ok).toBe(false);
  });

  it('AUD-05 COMPUTED + unknown candidate classification rejected (enum)', () => {
    const r = run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [forgeB1Classification('FORGED_UNKNOWN_CLASS', 'COMPUTED')] }));
    report('AUD-05', r);
    expect(r.out?.ok).toBe(false);
  });

  it('AUD-06 B2 proxyKind/classification mismatch bypasses NOT_ASSESSABLE subtype', () => {
    const plane = cloneMutablePlane(adaptColdEnginePositiveCandidatePlane());
    const p = plane.participant;
    if (p.sourceModule !== 'P2-B2') throw new Error('b2');
    const pos = plane.candidates.find((c) => c.sourceModule === 'P2-B2')!;
    if (pos.sourceModule !== 'P2-B2') throw new Error('b2c');
    const kinds = ['COLD_ENGINE_HIGH_LOAD', 'COLD_ENGINE_HIGH_RPM', 'COLD_ENGINE_FULL_THROTTLE'] as const;
    const other = kinds.find((k) => k !== pos.proxyKind)!;
    const forgedClass = `${other}_PROXY_CANDIDATE`;
    (pos as { originalClassification: string }).originalClassification = forgedClass;
    (pos.originalCandidate as { classification: string }).classification = forgedClass;
    plane.participant = {
      ...p,
      subtypeAssessability: {
        ...p.subtypeAssessability,
        [pos.proxyKind]: { status: 'ASSESSABLE', reasonCodes: [] },
        [other]: { status: 'NOT_ASSESSABLE', reasonCodes: ['AUDIT_FORGED'] },
      },
    };
     
    console.log(`[AUDIT] AUD-06 detail proxyKind=${pos.proxyKind} forgedClass=${forgedClass} (subtype ${other}=NOT_ASSESSABLE)`);
    const r = run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }));
    report('AUD-06', r);
    expect(r.out?.ok).toBe(false);
  });

  it('AUD-07 B3 unknown tripEvidenceClassification rejected', () => {
    const plane = cloneMutablePlane(adaptSustainedLoadPlaneFromS11());
    const p = plane.participant;
    if (p.sourceModule !== 'P2-B3') throw new Error('b3');
    plane.participant = { ...p, tripEvidenceClassification: 'FORGED_TRIP_CLASS' as never };
    const r = run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }));
    report('AUD-07', r);
    expect(r.out?.ok).toBe(false);
  });

  it('AUD-08 B4 unknown facet tripEvidenceClassification rejected', () => {
    const plane = cloneMutablePlane(adaptRevvingIdleB4FacetAPlaneFromS01());
    const p = plane.participant;
    if (p.sourceModule !== 'P2-B4') throw new Error('b4');
    plane.participant = { ...p, facetA: { ...p.facetA, tripEvidenceClassification: 'FORGED' as never } };
    const r = run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }));
    report('AUD-08', r);
    expect(r.out?.ok).toBe(false);
  });

  it('AUD-09 A1 unknown highEpisodesStatus (both fields, zero episodes) rejected', () => {
    const d = adaptA1DescriptivePlaneFromS14()!;
    const part = d.participant;
    const tampered = {
      ...d,
      episodes: [],
      participant: {
        ...part,
        moduleAssessability: { ...part.moduleAssessability, highEpisodesStatus: 'FORGED' as never },
        highEpisodesMeta: { ...part.highEpisodesMeta, status: 'FORGED' as never },
      },
    };
    const r = run(assembleP2c2Bundle({ descriptive: tampered, powertrainProxies: [adaptKickdownPlaneFromScenario()] }));
    report('AUD-09', r);
    expect(r.out?.ok).toBe(false);
  });

  it('AUD-10 duplicate plane identity evaded via extra unknown identity key', () => {
    const a = adaptKickdownPlaneFromScenario();
    const b = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    b.participant = { ...b.participant, identity: { ...b.participant.identity, auditNonce: 'x' } as never };
    const r = run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [a, b] }));
    report('AUD-10', r);
    expect(r.out?.ok).toBe(false);
  });

  it('AUD-11 non-JSON-safe identity extra field fails closed (no throw)', () => {
    const b = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    b.participant = { ...b.participant, identity: { ...b.participant.identity, auditDate: new Date(0) } as never };
    expectControlledReject('AUD-11', assembleP2c2Bundle({ descriptive: null, powertrainProxies: [b] }));
  });

  it('AUD-12 function in participant.moduleCoverage fails closed (no throw)', () => {
    const b = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const p = b.participant;
    if (p.sourceModule !== 'P2-B1') throw new Error('b1');
    b.participant = { ...p, moduleCoverage: { ...p.moduleCoverage, fn: () => 1 } as never };
    expectControlledReject('AUD-12', assembleP2c2Bundle({ descriptive: null, powertrainProxies: [b] }));
  });

  it('AUD-13 cyclic originalCandidate fails closed (no throw)', () => {
    const b = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const c = structuredClone(b.candidates[0]!);
    (c.originalCandidate as unknown as Record<string, unknown>).self = c.originalCandidate;
    b.candidates = [c];
    expectControlledReject('AUD-13', assembleP2c2Bundle({ descriptive: null, powertrainProxies: [b] }));
  });

  it('AUD-14 Proxy-wrapped bundle fails closed (no throw)', () => {
    const bundle = new Proxy(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [adaptKickdownPlaneFromScenario()] }), {});
    const r = run(bundle);
    report('AUD-14', r);
    expect(r.thrown).toBeUndefined();
    expect(r.out?.ok).toBe(false);
  });

  it('AUD-15 TOCTOU: stateful getter cannot forge positive duplicate edges', () => {
    const clean = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const pos = requirePositiveKickdownCandidate(clean);
    const safe = { ...clean, candidates: [] as typeof clean.candidates };
    safe.participant = { ...clean.participant, adapterClaimsPositiveEvidence: false, originalKernelStatus: 'ABSTAINED' };
    const forged = [structuredClone(pos), structuredClone(pos)];
    const build = (swapAt: number | null) => {
      let n = 0;
      const plane: Record<string, unknown> = { evidencePlane: safe.evidencePlane, participant: safe.participant };
      Object.defineProperty(plane, 'candidates', {
        enumerable: true,
        get() {
          n++;
          return swapAt !== null && n >= swapAt ? forged : [];
        },
      });
      return { plane, count: () => n };
    };
    const probe = build(null);
    run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [probe.plane as never] }));
    const total = probe.count();
    expect(total).toBeGreaterThan(0);
    const attack = build(total);
    const r = run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [attack.plane as never] }));
    report(`AUD-15 (getter accesses=${total})`, r);
    expect(r.thrown).toBeUndefined();
    expect(sameSourceEdges(r)).toBe(0);
    expect(r.out?.ok).toBe(false);
    const fail = r.out;
    if (fail && !fail.ok) {
      expect(
        fail.diagnosticCodes.some((c) =>
          [
            'CANDIDATE_INVENTORY_UNDER_ABSTAINED_KERNEL',
            'PARTICIPANT_CONTRADICTORY_POSITIVE_UNDER_ABSTAIN',
            'BUNDLE_INPUT_ISOLATION_FAILED',
          ].includes(c),
        ),
      ).toBe(true);
    }
  });

  it('AUD-16 B3 forged positive with MULTI_LABEL trip class fails bidirectional parity (A-4)', () => {
    const r = run(
      assembleP2c2Bundle({
        descriptive: null,
        powertrainProxies: [syntheticB3('MULTI_LABEL_HIGH_LOAD_RUN', 'COMPUTED', 1)],
      }),
    );
    report('AUD-16', r);
    expect(r.thrown).toBeUndefined();
    expect(r.out?.ok).toBe(false);
    const fail = r.out;
    if (fail && !fail.ok) {
      expect(fail.diagnosticCodes).toContain('B3_PARTICIPANT_TRIP_CLASSIFICATION_CONTRADICTION');
    }
    expect(sameSourceEdges(r)).toBe(0);
  });

  it('AUD-17 B2 extra unknown subtype key accepted?', () => {
    const plane = cloneMutablePlane(adaptColdEnginePositiveCandidatePlane());
    const p = plane.participant;
    if (p.sourceModule !== 'P2-B2') throw new Error('b2');
    plane.participant = {
      ...p,
      subtypeAssessability: { ...p.subtypeAssessability, COLD_ENGINE_FORGED: { status: 'ASSESSABLE', reasonCodes: [] } } as never,
    };
    const r = run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }));
    report('AUD-17', r);
    expect(r.out?.ok).toBe(false);
  });

  it('AUD-18 determinism: reversed plane order -> identical digest', () => {
    const bundle = baselineMatchingMultiModuleBundle();
    const rev = { ...bundle, powertrainProxies: [...bundle.powertrainProxies].reverse() };
    const a = run(bundle);
    const b = run(rev);
    expect(a.out?.ok && b.out?.ok).toBe(true);
    if (a.out?.ok && b.out?.ok) expect(a.out.resultDigest).toBe(b.out.resultDigest);
  });

  it('AUD-19 B4 positive facet-A candidate relabelled to facet B (envelope coherence)', () => {
    const plane = cloneMutablePlane(adaptRevvingIdleB4FacetAPlaneFromS01());
    const c = plane.candidates.find((x) => x.sourceModule === 'P2-B4')!;
    (c as { facet: string }).facet = 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY';
    const r = run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }));
    report('AUD-19', r);
    expect(r.out?.ok).toBe(false);
  });

  it('AUD-21 A1 v1b fingerprint mismatch vs proxy rejected', () => {
    const d = adaptA1DescriptivePlaneFromS14()!;
    const tampered = { ...d, participant: { ...d.participant, identity: { ...d.participant.identity, v1bInputFingerprint: 'forged-fp' } } };
    const r = run(assembleP2c2Bundle({ descriptive: tampered, powertrainProxies: [adaptKickdownPlaneFromScenario()] }));
    report('AUD-21', r);
    const blocked = !r.out?.ok || r.out.identityAdmission.verdict !== 'ADMITTED';
    expect(blocked).toBe(true);
  });

  it('AUD-30 aligned legit A1 + B1 accepted; A1 never in edges', () => {
    const r = run(assembleP2c2Bundle({ descriptive: alignedA1() as never, powertrainProxies: [adaptKickdownPlaneFromScenario()] }));
    report('AUD-30', r);
    expect(r.out?.ok).toBe(true);
    if (r.out?.ok) {
      expect(r.out.candidateInventory.some((c) => c.sourceModule === 'P2-A1')).toBe(false);
      expect(r.out.pairwiseDecisions.some((d) => d.leftSourceModule === 'P2-A1' || d.rightSourceModule === 'P2-A1')).toBe(false);
    }
  });

  it('AUD-31 aligned A1 unknown highEpisodesStatus both fields, zero episodes', () => {
    const d = alignedA1();
    const part = d.participant as never as { moduleAssessability: object; highEpisodesMeta: object };
    const t = {
      ...d,
      episodes: [],
      participant: {
        ...d.participant,
        moduleAssessability: { ...part.moduleAssessability, highEpisodesStatus: 'FORGED' },
        highEpisodesMeta: { ...part.highEpisodesMeta, status: 'FORGED' },
      },
    };
    const r = run(assembleP2c2Bundle({ descriptive: t as never, powertrainProxies: [adaptKickdownPlaneFromScenario()] }));
    report('AUD-31', r);
    expect(r.out?.ok).toBe(false);
  });

  it('AUD-20/32 aligned A1 NOT_APPLICABLE with nonempty episodes rejected (A-6)', () => {
    const d = alignedA1();
    expect(d.episodes.length).toBeGreaterThan(0);
    const t = { ...d, participant: { ...d.participant, originalKernelStatus: 'NOT_APPLICABLE' } };
    const r = run(assembleP2c2Bundle({ descriptive: t as never, powertrainProxies: [adaptKickdownPlaneFromScenario()] }));
    report(`AUD-32 (episodes=${d.episodes.length})`, r);
    expect(r.thrown).toBeUndefined();
    expect(r.out?.ok).toBe(false);
    const fail = r.out;
    if (fail && !fail.ok) {
      expect(fail.diagnosticCodes).toContain('A1_NOT_APPLICABLE_WITH_EPISODES');
    }
  });

  it('AUD-33 aligned A1 claims positive evidence / guard false rejected', () => {
    const d = alignedA1();
    const t = { ...d, participant: { ...d.participant, adapterClaimsPositiveEvidence: true } };
    const r = run(assembleP2c2Bundle({ descriptive: t as never, powertrainProxies: [adaptKickdownPlaneFromScenario()] }));
    report('AUD-33', r);
    expect(r.out?.ok).toBe(false);
  });

  it('AUD-34 B3 COMPUTED + positive + trip class GAP_AWARE accepted (control)', () => {
    const r = run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [syntheticB3('GAP_AWARE_SUSTAINED_PROXY_CANDIDATE', 'COMPUTED', 1)] }));
    report('AUD-34', r);
    expect(r.out?.ok).toBe(true);
  });

  it('AUD-36 B3 positive candidates with forged unknown trip class', () => {
    const r = run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [syntheticB3('FORGED', 'COMPUTED', 1)] }));
    report('AUD-36', r);
    expect(r.out?.ok).toBe(false);
  });

  it('AUD-37 B3 ABSTAINED + duplicate GAP_AWARE positives (P1-04 analog) rejected', () => {
    const r = run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [syntheticB3('NOT_ASSESSABLE', 'ABSTAINED', 2)] }));
    report('AUD-37', r);
    expect(r.out?.ok).toBe(false);
  });

  it('AUD-38 B3 status NOT_OBSERVED but trip class SINGLE_HIGH_LOAD_ENTRY_LABEL, zero cands (status/class parity)', () => {
    const r = run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [syntheticB3('SINGLE_HIGH_LOAD_ENTRY_LABEL', 'NOT_OBSERVED', 0)] }));
    report('AUD-38', r);
    expect(r.out?.ok).toBe(false);
  });

  it('AUD-39 B2 ABSTAINED with candidates is impossible in kernel — non-positive duplicate', () => {
    const plane = cloneMutablePlane(adaptColdEnginePositiveCandidatePlane());
    const c = structuredClone(plane.candidates[0]!);
    (c as { originalClassification: string }).originalClassification = 'NOT_ASSESSABLE';
    (c.originalCandidate as { classification: string }).classification = 'NOT_ASSESSABLE';
    plane.candidates = [c, structuredClone(c)];
    plane.participant = { ...plane.participant, originalKernelStatus: 'ABSTAINED', adapterClaimsPositiveEvidence: false };
    const r = run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }));
    report('AUD-39', r);
    expect(r.out?.ok).toBe(false);
  });

  it('AUD-40 B2 positive with forged proxyKind mismatch inside ADMITTED multi-module bundle', () => {
    const bundle = baselineMatchingMultiModuleBundle();
    const planes = bundle.powertrainProxies.map((p) => cloneMutablePlane(p));
    const b2 = planes.find((p) => p.participant.sourceModule === 'P2-B2')!;
    const p = b2.participant;
    if (p.sourceModule !== 'P2-B2') throw new Error('b2');
    const pos = b2.candidates.find((c) => c.sourceModule === 'P2-B2')!;
    if (pos.sourceModule !== 'P2-B2') throw new Error('b2c');
    (pos as { originalClassification: string }).originalClassification = 'COLD_ENGINE_HIGH_RPM_PROXY_CANDIDATE';
    (pos.originalCandidate as { classification: string }).classification = 'COLD_ENGINE_HIGH_RPM_PROXY_CANDIDATE';
    b2.participant = {
      ...p,
      subtypeAssessability: { ...p.subtypeAssessability, COLD_ENGINE_HIGH_RPM: { status: 'NOT_ASSESSABLE', reasonCodes: ['AUDIT'] } },
    };
    const r = run({ ...bundle, powertrainProxies: planes });
    report(`AUD-40 (proxyKind=${pos.proxyKind})`, r);
    if (r.out?.ok) {
      const inv = r.out.candidateInventory.filter((c) => c.originalClassification === 'COLD_ENGINE_HIGH_RPM_PROXY_CANDIDATE');
       
      console.log(`[AUDIT] AUD-40 inventory HIGH_RPM positives under NOT_ASSESSABLE subtype: ${inv.length}`);
    }
    expect(r.out?.ok).toBe(false);
  });

  it('AUD-22 NOT_OBSERVED + duplicate non-positive retains inventory without positive duplicate edge', () => {
    const r = run(
      assembleP2c2Bundle({ descriptive: null, powertrainProxies: [forgeB1Classification('THROTTLE_STEP_OBSERVED', 'NOT_OBSERVED')] }),
    );
    report('AUD-22', r);
    expect(r.thrown).toBeUndefined();
    expect(r.out?.ok).toBe(true);
    if (r.out?.ok) {
      expect(r.out.candidateInventory).toHaveLength(2);
      expect(sameSourceEdges(r)).toBe(0);
      expect(r.out.pairwiseDecisions.every((d) => d.relationshipDecision !== 'SAME_SOURCE_DUPLICATE')).toBe(true);
      const duplicatePair = r.out.pairwiseDecisions.find((d) => d.leftSourceModule === 'P2-B1' && d.rightSourceModule === 'P2-B1');
      expect(duplicatePair).toBeDefined();
      expect(duplicatePair!.relationshipDecision).toBe('INSUFFICIENT_ALIGNMENT_EVIDENCE');
      expect(duplicatePair!.decisionRationaleCodes).toContain('NON_POSITIVE_DUPLICATE_NOT_AUTHORIZED_V1_EDGE');
    }
  });

  it('AUD-41 deeply nested originalCandidate fails closed without RangeError (A-8 depth)', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const c = structuredClone(plane.candidates[0]!);
    (c.originalCandidate as Record<string, unknown>).nestedAudit = nestPlainObjectDepth(80);
    plane.candidates = [c];
    expectControlledReject('AUD-41', assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }));
    const r = run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }));
    const fail = r.out;
    if (fail && !fail.ok) {
      expect(
        fail.diagnosticCodes.some((c) =>
          ['CANDIDATE_PAYLOAD_CANONICAL_INVALID', 'BUNDLE_NESTED_SHAPE_INVALID'].includes(c),
        ),
      ).toBe(true);
    }
  });

  describe('Opus W2 final two-blocker oracles (N-03..N-09)', () => {
    function nestPlainObjectForProjection(depth: number): Record<string, unknown> {
      let n: Record<string, unknown> = { leaf: 1 };
      for (let i = 0; i < depth; i++) n = { c: n };
      return n;
    }

    function expectProjectionReject(id: string, bundle: unknown) {
      const r = run(bundle);
      report(id, r);
      expect(r.thrown).toBeUndefined();
      expect(r.out?.ok).toBe(false);
      const fail = r.out;
      if (fail && !fail.ok) {
        expect(fail.diagnosticCodes).toContain('PARTICIPANT_PROJECTION_CANONICAL_INVALID');
      }
    }

    it('N-03 deep moduleCoverage fails closed without throw (A-8 projection)', () => {
      const p = cloneMutablePlane(adaptKickdownPlaneFromScenario());
      const part = p.participant;
      if (part.sourceModule !== 'P2-B1') throw new Error('precondition B1');
      p.participant = {
        ...part,
        moduleCoverage: { ...part.moduleCoverage, deep: nestPlainObjectForProjection(80) } as never,
      };
      expectProjectionReject('N-03', assembleP2c2Bundle({ descriptive: null, powertrainProxies: [p] }));
    });

    it('N-04 NaN in moduleCoverage fails closed without throw (A-8 projection)', () => {
      const p = cloneMutablePlane(adaptKickdownPlaneFromScenario());
      const part = p.participant;
      if (part.sourceModule !== 'P2-B1') throw new Error('precondition B1');
      p.participant = {
        ...part,
        moduleCoverage: { ...part.moduleCoverage, rpmTripCoverage: Number.NaN } as never,
      };
      expectProjectionReject('N-04', assembleP2c2Bundle({ descriptive: null, powertrainProxies: [p] }));
    });

    it('N-05 Date in B4 coverageDiagnostics fails closed without throw (A-8 projection)', () => {
      const p = cloneMutablePlane(adaptRevvingIdleB4FacetAPlaneFromS01());
      const part = p.participant;
      if (part.sourceModule !== 'P2-B4') throw new Error('precondition B4');
      p.participant = {
        ...part,
        facetA: {
          ...part.facetA,
          coverageDiagnostics: { ...part.facetA.coverageDiagnostics, d: new Date(0) } as never,
        },
      };
      expectProjectionReject('N-05', assembleP2c2Bundle({ descriptive: null, powertrainProxies: [p] }));
    });

    it('N-06 undefined in B2 moduleCoverage fails closed without throw (A-8 projection)', () => {
      const p = cloneMutablePlane(adaptColdEnginePositiveCandidatePlane());
      const part = p.participant;
      if (part.sourceModule !== 'P2-B2') throw new Error('precondition B2');
      p.participant = {
        ...part,
        moduleCoverage: { ...part.moduleCoverage, u: undefined } as never,
      };
      expectProjectionReject('N-06', assembleP2c2Bundle({ descriptive: null, powertrainProxies: [p] }));
    });

    it('N-08 B3 ABSTAINED + NOT_OBSERVED trip class fails closed (A-4 negative parity)', () => {
      const r = run(
        assembleP2c2Bundle({ descriptive: null, powertrainProxies: [syntheticB3('NOT_OBSERVED', 'ABSTAINED', 0)] }),
      );
      report('N-08', r);
      expect(r.thrown).toBeUndefined();
      expect(r.out?.ok).toBe(false);
      const fail = r.out;
      if (fail && !fail.ok) {
        expect(fail.diagnosticCodes).toContain('B3_PARTICIPANT_STATUS_TRIP_CLASS_CONTRADICTION');
      }
    });

    it('N-09 B3 COMPUTED + NOT_OBSERVED trip class fails closed (A-4 negative parity)', () => {
      const r = run(
        assembleP2c2Bundle({ descriptive: null, powertrainProxies: [syntheticB3('NOT_OBSERVED', 'COMPUTED', 0)] }),
      );
      report('N-09', r);
      expect(r.thrown).toBeUndefined();
      expect(r.out?.ok).toBe(false);
      const fail = r.out;
      if (fail && !fail.ok) {
        expect(fail.diagnosticCodes).toContain('B3_PARTICIPANT_STATUS_TRIP_CLASS_CONTRADICTION');
      }
    });
  });

  it('AUD-42 oversized limitationCodes array fails closed without stack overflow (A-8 breadth)', () => {
    const plane = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const c = structuredClone(plane.candidates[0]!);
    const kick = c.originalCandidate as { limitationCodes: string[] };
    kick.limitationCodes = Array.from({ length: 600 }, (_, i) => `CODE_${i}`);
    plane.candidates = [c];
    const r = run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [plane] }));
    report('AUD-42', r);
    expect(r.thrown).toBeUndefined();
    expect(r.out?.ok).toBe(false);
    const fail = r.out;
    if (fail && !fail.ok) {
      expect(fail.diagnosticCodes).toContain('BUNDLE_NESTED_SHAPE_INVALID');
    }
  });
});
