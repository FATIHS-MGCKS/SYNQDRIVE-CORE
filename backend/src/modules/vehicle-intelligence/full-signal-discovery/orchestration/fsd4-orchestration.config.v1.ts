export type Fsd4OrchestrationConfigV1 = {
  enabled: boolean;
  allowedVehicleIds: ReadonlySet<string>;
  providerExecutionEnabled: boolean;
};

export function createDefaultFsd4OrchestrationConfigV1(): Fsd4OrchestrationConfigV1 {
  return {
    enabled: false,
    allowedVehicleIds: new Set(),
    providerExecutionEnabled: false,
  };
}

export function parseFsd4VehicleAllowlistEnv(raw: string | undefined): ReadonlySet<string> {
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

/**
 * FSD-4 environment parity with FSD-3 — default OFF (fail-closed).
 */
export function resolveFsd4OrchestrationConfigFromEnv(env: NodeJS.ProcessEnv = process.env): Fsd4OrchestrationConfigV1 {
  return {
    enabled: env.FSD4_HISTORICAL_ORCHESTRATION_ENABLED === '1',
    allowedVehicleIds: parseFsd4VehicleAllowlistEnv(env.FSD4_HISTORICAL_VEHICLE_ALLOWLIST),
    providerExecutionEnabled: env.FSD4_PROVIDER_EXECUTION_ENABLED === '1',
  };
}

export function assertFsd4VehicleAllowed(config: Fsd4OrchestrationConfigV1, vehicleId: string): void {
  if (!config.enabled) {
    throw new Error('FSD4_ORCHESTRATION_DISABLED');
  }
  if (!config.allowedVehicleIds.has(vehicleId)) {
    throw new Error('FSD4_VEHICLE_NOT_ALLOWLISTED');
  }
}
