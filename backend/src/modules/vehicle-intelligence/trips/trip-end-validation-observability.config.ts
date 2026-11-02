/**
 * TDL PR0 — revision-safe end-validation decision observability (non-authoritative).
 * Default disabled; fail-closed when enabled without an explicit vehicle allowlist.
 */

export const TRIP_END_VALIDATION_OBSERVABILITY_ENABLED_ENV =
  'TRIP_END_VALIDATION_OBSERVABILITY_ENABLED';
export const TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS_ENV =
  'TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS';
/** Owner attestation: migration applied + best-effort observability accepted. */
export const TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK_ENV =
  'TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK';
/** Owner attestation: 90d retention is planned only (no purge job in PR0). */
export const TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT_ENV =
  'TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT';

export function parseTripEndValidationObservabilityEnabled(
  raw: string | undefined,
  fallback = false,
): boolean {
  if (raw == null || raw.trim() === '') return fallback;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback;
}

export function parseTripEndValidationObservabilityVehicleAllowlist(
  raw: string | undefined,
): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export function isTripEndValidationObservabilityEnabledForVehicle(
  vehicleId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (
    !parseTripEndValidationObservabilityEnabled(
      env[TRIP_END_VALIDATION_OBSERVABILITY_ENABLED_ENV],
    )
  ) {
    return false;
  }
  const allowlist = parseTripEndValidationObservabilityVehicleAllowlist(
    env[TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS_ENV],
  );
  if (allowlist.size === 0) return false;
  if (!allowlist.has(vehicleId)) return false;
  if (
    !parseTripEndValidationObservabilityEnabled(
      env[TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK_ENV],
    )
  ) {
    return false;
  }
  if (
    !parseTripEndValidationObservabilityEnabled(
      env[TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT_ENV],
    )
  ) {
    return false;
  }
  return true;
}

export function readTripEndValidationObservabilityActivationBlockers(
  vehicleId: string,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const blockers: string[] = [];
  if (
    !parseTripEndValidationObservabilityEnabled(
      env[TRIP_END_VALIDATION_OBSERVABILITY_ENABLED_ENV],
    )
  ) {
    blockers.push('TRIP_END_VALIDATION_OBSERVABILITY_ENABLED!=true');
  }
  const allowlist = parseTripEndValidationObservabilityVehicleAllowlist(
    env[TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS_ENV],
  );
  if (allowlist.size === 0) {
    blockers.push('TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS empty');
  } else if (!allowlist.has(vehicleId)) {
    blockers.push('vehicle not in allowlist');
  }
  if (
    !parseTripEndValidationObservabilityEnabled(
      env[TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK_ENV],
    )
  ) {
    blockers.push('TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK!=true');
  }
  if (
    !parseTripEndValidationObservabilityEnabled(
      env[TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT_ENV],
    )
  ) {
    blockers.push('TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT!=true');
  }
  return blockers;
}
