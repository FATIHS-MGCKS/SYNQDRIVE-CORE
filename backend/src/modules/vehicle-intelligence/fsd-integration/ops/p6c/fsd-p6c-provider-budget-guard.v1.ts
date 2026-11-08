import type { FsdP6cFleetDiscoveryPlanReportV1 } from './fsd-p6c-fleet-plan.v1';
import { FSD_P6C_MAX_REQUESTS_PER_RUN_HARD_CEILING_V1 } from './fsd-p6c-cli-budget.v1';

/** Documented DIMO Core documented tier ceiling — observability reference for sequential fleet runs. */
export const FSD_P6C_DIMO_DOCUMENTED_RATE_PER_SECOND_V1 = 25;

export type FsdP6cProviderBudgetGuardResultV1 =
  | {
      ok: true;
      peakInFlightProviderRequests: number;
      fleetCumulativePlannedProviderRequests: number;
      fleetSequentialPlannedProviderRequests: number;
      offlineReferenceOnly: boolean;
      notes: string[];
    }
  | {
      ok: false;
      reason: string;
      peakInFlightProviderRequests: number;
      fleetCumulativePlannedProviderRequests: number;
      fleetSequentialPlannedProviderRequests: number;
      offlineReferenceOnly: boolean;
    };

/**
 * Validates planner-derived budgets before any provider dispatch.
 * Fleet execution is strictly sequential — peak in-flight equals the per-vehicle max planned slice.
 */
export function evaluateFsdP6cProviderBudgetGuardV1(
  planReport: FsdP6cFleetDiscoveryPlanReportV1,
): FsdP6cProviderBudgetGuardResultV1 {
  const peakInFlight = planReport.peakInFlightProviderRequests;
  const cumulative = planReport.fleetCumulativePlannedProviderRequests;
  const offlineReferenceOnly = planReport.planBinding === 'OFFLINE_REFERENCE';

  if (planReport.anyCatalogPending) {
    return {
      ok: false,
      reason: 'CATALOG_PENDING',
      peakInFlightProviderRequests: peakInFlight,
      fleetCumulativePlannedProviderRequests: cumulative,
      fleetSequentialPlannedProviderRequests: cumulative,
      offlineReferenceOnly,
    };
  }

  if (!planReport.allExecutable) {
    return {
      ok: false,
      reason: 'NON_EXECUTABLE_VEHICLE_PLAN',
      peakInFlightProviderRequests: peakInFlight,
      fleetCumulativePlannedProviderRequests: cumulative,
      fleetSequentialPlannedProviderRequests: cumulative,
      offlineReferenceOnly,
    };
  }

  if (planReport.planCompleteness !== 'FULL') {
    return {
      ok: false,
      reason: 'PLAN_NOT_FULL',
      peakInFlightProviderRequests: peakInFlight,
      fleetCumulativePlannedProviderRequests: cumulative,
      fleetSequentialPlannedProviderRequests: cumulative,
      offlineReferenceOnly,
    };
  }

  if (planReport.budget.maxRequestsPerRun > FSD_P6C_MAX_REQUESTS_PER_RUN_HARD_CEILING_V1) {
    return {
      ok: false,
      reason: 'PER_RUN_BUDGET_EXCEEDS_HARD_CEILING',
      peakInFlightProviderRequests: peakInFlight,
      fleetCumulativePlannedProviderRequests: cumulative,
      fleetSequentialPlannedProviderRequests: cumulative,
      offlineReferenceOnly,
    };
  }

  if (peakInFlight > planReport.budget.maxRequestsPerRun) {
    return {
      ok: false,
      reason: 'PEAK_IN_FLIGHT_EXCEEDS_PER_RUN_BUDGET',
      peakInFlightProviderRequests: peakInFlight,
      fleetCumulativePlannedProviderRequests: cumulative,
      fleetSequentialPlannedProviderRequests: cumulative,
      offlineReferenceOnly,
    };
  }

  const notes = [
    'Fleet runs vehicles sequentially; global PM2 FSD flags remain unchanged.',
    `Fleet cumulative planned provider requests (sequential): ${cumulative} — not a binding production commitment when planBinding=OFFLINE_REFERENCE.`,
    `Peak parallel in-flight provider requests (configured): ${peakInFlight} (must stay within per-run budget ${planReport.budget.maxRequestsPerRun}).`,
    `Max planned provider requests per vehicle (sequential phases): ${planReport.maxPlannedProviderRequestsPerVehicle}.`,
    `DIMO documented Core rate reference: ${FSD_P6C_DIMO_DOCUMENTED_RATE_PER_SECOND_V1} req/s — operator admission limiter may still throttle.`,
  ];
  if (offlineReferenceOnly) {
    notes.push('OFFLINE_REFERENCE plan only — recompute after live catalog for production.');
  }

  return {
    ok: true,
    peakInFlightProviderRequests: peakInFlight,
    fleetCumulativePlannedProviderRequests: cumulative,
    fleetSequentialPlannedProviderRequests: cumulative,
    offlineReferenceOnly,
    notes,
  };
}

export function assertFsdP6cProviderBudgetGuardV1(planReport: FsdP6cFleetDiscoveryPlanReportV1): void {
  const result = evaluateFsdP6cProviderBudgetGuardV1(planReport);
  if (!result.ok) {
    throw new Error(`FSD_P6C_PROVIDER_BUDGET_GUARD_${result.reason}`);
  }
}
