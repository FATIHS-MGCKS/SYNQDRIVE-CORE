import {
  createDefaultFsdBudgetConfigV1,
  type FsdBudgetConfigV1,
  validatePlannedRequestCount,
} from './fsd-budget.contract.v1';
import { normalizeDeclaredFieldNames } from './fsd-graphql-field.util.v1';
import {
  planFsdHistoricalQueries,
  type FsdHistoricalPlanV1,
} from './fsd-historical.planner.v1';
import type { FsdHistoricalWindowV1 } from './fsd-query-document.builder.v1';
import { planFsdSnapshotQueries, type FsdSnapshotPlanV1 } from './fsd-snapshot.planner.v1';
import { classifyDeclaredFsdSignals } from './fsd-signal-shape.classifier.v1';

/** One reserved provider slot for availableSignals catalog fetch (executed in later FSD phases). */
export const FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1 = 1;

export type FsdFullDiscoveryPlanV1 = {
  declaredFieldNames: string[];
  classifiedCount: number;
  catalogReservedRequestSlots: number;
  snapshot: FsdSnapshotPlanV1;
  historical: FsdHistoricalPlanV1 | null;
  totalPlannedProviderRequests: number;
  budgetValidation: ReturnType<typeof validatePlannedRequestCount>;
  deferredByBudget: string[];
};

export function planFsdFullSignalDiscoveryV1(input: {
  tokenId: number;
  declaredFieldNames: readonly string[];
  historicalWindow?: FsdHistoricalWindowV1;
  budget?: FsdBudgetConfigV1;
}): FsdFullDiscoveryPlanV1 {
  const budget = input.budget ?? createDefaultFsdBudgetConfigV1();
  const declaredFieldNames = normalizeDeclaredFieldNames(input.declaredFieldNames);
  const classified = classifyDeclaredFsdSignals(declaredFieldNames);

  const snapshot = planFsdSnapshotQueries({
    tokenId: input.tokenId,
    declaredFieldNames,
    budget,
  });

  const remainingAfterCatalogAndSnapshot =
    budget.maxRequestsPerRun -
    FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1 -
    snapshot.documents.length;

  let historical: FsdHistoricalPlanV1 | null = null;
  const deferredByBudget: string[] = snapshot.deferredSignals.map((s) => s.fieldName);

  if (input.historicalWindow && remainingAfterCatalogAndSnapshot > 0) {
    historical = planFsdHistoricalQueries({
      tokenId: input.tokenId,
      declaredFieldNames,
      window: input.historicalWindow,
      budget,
      maxPlannedHistoricalRequests: remainingAfterCatalogAndSnapshot,
      isolateSpeedSignal: true,
    });
    deferredByBudget.push(...historical.deferredSignals.map((s) => s.fieldName));
  } else if (input.historicalWindow) {
    deferredByBudget.push(
      ...classified
        .filter((c) => c.historicalAggregationSupported && c.shape !== 'UNKNOWN')
        .map((c) => c.fieldName),
    );
  }

  const totalPlannedProviderRequests =
    FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1 +
    snapshot.documents.length +
    (historical?.chunks.length ?? 0);

  const budgetValidation = validatePlannedRequestCount(totalPlannedProviderRequests, budget);

  return {
    declaredFieldNames,
    classifiedCount: classified.length,
    catalogReservedRequestSlots: FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1,
    snapshot,
    historical,
    totalPlannedProviderRequests,
    budgetValidation,
    deferredByBudget: [...new Set(deferredByBudget)].sort((a, b) => a.localeCompare(b)),
  };
}
