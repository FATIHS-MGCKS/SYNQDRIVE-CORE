import {
  assertFsdDiscoveryRunTransition,
  assertFsdDiscoveryStageTransition,
  buildFsdDiscoveryRunKey,
  buildFsdDiscoveryStagePlanFingerprint,
} from './fsd-discovery-persistence.contract.v1';

describe('FSD-2 persistence contract', () => {
  it('builds deterministic run and stage fingerprints', () => {
    const runKeyA = buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'cat-a' });
    const runKeyB = buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'cat-a' });
    const runKeyC = buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'cat-b' });
    expect(runKeyA).toBe(runKeyB);
    expect(runKeyA).not.toBe(runKeyC);

    const stageFp = buildFsdDiscoveryStagePlanFingerprint({
      stageType: 'SNAPSHOT',
      planDocumentFingerprints: ['b', 'a'],
    });
    const stageFp2 = buildFsdDiscoveryStagePlanFingerprint({
      stageType: 'SNAPSHOT',
      planDocumentFingerprints: ['a', 'b'],
    });
    expect(stageFp).toBe(stageFp2);
  });

  it('fail-closed on invalid run transitions', () => {
    expect(() => assertFsdDiscoveryRunTransition('COMPLETED', 'IN_PROGRESS')).toThrow(
      /INVALID_STATE_TRANSITION/,
    );
  });

  it('allows UNKNOWN_OUTCOME without automatic retry path in stage machine', () => {
    expect(() => assertFsdDiscoveryStageTransition('IN_PROGRESS', 'UNKNOWN_OUTCOME')).not.toThrow();
    expect(() => assertFsdDiscoveryStageTransition('UNKNOWN_OUTCOME', 'IN_PROGRESS')).toThrow(
      /INVALID_STATE_TRANSITION/,
    );
  });
});
