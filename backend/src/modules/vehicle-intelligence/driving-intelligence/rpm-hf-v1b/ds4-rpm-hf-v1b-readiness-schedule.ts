import { DS4_RPM_HF_V1B_TUNING } from './ds4-rpm-hf-v1b.config';

/** Offsets from trip end for defer retry attempts (attempt 1 → index 0). */
export const DS4_RPM_HF_V1B_DEFER_RETRY_OFFSETS_FROM_TRIP_END_MS = [
  2 * 60_000,
  10 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
  24 * 60 * 60_000,
  48 * 60 * 60_000,
] as const;

export function readinessDeadlineMs(tripEndIso: string, windowMs = DS4_RPM_HF_V1B_TUNING.postTripReadinessWindowMs): number | null {
  const tripEndMs = Date.parse(tripEndIso);
  if (!Number.isFinite(tripEndMs)) return null;
  return tripEndMs + windowMs;
}

/**
 * Time-based defer schedule anchored at trip end (not linear backoff from now).
 * Returns null when the next scheduled attempt would fall at or after the readiness deadline.
 */
export function computeDs4RpmHfV1bDeferNextAttemptAt(input: {
  tripEndIso: string;
  /** Outbox attempt_count after claim increment (1-based). */
  attemptCount: number;
  nowMs: number;
}): Date | null {
  const tripEndMs = Date.parse(input.tripEndIso);
  if (!Number.isFinite(tripEndMs)) return null;
  const deadline = readinessDeadlineMs(input.tripEndIso);
  if (deadline == null) return null;

  const deferIndex = Math.max(0, input.attemptCount - 1);
  const offset =
    DS4_RPM_HF_V1B_DEFER_RETRY_OFFSETS_FROM_TRIP_END_MS[
      Math.min(deferIndex, DS4_RPM_HF_V1B_DEFER_RETRY_OFFSETS_FROM_TRIP_END_MS.length - 1)
    ]!;
  const scheduledMs = tripEndMs + offset;
  const nextMs = Math.max(input.nowMs, scheduledMs);
  if (nextMs >= deadline) return null;
  return new Date(nextMs);
}
