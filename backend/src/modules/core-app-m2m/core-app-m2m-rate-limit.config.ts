/**
 * Distributed M2M rate limits (P3-PR11C). Env-configurable; defaults are non-production activations.
 */
const DEFAULT_EXCHANGE_MAX = 20;
const DEFAULT_EXCHANGE_WINDOW_MS = 60_000;
const DEFAULT_VEHICLE_LIST_MAX = 120;
const DEFAULT_VEHICLE_DETAIL_MAX = 60;
const DEFAULT_VEHICLE_WINDOW_MS = 60_000;

function positiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = Number(env[name] ?? '');
  if (Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return fallback;
}

export function resolveCoreAppM2mExchangeRateLimitMax(env: NodeJS.ProcessEnv = process.env): number {
  return positiveInt(env, 'CORE_APP_M2M_EXCHANGE_RATE_LIMIT_MAX', DEFAULT_EXCHANGE_MAX);
}

export function resolveCoreAppM2mExchangeRateLimitWindowMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return positiveInt(env, 'CORE_APP_M2M_EXCHANGE_RATE_LIMIT_WINDOW_MS', DEFAULT_EXCHANGE_WINDOW_MS);
}

export function resolveCoreAppM2mVehicleListRateLimitMax(env: NodeJS.ProcessEnv = process.env): number {
  return positiveInt(env, 'CORE_APP_M2M_VEHICLE_READ_LIST_RATE_LIMIT_MAX', DEFAULT_VEHICLE_LIST_MAX);
}

export function resolveCoreAppM2mVehicleDetailRateLimitMax(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return positiveInt(env, 'CORE_APP_M2M_VEHICLE_READ_DETAIL_RATE_LIMIT_MAX', DEFAULT_VEHICLE_DETAIL_MAX);
}

export function resolveCoreAppM2mVehicleRateLimitWindowMs(env: NodeJS.ProcessEnv = process.env): number {
  return positiveInt(env, 'CORE_APP_M2M_VEHICLE_READ_RATE_LIMIT_WINDOW_MS', DEFAULT_VEHICLE_WINDOW_MS);
}