import type { TripDiBoundaryAdmissionRecoveryFleetVehicleV1 } from './trip-di-boundary-admission-recovery.fleet-cohort.v1';

/** Default fleet admission pass interval (must match scheduler @Interval). */
export const TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_FLEET_PASS_INTERVAL_MS = 30 * 60_000;

/**
 * Deterministic round-robin ordering so repeated passes with exhausted global budget
 * eventually visit every eligible vehicle (stable sort + time-based rotation).
 */
export function computeTripDiBoundaryAdmissionRecoveryFleetPassRotationSeed(
  now: Date,
  intervalMs: number = TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_FLEET_PASS_INTERVAL_MS,
): number {
  if (intervalMs <= 0) return 0;
  return Math.floor(now.getTime() / intervalMs);
}

export function rotateTripDiBoundaryAdmissionRecoveryFleetVehiclesV1(
  vehicles: readonly TripDiBoundaryAdmissionRecoveryFleetVehicleV1[],
  passSeed: number,
): TripDiBoundaryAdmissionRecoveryFleetVehicleV1[] {
  if (vehicles.length <= 1) return [...vehicles];
  const sorted = [...vehicles].sort((a, b) => {
    const org = a.organizationId.localeCompare(b.organizationId);
    if (org !== 0) return org;
    return a.vehicleId.localeCompare(b.vehicleId);
  });
  const start = passSeed % sorted.length;
  return [...sorted.slice(start), ...sorted.slice(0, start)];
}
