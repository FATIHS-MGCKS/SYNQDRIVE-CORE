/**
 * FSD-3 orchestration gates — default OFF (fail-closed).
 *
 * P5B: offboarding and ops lifecycle entrypoints synchronously invalidate executable FSD runs
 * on DIMO source-link deactivation; fenced writes still fail-closed on STALE_SOURCE_LINK.
 */
export type Fsd3OrchestrationConfigV1 = {
  enabled: boolean;
  /** Explicit vehicle allowlist — empty means fail-closed (no vehicles). */
  allowedVehicleIds: ReadonlySet<string>;
  /** Must remain false in draft PR — real DIMO dispatch is blocked when false. */
  providerExecutionEnabled: boolean;
};

export const FSD3_LIVE_ACTIVATION_BLOCKERS_V1 = [] as const;

export function createDefaultFsd3OrchestrationConfigV1(): Fsd3OrchestrationConfigV1 {
  return {
    enabled: false,
    allowedVehicleIds: new Set(),
    providerExecutionEnabled: false,
  };
}

export function parseFsd3VehicleAllowlistEnv(raw: string | undefined): ReadonlySet<string> {
  if (!raw?.trim()) {
    return new Set();
  }
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function resolveFsd3OrchestrationConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Fsd3OrchestrationConfigV1 {
  return {
    enabled: env.FSD3_CATALOG_SNAPSHOT_ORCHESTRATION_ENABLED === '1',
    allowedVehicleIds: parseFsd3VehicleAllowlistEnv(env.FSD3_CATALOG_SNAPSHOT_VEHICLE_ALLOWLIST),
    providerExecutionEnabled: env.FSD3_PROVIDER_EXECUTION_ENABLED === '1',
  };
}

export function assertFsd3VehicleAllowed(
  config: Fsd3OrchestrationConfigV1,
  vehicleId: string,
): void {
  if (!config.enabled) {
    throw new Error('FSD3_ORCHESTRATION_DISABLED');
  }
  if (!config.allowedVehicleIds.has(vehicleId)) {
    throw new Error('FSD3_VEHICLE_NOT_ALLOWLISTED');
  }
}
