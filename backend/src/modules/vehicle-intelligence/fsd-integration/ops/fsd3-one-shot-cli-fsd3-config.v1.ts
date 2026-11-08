import type { Fsd3OrchestrationConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-orchestration.config.v1';
import type { Fsd4OrchestrationConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd4-orchestration.config.v1';
import { createDefaultFsd4OrchestrationConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd4-orchestration.config.v1';

/**
 * Process-scoped FSD3 gates for the ops CLI — does not read PM2 replica env flags.
 */
export function buildFsd3OneShotCliOrchestrationConfigV1(allowedVehicleId: string): Fsd3OrchestrationConfigV1 {
  return {
    enabled: true,
    allowedVehicleIds: new Set([allowedVehicleId]),
    providerExecutionEnabled: true,
  };
}

/** FSD4 remains disabled for the P6B one-shot CLI process regardless of replica env. */
export function buildFsd3OneShotCliFsd4DisabledConfigV1(): Fsd4OrchestrationConfigV1 {
  return createDefaultFsd4OrchestrationConfigV1();
}

/** Process-scoped FSD4 gates for the P6C fleet one-shot CLI — does not read PM2 replica env flags. */
export function buildFsd4OneShotCliOrchestrationConfigV1(allowedVehicleId: string): Fsd4OrchestrationConfigV1 {
  return {
    enabled: true,
    allowedVehicleIds: new Set([allowedVehicleId]),
    providerExecutionEnabled: true,
  };
}
