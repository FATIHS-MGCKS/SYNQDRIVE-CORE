import { CORE_APP_M2M_MAX_TTL_SECONDS } from './core-app-m2m.constants';

export function isCoreAppM2mEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CORE_APP_M2M_ENABLED?.trim().toLowerCase() === 'true';
}

export function resolveCoreAppM2mSigningSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const dedicated = env.CORE_APP_M2M_SIGNING_SECRET?.trim();
  if (!dedicated) {
    return null;
  }
  return dedicated;
}

export function assertCoreAppM2mSigningSecretWhenEnabled(env: NodeJS.ProcessEnv = process.env): void {
  if (!isCoreAppM2mEnabled(env)) {
    return;
  }
  const secret = resolveCoreAppM2mSigningSecret(env);
  if (!secret) {
    throw new Error(
      'CORE_APP_M2M_ENABLED=true requires CORE_APP_M2M_SIGNING_SECRET (must not reuse JWT_SECRET).',
    );
  }
}

export function resolveCoreAppM2mTokenTtlSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.CORE_APP_M2M_TOKEN_TTL_SECONDS ?? '');
  if (Number.isFinite(raw) && raw > 0 && raw <= CORE_APP_M2M_MAX_TTL_SECONDS) {
    return raw;
  }
  return CORE_APP_M2M_MAX_TTL_SECONDS;
}
