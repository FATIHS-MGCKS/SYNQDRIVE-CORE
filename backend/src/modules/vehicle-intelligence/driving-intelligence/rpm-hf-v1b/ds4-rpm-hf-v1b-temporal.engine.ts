import {
  collectIntraTripIntervalsSeconds,
  medianSeconds,
  percentileSeconds,
} from '../../vehicle-signal-intelligence/vsi-profile-cadence-stats.util';
import {
  DS4_RPM_HF_V1B_CONTINUOUS_SEQUENCE_MAX_GAP_SECONDS,
  type Ds4RpmHfV1bIntervalStats,
  type Ds4RpmHfV1bRpmValueStats,
  type Ds4RpmHfV1bSequenceStats,
  type Ds4RpmHfV1bTemporalCoverage,
  type Ds4RpmHfV1bTemporalEngineInput,
  type Ds4RpmHfV1bTemporalTripWindow,
} from './ds4-rpm-hf-v1b.contract';

const GAP_OVER_2S_THRESHOLD = 2;

export type Ds4RpmHfV1bTemporalCadenceProfile = {
  nominalCadenceSeconds: 1 | 2 | 3;
  bucketWidthSeconds: number;
  sequenceMaxGapSeconds: number;
  interPointGapReportThresholdSeconds: number;
};

export const DS4_RPM_HF_V1B_TEMPORAL_PROFILE_1S: Ds4RpmHfV1bTemporalCadenceProfile = {
  nominalCadenceSeconds: 1,
  bucketWidthSeconds: 1,
  sequenceMaxGapSeconds: DS4_RPM_HF_V1B_CONTINUOUS_SEQUENCE_MAX_GAP_SECONDS,
  interPointGapReportThresholdSeconds: GAP_OVER_2S_THRESHOLD,
};

export const DS4_RPM_HF_V1B_TEMPORAL_PROFILE_2S: Ds4RpmHfV1bTemporalCadenceProfile = {
  nominalCadenceSeconds: 2,
  bucketWidthSeconds: 2,
  sequenceMaxGapSeconds: 3,
  interPointGapReportThresholdSeconds: 3,
};

export const DS4_RPM_HF_V1B_TEMPORAL_PROFILE_3S: Ds4RpmHfV1bTemporalCadenceProfile = {
  nominalCadenceSeconds: 3,
  bucketWidthSeconds: 3,
  sequenceMaxGapSeconds: 4,
  interPointGapReportThresholdSeconds: 4,
};

export function resolveTemporalCadenceProfileForTier(
  tier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S',
): Ds4RpmHfV1bTemporalCadenceProfile {
  switch (tier) {
    case 'RPM_2S':
      return DS4_RPM_HF_V1B_TEMPORAL_PROFILE_2S;
    case 'RPM_3S':
      return DS4_RPM_HF_V1B_TEMPORAL_PROFILE_3S;
    default:
      return DS4_RPM_HF_V1B_TEMPORAL_PROFILE_1S;
  }
}

export type Ds4RpmHfV1bTemporalAnalysis = {
  tripWindow: Ds4RpmHfV1bTemporalTripWindow;
  rpmValues: Ds4RpmHfV1bRpmValueStats;
  coverage: Ds4RpmHfV1bTemporalCoverage;
  intervals: Ds4RpmHfV1bIntervalStats;
  sequences: Ds4RpmHfV1bSequenceStats;
};

/**
 * Deterministic temporal quality analysis bound to canonical trip boundaries.
 * Bucket indices use UTC epoch seconds: floor(ms/1000).
 */
