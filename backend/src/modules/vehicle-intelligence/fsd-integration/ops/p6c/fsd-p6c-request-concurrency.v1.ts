import type { FsdBudgetConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';
import { FSD_P6C_MAX_REQUESTS_PER_RUN_HARD_CEILING_V1 } from './fsd-p6c-cli-budget.v1';

export const FSD_P6C_PLANNED_MAX_PARALLEL_REQUESTS_ENV = 'FSD_P6C_PLANNED_MAX_PARALLEL_REQUESTS' as const;

/** Sequential privileged fleet ops default — not provider-side DIMO parallel dispatch. */
export const FSD_P6C_DEFAULT_PARALLEL_IN_FLIGHT_V1 = 1;

export function resolveFsdP6cPlannedMaxParallelProviderRequestsV1(input: {
  budget: FsdBudgetConfigV1;
  env?: NodeJS.ProcessEnv;
}): number {
  const env = input.env ?? process.env;
  const raw = env[FSD_P6C_PLANNED_MAX_PARALLEL_REQUESTS_ENV];
  let parallel = FSD_P6C_DEFAULT_PARALLEL_IN_FLIGHT_V1;
  if (raw?.trim()) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      parallel = parsed;
    }
  }
  return Math.min(
    parallel,
    input.budget.maxRequestsPerRun,
    FSD_P6C_MAX_REQUESTS_PER_RUN_HARD_CEILING_V1,
  );
}

export function computeMaxPlannedProviderRequestsPerVehicleV1(input: {
  fsd3PlannedProviderRequests: number;
  fsd4PlannedProviderRequests: number;
}): number {
  return input.fsd3PlannedProviderRequests + input.fsd4PlannedProviderRequests;
}
