import type { FsdHistoricalWindowV1 } from './fsd-query-document.builder.v1';
import type { FsdHistoricalFrequencyClassV1, FsdValueObservationKindV1 } from './fsd-evidence.contract.v1';

/**
 * FSD coverage observation window: half-open interval [fromUtc, toUtc) in epoch milliseconds.
 * Bucket denominator still uses ceil((toMs - fromMs) / 1000) for aggregated 1 Hz grid sizing.
 *
 * DIMO provider query boundaries may use inclusive/exclusive rules that differ; this module
 * applies the half-open contract above only to coverage math and bucket slot assignment —
 * not to GraphQL document construction (see fsd-query-document.builder.v1.ts).
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
  return timestampMs >= fromMs && timestampMs < toMs;
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

function observationKindPriority(kind: FsdValueObservationKindV1): number {
  if (kind === 'VALID_NONZERO' || kind === 'VALID_ZERO') {
    return 3;
  }
  if (kind === 'NULL') {
    return 2;
  }
  if (kind === 'MISSING') {
    return 1;
  }
  return 0;
}

/** Order-independent dominant observation for a single 1 Hz bucket slot. */
export function pickDominantBucketObservation(
  observations: readonly FsdBucketObservationV1[],
): FsdBucketObservationV1 {
  if (observations.length === 0) {
    throw new Error('pickDominantBucketObservation requires at least one observation');
  }
  return observations.reduce((best, obs) => {
    const bestKind = classifyNumericObservation(best.numericValue);
    const obsKind = classifyNumericObservation(obs.numericValue);
    const bestPriority = observationKindPriority(bestKind);
    const obsPriority = observationKindPriority(obsKind);
    if (obsPriority > bestPriority) {
      return obs;
    }
    if (obsPriority < bestPriority) {
      return best;
    }
    return obs.timestampMs < best.timestampMs ? obs : best;
  });
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
  /** Additional in-window observations landing in an already-seen 1 Hz bucket (distinct timestampMs). */
  collidingBucketObservationsIgnored: number;
  outOfWindowObservations: number;
};

export function summarizeSignalBucketObservations(input: {
  window: FsdHistoricalWindowV1;
  observations: readonly FsdBucketObservationV1[];
  /** When >1, returned rows may exist without implying per-signal valid values (co-selection). */
  coSelectedFieldCount?: number;
}): FsdCoverageSummaryV1 {
  const expectedBucketPositions = computeExpectedBucketPositions(input.window);
  const seenExactTimestamps = new Set<number>();
  const bucketObservations = new Map<number, FsdBucketObservationV1[]>();
  let duplicateTimestampsIgnored = 0;
  let collidingBucketObservationsIgnored = 0;
  let outOfWindowObservations = 0;

  for (const obs of input.observations) {
    if (!isTimestampWithinHistoricalWindow(input.window, obs.timestampMs)) {
      outOfWindowObservations += 1;
      continue;
    }
    const bucketSlot = mapTimestampToBucketSlot(input.window, obs.timestampMs);
    if (bucketSlot === null || bucketSlot >= expectedBucketPositions) {
      outOfWindowObservations += 1;
      continue;
    }
    if (seenExactTimestamps.has(obs.timestampMs)) {
      duplicateTimestampsIgnored += 1;
      continue;
    }
    seenExactTimestamps.add(obs.timestampMs);

    const existing = bucketObservations.get(bucketSlot);
    if (existing) {
      collidingBucketObservationsIgnored += 1;
      existing.push(obs);
    } else {
      bucketObservations.set(bucketSlot, [obs]);
    }
  }

  let validValueBucketCount = 0;
  let nullBucketCount = 0;
  let missingBucketCount = 0;
  let zeroValueBucketCount = 0;
  let firstValidTimestampMs: number | null = null;
  let lastValidTimestampMs: number | null = null;

  for (const observations of bucketObservations.values()) {
    const dominant = pickDominantBucketObservation(observations);
    const kind = classifyNumericObservation(dominant.numericValue);
    if (kind === 'VALID_NONZERO' || kind === 'VALID_ZERO') {
      validValueBucketCount += 1;
      if (kind === 'VALID_ZERO') {
        zeroValueBucketCount += 1;
      }
      const validTimestamps = observations
        .filter((o) => isValidValueBucket(classifyNumericObservation(o.numericValue)))
        .map((o) => o.timestampMs);
      const bucketFirstValid = Math.min(...validTimestamps);
      const bucketLastValid = Math.max(...validTimestamps);
      if (firstValidTimestampMs === null || bucketFirstValid < firstValidTimestampMs) {
        firstValidTimestampMs = bucketFirstValid;
      }
      if (lastValidTimestampMs === null || bucketLastValid > lastValidTimestampMs) {
        lastValidTimestampMs = bucketLastValid;
      }
    } else if (kind === 'NULL') {
      nullBucketCount += 1;
    } else if (kind === 'MISSING') {
      missingBucketCount += 1;
    }
  }

  const returnedBucketCount = bucketObservations.size;
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
    collidingBucketObservationsIgnored,
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
