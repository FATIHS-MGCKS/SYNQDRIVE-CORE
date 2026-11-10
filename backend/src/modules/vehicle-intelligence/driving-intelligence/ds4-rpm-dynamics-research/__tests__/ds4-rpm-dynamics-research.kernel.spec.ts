import { computeDs4RpmEpisodeResearchV1 } from '../../ds4-rpm-episode-research/ds4-rpm-episode-research.kernel.v1';
import { canonicalizeDs4RpmResearchPoints } from '../../ds4-rpm-research-shared/ds4-rpm-research-point-canon.v1';
import { computeDs4RpmDynamicsResearchV1 } from '../ds4-rpm-dynamics-research.kernel.v1';
import {
  buildBoundDynamicsInput,
  buildBoundResearchInput,
  buildRpmPointsEverySeconds,
} from './ds4-rpm-dynamics-research.test-helpers';

describe('ds4-rpm-dynamics-research kernel v1', () => {
  it('computes rising adjacent deltas and a rising monotonic run', () => {
    const rpmPoints = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 5, 1).map((p, i) => ({
      ...p,
      valueRpm: 800 + i * 50,
    }));
    const out = computeDs4RpmDynamicsResearchV1(buildBoundDynamicsInput({ rpmPoints }));
    expect(out.status).toBe('COMPUTED');
    expect(out.timeAuthority).toBe('BUCKET_LABEL_UNVERIFIED');
    expect(out.observedDynamics.status).toBe('SUPPORTED_DESCRIPTIVE');
    expect(out.observedDynamics.deltaDistribution.positiveCount).toBe(4);
    expect(out.observedDynamics.adjacentDeltas.every((d) => d.direction === 'RISE')).toBe(true);
    expect(out.observedDynamics.monotonicRuns.some((r) => r.kind === 'RISING')).toBe(true);
    expect(out.semanticGuards.observedDeltaIsNotPhysicalDrpmDt).toBe(true);
  });

  it('computes falling deltas', () => {
    const rpmPoints = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 4, 1).map((p, i) => ({
      ...p,
      valueRpm: 1200 - i * 40,
    }));
    const out = computeDs4RpmDynamicsResearchV1(buildBoundDynamicsInput({ rpmPoints }));
    expect(out.observedDynamics.deltaDistribution.negativeCount).toBe(3);
    expect(out.observedDynamics.monotonicRuns.some((r) => r.kind === 'FALLING')).toBe(true);
  });

  it('counts a direction reversal between rising and falling runs', () => {
    const rpmPoints = [
      { recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: 800 },
      { recordedAtIso: '2026-01-01T10:00:02.000Z', valueRpm: 950 },
      { recordedAtIso: '2026-01-01T10:00:03.000Z', valueRpm: 900 },
      { recordedAtIso: '2026-01-01T10:00:04.000Z', valueRpm: 850 },
    ];
    const out = computeDs4RpmDynamicsResearchV1(buildBoundDynamicsInput({ rpmPoints }));
    expect(out.observedDynamics.observedDirectionReversalCount).toBe(1);
  });

  it('treats constant RPM as flat deltas', () => {
    const rpmPoints = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 4, 1).map((p) => ({
      ...p,
      valueRpm: 900,
    }));
    const out = computeDs4RpmDynamicsResearchV1(buildBoundDynamicsInput({ rpmPoints }));
    expect(out.observedDynamics.deltaDistribution.zeroCount).toBe(3);
    expect(out.observedDynamics.monotonicRuns[0]?.kind).toBe('FLAT');
  });

  it('binds RPM_1S cadence profile (2s sequence max gap)', () => {
    const out = computeDs4RpmDynamicsResearchV1(
      buildBoundDynamicsInput({
        rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 8, 1),
      }),
    );
    expect(out.bindings.cadenceTier).toBe('RPM_1S');
    expect(out.bindings.nominalCadenceSeconds).toBe(1);
    expect(out.bindings.sequenceMaxGapSeconds).toBe(2);
  });

  it('binds RPM_2S cadence profile', () => {
    const out = computeDs4RpmDynamicsResearchV1(
      buildBoundDynamicsInput({
        rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:00.000Z', 5, 2),
        tripId: 'tier-2s-trip',
        cadenceTier: 'RPM_2S',
      }),
    );
    expect(out.bindings.cadenceTier).toBe('RPM_2S');
    expect(out.bindings.nominalCadenceSeconds).toBe(2);
    expect(out.bindings.sequenceMaxGapSeconds).toBe(3);
  });

  it('abstains for RPM_3S observation-only tier (V1B policy; no cadence activation change)', () => {
    const out = computeDs4RpmDynamicsResearchV1(
      buildBoundDynamicsInput({
        rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:00.000Z', 4, 3),
        tripId: 'tier-3s-trip',
        cadenceTier: 'RPM_3S',
      }),
    );
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('V1B_ANALYSIS_MODE_NOT_ELIGIBLE');
    expect(out.bindings.cadenceTier).toBe('RPM_3S');
    expect(out.bindings.nominalCadenceSeconds).toBeNull();
  });

  it('keeps labels in one sequence at exact sequence gap boundary', () => {
    const rpmPoints = [
      { recordedAtIso: '2026-01-01T10:00:00.000Z', valueRpm: 900 },
      { recordedAtIso: '2026-01-01T10:00:02.000Z', valueRpm: 920 },
      { recordedAtIso: '2026-01-01T10:00:04.000Z', valueRpm: 940 },
    ];
    const out = computeDs4RpmDynamicsResearchV1(buildBoundDynamicsInput({ rpmPoints }));
    expect(out.denominators.continuousSequenceCount).toBe(1);
    expect(out.denominators.adjacentObservedPairCount).toBe(2);
  });

  it('splits sequences when label gap strictly exceeds v1b sequence max', () => {
    const rpmPoints = [
      { recordedAtIso: '2026-01-01T10:00:00.000Z', valueRpm: 900 },
      { recordedAtIso: '2026-01-01T10:00:02.000Z', valueRpm: 920 },
      { recordedAtIso: '2026-01-01T10:00:05.000Z', valueRpm: 940 },
    ];
    const out = computeDs4RpmDynamicsResearchV1(buildBoundDynamicsInput({ rpmPoints }));
    expect(out.denominators.continuousSequenceCount).toBe(2);
    expect(out.denominators.adjacentObservedPairCount).toBe(1);
  });

  it('abstains on conflicting duplicate RPM at one label', () => {
    const iso = '2026-01-01T10:00:01.000Z';
    const out = computeDs4RpmDynamicsResearchV1(
      buildBoundDynamicsInput({
        rpmPoints: [
          { recordedAtIso: iso, valueRpm: 800 },
          { recordedAtIso: iso, valueRpm: 900 },
          { recordedAtIso: '2026-01-01T10:00:02.000Z', valueRpm: 850 },
        ],
      }),
    );
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('CONFLICTING_RPM_LABELS_AT_SHARED_TIMESTAMP');
  });

  it('collapses identical duplicate labels and still computes dynamics', () => {
    const iso = '2026-01-01T10:00:01.000Z';
    const out = computeDs4RpmDynamicsResearchV1(
      buildBoundDynamicsInput({
        rpmPoints: [
          { recordedAtIso: iso, valueRpm: 800 },
          { recordedAtIso: iso, valueRpm: 800 },
          { recordedAtIso: '2026-01-01T10:00:02.000Z', valueRpm: 850 },
        ],
      }),
    );
    expect(out.status).toBe('COMPUTED');
    expect(out.denominators.identicalDuplicateCollapsedCount).toBe(1);
    expect(out.denominators.observedUniqueLabelCount).toBe(2);
  });

  it('excludes invalid timestamps and negative RPM from canon', () => {
    const out = computeDs4RpmDynamicsResearchV1(
      buildBoundDynamicsInput({
        rpmPoints: [
          { recordedAtIso: 'not-a-date', valueRpm: 800 },
          { recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: -1 },
          { recordedAtIso: '2026-01-01T10:00:02.000Z', valueRpm: 820 },
        ],
      }),
    );
    expect(out.denominators.invalidTimestampOrRpmCount).toBeGreaterThan(0);
    expect(out.denominators.negativeOrNonFiniteRpmExcludedCount).toBe(1);
    expect(out.denominators.adjacentObservedPairCount).toBe(0);
    expect(out.observedDynamics.status).toBe('NOT_ASSESSABLE');
  });

  it('abstains when ICE applicability is NOT_APPLICABLE (BEV path)', () => {
    const out = computeDs4RpmDynamicsResearchV1(
      buildBoundDynamicsInput({
        rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 4, 1),
        iceRpmApplicability: 'NOT_APPLICABLE',
      }),
    );
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('ICE_APPLICABILITY_NOT_ADMITTED');
  });

  it('abstains on incomplete HF read', () => {
    const input = buildBoundDynamicsInput({
      rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 5, 1),
    });
    input.tripInput.dataQuality.completenessLabel = 'INCOMPLETE_MORE_POINTS_AVAILABLE';
    const out = computeDs4RpmDynamicsResearchV1(input);
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('HF_READ_INCOMPLETE');
  });

  it('is deterministic under input permutation', () => {
    const rpmPoints = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 6, 1).map((p, i) => ({
      ...p,
      valueRpm: 700 + i * 25,
    }));
    const shuffled = [...rpmPoints].reverse();
    const a = computeDs4RpmDynamicsResearchV1(buildBoundDynamicsInput({ rpmPoints }));
    const b = computeDs4RpmDynamicsResearchV1(buildBoundDynamicsInput({ rpmPoints: shuffled }));
    expect(JSON.stringify(a.observedDynamics)).toBe(JSON.stringify(b.observedDynamics));
  });

  describe('P1 insufficient pair / negative evidence', () => {
    it('zero adjacent pairs → NOT_ASSESSABLE while trip status stays COMPUTED', () => {
      const rpmPoints = [
        { recordedAtIso: '2026-01-01T10:00:00.000Z', valueRpm: 900 },
        { recordedAtIso: '2026-01-01T10:00:05.000Z', valueRpm: 920 },
      ];
      const out = computeDs4RpmDynamicsResearchV1(buildBoundDynamicsInput({ rpmPoints }));
      expect(out.status).toBe('COMPUTED');
      expect(out.denominators.adjacentObservedPairCount).toBe(0);
      expect(out.denominators.continuousSequenceCount).toBe(2);
      expect(out.observedDynamics.status).toBe('NOT_ASSESSABLE');
    });

    it('does not emit synthetic FLAT runs for singleton sequences', () => {
      const rpmPoints = [
        { recordedAtIso: '2026-01-01T10:00:00.000Z', valueRpm: 900 },
        { recordedAtIso: '2026-01-01T10:00:05.000Z', valueRpm: 920 },
        { recordedAtIso: '2026-01-01T10:00:10.000Z', valueRpm: 940 },
      ];
      const out = computeDs4RpmDynamicsResearchV1(buildBoundDynamicsInput({ rpmPoints }));
      expect(out.denominators.continuousSequenceCount).toBe(3);
      expect(out.observedDynamics.monotonicRuns).toHaveLength(0);
    });

    it('preserves genuine FLAT runs with at least two equal observations', () => {
      const rpmPoints = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 3, 1).map((p) => ({
        ...p,
        valueRpm: 1100,
      }));
      const out = computeDs4RpmDynamicsResearchV1(buildBoundDynamicsInput({ rpmPoints }));
      expect(out.observedDynamics.monotonicRuns).toEqual([
        expect.objectContaining({ kind: 'FLAT', pointCount: 3 }),
      ]);
    });
  });

  describe('P2 plateau reversal semantics', () => {
    const secs = (base: string, offset: number) =>
      new Date(Date.parse(base) + offset * 1000).toISOString();

    it('counts RISE–FLAT–FALL as one reversal (flat does not conceal trend change)', () => {
      const rpmPoints = [
        { recordedAtIso: secs('2026-01-01T10:00:01.000Z', 0), valueRpm: 800 },
        { recordedAtIso: secs('2026-01-01T10:00:01.000Z', 1), valueRpm: 950 },
        { recordedAtIso: secs('2026-01-01T10:00:01.000Z', 2), valueRpm: 950 },
        { recordedAtIso: secs('2026-01-01T10:00:01.000Z', 3), valueRpm: 850 },
      ];
      const out = computeDs4RpmDynamicsResearchV1(buildBoundDynamicsInput({ rpmPoints }));
      expect(out.observedDynamics.observedDirectionReversalCount).toBe(1);
    });

    it('counts FALL–FLAT–RISE as one reversal', () => {
      const rpmPoints = [
        { recordedAtIso: secs('2026-01-01T10:00:01.000Z', 0), valueRpm: 1200 },
        { recordedAtIso: secs('2026-01-01T10:00:01.000Z', 1), valueRpm: 1000 },
        { recordedAtIso: secs('2026-01-01T10:00:01.000Z', 2), valueRpm: 1000 },
        { recordedAtIso: secs('2026-01-01T10:00:01.000Z', 3), valueRpm: 1150 },
      ];
      const out = computeDs4RpmDynamicsResearchV1(buildBoundDynamicsInput({ rpmPoints }));
      expect(out.observedDynamics.observedDirectionReversalCount).toBe(1);
    });

    it('does not count RISE–FLAT–RISE as a reversal', () => {
      const rpmPoints = [
        { recordedAtIso: secs('2026-01-01T10:00:01.000Z', 0), valueRpm: 800 },
        { recordedAtIso: secs('2026-01-01T10:00:01.000Z', 1), valueRpm: 950 },
        { recordedAtIso: secs('2026-01-01T10:00:01.000Z', 2), valueRpm: 950 },
        { recordedAtIso: secs('2026-01-01T10:00:01.000Z', 3), valueRpm: 1100 },
      ];
      const out = computeDs4RpmDynamicsResearchV1(buildBoundDynamicsInput({ rpmPoints }));
      expect(out.observedDynamics.observedDirectionReversalCount).toBe(0);
    });

    it('all-FLAT trajectory yields zero reversals', () => {
      const rpmPoints = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 5, 1).map((p) => ({
        ...p,
        valueRpm: 900,
      }));
      const out = computeDs4RpmDynamicsResearchV1(buildBoundDynamicsInput({ rpmPoints }));
      expect(out.observedDynamics.observedDirectionReversalCount).toBe(0);
    });

    it('does not count reversals across sequence breaks', () => {
      const rpmPoints = [
        { recordedAtIso: '2026-01-01T10:00:00.000Z', valueRpm: 800 },
        { recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: 950 },
        { recordedAtIso: '2026-01-01T10:00:05.000Z', valueRpm: 900 },
        { recordedAtIso: '2026-01-01T10:00:06.000Z', valueRpm: 750 },
      ];
      const out = computeDs4RpmDynamicsResearchV1(buildBoundDynamicsInput({ rpmPoints }));
      expect(out.denominators.continuousSequenceCount).toBe(2);
      expect(out.observedDynamics.observedDirectionReversalCount).toBe(0);
    });
  });

  it('A1 canon parity: shared canonicalizer matches episode kernel denominators', () => {
    const rpmPoints = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 7, 1);
    const shared = canonicalizeDs4RpmResearchPoints(rpmPoints);
    const a1 = computeDs4RpmEpisodeResearchV1(buildBoundResearchInput({ rpmPoints }));
    expect(shared.points.length).toBe(a1.denominators.observedUniqueLabelCount);
    expect(shared.identicalDuplicateCollapsedCount).toBe(a1.denominators.identicalDuplicateCollapsedCount);
    expect(shared.conflictingDuplicateLabelCount).toBe(a1.denominators.conflictingDuplicateLabelCount);
  });
});
