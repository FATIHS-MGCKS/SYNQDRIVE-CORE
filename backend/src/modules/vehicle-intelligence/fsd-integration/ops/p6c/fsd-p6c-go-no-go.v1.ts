import type { FsdP6cFleetDiscoveryPlanReportV1 } from './fsd-p6c-fleet-plan.v1';
import type { FsdP6cProviderBudgetGuardResultV1 } from './fsd-p6c-provider-budget-guard.v1';

export const SYNQDRIVE_FSD_P6C_ARCHITECTURE_REVIEW_CLEARED =
  'SYNQDRIVE_FSD_P6C_ARCHITECTURE_REVIEW_CLEARED' as const;

export type FsdP6cGoNoGoContextV1 =
  | 'OFFLINE_PLAN'
  | 'AUTHORIZED_READ_ONLY_PREFLIGHT'
  | 'EXECUTE';

export type FsdP6cLiveTestGoNoGoV1 = {
  decision: 'GO' | 'NO_GO';
  reasons: string[];
  gates: {
    allPlansExecutable: boolean;
    providerBudgetGuardOk: boolean;
    ownerAuthorizationSatisfied: boolean;
    architectureReviewCleared: boolean;
    productionManifestValid: boolean;
    noCatalogPending: boolean;
    liveExecuteContext: boolean;
    offlineReferenceOnly: boolean;
    notOfflineReferencePlan: boolean;
    planCompletenessFull: boolean;
  };
  planReport: Pick<
    FsdP6cFleetDiscoveryPlanReportV1,
    | 'allExecutable'
    | 'fleetCumulativePlannedProviderRequests'
    | 'peakInFlightProviderRequests'
    | 'budget'
    | 'historicalWindow'
    | 'planBinding'
    | 'planCompleteness'
  >;
  providerBudgetGuard: FsdP6cProviderBudgetGuardResultV1;
  stop: 'AWAIT_CHATGPT_REVIEW';
};

export function resolveFsdP6cArchitectureReviewClearedV1(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[SYNQDRIVE_FSD_P6C_ARCHITECTURE_REVIEW_CLEARED] === '1';
}

export function isFsdP6cLiveGoEligibleV1(gates: FsdP6cLiveTestGoNoGoV1['gates']): boolean {
  return (
    gates.allPlansExecutable &&
    gates.planCompletenessFull &&
    gates.providerBudgetGuardOk &&
    gates.ownerAuthorizationSatisfied &&
    gates.architectureReviewCleared &&
    gates.productionManifestValid &&
    gates.noCatalogPending &&
    gates.liveExecuteContext &&
    !gates.offlineReferenceOnly &&
    gates.notOfflineReferencePlan
  );
}

/**
 * GO only when every gate is satisfied on a live execute path.
 * Owner env alone never produces GO. Offline planner output is always NO_GO.
 */
export function buildFsdP6cLiveTestGoNoGoV1(input: {
  planReport: FsdP6cFleetDiscoveryPlanReportV1;
  providerBudgetGuard: FsdP6cProviderBudgetGuardResultV1;
  context: FsdP6cGoNoGoContextV1;
  liveProvider: 'mock' | 'dimo_live';
  ownerAuthorizationSatisfied: boolean;
  productionManifestValid: boolean;
  architectureReviewCleared: boolean;
}): FsdP6cLiveTestGoNoGoV1 {
  const reasons: string[] = [];
  const offlineReferenceOnly = input.context === 'OFFLINE_PLAN';

  if (offlineReferenceOnly) {
    reasons.push('OFFLINE_REFERENCE_PLAN — not valid production GO evidence.');
  }
  if (!input.planReport.allExecutable) {
    reasons.push('At least one vehicle plan is not executable under the configured budget.');
  }
  if (input.planReport.anyCatalogPending) {
    reasons.push('CATALOG_PENDING — declaredFieldNames missing; re-plan after live catalog fetch.');
  }
  if (input.planReport.planCompleteness !== 'FULL') {
    reasons.push(`Plan completeness is ${input.planReport.planCompleteness}, not FULL.`);
  }
  if (!input.providerBudgetGuard.ok) {
    reasons.push(`Provider budget guard failed: ${input.providerBudgetGuard.reason}.`);
  }
  if (!input.productionManifestValid) {
    reasons.push('Production manifest validation failed or not marked productionManifest=true.');
  }
  if (!input.ownerAuthorizationSatisfied) {
    reasons.push('Owner live authorization env not set for production DIMO dispatch.');
  }
  if (!input.architectureReviewCleared) {
    reasons.push('Architecture / ChatGPT review gate not cleared (STOP=AWAIT_CHATGPT_REVIEW).');
  }
  if (input.context !== 'EXECUTE' || input.liveProvider !== 'dimo_live') {
    reasons.push('GO applies only to EXECUTE with --provider=live after all other gates pass.');
  }
  if (input.planReport.planBinding === 'OFFLINE_REFERENCE') {
    reasons.push('OFFLINE_REFERENCE planBinding cannot authorize production GO.');
  }

  const gates = {
    allPlansExecutable: input.planReport.allExecutable,
    providerBudgetGuardOk: input.providerBudgetGuard.ok,
    ownerAuthorizationSatisfied: input.ownerAuthorizationSatisfied,
    architectureReviewCleared: input.architectureReviewCleared,
    productionManifestValid: input.productionManifestValid,
    noCatalogPending: !input.planReport.anyCatalogPending,
    liveExecuteContext: input.context === 'EXECUTE' && input.liveProvider === 'dimo_live',
    offlineReferenceOnly,
    notOfflineReferencePlan: input.planReport.planBinding !== 'OFFLINE_REFERENCE',
    planCompletenessFull: input.planReport.planCompleteness === 'FULL',
  };

  const decision: 'GO' | 'NO_GO' = isFsdP6cLiveGoEligibleV1(gates) ? 'GO' : 'NO_GO';

  return {
    decision,
    reasons,
    gates,
    planReport: {
      allExecutable: input.planReport.allExecutable,
      fleetCumulativePlannedProviderRequests: input.planReport.fleetCumulativePlannedProviderRequests,
      peakInFlightProviderRequests: input.planReport.peakInFlightProviderRequests,
      budget: input.planReport.budget,
      historicalWindow: input.planReport.historicalWindow,
      planBinding: input.planReport.planBinding,
      planCompleteness: input.planReport.planCompleteness,
    },
    providerBudgetGuard: input.providerBudgetGuard,
    stop: 'AWAIT_CHATGPT_REVIEW',
  };
}
