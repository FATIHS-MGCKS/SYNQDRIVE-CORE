export const CORE_APP_SERVICE_TOKEN_TYPE = 'core_app_service' as const;

export const CORE_APP_M2M_ISSUER = 'synqdrive-core-app-m2m' as const;

export const CORE_APP_M2M_AUDIENCE = 'synqdrive-core-api' as const;

export const CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ = 'core:entitlements:read' as const;

/** P1B-PR1 allowlist — extend only via explicit owner-approved PRs. */
export const CORE_APP_M2M_ALLOWED_SCOPES = [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ] as const;

export type CoreAppM2mAllowedScope = (typeof CORE_APP_M2M_ALLOWED_SCOPES)[number];

export const CORE_APP_M2M_MAX_TTL_SECONDS = 300;

export const CORE_APP_M2M_EXCHANGE_PATH = '/api/v1/auth/core-app/token';
