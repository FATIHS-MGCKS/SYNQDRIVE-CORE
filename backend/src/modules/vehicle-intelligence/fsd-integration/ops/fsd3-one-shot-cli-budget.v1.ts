import {
  createDefaultFsdBudgetConfigV1,
  normalizeFsdBudgetConfigV1,
  type FsdBudgetConfigV1,
} from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';

/** P6B V1 hard cap — no CLI override above this. */
export const FSD3_P6B_CLI_BUDGET_V1: FsdBudgetConfigV1 = normalizeFsdBudgetConfigV1({
  maxRequestsPerRun: 2,
  maxSnapshotFieldsPerDocument: 26,
  maxResponseBytes: 524_288,
  maxHistoricalWindowSeconds: 3600,
  maxHistoricalFloatFieldsPerChunk: 8,
});

export function assertBudgetMatchesP6bCliCap(budget: FsdBudgetConfigV1): void {
  const normalized = normalizeFsdBudgetConfigV1(budget);
  const cap = FSD3_P6B_CLI_BUDGET_V1;
  if (
    normalized.maxRequestsPerRun !== cap.maxRequestsPerRun ||
    normalized.maxSnapshotFieldsPerDocument !== cap.maxSnapshotFieldsPerDocument ||
    normalized.maxResponseBytes !== cap.maxResponseBytes ||
    normalized.maxHistoricalFloatFieldsPerChunk !== cap.maxHistoricalFloatFieldsPerChunk
  ) {
    throw new Error('FSD3_P6B_BUDGET_MISMATCH');
  }
}

export function p6bCliDiscoveryBudget(): FsdBudgetConfigV1 {
  return { ...FSD3_P6B_CLI_BUDGET_V1 };
}
