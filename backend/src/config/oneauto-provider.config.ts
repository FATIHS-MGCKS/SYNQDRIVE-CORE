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
  /** Conservative provider KB default (24h) — not attested as charge-free re-query. */
  providerResultRetentionMs: intEnv('ONEAUTO_PROVIDER_RESULT_RETENTION_MS', 24 * 60 * 60_000),
  indicativePriceMinorBySku: loadSkuPriceMinorMap(),
  pricingCatalogVersion: process.env.ONEAUTO_PRICING_CATALOG_VERSION?.trim() || 'synqdrive-catalog-v1',
  maxPollAttempts: intEnv('ONEAUTO_MAX_POLL_ATTEMPTS', 12),
  pollIntervalMs: intEnv('ONEAUTO_POLL_INTERVAL_MS', 5_000),
  /** Hard cap on provider response bytes read into memory (fail closed when exceeded). */
  maxResponseBytes: intEnv('ONEAUTO_MAX_RESPONSE_BYTES', 1_048_576),
  /** PR-C2: persist immutable OEM vinlookup suggestion snapshots after successful OE_VIN_LOOKUP_EU jobs. */
  oemSuggestionsEnabled: (process.env.ONEAUTO_OEM_SUGGESTIONS_ENABLED ?? 'false') === 'true',
  oemSuggestionsCleanupBatchSize: intEnv('ONEAUTO_OEM_SUGGESTIONS_CLEANUP_BATCH_SIZE', 100),
  oemSuggestionsRecoveryBatchSize: intEnv('ONEAUTO_OEM_SUGGESTIONS_RECOVERY_BATCH_SIZE', 25),
  /** PR3: register callback_url on initial dispatch — default OFF (no live activation). */
  callbackEnabled: (process.env.ONEAUTO_CALLBACK_ENABLED ?? 'false') === 'true',
  /** PR3: allow exactly one retrieval GET after provider callback — default OFF. */
  callbackRetrievalGetEnabled:
    (process.env.ONEAUTO_CALLBACK_RETRIEVAL_GET_ENABLED ?? 'false') === 'true',
  /** When true, set return_data_in_callback on dispatch (not attested — keep false). */
  callbackReturnDataInCallback:
    (process.env.ONEAUTO_CALLBACK_RETURN_DATA_IN_CALLBACK ?? 'false') === 'true',
  /** Public base for callback_url registration (no trailing slash). */
  callbackPublicBaseUrl:
    process.env.ONEAUTO_CALLBACK_PUBLIC_BASE_URL?.trim() || 'https://app.synqdrive.eu/api/v1',
}));
