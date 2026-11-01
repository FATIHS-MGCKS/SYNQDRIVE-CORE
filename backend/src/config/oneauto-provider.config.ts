import { registerAs } from '@nestjs/config';

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Per-SKU indicative list prices (minor units). Execution blocked when unset for a SKU. */
function loadSkuPriceMinorMap(): Record<string, number> {
  const out: Record<string, number> = {};
  const prefix = 'ONEAUTO_INDICATIVE_PRICE_';
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith(prefix) || !key.endsWith('_MINOR')) continue;
    const sku = key.slice(prefix.length, -'_MINOR'.length);
    const n = Number.parseInt(String(value), 10);
    if (Number.isFinite(n) && n >= 0) out[sku] = n;
  }
  return out;
}

/**
 * One Auto API provider integration (Master Admin P1).
 * Default OFF — no outbound paid calls without ONEAUTO_ENABLED=true and explicit cost confirmation.
 */
export default registerAs('oneautoProvider', () => ({
  enabled: (process.env.ONEAUTO_ENABLED ?? 'false') === 'true',
  sandbox: (process.env.ONEAUTO_SANDBOX ?? 'true') === 'true',
  apiKeyPresent: Boolean(process.env.ONEAUTO_API_KEY?.trim()),
  baseUrl:
    process.env.ONEAUTO_BASE_URL?.trim() ||
    ((process.env.ONEAUTO_SANDBOX ?? 'true') === 'true'
      ? 'https://sandbox.oneautoapi.com'
      : 'https://api.oneautoapi.com'),
  requestTimeoutMs: intEnv('ONEAUTO_REQUEST_TIMEOUT_MS', 30_000),
  maxRetries: intEnv('ONEAUTO_MAX_RETRIES', 0),
  orgDailyBudgetMinor: intEnv('ONEAUTO_ORG_DAILY_BUDGET_MINOR', 0),
  quoteTtlMs: intEnv('ONEAUTO_QUOTE_TTL_MS', 5 * 60_000),
  jobTtlMs: intEnv('ONEAUTO_JOB_TTL_MS', 24 * 60 * 60_000),
  indicativePriceMinorBySku: loadSkuPriceMinorMap(),
  pricingCatalogVersion: process.env.ONEAUTO_PRICING_CATALOG_VERSION?.trim() || 'synqdrive-catalog-v1',
  maxPollAttempts: intEnv('ONEAUTO_MAX_POLL_ATTEMPTS', 12),
  pollIntervalMs: intEnv('ONEAUTO_POLL_INTERVAL_MS', 5_000),
  /** Hard cap on provider response bytes read into memory (fail closed when exceeded). */
  maxResponseBytes: intEnv('ONEAUTO_MAX_RESPONSE_BYTES', 1_048_576),
}));