export function computeDs4RpmHfV1bTemporalAnalysis(
  input: Ds4RpmHfV1bTemporalEngineInput,
  cadenceProfile: Ds4RpmHfV1bTemporalCadenceProfile = DS4_RPM_HF_V1B_TEMPORAL_PROFILE_1S,
): Ds4RpmHfV1bTemporalAnalysis {
  const tripStartMs = Date.parse(input.tripStartIso);
  const tripEndMs = Date.parse(input.tripEndIso);
  if (!Number.isFinite(tripStartMs) || !Number.isFinite(tripEndMs) || tripEndMs < tripStartMs) {
    return emptyAnalysis(input, tripStartMs, tripEndMs, cadenceProfile);
  }

  const sorted = [...input.points]
    .map((p) => ({ ...p, recordedAtMs: Date.parse(p.recordedAtIso) }))
    .filter((p) => Number.isFinite(p.recordedAtMs))
    .sort((a, b) => a.recordedAtMs - b.recordedAtMs);

  const bucketWidthMs = cadenceProfile.bucketWidthSeconds * 1000;
  const tripStartBucket = Math.floor(tripStartMs / bucketWidthMs);
  const tripEndBucket = Math.floor(tripEndMs / bucketWidthMs);
  const eligibleBuckets = Math.max(0, tripEndBucket - tripStartBucket + 1);

  const inWindow = sorted.filter((p) => p.recordedAtMs >= tripStartMs && p.recordedAtMs <= tripEndMs);
  const observedBucketSet = new Set<number>();
  for (const p of inWindow) {
    observedBucketSet.add(Math.floor(p.recordedAtMs / bucketWidthMs));
  }

  const rpmValues = inWindow.map((p) => p.valueRpm).filter((v) => Number.isFinite(v));
  const rpmSorted = [...rpmValues].sort((a, b) => a - b);

  const firstPoint = inWindow[0];
  const lastPoint = inWindow[inWindow.length - 1];

  const tripDurationSeconds = (tripEndMs - tripStartMs) / 1000;
  const firstRpmOffsetSeconds = firstPoint
    ? Math.max(0, (firstPoint.recordedAtMs - tripStartMs) / 1000)
    : null;
  const lastRpmToTripEndSeconds = lastPoint
    ? Math.max(0, (tripEndMs - lastPoint.recordedAtMs) / 1000)
    : null;

  const leadingMissingSeconds = computeLeadingMissingSeconds(
    tripStartBucket,
    tripEndBucket,
    observedBucketSet,
  );
  const trailingMissingSeconds = computeTrailingMissingSeconds(
    tripStartBucket,
    tripEndBucket,
    observedBucketSet,
  );
  const internalMissingBucketCount = computeInternalMissingBucketCount(
    tripStartBucket,
    tripEndBucket,
    observedBucketSet,
  );
  const missingBucketCount = Math.max(0, eligibleBuckets - observedBucketSet.size);
  const observedBucketCoverageRatio =
    eligibleBuckets > 0 ? observedBucketSet.size / eligibleBuckets : null;

  const cadencePoints = inWindow.map((p) => ({ recordedAtMs: p.recordedAtMs, value: p.valueRpm }));
  const intervals = collectIntraTripIntervalsSeconds(cadencePoints, [
    { startMs: tripStartMs, endMs: tripEndMs },
  ]);
  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const gapCountOverThreshold = intervals.filter(
    (i) => i > cadenceProfile.interPointGapReportThresholdSeconds,
  ).length;
  const longestObservedGapSeconds = sortedIntervals.length > 0 ? sortedIntervals[sortedIntervals.length - 1]! : null;

  const sequences = computeContinuousSequences(inWindow, cadenceProfile.sequenceMaxGapSeconds);

  return {
    tripWindow: {
      tripStartIso: input.tripStartIso,
      tripEndIso: input.tripEndIso,
      tripDurationSeconds,
      firstRpmOffsetSeconds,
      lastRpmToTripEndSeconds,
    },
    rpmValues: {
      validPointCount: inWindow.length,
      invalidValueCount: input.invalidValueCount,
      duplicateTimestampCount: input.duplicateTimestampCount,
      rpmMin: rpmSorted.length > 0 ? rpmSorted[0]! : null,
      rpmMax: rpmSorted.length > 0 ? rpmSorted[rpmSorted.length - 1]! : null,
      rpmMedian: medianSeconds(rpmSorted),
    },
    coverage: {
      eligibleOneSecondBuckets: eligibleBuckets,
      observedUniqueOneSecondBuckets: observedBucketSet.size,
      observedBucketCoverageRatio,
      missingBucketCount,
      leadingMissingSeconds,
      trailingMissingSeconds,
      internalMissingBucketCount,
      bucketSemanticsNote: 'DIMO_1S_AVG_BUCKETS_NOT_OEM_CAN_HZ',
      gapInterpretationPolicy: 'MISSING_DATA_NOT_ENGINE_OFF',
    },
    intervals: {
      medianIntervalSeconds: medianSeconds(intervals),
      p95IntervalSeconds: percentileSeconds(sortedIntervals, 95),
      maxIntervalSeconds: longestObservedGapSeconds,
      gapCountOver2Seconds: gapCountOverThreshold,
      longestObservedGapSeconds,
    },
    sequences,
  };
}

function computeLeadingMissingSeconds(
  tripStartBucket: number,
  tripEndBucket: number,
  observed: Set<number>,
): number {
  if (tripEndBucket < tripStartBucket || observed.size === 0) {
    return Math.max(0, tripEndBucket - tripStartBucket + 1);
  }
  let count = 0;
  for (let b = tripStartBucket; b <= tripEndBucket; b += 1) {
    if (observed.has(b)) break;
    count += 1;
  }
  return count;
}

