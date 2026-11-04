export const FSD_BUDGET_DEFAULTS_V1 = {
  MAX_REQUESTS_PER_RUN: 12,
  MAX_HISTORICAL_WINDOW_SECONDS: 3600,
  MAX_SNAPSHOT_FIELDS_PER_DOCUMENT: 26,
  MAX_HISTORICAL_FLOAT_FIELDS_PER_CHUNK: 8,
  MAX_RESPONSE_BYTES: 524_288,
} as const;

export type FsdBudgetConfigV1 = {
  maxRequestsPerRun: number;
  maxHistoricalWindowSeconds: number;
  maxSnapshotFieldsPerDocument: number;
  maxHistoricalFloatFieldsPerChunk: number;
  maxResponseBytes: number;
};

export function createDefaultFsdBudgetConfigV1(
  overrides: Partial<FsdBudgetConfigV1> = {},
): FsdBudgetConfigV1 {
  return {
    maxRequestsPerRun: overrides.maxRequestsPerRun ?? FSD_BUDGET_DEFAULTS_V1.MAX_REQUESTS_PER_RUN,
    maxHistoricalWindowSeconds:
      overrides.maxHistoricalWindowSeconds ?? FSD_BUDGET_DEFAULTS_V1.MAX_HISTORICAL_WINDOW_SECONDS,
    maxSnapshotFieldsPerDocument:
      overrides.maxSnapshotFieldsPerDocument ??
      FSD_BUDGET_DEFAULTS_V1.MAX_SNAPSHOT_FIELDS_PER_DOCUMENT,
    maxHistoricalFloatFieldsPerChunk:
      overrides.maxHistoricalFloatFieldsPerChunk ??
      FSD_BUDGET_DEFAULTS_V1.MAX_HISTORICAL_FLOAT_FIELDS_PER_CHUNK,
    maxResponseBytes: overrides.maxResponseBytes ?? FSD_BUDGET_DEFAULTS_V1.MAX_RESPONSE_BYTES,
  };
}

export type FsdBudgetValidationResultV1 =
  | { ok: true; plannedRequestCount: number }
  | {
      ok: false;
      reason: 'REQUEST_BUDGET_EXCEEDED' | 'HISTORICAL_WINDOW_TOO_LONG';
      plannedRequestCount: number;
      limit: number;
    };

export function validateHistoricalWindowAgainstBudget(
  windowSeconds: number,
  budget: FsdBudgetConfigV1,
): FsdBudgetValidationResultV1 {
  if (windowSeconds > budget.maxHistoricalWindowSeconds) {
    return {
      ok: false,
      reason: 'HISTORICAL_WINDOW_TOO_LONG',
      plannedRequestCount: 0,
      limit: budget.maxHistoricalWindowSeconds,
    };
  }
  return { ok: true, plannedRequestCount: 0 };
}

export function validatePlannedRequestCount(
  plannedRequestCount: number,
  budget: FsdBudgetConfigV1,
): FsdBudgetValidationResultV1 {
  if (plannedRequestCount > budget.maxRequestsPerRun) {
    return {
      ok: false,
      reason: 'REQUEST_BUDGET_EXCEEDED',
      plannedRequestCount,
      limit: budget.maxRequestsPerRun,
    };
  }
  return { ok: true, plannedRequestCount };
}

/** Non-negative finite document/request slot budget (guards negative and overflow inputs). */
export function sanitizeNonNegativeRequestBudget(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  return Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER);
}

export function resolveMaxSnapshotDocumentsFromRemainingBudget(
  remainingAfterCatalogSlot: number,
): number {
  return sanitizeNonNegativeRequestBudget(remainingAfterCatalogSlot);
}

export function resolveRemainingHistoricalRequestBudget(input: {
  maxRequestsPerRun: number;
  catalogReservedSlots: number;
  snapshotDocumentCount: number;
}): number {
  const remaining =
    input.maxRequestsPerRun - input.catalogReservedSlots - input.snapshotDocumentCount;
  return sanitizeNonNegativeRequestBudget(remaining);
}

/** Execution-phase ledger (contracts only — enforced in later FSD phases). */
export type FsdProviderExecutionLedgerV1 = {
  plannedRequests: number;
  executedRequests: number;
  consumedProviderAttempts: number;
  budgetAcquisitionFailures: number;
  unknownProviderOutcomes: number;
};

export function createEmptyFsdProviderExecutionLedgerV1(): FsdProviderExecutionLedgerV1 {
  return {
    plannedRequests: 0,
    executedRequests: 0,
    consumedProviderAttempts: 0,
    budgetAcquisitionFailures: 0,
    unknownProviderOutcomes: 0,
  };
}
