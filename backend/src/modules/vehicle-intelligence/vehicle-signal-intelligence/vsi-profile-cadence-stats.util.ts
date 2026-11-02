import { createHash } from 'node:crypto';
import type { VsiSignalConfidenceLevel } from './vsi-profile.types';
import {
  VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
  type VsiCadenceObservedDensityLabel,
  type VsiCadenceRegimeKind,
  type VsiCadenceRegimeV2,
  type VsiIceRpmApplicability,
  type VsiLvCadenceEvidenceInput,
  type VsiRpmCadenceEvidenceInput,
  type VsiRpmCadenceTripWindow,
  type VsiSignalCadenceIntelligenceV2,
} from './vsi-profile-cadence.types';

export const VSI_CADENCE_MIN_INTERVAL_SAMPLES = 3;
export const VSI_CADENCE_MIN_REGIME_SAMPLES = 3;

/**
 * Cadence provenance tags: preserve first-seen order, drop exact duplicates only.
 * Idempotent when the same tag list is processed again.
 */
export function dedupeCadenceProvenanceTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

const POLL_BOUND_MAX_SECONDS = 45 * 60;
const RESTING_HEARTBEAT_MIN_SECONDS = 2 * 3600;
const RESTING_HEARTBEAT_MIN_SAMPLES_FOR_HIGH = 5;
const RESTING_HEARTBEAT_MAX_MEDIAN_P95_RATIO = 1.25;

export function percentileSeconds(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] ?? null;
}

