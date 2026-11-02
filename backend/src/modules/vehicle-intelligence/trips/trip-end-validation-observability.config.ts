/**
 * TDL PR0 — revision-safe end-validation decision observability (non-authoritative).
 * Default disabled; fail-closed when enabled without an explicit vehicle allowlist.
 */

export const TRIP_END_VALIDATION_OBSERVABILITY_ENABLED_ENV =
  'TRIP_END_VALIDATION_OBSERVABILITY_ENABLED';
export const TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS_ENV =
  'TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS';

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
  return allowlist.has(vehicleId);
}
