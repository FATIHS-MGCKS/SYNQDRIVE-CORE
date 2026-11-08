import {
  createDefaultFsdBudgetConfigV1,
  normalizeFsdBudgetConfigV1,
  validateHistoricalWindowForPlanning,
  type FsdBudgetConfigV1,
} from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';
import type { FsdHistoricalWindowV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-query-document.builder.v1';
import type { FsdP6cFleetManifestV1 } from './fsd-p6c-fleet-manifest.v1';

/** Hard ceiling for P6C per-run provider slots — fail-closed above this (no unlimited runs). */
export const FSD_P6C_MAX_REQUESTS_PER_RUN_HARD_CEILING_V1 = 64;

const parseBoundedIntEnv = (raw: string | undefined, fallback: number, max: number): number => {
  if (!raw?.trim()) {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return Math.min(n, max);
};

export function resolveFsdP6cMaxRequestsPerRunCeilingV1(env: NodeJS.ProcessEnv = process.env): number {
  return parseBoundedIntEnv(
    env.FSD_P6C_MAX_REQUESTS_PER_RUN_CEILING,
    createDefaultFsdBudgetConfigV1().maxRequestsPerRun,
    FSD_P6C_MAX_REQUESTS_PER_RUN_HARD_CEILING_V1,
  );
}

export function resolveP6cCliBudgetFromManifest(manifest: FsdP6cFleetManifestV1): FsdBudgetConfigV1 {
  const ceiling = resolveFsdP6cMaxRequestsPerRunCeilingV1();
  const normalized = normalizeFsdBudgetConfigV1(manifest.budget);
  if (normalized.maxRequestsPerRun > ceiling) {
    throw new Error('FSD_P6C_BUDGET_EXCEEDS_CEILING');
  }
  if (normalized.maxRequestsPerRun > FSD_P6C_MAX_REQUESTS_PER_RUN_HARD_CEILING_V1) {
    throw new Error('FSD_P6C_BUDGET_EXCEEDS_HARD_CEILING');
  }
  return normalized;
}

export function assertP6cHistoricalWindowAdmissibleV1(input: {
  window: FsdHistoricalWindowV1;
  budget: FsdBudgetConfigV1;
}): void {
  const duration = validateHistoricalWindowForPlanning(input.window, input.budget);
  if (!duration.ok) {
    throw new Error(`FSD_P6C_HISTORICAL_WINDOW_${duration.reason}`);
  }
}
