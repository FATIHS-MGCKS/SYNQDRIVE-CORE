export type OneAutoRuntimeBudgetCfg = {
  enabled?: boolean;
  orgDailyBudgetMinor?: number;
};

/**
 * When the provider is enabled, outbound execution requires a positive finite org daily budget cap.
 * Disabled installations (default) are unaffected.
 */
export function assertOneAutoPositiveOrgBudgetWhenEnabled(cfg: OneAutoRuntimeBudgetCfg): void {
  if (cfg.enabled !== true) return;
  const cap = cfg.orgDailyBudgetMinor ?? 0;
  if (!Number.isFinite(cap) || cap <= 0) {
    throw Object.assign(new Error('One Auto org daily budget must be configured when provider is enabled'), {
      code: 'ONEAUTO_BUDGET_NOT_CONFIGURED',
    });
  }
}
