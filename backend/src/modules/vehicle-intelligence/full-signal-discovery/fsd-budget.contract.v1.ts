import { parseUtcIsoToEpochMs } from './fsd-coverage.calculator.v1';
import type { FsdHistoricalWindowV1 } from './fsd-query-document.builder.v1';

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

export type FsdBudgetValidationFailureReasonV1 =
  | 'REQUEST_BUDGET_EXCEEDED'
  | 'HISTORICAL_WINDOW_TOO_LONG'
  | 'HISTORICAL_WINDOW_INVALID';

export type FsdBudgetValidationResultV1 =
  | { ok: true; plannedRequestCount: number }
  | {
      ok: false;
      reason: FsdBudgetValidationFailureReasonV1;
      plannedRequestCount: number;
      limit: number;
    };

function sanitizeNonNegativeInt(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER);
}

function sanitizePositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER);
}

/** Deterministic normalization for planner inputs — preserves intentional zero request budgets. */
export function normalizeFsdBudgetConfigV1(input: FsdBudgetConfigV1): FsdBudgetConfigV1 {
  return {
    maxRequestsPerRun: sanitizeNonNegativeInt(input.maxRequestsPerRun),
    maxHistoricalWindowSeconds: sanitizePositiveInt(
      input.maxHistoricalWindowSeconds,
      FSD_BUDGET_DEFAULTS_V1.MAX_HISTORICAL_WINDOW_SECONDS,
    ),
    maxSnapshotFieldsPerDocument: sanitizePositiveInt(
      input.maxSnapshotFieldsPerDocument,
      FSD_BUDGET_DEFAULTS_V1.MAX_SNAPSHOT_FIELDS_PER_DOCUMENT,
    ),
    maxHistoricalFloatFieldsPerChunk: sanitizePositiveInt(
      input.maxHistoricalFloatFieldsPerChunk,
      FSD_BUDGET_DEFAULTS_V1.MAX_HISTORICAL_FLOAT_FIELDS_PER_CHUNK,
    ),
    maxResponseBytes: sanitizePositiveInt(
      input.maxResponseBytes,
      FSD_BUDGET_DEFAULTS_V1.MAX_RESPONSE_BYTES,
    ),
  };
}

export function createDefaultFsdBudgetConfigV1(
  overrides: Partial<FsdBudgetConfigV1> = {},
): FsdBudgetConfigV1 {
  return normalizeFsdBudgetConfigV1({
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
  });
}

export function validateHistoricalWindowAgainstBudget(
  windowSeconds: number,
  budget: FsdBudgetConfigV1,
): FsdBudgetValidationResultV1 {
  const normalizedBudget = normalizeFsdBudgetConfigV1(budget);
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    return {
      ok: false,
      reason: 'HISTORICAL_WINDOW_INVALID',
      plannedRequestCount: 0,
      limit: 0,
    };
  }
  if (windowSeconds > normalizedBudget.maxHistoricalWindowSeconds) {
    return {
      ok: false,
      reason: 'HISTORICAL_WINDOW_TOO_LONG',
      plannedRequestCount: 0,
      limit: normalizedBudget.maxHistoricalWindowSeconds,
    };
  }
  return { ok: true, plannedRequestCount: 0 };
}

export function validateHistoricalWindowForPlanning(
  window: FsdHistoricalWindowV1,
  budget: FsdBudgetConfigV1,
): FsdBudgetValidationResultV1 {
  let fromMs: number;
  let toMs: number;
  try {
    fromMs = parseUtcIsoToEpochMs(window.fromUtc);
    toMs = parseUtcIsoToEpochMs(window.toUtc);
  } catch {
    return {
      ok: false,
      reason: 'HISTORICAL_WINDOW_INVALID',
      plannedRequestCount: 0,
      limit: 0,
    };
  }
  if (toMs < fromMs) {
    return {
      ok: false,
      reason: 'HISTORICAL_WINDOW_INVALID',
      plannedRequestCount: 0,
      limit: 0,
    };
  }
  if (toMs === fromMs) {
    return {
      ok: false,
      reason: 'HISTORICAL_WINDOW_INVALID',
      plannedRequestCount: 0,
      limit: 0,
    };
  }
  const windowSeconds = (toMs - fromMs) / 1000;
  return validateHistoricalWindowAgainstBudget(windowSeconds, budget);
}

export function validatePlannedRequestCount(
  plannedRequestCount: number,
  budget: FsdBudgetConfigV1,
): FsdBudgetValidationResultV1 {
  const normalizedBudget = normalizeFsdBudgetConfigV1(budget);
  const safePlanned = sanitizeNonNegativeInt(plannedRequestCount);
  if (safePlanned > normalizedBudget.maxRequestsPerRun) {
    return {
      ok: false,
      reason: 'REQUEST_BUDGET_EXCEEDED',
      plannedRequestCount: safePlanned,
      limit: normalizedBudget.maxRequestsPerRun,
    };
  }
  return { ok: true, plannedRequestCount: safePlanned };
}

/** Non-negative finite document/request slot budget (guards negative and overflow inputs). */
export function sanitizeNonNegativeRequestBudget(value: number): number {
  return sanitizeNonNegativeInt(value);
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