function computeTrailingMissingSeconds(
  tripStartBucket: number,
  tripEndBucket: number,
  observed: Set<number>,
): number {
  if (tripEndBucket < tripStartBucket || observed.size === 0) {
    return Math.max(0, tripEndBucket - tripStartBucket + 1);
  }
  let count = 0;
  for (let b = tripEndBucket; b >= tripStartBucket; b -= 1) {
    if (observed.has(b)) break;
    count += 1;
  }
  return count;
}

function computeInternalMissingBucketCount(
  tripStartBucket: number,
  tripEndBucket: number,
  observed: Set<number>,
): number {
  if (observed.size === 0) return 0;
  let firstObs = tripEndBucket;
  let lastObs = tripStartBucket;
  for (const b of observed) {
    if (b < firstObs) firstObs = b;
    if (b > lastObs) lastObs = b;
  }
  let internalMissing = 0;
  for (let b = firstObs; b <= lastObs; b += 1) {
    if (!observed.has(b)) internalMissing += 1;
  }
  return internalMissing;
}

/**
 * Continuous sequence: maximal chain of points where each adjacent interval
 * is <= DS4_RPM_HF_V1B_CONTINUOUS_SEQUENCE_MAX_GAP_SECONDS.
 * Duration = (lastPointTime - firstPointTime) / 1000 — missing seconds are not counted.
 */
function computeContinuousSequences(
  points: ReadonlyArray<{ recordedAtMs: number }>,
  sequenceMaxGapSeconds: number,
): Ds4RpmHfV1bSequenceStats {
  if (points.length === 0) {
    return {
      continuousSequenceCount: 0,
      longestContinuousSequenceSeconds: null,
      observedSequenceDurationSeconds: null,
      sequenceGapRuleSeconds: sequenceMaxGapSeconds,
    };
  }

  let sequenceCount = 1;
  let longest = 0;
  let totalContinuousObservedSeconds = 0;
  let seqStart = points[0]!.recordedAtMs;
  let seqPrev = points[0]!.recordedAtMs;

  const closeSequence = (): void => {
    const spanSec = (seqPrev - seqStart) / 1000;
    longest = Math.max(longest, spanSec);
    totalContinuousObservedSeconds += spanSec;
  };

  for (let i = 1; i < points.length; i += 1) {
    const curr = points[i]!.recordedAtMs;
    const gapSec = (curr - seqPrev) / 1000;
    if (gapSec > sequenceMaxGapSeconds) {
      closeSequence();
      sequenceCount += 1;
      seqStart = curr;
    }
    seqPrev = curr;
  }
  closeSequence();

  return {
    continuousSequenceCount: sequenceCount,
    longestContinuousSequenceSeconds: points.length >= 2 ? longest : 0,
    observedSequenceDurationSeconds: points.length >= 1 ? totalContinuousObservedSeconds : null,
    sequenceGapRuleSeconds: sequenceMaxGapSeconds,
  };
}

function emptyAnalysis(
  input: Ds4RpmHfV1bTemporalEngineInput,
  tripStartMs: number,
  tripEndMs: number,
  cadenceProfile: Ds4RpmHfV1bTemporalCadenceProfile,
): Ds4RpmHfV1bTemporalAnalysis {
  const tripDurationSeconds =
    Number.isFinite(tripStartMs) && Number.isFinite(tripEndMs) && tripEndMs >= tripStartMs
      ? (tripEndMs - tripStartMs) / 1000
      : 0;
  return {
    tripWindow: {
      tripStartIso: input.tripStartIso,
      tripEndIso: input.tripEndIso,
      tripDurationSeconds,
      firstRpmOffsetSeconds: null,
      lastRpmToTripEndSeconds: null,
    },
    rpmValues: {
      validPointCount: 0,
      invalidValueCount: input.invalidValueCount,
      duplicateTimestampCount: input.duplicateTimestampCount,
      rpmMin: null,
      rpmMax: null,
      rpmMedian: null,
    },
    coverage: {
      eligibleOneSecondBuckets: 0,
      observedUniqueOneSecondBuckets: 0,
      observedBucketCoverageRatio: null,
      missingBucketCount: 0,
      leadingMissingSeconds: 0,
      trailingMissingSeconds: 0,
      internalMissingBucketCount: 0,
      bucketSemanticsNote: 'DIMO_1S_AVG_BUCKETS_NOT_OEM_CAN_HZ',
      gapInterpretationPolicy: 'MISSING_DATA_NOT_ENGINE_OFF',
    },
    intervals: {
      medianIntervalSeconds: null,
      p95IntervalSeconds: null,
      maxIntervalSeconds: null,
      gapCountOver2Seconds: 0,
      longestObservedGapSeconds: null,
    },
    sequences: {
      continuousSequenceCount: 0,
      longestContinuousSequenceSeconds: null,
      observedSequenceDurationSeconds: null,
      sequenceGapRuleSeconds: cadenceProfile.sequenceMaxGapSeconds,
    },
  };
}
