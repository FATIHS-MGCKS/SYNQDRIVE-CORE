import { registerAs } from '@nestjs/config';
import {
  resolveMaxSameTripQualifiedStopMsConfig,
} from '../modules/vehicle-intelligence/trips/trip-qualified-stop-duration.config';

const maxSameTripStopConfig = resolveMaxSameTripQualifiedStopMsConfig();

export default registerAs('worker', () => ({
  snapshotIntervalMs: parseInt(process.env.WORKER_SNAPSHOT_INTERVAL_MS || '30000', 10),
  tripTrackingIntervalMs: parseInt(process.env.WORKER_TRIP_TRACKING_INTERVAL_MS || '30000', 10),
  tripTrackingConcurrency: parseInt(process.env.WORKER_TRIP_TRACKING_CONCURRENCY || '5', 10),

  // ── Trip Active Continuity: time-based evaluation windows ──
  // How far back from "now" to look at core data when evaluating active/idle/end.
  // Replaces the old hardcoded slice(-5) approach.
  tripContinuityCoreWindowMs: parseInt(process.env.TRIP_CONTINUITY_CORE_WINDOW_MS || '120000', 10),
  // How far back from "now" to look at performance data for ICE engine activity.
  tripContinuityPerfWindowMs: parseInt(process.env.TRIP_CONTINUITY_PERF_WINDOW_MS || '90000', 10),

  // ── Trip End: Timeout fallback (last resort, not primary end trigger) ──
  // How long to wait in POSSIBLE_END before hard-forcing finalization.
  tripEndTimeoutMs: parseInt(process.env.WORKER_TRIP_END_TIMEOUT_MS || '1800000', 10),

  // ── Trip End: Stability window before triggering CUSUM validation ──
  // Trip must remain in POSSIBLE_END for this duration before CUSUM runs.
  tripEndStabilityWindowMs: parseInt(process.env.TRIP_END_STABILITY_WINDOW_MS || '90000', 10),

  // ── Trip End: Min inactivity before CUSUM is triggered ──
  // Enforced as a guard in POSSIBLE_END_CHECK before scheduling END_VALIDATION.
  // CUSUM gate = max(stabilityWindow, minInactivity). Defaults: 90s stability,
  // 120s min inactivity → 120s gate before first CUSUM attempt.
  tripEndMinInactivityBeforeCusumMs: parseInt(
    process.env.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS || '120000',
    10,
  ),

  // ── ClickHouse trip-end assist (first instance; FSM/CUSUM fallback) ──
  tripEndChAssistMinStationaryMs: parseInt(
    process.env.TRIP_END_CH_ASSIST_MIN_STATIONARY_MS || '45000',
    10,
  ),
  tripEndChAssistMinTripDurationMs: parseInt(
    process.env.TRIP_END_CH_ASSIST_MIN_TRIP_DURATION_MS || '60000',
    10,
  ),
  tripEndChAssistStabilityMs: parseInt(
    process.env.TRIP_END_CH_ASSIST_STABILITY_MS || '30000',
    10,
  ),
  tripEndChAssistHighConfidenceStationaryMs: parseInt(
    process.env.TRIP_END_CH_ASSIST_HIGH_STATIONARY_MS || '90000',
    10,
  ),

  tripEndEmptyCoreBackoffBaseMs: parseInt(
    process.env.TRIP_EMPTY_CORE_BACKOFF_BASE_MS || '30000',
    10,
  ),
  tripEndEmptyCoreBackoffMaxMs: parseInt(
    process.env.TRIP_EMPTY_CORE_BACKOFF_MAX_MS || '600000',
    10,
  ),
  tripEndEmptyCoreBackoffJitterRatio: parseFloat(
    process.env.TRIP_EMPTY_CORE_BACKOFF_JITTER_RATIO || '0.15',
  ),

  // ── Trip End: Retry interval between CUSUM validation attempts ──
  tripEndValidationRetryMs: parseInt(process.env.TRIP_END_VALIDATION_RETRY_MS || '60000', 10),

  // ── Trip End: Max CUSUM validation attempts before accepting timeout fallback ──
  tripEndValidationMaxAttempts: parseInt(process.env.TRIP_END_VALIDATION_MAX_ATTEMPTS || '3', 10),

  // ── Trip End: How far back from possibleEndAt to fetch data for CUSUM ──
  tripEndSegmentLookbackMs: parseInt(process.env.TRIP_END_SEGMENT_LOOKBACK_MS || '900000', 10),

  // ── Trip End: How far forward from possibleEndAt to fetch data for CUSUM ──
  tripEndSegmentLookaheadMs: parseInt(process.env.TRIP_END_SEGMENT_LOOKAHEAD_MS || '300000', 10),

  // ── Qualified stop duration (Trip FSM mid-gap + merge/reopen) ──
  // Max duration of a physically qualified stop/pause that remains ONE trip.
  // Split when qualified gap duration is STRICTLY GREATER than this value (ms).
  // Default 5 minutes. Legacy env TRIP_MID_GAP_SPLIT_MS maps to the same authority.
  tripSameTripMaxQualifiedStopMs:
    maxSameTripStopConfig.resolvedMaxSameTripQualifiedStopMs,
  tripSameTripMaxQualifiedStopMsConfigSource: maxSameTripStopConfig.configSource,
  /** @deprecated alias — identical to tripSameTripMaxQualifiedStopMs */
  tripMidGapSplitMs: maxSameTripStopConfig.resolvedMaxSameTripQualifiedStopMs,
  // Maximum position drift (meters) between the last pre-gap waypoint and
  // the first post-gap waypoint for the gap to be considered a stationary
  // stop (i.e., the same parking spot). Larger drifts mean the vehicle kept
  // moving through a signal dropout (e.g., tunnel) and MUST NOT be split.
  tripMidGapMaxStationaryDriftM: parseInt(
    process.env.TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M || '200',
    10,
  ),
  // Lower bound for the pre-split trip's existing duration/distance.
  // Prevents splitting a trip whose first segment would be trivially short
  // (e.g., false-positive signal glitches near trip start).
  tripMidGapMinPreDurationMs: parseInt(
    process.env.TRIP_MID_GAP_MIN_PRE_DURATION_MS || '60000',
    10,
  ),
  // P1B.9C: mid-gap false-split hardening (default off; per-vehicle via allowlist).
  tripMidGapTelemetrySilenceHardeningEnabled:
    process.env.TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_ENABLED === 'true',
  tripMidGapTelemetrySilenceHardeningVehicleIds: (
    process.env.TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_VEHICLE_IDS ?? ''
  )
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),

  // ── Trip FSM shadow observability (non-authoritative counterfactual / pause audit) ──
  tripFsmShadowObservabilityEnabled: parseBoolEnv(
    process.env.TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED,
    false,
  ),
  tripFsmShadowVehicleIds: (process.env.TRIP_FSM_SHADOW_VEHICLE_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),

  tripEndValidationObservabilityEnabled: parseBoolEnv(
    process.env.TRIP_END_VALIDATION_OBSERVABILITY_ENABLED,
    false,
  ),
  tripEndValidationObservabilityVehicleIds: (
    process.env.TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS ?? ''
  )
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),

  // ── Repair suppression: containment-aware coverage rollout ──
  // legacy  — binary overlap decides, exactly as before.
  // shadow  — binary overlap still decides; the coverage verdict is computed
  //           and audited alongside it so the two can be compared on real
  //           traffic without touching trip persistence.
  // enforce — the coverage verdict decides.
  // Defaults to shadow: measuring first is the whole point of the mode.
  tripRepairCoverageMode: normalizeCoverageMode(process.env.TRIP_REPAIR_COVERAGE_MODE),

  // ── P1.2 FINAL-3: partial boundary extension repair ──
  // Rollback without disabling all reconciliation: TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=false
  tripPartialBoundaryRepairEnabled: parseTripPartialBoundaryRepairEnabled(
    process.env.TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED,
  ),

  // Live POSSIBLE_START boundary lookback — derived from max poll interval + confirmation + buffer.
  // Override only when evidence requires a different ceiling.
  tripStartBoundaryMaxLookbackMs: parsePositiveIntEnv(
    process.env.WORKER_TRIP_START_BOUNDARY_MAX_LOOKBACK_MS,
    deriveDefaultTripStartBoundaryMaxLookbackMs(),
  ),

  // ── P1.2 FINAL-4: snapshot + reconciliation scale knobs ──
  snapshotConcurrency: parseBoundedConcurrency(
    process.env.WORKER_SNAPSHOT_CONCURRENCY,
    5,
  ),
  snapshotMaxEnqueuePerTick: parseNonNegativeIntEnv(
    process.env.WORKER_SNAPSHOT_MAX_ENQUEUE_PER_TICK,
    0,
  ),
  fastReconciliationRecencyMs: parsePositiveIntEnv(
    process.env.WORKER_FAST_RECONCILIATION_RECENCY_MS,
    60 * 60_000,
  ),
  fastReconciliationMaxVehiclesPerRun: parseNonNegativeIntEnv(
    process.env.WORKER_FAST_RECONCILIATION_MAX_VEHICLES_PER_RUN,
    0,
  ),
}));

