/* Independent final re-audit replay (N-01..N-19). Blocker probes assert fail-closed diagnostics. */
import { reconcileDbiP2c2OfflineEvidenceBundleV1 } from '../index.v1';
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
  withIdentityOverride,
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
  const o = r.out;
  const s = r.thrown
    ? `THROWN ${r.thrown}`
    : o!.ok
      ? `ok=true admission=${o!.identityAdmission.verdict} edges=${JSON.stringify(o!.pairwiseDecisions.map((d) => d.relationshipDecision))}`
      : `ok=false ${o!.diagnosticCodes.join(',')}`;
  console.log(`[FINAL] ${id} -> ${s}`);
}
const one = (p: unknown) => assembleP2c2Bundle({ descriptive: null, powertrainProxies: [p as never] });
function nest(depth: number): Record<string, unknown> {
  let n: Record<string, unknown> = { leaf: 1 };
  for (let i = 0; i < depth; i++) n = { c: n };
  return n;
}
function b3(tripClass: string, status: string, nCands: number) {
  const plane = cloneMutablePlane(adaptSustainedLoadPlaneFromS11());
  const cand = {
    sourceModule: 'P2-B3',
    sourceEpisodeKey: 'k',
    originalClassification: 'GAP_AWARE_SUSTAINED_PROXY_CANDIDATE',
    originalCandidate: {
      episodeKey: 'k',
      classification: 'GAP_AWARE_SUSTAINED_PROXY_CANDIDATE',
      startProviderBucketLabelIso: '2026-01-01T10:00:01.000Z',
      endProviderBucketLabelIso: '2026-01-01T10:00:05.000Z',
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

describe('W2 final re-audit independent probes', () => {
  it('N-01 legit planes + multi-module baseline accepted, digest deterministic under plane+candidate reorder', () => {
    for (const p of [
      adaptKickdownPlaneFromScenario(),
      adaptKickdownPlaneFromScenario('S10_INSUFFICIENT_OBSERVATIONS'),
      adaptColdEnginePlaneFromS09(),
      adaptColdEnginePositiveCandidatePlane(),
      adaptSustainedLoadPlaneFromS11(),
      adaptRevvingIdlePlaneFromS12(),
      adaptRevvingIdleB4FacetAPlaneFromS01(),
      adaptRevvingIdleB4DualFacetPlaneFromS01(),
    ]) {
      expect(run(one(p)).out?.ok).toBe(true);
    }
    const b = baselineMatchingMultiModuleBundle();
    const rev = {
      ...b,
      powertrainProxies: [...b.powertrainProxies].reverse().map((p) => ({ ...p, candidates: [...p.candidates].reverse() })),
    };
    const x = run(b);
    const y = run(rev);
    expect(x.out?.ok && y.out?.ok).toBe(true);
    if (x.out?.ok && y.out?.ok) expect(x.out.resultDigest).toBe(y.out.resultDigest);
  });

  it('N-02 legit COMPUTED duplicate positive kickdown still yields exactly one SAME_SOURCE_DUPLICATE', () => {
    const p = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const pos = p.candidates.find((c) => c.originalClassification === 'KICKDOWN_LIKE_PROXY_CANDIDATE')!;
    p.candidates = [structuredClone(pos), structuredClone(pos)];
    const r = run(one(p));
    report('N-02', r);
    expect(r.out?.ok).toBe(true);
    if (r.out?.ok) expect(r.out.pairwiseDecisions.filter((d) => d.relationshipDecision === 'SAME_SOURCE_DUPLICATE')).toHaveLength(1);
  });

  it('N-03 deep nesting (80) in participant.moduleCoverage -> controlled ok=false, no throw', () => {
    const p = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const part = p.participant as never as { moduleCoverage: Record<string, unknown> };
    p.participant = { ...p.participant, moduleCoverage: { ...part.moduleCoverage, deep: nest(80) } } as never;
    const r = run(one(p));
    report('N-03', r);
    expect(r.thrown).toBeUndefined();
    expect(r.out?.ok).toBe(false);
    if (r.out && !r.out.ok) expect(r.out.diagnosticCodes).toContain('PARTICIPANT_PROJECTION_CANONICAL_INVALID');
  });

  it('N-04 NaN in participant.moduleCoverage -> no throw', () => {
    const p = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const part = p.participant as never as { moduleCoverage: Record<string, unknown> };
    p.participant = { ...p.participant, moduleCoverage: { ...part.moduleCoverage, rpmTripCoverage: Number.NaN } } as never;
    const r = run(one(p));
    report('N-04', r);
    expect(r.thrown).toBeUndefined();
    expect(r.out?.ok).toBe(false);
    if (r.out && !r.out.ok) expect(r.out.diagnosticCodes).toContain('PARTICIPANT_PROJECTION_CANONICAL_INVALID');
  });

  it('N-05 Date in B4 facetA.coverageDiagnostics -> no throw', () => {
    const p = cloneMutablePlane(adaptRevvingIdleB4FacetAPlaneFromS01());
    const part = p.participant as never as { facetA: Record<string, unknown> & { coverageDiagnostics: object } };
    p.participant = {
      ...p.participant,
      facetA: { ...part.facetA, coverageDiagnostics: { ...part.facetA.coverageDiagnostics, d: new Date(0) } },
    } as never;
    const r = run(one(p));
    report('N-05', r);
    expect(r.thrown).toBeUndefined();
    expect(r.out?.ok).toBe(false);
    if (r.out && !r.out.ok) expect(r.out.diagnosticCodes).toContain('PARTICIPANT_PROJECTION_CANONICAL_INVALID');
  });

  it('N-06 undefined inside B2 moduleCoverage -> no throw', () => {
    const p = cloneMutablePlane(adaptColdEnginePositiveCandidatePlane());
    const part = p.participant as never as { moduleCoverage: Record<string, unknown> };
    p.participant = { ...p.participant, moduleCoverage: { ...part.moduleCoverage, u: undefined } } as never;
    const r = run(one(p));
    report('N-06', r);
    expect(r.thrown).toBeUndefined();
    expect(r.out?.ok).toBe(false);
    if (r.out && !r.out.ok) expect(r.out.diagnosticCodes).toContain('PARTICIPANT_PROJECTION_CANONICAL_INVALID');
  });

  it('N-07 extremely deep (20000) candidate payload -> no throw', () => {
    const p = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const c = structuredClone(p.candidates[0]!);
    (c.originalCandidate as Record<string, unknown>).deep = nest(20000);
    p.candidates = [c];
    const r = run(one(p));
    report('N-07', r);
    expect(r.thrown).toBeUndefined();
    expect(r.out?.ok).toBe(false);
  });

  it('N-08 B3 ABSTAINED + trip class NOT_OBSERVED (kernel impossible negative) rejected', () => {
    const r = run(one(b3('NOT_OBSERVED', 'ABSTAINED', 0)));
    report('N-08', r);
    expect(r.out?.ok).toBe(false);
    if (r.out && !r.out.ok) expect(r.out.diagnosticCodes).toContain('B3_PARTICIPANT_STATUS_TRIP_CLASS_CONTRADICTION');
  });

  it('N-09 B3 COMPUTED + trip class NOT_OBSERVED, zero candidates (kernel impossible) rejected', () => {
    const r = run(one(b3('NOT_OBSERVED', 'COMPUTED', 0)));
    report('N-09', r);
    expect(r.out?.ok).toBe(false);
    if (r.out && !r.out.ok) expect(r.out.diagnosticCodes).toContain('B3_PARTICIPANT_STATUS_TRIP_CLASS_CONTRADICTION');
  });

  it('N-10 B3 legit-shaped COMPUTED + MULTI_LABEL zero cands accepted (preserve valid)', () => {
    const r = run(one(b3('MULTI_LABEL_HIGH_LOAD_RUN', 'COMPUTED', 0)));
    report('N-10', r);
    expect(r.out?.ok).toBe(true);
  });

  it('N-11 B3 duplicate positives under COMPUTED/GAP_AWARE -> one SAME_SOURCE_DUPLICATE (authorized)', () => {
    const r = run(one(b3('GAP_AWARE_SUSTAINED_PROXY_CANDIDATE', 'COMPUTED', 2)));
    report('N-11', r);
    expect(r.out?.ok).toBe(true);
  });

  it('N-12 B1 forged support tier rejected (W3-C enum guard)', () => {
    const p = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const c = p.candidates[0]! as unknown as { originalCandidateSupportTier: string; originalCandidate: { candidateSupportTier: string } };
    c.originalCandidateSupportTier = 'FORGED_TIER';
    c.originalCandidate.candidateSupportTier = 'FORGED_TIER';
    const r = run(one(p));
    report('N-12', r);
    expect(r.thrown).toBeUndefined();
    expect(r.out?.ok).toBe(false);
    if (r.out && !r.out.ok) {
      expect(r.out.diagnosticCodes).toContain('B1_CANDIDATE_SUPPORT_TIER_INVALID');
    }
  });

  it('N-13 B2 forged proxyKind on non-positive candidate rejected', () => {
    const p = cloneMutablePlane(adaptColdEnginePositiveCandidatePlane());
    const c = structuredClone(p.candidates[0]!) as unknown as Record<string, unknown> & { originalCandidate: Record<string, unknown> };
    c.originalClassification = 'NOT_ASSESSABLE';
    c.originalCandidate.classification = 'NOT_ASSESSABLE';
    c.proxyKind = 'FORGED_KIND';
    c.originalCandidate.proxyKind = 'FORGED_KIND';
    p.candidates = [...p.candidates, c as never];
    const r = run(one(p));
    report('N-13', r);
    expect(r.out?.ok).toBe(false);
  });

  it('N-14 B4 positive facet-B candidate under facet-B NOT_ASSESSABLE (dual plane) rejected', () => {
    const p = cloneMutablePlane(adaptRevvingIdleB4DualFacetPlaneFromS01());
    const part = p.participant as never as { facetB: Record<string, unknown> };
    p.participant = { ...p.participant, facetB: { ...part.facetB, assessability: 'NOT_ASSESSABLE' } } as never;
    const r = run(one(p));
    report('N-14', r);
    expect(r.out?.ok).toBe(false);
  });

  it('N-15 prototype accessor on plane (non-own) cannot inject candidates', () => {
    const base = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const pos = base.candidates.find((c) => c.originalClassification === 'KICKDOWN_LIKE_PROXY_CANDIDATE')!;
    const proto = { get candidates() { return [structuredClone(pos), structuredClone(pos)]; } };
    const plane = Object.create(proto) as Record<string, unknown>;
    plane.evidencePlane = base.evidencePlane;
    plane.participant = { ...base.participant, originalKernelStatus: 'ABSTAINED', adapterClaimsPositiveEvidence: false };
    const r = run(one(plane));
    report('N-15', r);
    expect(r.thrown).toBeUndefined();
    const edges = r.out?.ok ? r.out.pairwiseDecisions.filter((d) => d.relationshipDecision === 'SAME_SOURCE_DUPLICATE').length : 0;
    expect(edges).toBe(0);
  });

  it('N-16 sourceBundleId reported on one plane, null on the other -> no SAME_SOURCE_DUPLICATE across', () => {
    const a = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const pos = a.candidates.find((c) => c.originalClassification === 'KICKDOWN_LIKE_PROXY_CANDIDATE')!;
    a.candidates = [structuredClone(pos)];
    const b = withIdentityOverride(a as never, { sourceBundleId: a.participant.identity.sourceBundleId ? null : 'bundle-x' });
    const r = run(assembleP2c2Bundle({ descriptive: null, powertrainProxies: [a as never, b] }));
    report('N-16', r);
    expect(r.thrown).toBeUndefined();
  });

  it('N-17 A1 COMPUTED + highEpisodes NOT_OBSERVED with episodes rejected (aligned)', () => {
    const d = adaptA1DescriptivePlaneFromS14()!;
    const id = adaptKickdownPlaneFromScenario().participant.identity;
    const t = {
      ...d,
      participant: {
        ...d.participant,
        identity: { ...d.participant.identity, organizationId: id.organizationId, vehicleId: id.vehicleId, tripId: id.tripId, providerSourceLinkId: id.providerSourceLinkId, v1bInputFingerprint: id.v1bInputFingerprint },
        moduleAssessability: { ...d.participant.moduleAssessability, highEpisodesStatus: 'NOT_OBSERVED' as const },
        highEpisodesMeta: { ...d.participant.highEpisodesMeta, status: 'NOT_OBSERVED' as const },
      },
    };
    expect(d.episodes.length).toBeGreaterThan(0);
    const r = run(assembleP2c2Bundle({ descriptive: t, powertrainProxies: [adaptKickdownPlaneFromScenario()] }));
    report('N-17', r);
    expect(r.out?.ok).toBe(false);
  });

  it('N-18 identity extra key with __proto__ own property rejected', () => {
    const p = cloneMutablePlane(adaptKickdownPlaneFromScenario());
    const id = { ...p.participant.identity } as Record<string, unknown>;
    Object.defineProperty(id, '__proto__', { value: { x: 1 }, enumerable: true, configurable: true, writable: true });
    p.participant = { ...p.participant, identity: id } as never;
    const r = run(one(p));
    report('N-18', r);
    expect(r.thrown).toBeUndefined();
    expect(r.out?.ok).toBe(false);
  });

  it('N-19 input object is not mutated by reconciliation', () => {
    const b = baselineMatchingMultiModuleBundle();
    const before = JSON.stringify(b);
    run(b);
    expect(JSON.stringify(b)).toBe(before);
  });
});