export function medianSeconds(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export function dedupeSortedTimestampsMs(timestampsMs: number[]): number[] {
  const sorted = [...timestampsMs].sort((a, b) => a - b);
  const out: number[] = [];
  for (const ts of sorted) {
    if (out.length === 0 || out[out.length - 1] !== ts) {
      out.push(ts);
    }
  }
  return out;
}

export function intervalsFromTimestampsMs(timestampsMs: number[]): number[] {
  const deduped = dedupeSortedTimestampsMs(timestampsMs);
  const deltas: number[] = [];
  for (let i = 1; i < deduped.length; i += 1) {
    const delta = (deduped[i]! - deduped[i - 1]!) / 1000;
    if (delta > 0) {
      deltas.push(delta);
    }
  }
  return deltas;
}

/** Intra-trip intervals only — never merges timestamps across trip boundaries. */
export function collectIntraTripIntervalsSeconds(
  points: readonly { recordedAtMs: number }[],
  trips: readonly { startMs: number; endMs: number }[],
): number[] {
  const intervals: number[] = [];
  for (const trip of trips) {
    const inTrip = dedupeSortedTimestampsMs(
      points
        .filter(
          (p) => p.recordedAtMs >= trip.startMs && p.recordedAtMs <= trip.endMs,
        )
        .map((p) => p.recordedAtMs),
    );
    intervals.push(...intervalsFromTimestampsMs(inTrip));
  }
  return intervals;
}

export function assignPointsToFirstTrip<T extends { recordedAtMs: number }>(
  points: readonly T[],
  trips: readonly { tripId: string; startMs: number; endMs: number }[],
): T[] {
  const out: T[] = [];
  for (const p of points) {
    for (const trip of trips) {
      if (p.recordedAtMs >= trip.startMs && p.recordedAtMs <= trip.endMs) {
        out.push(p);
        break;
      }
    }
  }
  return out;
}

/**
 * Distinct one-second buckets with observations divided by eligible trip duration.
 * Endpoint-only sparse trips cannot reach 100% coverage.
 */
export function computeDistinctBucketCoverageRatio(
  points: readonly { recordedAtMs: number }[],
  trips: readonly { startMs: number; endMs: number }[],
  bucketSeconds = 1,
): number | null {
  let eligibleSeconds = 0;
  let observedBucketCount = 0;
  for (const trip of trips) {
    const durationSec = Math.max(0, Math.floor((trip.endMs - trip.startMs) / 1000));
    if (durationSec <= 0) {
      continue;
    }
    eligibleSeconds += durationSec;
    const buckets = new Set<number>();
    for (const p of points) {
      if (p.recordedAtMs >= trip.startMs && p.recordedAtMs <= trip.endMs) {
        buckets.add(Math.floor((p.recordedAtMs - trip.startMs) / (bucketSeconds * 1000)));
      }
    }
    observedBucketCount += buckets.size;
  }
  if (eligibleSeconds <= 0) {
    return null;
  }
  return Math.min(1, observedBucketCount / eligibleSeconds);
}

function restingHeartbeatConfidence(intervals: number[]): VsiSignalConfidenceLevel {
  if (intervals.length < VSI_CADENCE_MIN_REGIME_SAMPLES) {
    return 'LOW';
  }
  const med = medianSeconds(intervals);
  const sorted = [...intervals].sort((a, b) => a - b);
  const p95 = percentileSeconds(sorted, 95);
  if (med == null || p95 == null || med <= 0) {
    return 'LOW';
  }
  const ratio = p95 / med;
  if (ratio > RESTING_HEARTBEAT_MAX_MEDIAN_P95_RATIO) {
    return 'LOW';
  }
  if (intervals.length >= RESTING_HEARTBEAT_MIN_SAMPLES_FOR_HIGH && ratio <= 1.15) {
    return 'HIGH';
  }
  return 'MEDIUM';
}

export function detectCadenceRegimes(intervalsSeconds: number[]): VsiCadenceRegimeV2[] {
  if (intervalsSeconds.length < VSI_CADENCE_MIN_REGIME_SAMPLES) {
    return [
      {
        kind: 'INSUFFICIENT_EVIDENCE',
        intervalMedianSeconds: null,
        intervalP95Seconds: null,
        sampleCount: intervalsSeconds.length,
        confidence: 'LOW',
      },
    ];
  }

  const pollBound = intervalsSeconds.filter((s) => s <= POLL_BOUND_MAX_SECONDS);
  const resting = intervalsSeconds.filter((s) => s >= RESTING_HEARTBEAT_MIN_SECONDS);
  const regimes: VsiCadenceRegimeV2[] = [];

  if (pollBound.length >= VSI_CADENCE_MIN_REGIME_SAMPLES) {
    const sorted = [...pollBound].sort((a, b) => a - b);
    regimes.push({
      kind: 'POLL_BOUND_ACTIVE',
      intervalMedianSeconds: medianSeconds(pollBound),
      intervalP95Seconds: percentileSeconds(sorted, 95),
      sampleCount: pollBound.length,
      confidence: pollBound.length >= 8 ? 'HIGH' : 'MEDIUM',
    });
  }

  if (resting.length >= VSI_CADENCE_MIN_REGIME_SAMPLES) {
    const sorted = [...resting].sort((a, b) => a - b);
    regimes.push({
      kind: 'PERIODIC_RESTING_HEARTBEAT',
      intervalMedianSeconds: medianSeconds(resting),
      intervalP95Seconds: percentileSeconds(sorted, 95),
      sampleCount: resting.length,
      confidence: restingHeartbeatConfidence(resting),
    });
  }

  const irregular = intervalsSeconds.filter(
    (s) => s > POLL_BOUND_MAX_SECONDS && s < RESTING_HEARTBEAT_MIN_SECONDS,
  );
  if (irregular.length >= VSI_CADENCE_MIN_REGIME_SAMPLES) {
    const sorted = [...irregular].sort((a, b) => a - b);
    regimes.push({
      kind: 'IRREGULAR',
      intervalMedianSeconds: medianSeconds(irregular),
      intervalP95Seconds: percentileSeconds(sorted, 95),
      sampleCount: irregular.length,
      confidence: 'MEDIUM',
    });
  }

  if (regimes.length === 0) {
    const sorted = [...intervalsSeconds].sort((a, b) => a - b);
    return [
      {
        kind: 'IRREGULAR',
        intervalMedianSeconds: medianSeconds(intervalsSeconds),
        intervalP95Seconds: percentileSeconds(sorted, 95),
        sampleCount: intervalsSeconds.length,
        confidence: 'LOW',
      },
    ];
  }

  return regimes;
}

function roundSecondsForSemantic(value: number | null): number | null {
  if (value == null) return null;
  return Math.round(value);
}

function hashCadenceSemantic(payload: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function buildCadenceSemanticFingerprint(parts: Record<string, unknown>): string {
  return hashCadenceSemantic({
    contract: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
    ...parts,
  });
}

/** RPM aggregate-bucket density from observed interval median (native Hz never claimed). */
export function resolveRpmObservedDensityLabel(input: {
  intervalMedianSeconds: number | null;
  intervalSampleCount: number;
  limitations: string[];
}): VsiCadenceObservedDensityLabel {
  if (input.limitations.includes('ICE_RPM_NOT_APPLICABLE')) {
    return 'NOT_APPLICABLE';
  }
  if (input.limitations.includes('POWERTRAIN_APPLICABILITY_UNKNOWN')) {
    return 'UNKNOWN';
  }
  if (
    input.intervalMedianSeconds == null ||
    input.intervalSampleCount < VSI_CADENCE_MIN_INTERVAL_SAMPLES
  ) {
    return 'UNKNOWN';
  }
  const median = input.intervalMedianSeconds;
  if (median <= 1.5) {
    return 'ONE_SECOND_BUCKETS_UNPROVEN';
  }
  if (median < 60) {
    return 'SUB_ONE_HZ';
  }
  return 'IRREGULAR';
}

function resolveDensityLabel(
  medianSeconds: number | null,
  limitations: string[],
  intervalSampleCount = 0,
): VsiCadenceObservedDensityLabel {
  if (limitations.includes('LV_PROVIDER_TIMESTAMP_MAY_REFLECT_DIMO_BUNDLE_NOT_INDEPENDENT_PHYSICAL_SAMPLE')) {
    if (medianSeconds == null || intervalSampleCount < VSI_CADENCE_MIN_INTERVAL_SAMPLES) {
      return 'UNKNOWN';
    }
    if (medianSeconds < 60) {
      return 'SUB_ONE_HZ';
    }
    return 'IRREGULAR';
  }
  return resolveRpmObservedDensityLabel({
    intervalMedianSeconds: medianSeconds,
    intervalSampleCount,
    limitations,
  });
}

function resolveEvidenceConfidence(
  sampleCount: number,
  regimes: VsiCadenceRegimeV2[],
): VsiSignalConfidenceLevel {
  if (sampleCount < VSI_CADENCE_MIN_INTERVAL_SAMPLES) {
    return 'LOW';
  }
  if (regimes.some((r) => r.confidence === 'HIGH')) {
    return 'HIGH';
  }
  if (regimes.some((r) => r.confidence === 'MEDIUM')) {
    return 'MEDIUM';
  }
  return 'UNKNOWN';
}

function maxGapWithinTripWindows(
  points: readonly { recordedAtMs: number }[],
  trips: readonly { startMs: number; endMs: number }[],
): number | null {
  const intervals = collectIntraTripIntervalsSeconds(points, trips);
  return intervals.length ? Math.max(...intervals) : null;
}

export function resolveIceRpmApplicability(
  fuelType: string | null | undefined,
): VsiIceRpmApplicability {
  if (!fuelType) {
    return 'UNKNOWN';
  }
  const normalized = fuelType.toUpperCase();
  if (normalized === 'ELECTRIC' || normalized === 'BEV' || normalized === 'EV') {
    return 'NOT_APPLICABLE';
  }
  return 'APPLICABLE';
}

/** @deprecated Use {@link resolveIceRpmApplicability} — unknown fuel type is not NOT_APPLICABLE. */
export function isIceRpmApplicableForFuelType(fuelType: string | null | undefined): boolean {
  return resolveIceRpmApplicability(fuelType) === 'APPLICABLE';
}

export function filterTripsForSourceLinkWindow(
  trips: readonly VsiRpmCadenceTripWindow[],
  linkActivatedAtMs: number,
  linkDeactivatedAtMs: number | null,
): VsiRpmCadenceTripWindow[] {
  const linkEnd = linkDeactivatedAtMs ?? Number.POSITIVE_INFINITY;
  return trips.filter(
    (t) => t.endMs >= linkActivatedAtMs && t.startMs <= linkEnd,
  );
}

/** Intersects trip bounds with the active provider-source-link window (no cross-link telemetry). */
export function clipTripWindowsToLinkBounds(
  trips: readonly VsiRpmCadenceTripWindow[],
  linkActivatedAtMs: number,
  linkDeactivatedAtMs: number | null,
): VsiRpmCadenceTripWindow[] {
  const linkEnd = linkDeactivatedAtMs ?? Number.POSITIVE_INFINITY;
  return filterTripsForSourceLinkWindow(trips, linkActivatedAtMs, linkDeactivatedAtMs)
    .map((t) => ({
      tripId: t.tripId,
      startMs: Math.max(t.startMs, linkActivatedAtMs),
      endMs: Math.min(t.endMs, linkEnd),
    }))
    .filter((t) => t.endMs > t.startMs);
}

export function dedupeLvPointsBySourceAdvance(
  points: readonly VsiLvCadenceEvidenceInput['points'][number][],
): VsiLvCadenceEvidenceInput['points'] {
  const sorted = [...points].sort((a, b) => a.observedAtMs - b.observedAtMs);
  const seen = new Set<number>();
  const out: VsiLvCadenceEvidenceInput['points'][number][] = [];
  for (const p of sorted) {
    const key = p.providerTimestampMs ?? p.observedAtMs;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(p);
  }
  return out;
}

function lvIntervalTimestampsMs(
  points: readonly VsiLvCadenceEvidenceInput['points'][number][],
): number[] {
  return points.map((p) => p.providerTimestampMs ?? p.observedAtMs);
}

export function analyzeEngineRpmCadence(
  input: VsiRpmCadenceEvidenceInput,
): VsiSignalCadenceIntelligenceV2 {
  const limitations: string[] = [
    'ENGINE_STATE_NOT_PERSISTED_OBSERVABILITY_LIMITED',
    'SPEED_ZERO_NOT_IGNITION_OFF_PROOF',
    'MISSING_GPS_NOT_STATIONARY_PROOF',
  ];
  if (input.attributionLimitations?.length) {
    limitations.push(...input.attributionLimitations);
  }
  let provenance = dedupeCadenceProvenanceTags(input.provenance);

  if (input.iceRpmApplicability === 'NOT_APPLICABLE') {
    limitations.push('ICE_RPM_NOT_APPLICABLE');
    return {
      contractVersion: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
      evidenceConfidence: 'HIGH',
      provenance: dedupeCadenceProvenanceTags(provenance),
      limitations,
      observedSampleCount: 0,
      distinctTimestampCount: 0,
      intervalMedianSeconds: null,
      intervalP95Seconds: null,
      maxIntraWindowGapSeconds: null,
      activeWindowCoverageRatio: null,
      finalizedTripCount: input.tripWindows.length,
      regimes: [
        {
          kind: 'INSUFFICIENT_EVIDENCE',
          intervalMedianSeconds: null,
          intervalP95Seconds: null,
          sampleCount: 0,
          confidence: 'HIGH',
        },
      ],
      observedDensityLabel: 'NOT_APPLICABLE',
      cadenceSemanticFingerprint: buildCadenceSemanticFingerprint({
        signal: 'engine_rpm',
        density: 'NOT_APPLICABLE',
        applicability: 'NOT_APPLICABLE',
        regimes: [],
      }),
    };
  }

  if (input.iceRpmApplicability === 'UNKNOWN') {
    limitations.push('POWERTRAIN_APPLICABILITY_UNKNOWN');
    return {
      contractVersion: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
      evidenceConfidence: 'UNKNOWN',
      provenance: dedupeCadenceProvenanceTags(provenance),
      limitations,
      observedSampleCount: 0,
      distinctTimestampCount: 0,
      intervalMedianSeconds: null,
      intervalP95Seconds: null,
      maxIntraWindowGapSeconds: null,
      activeWindowCoverageRatio: null,
      finalizedTripCount: input.tripWindows.length,
      regimes: [
        {
          kind: 'INSUFFICIENT_EVIDENCE',
          intervalMedianSeconds: null,
          intervalP95Seconds: null,
          sampleCount: 0,
          confidence: 'UNKNOWN',
        },
      ],
      observedDensityLabel: 'UNKNOWN',
      cadenceSemanticFingerprint: buildCadenceSemanticFingerprint({
        signal: 'engine_rpm',
        density: 'UNKNOWN',
        applicability: 'UNKNOWN',
        regimes: [],
      }),
    };
  }

  const validPoints = input.points.filter((p) => Number.isFinite(p.value));
  const scopedPoints = assignPointsToFirstTrip(validPoints, input.tripWindows);
  const inTripMs = scopedPoints.map((p) => p.recordedAtMs);
  const distinctTimestampCount = dedupeSortedTimestampsMs(inTripMs).length;
  const intervals = collectIntraTripIntervalsSeconds(scopedPoints, input.tripWindows);
  const sortedIntervals = [...intervals].sort((a, b) => a - b);

  if (
    input.hfReadStatus === 'SUCCESS' &&
    scopedPoints.length > 0 &&
    !provenance.includes('CLICKHOUSE_TELEMETRY_HF_POINTS')
  ) {
    provenance = [...provenance, 'CLICKHOUSE_TELEMETRY_HF_POINTS'];
  }
  provenance = dedupeCadenceProvenanceTags(provenance);
  if (input.hfReadStatus === 'UNAVAILABLE') {
    limitations.push('CLICKHOUSE_HF_UNAVAILABLE');
  }
  if (input.hfReadStatus === 'QUERY_FAILED') {
    limitations.push('CLICKHOUSE_HF_QUERY_FAILED');
  }
  if (input.hfReadStatus === 'EMPTY') {
    limitations.push('CLICKHOUSE_HF_EMPTY_IN_WINDOW');
  }
  limitations.push('DIMO_ONE_SECOND_BUCKET_NOT_NATIVE_SAMPLING_PROOF');
  limitations.push('NATIVE_DEVICE_SAMPLING_FREQUENCY_NOT_PROVEN');

  const regimes = detectCadenceRegimes(intervals);
  const intervalMedianSeconds = medianSeconds(intervals);
  const intervalP95Seconds = percentileSeconds(sortedIntervals, 95);
  const maxIntraWindowGapSeconds = maxGapWithinTripWindows(
    scopedPoints,
    input.tripWindows,
  );

  const cadence: VsiSignalCadenceIntelligenceV2 = {
    contractVersion: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
    evidenceConfidence: resolveEvidenceConfidence(intervals.length, regimes),
    provenance,
    limitations,
    observedSampleCount: scopedPoints.length,
    distinctTimestampCount,
    intervalMedianSeconds,
    intervalP95Seconds,
    maxIntraWindowGapSeconds,
    activeWindowCoverageRatio: computeDistinctBucketCoverageRatio(
      scopedPoints,
      input.tripWindows,
    ),
    finalizedTripCount: input.tripWindows.length,
    regimes,
    observedDensityLabel: resolveDensityLabel(
      intervalMedianSeconds,
      limitations,
      intervals.length,
    ),
    cadenceSemanticFingerprint: '',
  };

  cadence.cadenceSemanticFingerprint = buildCadenceSemanticFingerprint({
    signal: 'engine_rpm',
    applicability: 'APPLICABLE',
    density: cadence.observedDensityLabel,
    median: roundSecondsForSemantic(intervalMedianSeconds),
    p95: roundSecondsForSemantic(intervalP95Seconds),
    maxGap: roundSecondsForSemantic(maxIntraWindowGapSeconds),
    regimes: regimes.map((r) => ({
      kind: r.kind,
      median: roundSecondsForSemantic(r.intervalMedianSeconds),
      p95: roundSecondsForSemantic(r.intervalP95Seconds),
      confidence: r.confidence,
    })),
  });

  return cadence;
}

export function analyzeLvVoltageCadence(
  input: VsiLvCadenceEvidenceInput,
): VsiSignalCadenceIntelligenceV2 {
  const limitations: string[] = [
    'LV_PROVIDER_TIMESTAMP_MAY_REFLECT_DIMO_BUNDLE_NOT_INDEPENDENT_PHYSICAL_SAMPLE',
    'NATIVE_DEVICE_TRANSMISSION_INTERVAL_NOT_INFERRED_FROM_DIMO_SNAPSHOT_TIMING',
  ];
  const provenance = dedupeCadenceProvenanceTags([
    ...input.provenance,
    'POSTGRES_BATTERY_MEASUREMENTS',
  ]);

  const linkEnd = input.linkDeactivatedAtMs ?? Number.POSITIVE_INFINITY;
  const scoped = input.points.filter(
    (p) =>
      p.observedAtMs >= input.linkActivatedAtMs && p.observedAtMs <= linkEnd,
  );
  const deduped = dedupeLvPointsBySourceAdvance(scoped);

  const timestampsMs = lvIntervalTimestampsMs(deduped);
  const intervals = intervalsFromTimestampsMs(timestampsMs);
  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const regimes = detectCadenceRegimes(intervals);
  const intervalMedianSeconds = medianSeconds(intervals);
  const intervalP95Seconds = percentileSeconds(sortedIntervals, 95);
  const maxIntraWindowGapSeconds = intervals.length ? Math.max(...intervals) : null;

  const cadence: VsiSignalCadenceIntelligenceV2 = {
    contractVersion: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
    evidenceConfidence: resolveEvidenceConfidence(intervals.length, regimes),
    provenance,
    limitations,
    observedSampleCount: deduped.length,
    distinctTimestampCount: dedupeSortedTimestampsMs(timestampsMs).length,
    intervalMedianSeconds,
    intervalP95Seconds,
    maxIntraWindowGapSeconds,
    activeWindowCoverageRatio: null,
    finalizedTripCount: null,
    regimes,
    observedDensityLabel:
      intervals.length < VSI_CADENCE_MIN_INTERVAL_SAMPLES
        ? 'UNKNOWN'
        : resolveDensityLabel(intervalMedianSeconds, limitations, intervals.length),
    cadenceSemanticFingerprint: '',
  };

  cadence.cadenceSemanticFingerprint = buildCadenceSemanticFingerprint({
    signal: 'lv_voltage',
    median: roundSecondsForSemantic(intervalMedianSeconds),
    p95: roundSecondsForSemantic(intervalP95Seconds),
    maxGap: roundSecondsForSemantic(maxIntraWindowGapSeconds),
    regimes: regimes.map((r) => ({
      kind: r.kind,
      median: roundSecondsForSemantic(r.intervalMedianSeconds),
      p95: roundSecondsForSemantic(r.intervalP95Seconds),
      confidence: r.confidence,
    })),
  });

  return cadence;
}
