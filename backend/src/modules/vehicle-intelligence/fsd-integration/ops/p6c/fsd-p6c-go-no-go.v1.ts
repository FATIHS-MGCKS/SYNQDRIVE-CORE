import type { FsdP6cFleetDiscoveryPlanReportV1 } from './fsd-p6c-fleet-plan.v1';
import type { FsdP6cProviderBudgetGuardResultV1 } from './fsd-p6c-provider-budget-guard.v1';

export type FsdP6cLiveTestGoNoGoV1 = {
  decision: 'GO' | 'NO_GO';
  reasons: string[];
  planReport: Pick<
    FsdP6cFleetDiscoveryPlanReportV1,
  'allExecutable' | 'fleetSequentialPlannedProviderRequests' | 'budget' | 'historicalWindow'
  >;
  providerBudgetGuard: FsdP6cProviderBudgetGuardResultV1;
  stop: 'AWAIT_CHATGPT_REVIEW';
};

export function buildFsdP6cLiveTestGoNoGoV1(input: {
  planReport: FsdP6cFleetDiscoveryPlanReportV1;
  providerBudgetGuard: FsdP6cProviderBudgetGuardResultV1;
  /** When false, always NO_GO (e.g. missing owner authorization env on EXECUTE path). */
  ownerAuthorizationSatisfied: boolean;
}): FsdP6cLiveTestGoNoGoV1 {
  const reasons: string[] = [];
  if (!input.planReport.allExecutable) {
    reasons.push('At least one vehicle plan is not executable under the configured budget.');
  }
  if (!input.providerBudgetGuard.ok) {
    reasons.push(`Provider budget guard failed: ${input.providerBudgetGuard.reason}.`);
  }
  if (!input.ownerAuthorizationSatisfied) {
    reasons.push('Owner live authorization env not set for production DIMO dispatch.');
  }
  reasons.push('External ChatGPT/architecture review gate (STOP=AWAIT_CHATGPT_REVIEW) must clear before live execute.');

  const decision =
    input.planReport.allExecutable && input.providerBudgetGuard.ok && input.ownerAuthorizationSatisfied
      ? 'GO'
      : 'NO_GO';

  return {
    decision,
    reasons,
    planReport: {
      allExecutable: input.planReport.allExecutable,
      fleetSequentialPlannedProviderRequests: input.planReport.fleetSequentialPlannedProviderRequests,
      budget: input.planReport.budget,
      historicalWindow: input.planReport.historicalWindow,
    },
    providerBudgetGuard: input.providerBudgetGuard,
    stop: 'AWAIT_CHATGPT_REVIEW',
  };
}
