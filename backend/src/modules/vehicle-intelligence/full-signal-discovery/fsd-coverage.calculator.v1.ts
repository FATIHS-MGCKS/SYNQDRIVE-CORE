import type { FsdHistoricalWindowV1 } from './fsd-query-document.builder.v1';
import type { FsdHistoricalFrequencyClassV1, FsdValueObservationKindV1 } from './fsd-evidence.contract.v1';

/**
 * Historical window denominator: ceil((toMs - fromMs) / 1000).
 * Uses integer millisecond timestamps parsed from ISO strings — no floating drift on boundaries.
 */
export function parseUtcIsoToEpochMs(iso: string): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    throw new Error(`Invalid ISO timestamp: ${iso}`);
  }
  return ms;
}

export function computeHistoricalWindowSecondsFromIso(window: FsdHistoricalWindowV1): number {
  const fromMs = parseUtcIsoToEpochMs(window.fromUtc);
  const toMs = parseUtcIsoToEpochMs(window.toUtc);
  const durationMs = toMs - fromMs;
  if (durationMs < 0) {
    return 0;
  }
  return durationMs / 1000;
}

export function computeExpectedBucketPositions(window: FsdHistoricalWindowV1): number {
  const seconds = computeHistoricalWindowSecondsFromIso(window);
  if (seconds <= 0) {
    return 0;
  }
  return Math.ceil(seconds);
}

/**
 * Bucket slot `i` (0-based) covers [fromMs + i*1000, fromMs + (i+1)*1000) in UTC epoch ms.
 * Inclusive window start, exclusive end alignment for partial final seconds via ceil denominator.
 */
export function bucketSlotStartMs(window: FsdHistoricalWindowV1, slotIndex: number): number {
  const fromMs = parseUtcIsoToEpochMs(window.fromUtc);
  return fromMs + slotIndex * 1000;
}

export function isTimestampWithinHistoricalWindow(
  window: FsdHistoricalWindowV1,
  timestampMs: number,
): boolean {
  const fromMs = parseUtcIsoToEpochMs(window.fromUtc);
  const toMs = parseUtcIsoToEpochMs(window.toUtc);
  return timestampMs >= fromMs && timestampMs <= toMs;
}

export function mapTimestampToBucketSlot(
  window: FsdHistoricalWindowV1,
  timestampMs: number,
): number | null {
  if (!isTimestampWithinHistoricalWindow(window, timestampMs)) {
    return null;
  }
  const fromMs = parseUtcIsoToEpochMs(window.fromUtc);
  return Math.floor((timestampMs - fromMs) / 1000);
}

export type FsdBucketObservationV1 = {
  timestampMs: number;
  /** Raw numeric value when present; null means explicit null; undefined means missing field. */
  numericValue?: number | null;
};

export function classifyNumericObservation(
  value: number | null | undefined,
): FsdValueObservationKindV1 {
  if (value === undefined) {
    return 'MISSING';
  }
  if (value === null || Number.isNaN(value)) {
    return 'NULL';
  }
  if (!Number.isFinite(value)) {
    return 'INVALID';
  }
  if (value === 0) {
    return 'VALID_ZERO';
  }
  return 'VALID_NONZERO';
}

export function isValidValueBucket(kind: FsdValueObservationKindV1): boolean {
  return kind === 'VALID_NONZERO' || kind === 'VALID_ZERO';
}

export type FsdCoverageSummaryV1 = {
  expectedBucketPositions: number;
  returnedBucketCount: number;
  validValueBucketCount: number;
  nullBucketCount: number;
  missingBucketCount: number;
  zeroValueBucketCount: number;
  validValueCoverageRatio: number;
  firstValidTimestampMs: number | null;
  lastValidTimestampMs: number | null;
  frequencyClass: FsdHistoricalFrequencyClassV1;
  duplicateTimestampsIgnored: number;
  outOfWindowObservations: number;
};