function parsePositiveIntEnv(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeIntEnv(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseBoundedConcurrency(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 200);
}

function parseBoolEnv(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw.trim() === '') return fallback;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback;
}

/** Default enabled for PR testing; disable in production until rollout review. */
export function parseTripPartialBoundaryRepairEnabled(raw: string | undefined): boolean {
  return parseBoolEnv(raw, true);
}

/**
 * max(poll interval) + confirmation wait + safety buffer.
 * Worst-case LONG_IDLE poll (30min) + 3min confirmation + 2min buffer ≈ 35min.
 */
export function deriveDefaultTripStartBoundaryMaxLookbackMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const tiers = [
    parsePositiveIntEnv(env.WORKER_SNAPSHOT_TIER_ACTIVE_DRIVING_MS, 30_000),
    parsePositiveIntEnv(env.WORKER_SNAPSHOT_TIER_RECENTLY_ACTIVE_MS, 60_000),
    parsePositiveIntEnv(env.WORKER_SNAPSHOT_TIER_RESTING_STANDBY_MS, 5 * 60_000),
    parsePositiveIntEnv(env.WORKER_SNAPSHOT_TIER_LONG_IDLE_MS, 30 * 60_000),
  ];
  const maxPollMs = Math.max(...tiers);
  const confirmationMs = parsePositiveIntEnv(
    env.WORKER_POSSIBLE_START_CONFIRM_MAX_WAIT_MS,
    180_000,
  );
  const safetyBufferMs = 2 * 60_000;
  return maxPollMs + confirmationMs + safetyBufferMs;
}

export type TripRepairCoverageMode = 'legacy' | 'shadow' | 'enforce';

export function normalizeCoverageMode(raw: string | undefined): TripRepairCoverageMode {
  const value = (raw ?? '').trim().toLowerCase();
  return value === 'legacy' || value === 'enforce' ? value : 'shadow';
}
