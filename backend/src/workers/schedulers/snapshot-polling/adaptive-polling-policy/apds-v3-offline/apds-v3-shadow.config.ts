export const APDS_V3_SHADOW_ACTIVATION_VERSION = 'APDS_V3_SHADOW_ACTIVATION_V1' as const;

const TRUTHY = new Set(['true', '1', 'yes']);

export function isApdsV3ShadowKillSwitchEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.WORKER_APDS_V3_SHADOW_ENABLED?.trim().toLowerCase();
  return raw != null && TRUTHY.has(raw);
}

export function resolveApdsV3ShadowActivationVersion(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const v = env.WORKER_APDS_V3_SHADOW_ACTIVATION_VERSION?.trim();
  if (!v) return null;
  return v;
}

export function isApdsV3ShadowRuntimeReady(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isApdsV3ShadowKillSwitchEnabled(env)) return false;
  return resolveApdsV3ShadowActivationVersion(env) === APDS_V3_SHADOW_ACTIVATION_VERSION;
}

export function apdsV3ShadowMaxWritesPerMinute(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const parsed = parseInt(env.WORKER_APDS_V3_SHADOW_MAX_WRITES_PER_MINUTE ?? '600', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 600;
}