export function summarizeSignalBucketObservations(input: {
  window: FsdHistoricalWindowV1;
  observations: readonly FsdBucketObservationV1[];
  /** When >1, returned rows may exist without implying per-signal valid values (co-selection). */
  coSelectedFieldCount?: number;
}): FsdCoverageSummaryV1 {
  const expectedBucketPositions = computeExpectedBucketPositions(input.window);
  const seenTimestamps = new Set<number>();
  let duplicateTimestampsIgnored = 0;
  let outOfWindowObservations = 0;
  let validValueBucketCount = 0;
  let nullBucketCount = 0;
  let missingBucketCount = 0;
  let zeroValueBucketCount = 0;
  let firstValidTimestampMs: number | null = null;
  let lastValidTimestampMs: number | null = null;

  for (const obs of input.observations) {
    if (!isTimestampWithinHistoricalWindow(input.window, obs.timestampMs)) {
      outOfWindowObservations += 1;
      continue;
    }
    if (seenTimestamps.has(obs.timestampMs)) {
      duplicateTimestampsIgnored += 1;
      continue;
    }
    seenTimestamps.add(obs.timestampMs);

    const kind = classifyNumericObservation(obs.numericValue);
    if (kind === 'VALID_NONZERO' || kind === 'VALID_ZERO') {
      validValueBucketCount += 1;
      if (kind === 'VALID_ZERO') {
        zeroValueBucketCount += 1;
      }
      if (firstValidTimestampMs === null || obs.timestampMs < firstValidTimestampMs) {
        firstValidTimestampMs = obs.timestampMs;
      }
      if (lastValidTimestampMs === null || obs.timestampMs > lastValidTimestampMs) {
        lastValidTimestampMs = obs.timestampMs;
      }
    } else if (kind === 'NULL') {
      nullBucketCount += 1;
    } else if (kind === 'MISSING') {
      missingBucketCount += 1;
    }
  }

  const returnedBucketCount = seenTimestamps.size;
  const validValueCoverageRatio =
    expectedBucketPositions > 0 ? validValueBucketCount / expectedBucketPositions : 0;

  return {
    expectedBucketPositions,
    returnedBucketCount,
    validValueBucketCount,
    nullBucketCount,
    missingBucketCount,
    zeroValueBucketCount,
    validValueCoverageRatio,
    firstValidTimestampMs,
    lastValidTimestampMs,
    frequencyClass: 'AGGREGATED_1S',
    duplicateTimestampsIgnored,
    outOfWindowObservations,
  };
}

export type FsdMotionCoverageSummaryV1 = {
  movingValidBuckets: number;
  stationaryValidBuckets: number;
  unknownMotionPositions: number;
  movingThresholdKmh: number;
};

/**
 * Motion classification applies only to slots/buckets with a valid speed observation.
 * Unknown-motion positions use the full-window denominator minus classified valid speed buckets.
 */
export function summarizeSpeedMotionCoverage(input: {
  expectedBucketPositions: number;
  movingValidBuckets: number;
  stationaryValidBuckets: number;
  movingThresholdKmh?: number;
}): FsdMotionCoverageSummaryV1 {
  const movingThresholdKmh = input.movingThresholdKmh ?? 0.5;
  const unknownMotionPositions = Math.max(
    0,
    input.expectedBucketPositions - input.movingValidBuckets - input.stationaryValidBuckets,
  );
  return {
    movingValidBuckets: input.movingValidBuckets,
    stationaryValidBuckets: input.stationaryValidBuckets,
    unknownMotionPositions,
    movingThresholdKmh,
  };
}

export function summarizeFromP2eAggregateFixture(input: {
  window: FsdHistoricalWindowV1;
  speedValidBuckets: number;
  speedMovingBuckets: number;
  speedStationaryBuckets: number;
  gpsValidBuckets: number;
}): {
  speedCoverageRatio: number;
  gpsCoverageRatio: number;
  motion: FsdMotionCoverageSummaryV1;
} {
  const expected = computeExpectedBucketPositions(input.window);
  const motion = summarizeSpeedMotionCoverage({
    expectedBucketPositions: expected,
    movingValidBuckets: input.speedMovingBuckets,
    stationaryValidBuckets: input.speedStationaryBuckets,
  });
  return {
    speedCoverageRatio: expected > 0 ? input.speedValidBuckets / expected : 0,
    gpsCoverageRatio: expected > 0 ? input.gpsValidBuckets / expected : 0,
    motion,
  };
}
