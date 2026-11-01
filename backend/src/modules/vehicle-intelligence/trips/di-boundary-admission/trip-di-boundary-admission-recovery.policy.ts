/**
 * Fail-closed durable DI boundary admission recovery (Fable P0).
 * Writer defaults OFF; activation requires an explicit persistent UTC timestamp (never process start).
 *
 * FSM RESTING contract: when `vehicle_trip_detection_states` row exists, state must be RESTING and
 * active_trip_id must not reference the candidate trip. When no detection row exists (LEFT JOIN null),
 * scan may proceed if other guards pass — explicit legacy/data-gap fallback, not an active-drive bypass.
 */
import {
  parseDiV0S4BooleanFlag,
  parseDiV0S4ControlPlaneConfig,
  type DiV0S4ControlPlaneConfig,
} from '../../driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import { parseLiveFsmAutomaticAdmissionActivationHorizon } from './trip-di-boundary-admission-live-fsm-auto.policy';

export const TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_ACTIVATED_AT_UTC_ENV =
  'TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_ACTIVATED_AT_UTC';

/** When false (default), recovery pass may observe candidates (shadow) but must not write admission. */
export const TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_WRITER_ENABLED_ENV =
  'TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_WRITER_ENABLED';

/** When true and writer is false, emit metrics/logs for would-release candidates. Default true when activated. */
export const TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_SHADOW_OBSERVE_ENABLED_ENV =
  'TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_SHADOW_OBSERVE_ENABLED';

export const TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_LOOKBACK_HOURS_ENV =
  'TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_LOOKBACK_HOURS';

export const TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_MAX_TRIPS_PER_VEHICLE_ENV =
  'TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_MAX_TRIPS_PER_VEHICLE';

export const TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_GLOBAL_MAX_PER_PASS_ENV =
  'TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_GLOBAL_MAX_PER_PASS';

/**
 * Recovery-only fleet-wide authorization (does not toggle DS4 fleet-motion / Motion-Core rollout).
 * When true, recovery eligibility uses canonical tenant UUID gates instead of legacy S4 allowlists.
 */
export const TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_GLOBAL_AUTHORIZED_ENV =
  'TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_GLOBAL_AUTHORIZED';

export const DEFAULT_RECOVERY_LOOKBACK_HOURS = 48;
export const DEFAULT_RECOVERY_MAX_TRIPS_PER_VEHICLE = 32;
export const DEFAULT_RECOVERY_GLOBAL_MAX_PER_PASS = 64;

export interface TripDiBoundaryAdmissionRecoveryPolicy {
  s4: DiV0S4ControlPlaneConfig;
  /** Recovery-scoped global authorization (independent of DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_AUTHORIZED). */
  recoveryGlobalAuthorized: boolean;
  /** Null ⇒ recovery disabled (no scan, no writes). */
  recoveryActivationHorizonUtc: Date | null;
  writerEnabled: boolean;
  shadowObserveEnabled: boolean;
  lookbackHours: number;
  maxTripsPerVehicle: number;
  globalMaxPerPass: number;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function readTripDiBoundaryAdmissionRecoveryPolicyFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): TripDiBoundaryAdmissionRecoveryPolicy {
  const activationHorizonUtc = parseLiveFsmAutomaticAdmissionActivationHorizon(
    env[TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_ACTIVATED_AT_UTC_ENV],
  );
  const writerEnabled =
    env[TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_WRITER_ENABLED_ENV]?.trim().toLowerCase() === 'true';
  const shadowObserveEnabled =
    env[TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_SHADOW_OBSERVE_ENABLED_ENV]?.trim().toLowerCase() !==
    'false';
  return {
    s4: parseDiV0S4ControlPlaneConfig(env),
    recoveryGlobalAuthorized: parseDiV0S4BooleanFlag(
      env[TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_GLOBAL_AUTHORIZED_ENV],
    ),
    recoveryActivationHorizonUtc: activationHorizonUtc,
    writerEnabled,
    shadowObserveEnabled,
    lookbackHours: parsePositiveInt(
      env[TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_LOOKBACK_HOURS_ENV],
      DEFAULT_RECOVERY_LOOKBACK_HOURS,
    ),
    maxTripsPerVehicle: parsePositiveInt(
      env[TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_MAX_TRIPS_PER_VEHICLE_ENV],
      DEFAULT_RECOVERY_MAX_TRIPS_PER_VEHICLE,
    ),
    globalMaxPerPass: parsePositiveInt(
      env[TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_GLOBAL_MAX_PER_PASS_ENV],
      DEFAULT_RECOVERY_GLOBAL_MAX_PER_PASS,
    ),
  };
}

export function isTripDiBoundaryAdmissionRecoveryEnabled(
  policy: TripDiBoundaryAdmissionRecoveryPolicy,
): boolean {
  return policy.recoveryActivationHorizonUtc != null;
}

/**
 * Legacy synchronous allowlist-only check (tests / quick guards).
 * Production recovery passes use `evaluateTripDiBoundaryAdmissionRecoveryVehicleEligibilityV1`
 * (S4 fleet rollout policy, ACTIVE registry, provider capability, kill switch).
 */
export function isTripDiBoundaryAdmissionRecoveryVehicleEligible(
  policy: TripDiBoundaryAdmissionRecoveryPolicy,
  scope: { organizationId: string; vehicleId: string; vehicleOrganizationId: string },
): boolean {
  const { s4 } = policy;
  if (!s4.masterEnabled) return false;
  if (s4.organizationAllowlist.size === 0 || s4.vehicleAllowlist.size === 0) return false;
  if (!s4.organizationAllowlist.has(scope.organizationId)) return false;
  if (!s4.vehicleAllowlist.has(scope.vehicleId)) return false;
  if (scope.vehicleOrganizationId !== scope.organizationId) return false;
  return true;
}

/** Eligible trip end_time lower bound: max(activation, now − lookback). No pre-activation historical recovery. */
export function computeTripDiBoundaryAdmissionRecoveryEligibleFrom(
  policy: TripDiBoundaryAdmissionRecoveryPolicy,
  now: Date,
): Date | null {
  const horizon = policy.recoveryActivationHorizonUtc;
  if (horizon == null) return null;
  const lookbackMs = policy.lookbackHours * 3_600_000;
  const lookbackFrom = new Date(now.getTime() - lookbackMs);
  return new Date(Math.max(horizon.getTime(), lookbackFrom.getTime()));
}
