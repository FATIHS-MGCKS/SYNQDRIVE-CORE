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

export function assertFsd4VehicleAllowed(config: Fsd4OrchestrationConfigV1, vehicleId: string): void {
  if (!config.enabled) {
    throw new Error('FSD4_ORCHESTRATION_DISABLED');
  }
  if (!config.allowedVehicleIds.has(vehicleId)) {
    throw new Error('FSD4_VEHICLE_NOT_ALLOWLISTED');
  }
}
