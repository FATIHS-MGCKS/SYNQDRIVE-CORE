import { CORE_APP_M2M_MAX_TTL_SECONDS } from './core-app-m2m.constants';

export function isCoreAppM2mEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CORE_APP_M2M_ENABLED?.trim().toLowerCase() === 'true';
}

/** Explicit operator attestation only — never implied by CORE_APP_M2M_ENABLED alone. */
export function isCoreAppM2mProductionReady(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isCoreAppM2mEnabled(env)) {
    return false;
  }
  return env.CORE_APP_M2M_PRODUCTION_READY?.trim().toLowerCase() === 'true';
}

export function resolveCoreAppM2mSigningSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const dedicated = env.CORE_APP_M2M_SIGNING_SECRET?.trim();
  if (!dedicated) {
    return null;
  }
  return dedicated;
}

const MIN_M2M_SIGNING_SECRET_LENGTH = 32;

export function validateCoreAppM2mSigningSecretIsolation(env: NodeJS.ProcessEnv = process.env): void {
  if (!isCoreAppM2mEnabled(env)) {
    return;
  }
  const secret = resolveCoreAppM2mSigningSecret(env);
  if (!secret) {
    throw new Error(
      'CORE_APP_M2M_ENABLED=true requires CORE_APP_M2M_SIGNING_SECRET (must not reuse JWT_SECRET).',
    );
  }
  if (secret.length < MIN_M2M_SIGNING_SECRET_LENGTH) {
    throw new Error(
      `CORE_APP_M2M_SIGNING_SECRET must be at least ${MIN_M2M_SIGNING_SECRET_LENGTH} characters when M2M is enabled.`,
    );
  }
  const jwtSecret = env.JWT_SECRET?.trim();
  if (jwtSecret && secret === jwtSecret) {
    throw new Error('CORE_APP_M2M_SIGNING_SECRET must not equal JWT_SECRET.');
  }
  const voiceSecret = env.VOICE_MCP_TOKEN_SECRET?.trim();
  if (voiceSecret && secret === voiceSecret) {
    throw new Error('CORE_APP_M2M_SIGNING_SECRET must not reuse VOICE_MCP_TOKEN_SECRET.');
  }
}

export function assertCoreAppM2mSigningSecretWhenEnabled(env: NodeJS.ProcessEnv = process.env): void {
  validateCoreAppM2mSigningSecretIsolation(env);
}

export function resolveCoreAppM2mTokenTtlSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.CORE_APP_M2M_TOKEN_TTL_SECONDS ?? '');
  if (Number.isFinite(raw) && raw > 0 && raw <= CORE_APP_M2M_MAX_TTL_SECONDS) {
    return raw;
  }
  return CORE_APP_M2M_MAX_TTL_SECONDS;
}
