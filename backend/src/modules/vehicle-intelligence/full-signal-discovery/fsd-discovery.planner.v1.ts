import {
  createDefaultFsdBudgetConfigV1,
  type FsdBudgetConfigV1,
  type FsdBudgetValidationFailureReasonV1,
  type FsdBudgetValidationResultV1,
  normalizeFsdBudgetConfigV1,
  resolveMaxSnapshotDocumentsFromRemainingBudget,
  resolveRemainingHistoricalRequestBudget,
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

export type FsdFullDiscoveryNonExecutableReasonV1 =
  | 'REQUEST_BUDGET_EXCEEDED'
  | 'INSUFFICIENT_REQUEST_BUDGET_FOR_CATALOG'
  | 'HISTORICAL_WINDOW_TOO_LONG'
  | 'HISTORICAL_WINDOW_INVALID';

function mapHistoricalBudgetFailureToNonExecutableReason(
  reason: FsdBudgetValidationFailureReasonV1,
): FsdFullDiscoveryNonExecutableReasonV1 {
  if (reason === 'HISTORICAL_WINDOW_TOO_LONG') {
    return 'HISTORICAL_WINDOW_TOO_LONG';
  }
  if (reason === 'HISTORICAL_WINDOW_INVALID') {
    return 'HISTORICAL_WINDOW_INVALID';
  }
  return 'REQUEST_BUDGET_EXCEEDED';
}

export type FsdFullDiscoveryPlanV1 = {
  /** When false, snapshot.documents and historical chunks must be treated as non-executable. */
  executable: boolean;
  nonExecutableReason?: FsdFullDiscoveryNonExecutableReasonV1;
  declaredFieldNames: string[];
  classifiedCount: number;
  catalogReservedRequestSlots: number;
  snapshot: FsdSnapshotPlanV1;
  historical: FsdHistoricalPlanV1 | null;
  /** Count of provider requests that would execute when executable=true. */
  executableProviderRequestCount: number;
  /** Catalog + snapshot docs + historical chunks (planning arithmetic). */
  totalPlannedProviderRequests: number;
  budgetValidation: FsdBudgetValidationResultV1;
  deferredByBudget: string[];
};

function emptyHistoricalPlan(window: FsdHistoricalWindowV1): FsdHistoricalPlanV1 {
  return {
    window,
    windowSeconds: 0,
    expectedBucketPositions: 0,
    chunks: [],
    catalogSignals: [],
    deferredSignals: [],
    budgetValidation: { ok: true, plannedRequestCount: 0 },
  };
}

function buildNonExecutableFullPlan(input: {
  declaredFieldNames: string[];
  classifiedCount: number;
  snapshot: FsdSnapshotPlanV1;
  historical: FsdHistoricalPlanV1 | null;
  totalPlannedProviderRequests: number;
  budgetValidation: FsdBudgetValidationResultV1;
  deferredByBudget: string[];
  reason: FsdFullDiscoveryNonExecutableReasonV1;
}): FsdFullDiscoveryPlanV1 {
  return {
    executable: false,
    nonExecutableReason: input.reason,
    declaredFieldNames: input.declaredFieldNames,
    classifiedCount: input.classifiedCount,
    catalogReservedRequestSlots: FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1,
    snapshot: {
      documents: [],
      catalogSignals: input.snapshot.catalogSignals,
      deferredSignals: input.snapshot.deferredSignals,
    },
    historical: input.historical
      ? {
          ...input.historical,
          chunks: [],
        }
      : null,
    executableProviderRequestCount: 0,
    totalPlannedProviderRequests: input.totalPlannedProviderRequests,
    budgetValidation: input.budgetValidation,
    deferredByBudget: input.deferredByBudget,
  };
}

export function planFsdFullSignalDiscoveryV1(input: {
  tokenId: number;
  declaredFieldNames: readonly string[];
  historicalWindow?: FsdHistoricalWindowV1;
  budget?: FsdBudgetConfigV1;
}): FsdFullDiscoveryPlanV1 {
  const budget = normalizeFsdBudgetConfigV1(input.budget ?? createDefaultFsdBudgetConfigV1());
  const declaredFieldNames = normalizeDeclaredFieldNames(input.declaredFieldNames);
  const classified = classifyDeclaredFsdSignals(declaredFieldNames);

  if (budget.maxRequestsPerRun < FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1) {
    const budgetValidation: FsdBudgetValidationResultV1 = {
      ok: false,
      reason: 'REQUEST_BUDGET_EXCEEDED',
      plannedRequestCount: FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1,
      limit: budget.maxRequestsPerRun,
    };
    return buildNonExecutableFullPlan({
      declaredFieldNames,
      classifiedCount: classified.length,
      snapshot: { documents: [], catalogSignals: [], deferredSignals: [] },
      historical: input.historicalWindow ? emptyHistoricalPlan(input.historicalWindow) : null,
      totalPlannedProviderRequests: FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1,
      budgetValidation,
      deferredByBudget: declaredFieldNames,
      reason: 'INSUFFICIENT_REQUEST_BUDGET_FOR_CATALOG',
    });
  }

  const maxSnapshotDocuments = resolveMaxSnapshotDocumentsFromRemainingBudget(
    budget.maxRequestsPerRun - FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1,
  );

  const snapshot = planFsdSnapshotQueries({
    tokenId: input.tokenId,
    declaredFieldNames,
    budget,
    maxSnapshotDocuments,
  });

  const remainingHistoricalBudget = resolveRemainingHistoricalRequestBudget({
    maxRequestsPerRun: budget.maxRequestsPerRun,
    catalogReservedSlots: FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1,
    snapshotDocumentCount: snapshot.documents.length,
  });

  let historical: FsdHistoricalPlanV1 | null = null;
  const deferredByBudget: string[] = snapshot.deferredSignals.map((s) => s.fieldName);

  if (input.historicalWindow) {
    historical = planFsdHistoricalQueries({
      tokenId: input.tokenId,
      declaredFieldNames,
      window: input.historicalWindow,
      budget,
      maxPlannedHistoricalRequests: remainingHistoricalBudget,
      isolateSpeedSignal: true,
    });
    if (!historical.budgetValidation.ok) {
      const sortedDeferredOnWindowFailure = [...new Set(deferredByBudget)].sort((a, b) =>
        a.localeCompare(b),
      );
      return buildNonExecutableFullPlan({
        declaredFieldNames,
        classifiedCount: classified.length,
        snapshot,
        historical,
        totalPlannedProviderRequests:
          FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1 + snapshot.documents.length,
        budgetValidation: historical.budgetValidation,
        deferredByBudget: sortedDeferredOnWindowFailure,
        reason: mapHistoricalBudgetFailureToNonExecutableReason(
          historical.budgetValidation.reason,
        ),
      });
    }
    deferredByBudget.push(...historical.deferredSignals.map((s) => s.fieldName));
    if (remainingHistoricalBudget <= 0) {
      deferredByBudget.push(
        ...classified
          .filter((c) => c.historicalAggregationSupported && c.shape !== 'UNKNOWN')
          .map((c) => c.fieldName),
      );
    }
  }

  const totalPlannedProviderRequests =
    FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1 +
    snapshot.documents.length +
    (historical?.chunks.length ?? 0);

  const budgetValidation = validatePlannedRequestCount(totalPlannedProviderRequests, budget);
  const sortedDeferred = [...new Set(deferredByBudget)].sort((a, b) => a.localeCompare(b));

  if (!budgetValidation.ok) {
    return buildNonExecutableFullPlan({
      declaredFieldNames,
      classifiedCount: classified.length,
      snapshot,
      historical,
      totalPlannedProviderRequests,
      budgetValidation,
      deferredByBudget: sortedDeferred,
      reason: 'REQUEST_BUDGET_EXCEEDED',
    });
  }

  return {
    executable: true,
    declaredFieldNames,
    classifiedCount: classified.length,
    catalogReservedRequestSlots: FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1,
    snapshot,
    historical,
    executableProviderRequestCount: totalPlannedProviderRequests,
    totalPlannedProviderRequests,
    budgetValidation,
    deferredByBudget: sortedDeferred,
  };
}
