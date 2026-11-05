import { ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU } from './service-history/oneauto-service-history-eu.types';

export const ONEAUTO_E1_SERVICE_HISTORY_TEST_ORG_IDS_ENV =
  'ONEAUTO_E1_SERVICE_HISTORY_TEST_ORG_IDS' as const;

export const ONEAUTO_E1_SERVICE_HISTORY_TEST_ORG_BUDGET_CAP_MINOR_ENV =
  'ONEAUTO_E1_SERVICE_HISTORY_TEST_ORG_BUDGET_CAP_MINOR' as const;

export type OneAutoOrgBudgetAllowanceCfg = {
  orgDailyBudgetMinor?: number;
  e1ServiceHistoryTestOrgIds?: string[];
  e1ServiceHistoryTestOrgBudgetCapMinor?: number;
};

function parseCsvOrgIds(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadE1ServiceHistoryTestOrgIdsFromEnv(): string[] {
  return parseCsvOrgIds(process.env[ONEAUTO_E1_SERVICE_HISTORY_TEST_ORG_IDS_ENV]);
}

export function loadE1ServiceHistoryTestOrgBudgetCapMinorFromEnv(): number | undefined {
  const raw = process.env[ONEAUTO_E1_SERVICE_HISTORY_TEST_ORG_BUDGET_CAP_MINOR_ENV]?.trim();
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Raises the effective daily cap only for allowlisted orgs executing OE_SERVICE_HISTORY_EU —
 * supports Master test orgs on a 100-minor platform cap without changing global limits.
 */
export function resolveEffectiveOrgDailyBudgetMinor(input: {
  organizationId: string;
  serviceSku: string;
  cfg: OneAutoOrgBudgetAllowanceCfg;
}): number {
  const base = input.cfg.orgDailyBudgetMinor ?? 0;
  if (input.serviceSku !== ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU) {
    return base;
  }
  const allowlist = input.cfg.e1ServiceHistoryTestOrgIds ?? [];
  const capOverride = input.cfg.e1ServiceHistoryTestOrgBudgetCapMinor;
  if (!allowlist.includes(input.organizationId) || capOverride == null) {
    return base;
  }
  return Math.max(base, capOverride);
}
