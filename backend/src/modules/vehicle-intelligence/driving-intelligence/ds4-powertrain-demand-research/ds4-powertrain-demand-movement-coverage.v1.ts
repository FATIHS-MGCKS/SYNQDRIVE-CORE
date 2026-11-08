import type { Ds4CanonicalMultichannelBucketV1 } from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import type { Ds4KickdownCandidateClassification, Ds4KickdownCandidateSupportTier } from './ds4-powertrain-demand-research.contract.v1';

export const DS4_POWERTRAIN_MOVEMENT_COVERAGE_SCOPE = 'OBSERVED_MOVING_BUCKETS_ONLY' as const;

export const DS4_POWERTRAIN_MOVING_CHANNEL_COVERAGE_MIN = 0.7 as const;
export const DS4_POWERTRAIN_MOVING_OBSERVATION_MIN = 8 as const;

export type Ds4MovementBucketDispositionV1 = 'OBSERVED_MOVING' | 'OBSERVED_STATIONARY' | 'UNKNOWN_SPEED';

export function classifyMovementBucket(speedKmh: number | null): Ds4MovementBucketDispositionV1 {
  if (speedKmh == null) return 'UNKNOWN_SPEED';
  if (speedKmh === 0) return 'OBSERVED_STATIONARY';
  return 'OBSERVED_MOVING';
}

function bucketHasRequiredChannels(b: Ds4CanonicalMultichannelBucketV1): boolean {
  return (
    b.throttlePct != null &&
    b.speedKmh != null &&
    b.rpm != null &&
    b.loadPct != null
  );
}

/** Full-grid diagnostic — not used for movement-scoped admission. */
export function multichannelObservedGridCoverage(
  buckets: readonly Ds4CanonicalMultichannelBucketV1[],
): number {
  if (buckets.length === 0) return 0;
  let complete = 0;
  for (const b of buckets) {
    if (bucketHasRequiredChannels(b)) complete += 1;
  }
  return complete / buckets.length;
}

export type Ds4MovementScopedCoverageEvidenceV1 = {
  localCoverageScope: typeof DS4_POWERTRAIN_MOVEMENT_COVERAGE_SCOPE;
  fullTripMovementCoverageVerdict: 'UNKNOWN';
  multichannelObservedGridCoverage: number;
  movementObservedCompleteness: number;
  observedMovingBucketCount: number;
  observedStationaryBucketCount: number;
  unknownSpeedBucketCount: number;
  eligibleMovingObservationCount: number;
};

export function computeMovementScopedCoverageEvidence(
  buckets: readonly Ds4CanonicalMultichannelBucketV1[],
): Ds4MovementScopedCoverageEvidenceV1 {
  let observedMovingBucketCount = 0;
  let observedStationaryBucketCount = 0;
  let unknownSpeedBucketCount = 0;
  let movingRequiredChannelComplete = 0;

  for (const b of buckets) {
    const disposition = classifyMovementBucket(b.speedKmh);
    if (disposition === 'UNKNOWN_SPEED') {
      unknownSpeedBucketCount += 1;
      continue;
    }
    if (disposition === 'OBSERVED_STATIONARY') {
      observedStationaryBucketCount += 1;
      continue;
    }
    observedMovingBucketCount += 1;
    if (bucketHasRequiredChannels(b)) {
      movingRequiredChannelComplete += 1;
    }
  }

  const movementObservedCompleteness =
    observedMovingBucketCount > 0 ? movingRequiredChannelComplete / observedMovingBucketCount : 0;

  return {
    localCoverageScope: DS4_POWERTRAIN_MOVEMENT_COVERAGE_SCOPE,
    fullTripMovementCoverageVerdict: 'UNKNOWN',
    multichannelObservedGridCoverage: multichannelObservedGridCoverage(buckets),
    movementObservedCompleteness,
    observedMovingBucketCount,
    observedStationaryBucketCount,
    unknownSpeedBucketCount,
    eligibleMovingObservationCount: movingRequiredChannelComplete,
  };
}

export function resolveKickdownCandidateSupportTier(input: {
  classification: Ds4KickdownCandidateClassification;
  movementObservedCompleteness: number;
  r1Historical: boolean;
}): Ds4KickdownCandidateSupportTier {
  if (input.classification !== 'KICKDOWN_LIKE_PROXY_CANDIDATE') return 'WEAK';
  if (input.r1Historical) {
    return input.movementObservedCompleteness >= 0.85 ? 'MODERATE' : 'WEAK';
  }
  if (input.movementObservedCompleteness >= 0.85) return 'STRONG';
  if (input.movementObservedCompleteness >= 0.7) return 'MODERATE';
  return 'WEAK';
}
