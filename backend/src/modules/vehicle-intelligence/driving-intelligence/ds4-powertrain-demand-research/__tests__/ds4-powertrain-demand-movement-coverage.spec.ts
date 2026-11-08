import {
  computeMovementScopedCoverageEvidence,
  resolveKickdownCandidateSupportTier,
} from '../ds4-powertrain-demand-movement-coverage.v1';
import { canonicalizeMultichannelObservations } from '../ds4-powertrain-demand-multichannel-canonicalize.v1';
import { computeDs4PowertrainDemandResearchV1 } from '../ds4-powertrain-demand-research.kernel.v1';
import {
  buildBoundPowertrainInput,
  buildObservationSeries,
  positiveKickdownGrid,
} from './ds4-powertrain-demand-research.test-helpers';

function gridWithStationaryPrefix(): ReturnType<typeof buildObservationSeries> {
  return buildObservationSeries('2026-01-01T10:00:01.000Z', 20, 1, (i) => {
    if (i < 8) {
      return { speedKmh: 0, throttlePct: 10, rpm: 850, loadPct: 12 };
    }
    const j = i - 8;
    if (j === 0) return { throttlePct: 25, rpm: 2000, speedKmh: 55, loadPct: 45 };
    if (j === 1) return { throttlePct: 55, rpm: 2600, speedKmh: 62, loadPct: 60 };
    if (j === 2) return { throttlePct: 92, rpm: 3200, speedKmh: 70, loadPct: 78 };
    return { throttlePct: 40, rpm: 2400, speedKmh: 72, loadPct: 50 };
  });
}

describe('movement-scoped coverage admission', () => {
  it('A/B: stationary buckets do not penalize moving completeness', () => {
    const grid = gridWithStationaryPrefix();
    const canon = canonicalizeMultichannelObservations(grid);
    const ev = computeMovementScopedCoverageEvidence(canon.buckets);
    expect(ev.observedStationaryBucketCount).toBe(8);
    expect(ev.observedMovingBucketCount).toBe(12);
    expect(ev.movementObservedCompleteness).toBe(1);
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid }),
    );
    expect(out.status).toBe('COMPUTED');
  });

  it('C: missing RPM on a moving bucket reduces movement completeness', () => {
    const grid = positiveKickdownGrid().map((r, i) =>
      i === 3 ? { ...r, rpm: null } : r,
    );
    const ev = computeMovementScopedCoverageEvidence(
      canonicalizeMultichannelObservations(grid).buckets,
    );
    expect(ev.observedMovingBucketCount).toBe(12);
    expect(ev.movementObservedCompleteness).toBeCloseTo(11 / 12, 5);
    const grid2 = positiveKickdownGrid().map((r, i) =>
      i >= 3 && i <= 6 ? { ...r, loadPct: null } : r,
    );
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid2 }),
    );
    expect(out.abstainReasons).toContain('CHANNEL_COVERAGE_BELOW_MINIMUM');
  });

  it('D: null speed is unknown, not stationary', () => {
    const grid = positiveKickdownGrid().map((r, i) =>
      i === 1 ? { ...r, speedKmh: null } : r,
    );
    const ev = computeMovementScopedCoverageEvidence(
      canonicalizeMultichannelObservations(grid).buckets,
    );
    expect(ev.unknownSpeedBucketCount).toBe(1);
    expect(ev.observedStationaryBucketCount).toBe(0);
  });

  it('E: low wall-clock RPM coverage may still compute with local moving evidence', () => {
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: positiveKickdownGrid() }),
    );
    expect(out.kickdown.coverageEvidence.rpmTripCoverage).toBeLessThan(0.1);
    expect(out.status).toBe('COMPUTED');
    expect(out.unsupportedScientificClaims).toContain('LOCAL_COVERAGE_NOT_FULL_TRIP_REPRESENTATIVE');
  });

  it('G: support tier is monotonic in movement completeness', () => {
    const tiers = [0.65, 0.75, 0.86].map((c) =>
      resolveKickdownCandidateSupportTier({
        classification: 'KICKDOWN_LIKE_PROXY_CANDIDATE',
        movementObservedCompleteness: c,
        r1Historical: false,
      }),
    );
    expect(tiers).toEqual(['WEAK', 'MODERATE', 'STRONG']);
  });

  it('H: zero moving evidence abstains', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, () => ({
      speedKmh: 0,
      throttlePct: 30,
      rpm: 900,
      loadPct: 20,
    }));
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid }),
    );
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('NO_MOVING_OPPORTUNITY_EVIDENCE');
  });
});
