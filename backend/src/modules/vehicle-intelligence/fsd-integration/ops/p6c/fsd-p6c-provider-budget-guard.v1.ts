import type { FsdP6cFleetDiscoveryPlanReportV1 } from './fsd-p6c-fleet-plan.v1';
import { FSD_P6C_MAX_REQUESTS_PER_RUN_HARD_CEILING_V1 } from './fsd-p6c-cli-budget.v1';

/** Documented DIMO Core documented tier ceiling — observability reference for sequential fleet runs. */
export const FSD_P6C_DIMO_DOCUMENTED_RATE_PER_SECOND_V1 = 25;

export type FsdP6cProviderBudgetGuardResultV1 =
  | {
      ok: true;
      peakInFlightProviderRequests: number;
      fleetSequentialPlannedProviderRequests: number;
      notes: string[];
    }
  | {
      ok: false;
      reason: string;
      peakInFlightProviderRequests: number;
      fleetSequentialPlannedProviderRequests: number;
    };

/**
 * Validates planner-derived budgets before any provider dispatch.
 * Fleet execution is strictly sequential — peak in-flight equals the per-vehicle max planned slice.
 */
export function evaluateFsdP6cProviderBudgetGuardV1(
  planReport: FsdP6cFleetDiscoveryPlanReportV1,
): FsdP6cProviderBudgetGuardResultV1 {
  const perVehiclePeaks = planReport.vehicles.map((v) =>
    Math.max(v.fsd3PlannedProviderRequests, v.fsd4PlannedProviderRequests + 1),
  );
  const peakInFlight = perVehiclePeaks.length ? Math.max(...perVehiclePeaks) : 0;

  if (!planReport.allExecutable) {
    return {
      ok: false,
      reason: 'NON_EXECUTABLE_VEHICLE_PLAN',
      peakInFlightProviderRequests: peakInFlight,
      fleetSequentialPlannedProviderRequests: planReport.fleetSequentialPlannedProviderRequests,
    };
  }

  if (planReport.budget.maxRequestsPerRun > FSD_P6C_MAX_REQUESTS_PER_RUN_HARD_CEILING_V1) {
    return {
      ok: false,
      reason: 'PER_RUN_BUDGET_EXCEEDS_HARD_CEILING',
      peakInFlightProviderRequests: peakInFlight,
      fleetSequentialPlannedProviderRequests: planReport.fleetSequentialPlannedProviderRequests,
    };
  }

  if (peakInFlight > planReport.budget.maxRequestsPerRun) {
    return {
      ok: false,
      reason: 'PEAK_IN_FLIGHT_EXCEEDS_PER_RUN_BUDGET',
      peakInFlightProviderRequests: peakInFlight,
      fleetSequentialPlannedProviderRequests: planReport.fleetSequentialPlannedProviderRequests,
    };
  }

  const notes = [
    'Fleet runs vehicles sequentially; global PM2 FSD flags remain unchanged.',
    `Disclosed fleet sequential provider requests: ${planReport.fleetSequentialPlannedProviderRequests}.`,
    `Peak in-flight provider requests (single vehicle): ${peakInFlight} (must stay within per-run budget ${planReport.budget.maxRequestsPerRun}).`,
    `DIMO documented Core rate reference: ${FSD_P6C_DIMO_DOCUMENTED_RATE_PER_SECOND_V1} req/s — operator admission limiter may still throttle.`,
  ];

  return {
    ok: true,
    peakInFlightProviderRequests: peakInFlight,
    fleetSequentialPlannedProviderRequests: planReport.fleetSequentialPlannedProviderRequests,
    notes,
  };
}

export function assertFsdP6cProviderBudgetGuardV1(planReport: FsdP6cFleetDiscoveryPlanReportV1): void {
  const result = evaluateFsdP6cProviderBudgetGuardV1(planReport);
  if (!result.ok) {
    throw new Error(`FSD_P6C_PROVIDER_BUDGET_GUARD_${result.reason}`);
  }
}
