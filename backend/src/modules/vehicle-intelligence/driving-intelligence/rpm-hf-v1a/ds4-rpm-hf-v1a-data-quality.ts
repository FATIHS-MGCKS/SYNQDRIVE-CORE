import type { HfTripRpmPointRow, HfTripRpmPointsReadResult } from '@modules/clickhouse/clickhouse-hf.types';
import {
  collectIntraTripIntervalsSeconds,
  medianSeconds,
  percentileSeconds,
} from '../../vehicle-signal-intelligence/vsi-profile-cadence-stats.util';
import type {
  Ds4RpmHfV1aCompletenessLabel,
  Ds4RpmHfV1aDataQualityV1,
  Ds4RpmHfV1aGapDescriptor,
} from './ds4-rpm-hf-v1a.contract';

const GAP_MIN_SECONDS = 3;

export function buildDs4RpmHfV1aDataQuality(input: {
  read: HfTripRpmPointsReadResult | null;
  points: HfTripRpmPointRow[];
}): Ds4RpmHfV1aDataQualityV1 {
  const read = input.read;
  const points = [...input.points].sort((a, b) => a.recordedAtMs - b.recordedAtMs);

  const completenessLabel: Ds4RpmHfV1aCompletenessLabel = !read
    ? 'NOT_READ'
    : read.completenessStatus === 'EMPTY'
      ? 'EMPTY'
      : read.completenessStatus;

  if (points.length === 0) {
    return {
      contractVersion: 'ds4-rpm-hf-data-quality-v1',
      validPointCount: 0,
      invalidValueCount: read?.invalidValueCount ?? 0,
      duplicateTimestampCount: read?.duplicateTimestampCount ?? 0,
      earliestRecordedAtIso: null,
      latestRecordedAtIso: null,
      observedIntervals: emptyIntervalStats(),
      identifiedGaps: [],
      completenessLabel,
      totalMatchingCount: read?.totalMatchingCount ?? null,
      returnedPointCount: 0,
      readLimit: read?.limit ?? 0,
      readOffset: read?.offset ?? 0,
      bucketSemanticsNote: 'DIMO_1S_AVG_BUCKETS_NOT_OEM_CAN_HZ',
      gapInterpretationPolicy: 'MISSING_POINTS_NOT_ENGINE_STOP',
    };
  }

  const cadencePoints = points.map((p) => ({
    recordedAtMs: p.recordedAtMs,
    value: p.valueRpm,
  }));
  const intervals = collectIntraTripIntervalsSeconds(cadencePoints, [
    {
      startMs: points[0]!.recordedAtMs,
      endMs: points[points.length - 1]!.recordedAtMs,
    },
  ]);
  const sortedIntervals = [...intervals].sort((a, b) => a - b);

  const identifiedGaps = describeGaps(points);

  return {
    contractVersion: 'ds4-rpm-hf-data-quality-v1',
    validPointCount: points.length,
    invalidValueCount: read?.invalidValueCount ?? 0,
    duplicateTimestampCount: read?.duplicateTimestampCount ?? 0,
    earliestRecordedAtIso: points[0]!.recordedAtIso,
    latestRecordedAtIso: points[points.length - 1]!.recordedAtIso,
    observedIntervals: {
      intervalCount: intervals.length,
      intervalMedianSeconds: medianSeconds(intervals),
      intervalP95Seconds: percentileSeconds(sortedIntervals, 95),
      minIntervalSeconds: sortedIntervals.length > 0 ? sortedIntervals[0]! : null,
      maxIntervalSeconds:
        sortedIntervals.length > 0 ? sortedIntervals[sortedIntervals.length - 1]! : null,
    },
    identifiedGaps,
    completenessLabel,
    totalMatchingCount: read?.totalMatchingCount ?? points.length,
    returnedPointCount: points.length,
    readLimit: read?.limit ?? points.length,
    readOffset: read?.offset ?? 0,
    bucketSemanticsNote: 'DIMO_1S_AVG_BUCKETS_NOT_OEM_CAN_HZ',
    gapInterpretationPolicy: 'MISSING_POINTS_NOT_ENGINE_STOP',
  };
}

function emptyIntervalStats(): Ds4RpmHfV1aDataQualityV1['observedIntervals'] {
  return {
    intervalCount: 0,
    intervalMedianSeconds: null,
    intervalP95Seconds: null,
    minIntervalSeconds: null,
    maxIntervalSeconds: null,
  };
}

function describeGaps(points: HfTripRpmPointRow[]): Ds4RpmHfV1aGapDescriptor[] {
  const gaps: Ds4RpmHfV1aGapDescriptor[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const gapSeconds = (curr.recordedAtMs - prev.recordedAtMs) / 1000;
    if (gapSeconds >= GAP_MIN_SECONDS) {
      gaps.push({
        fromRecordedAtIso: prev.recordedAtIso,
        toRecordedAtIso: curr.recordedAtIso,
        gapDurationSeconds: gapSeconds,
        interpretationPolicy: 'MISSING_DATA_ONLY',
      });
    }
  }
  return gaps;
}

/** Build synthetic points from interval seconds (tests / fixture replay). */
export function buildSyntheticRpmPointsFromIntervals(input: {
  tripStartMs: number;
  intervalsSec: number[];
  rpmValue?: number;
}): HfTripRpmPointRow[] {
  const rpm = input.rpmValue ?? 1500;
  const points: HfTripRpmPointRow[] = [];
  let t = input.tripStartMs;
  points.push(makeSyntheticPoint(t, rpm));
  for (const sec of input.intervalsSec) {
    t += sec * 1000;
    points.push(makeSyntheticPoint(t, rpm));
  }
  return points;
}

function makeSyntheticPoint(recordedAtMs: number, valueRpm: number): HfTripRpmPointRow {
  const iso = new Date(recordedAtMs).toISOString();
  return {
    recordedAtMs,
    recordedAtIso: iso,
    valueRpm,
    unit: 'rpm',
    quality: 'normalized',
    orgId: 'org-fixture',
    vehicleId: 'vehicle-fixture',
    tripId: 'trip-fixture',
    tokenId: null,
  };
}
