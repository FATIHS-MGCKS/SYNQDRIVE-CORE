/**
 * FSD-3 orchestration gates — default OFF (fail-closed).
 *
 * LIVE_ACTIVATION_BLOCKER: external VehicleDataSourceLink deactivation is re-checked
 * inside each FSD-2 fenced write, but there is no DB trigger to invalidate in-flight runs
 * when a link is deactivated outside FSD acquire. Production activation requires either
 * synchronous run invalidation on link deactivation or accepting STALE_SOURCE_LINK on
 * next fenced write (documented in fsd3-orchestration.service.v1.ts).
 */
export type Fsd3OrchestrationConfigV1 = {
  enabled: boolean;
  /** Explicit vehicle allowlist — empty means fail-closed (no vehicles). */
  allowedVehicleIds: ReadonlySet<string>;
  /** Must remain false in draft PR — real DIMO dispatch is blocked when false. */
  providerExecutionEnabled: boolean;
};

export const FSD3_LIVE_ACTIVATION_BLOCKERS_V1 = [
  'SOURCE_LINK_DEACTIVATION_RUN_INVALIDATION_NOT_SYNCHRONIZED',
] as const;

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
