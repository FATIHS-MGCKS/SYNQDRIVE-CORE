import { createDefaultFsdBudgetConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';
import {
  computeMaxPlannedProviderRequestsPerVehicleV1,
  resolveFsdP6cPlannedMaxParallelProviderRequestsV1,
  FSD_P6C_DEFAULT_PARALLEL_IN_FLIGHT_V1,
} from '../fsd-p6c-request-concurrency.v1';

describe('FSD P6C request concurrency metrics', () => {
  it('defaults peak parallel in-flight to 1', () => {
    const budget = createDefaultFsdBudgetConfigV1({ maxRequestsPerRun: 12 });
    expect(
      resolveFsdP6cPlannedMaxParallelProviderRequestsV1({ budget, env: {} as NodeJS.ProcessEnv }),
    ).toBe(FSD_P6C_DEFAULT_PARALLEL_IN_FLIGHT_V1);
  });

  it('separates per-vehicle planned total from parallel cap', () => {
    expect(
      computeMaxPlannedProviderRequestsPerVehicleV1({
        fsd3PlannedProviderRequests: 2,
        fsd4PlannedProviderRequests: 5,
      }),
    ).toBe(7);
  });
});
