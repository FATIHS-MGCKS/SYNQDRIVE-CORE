import { registerAs } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { assertCoreAppM2mSigningSecretWhenEnabled } from '@modules/core-app-m2m/core-app-m2m.config';

export default registerAs('app', () => {
  const logger = new Logger('AppConfig');
  const nodeEnv = process.env.NODE_ENV || 'development';

  // JWT_SECRET is required in all environments — fail fast if absent
  assertCoreAppM2mSigningSecretWhenEnabled(process.env);

  if (!process.env.JWT_SECRET) {
    const msg = 'FATAL: JWT_SECRET environment variable is not set. The application will not start without a configured JWT secret.';
    logger.error(msg);
    throw new Error(msg);
  }

  const enableSeedAdmin = process.env.ENABLE_SEED_ADMIN === 'true';
  const seedAdminToken = process.env.SEED_ADMIN_TOKEN ?? '';

  if (enableSeedAdmin && !seedAdminToken) {
    logger.warn('ENABLE_SEED_ADMIN=true but SEED_ADMIN_TOKEN is not set. The seed-admin endpoint will be disabled until SEED_ADMIN_TOKEN is configured.');
  }

  // CORS origins: comma-separated list, e.g. "https://app.synqdrive.io,https://admin.synqdrive.io"
  const corsOrigins: string[] = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // In development, always allow localhost origins
  if (nodeEnv === 'development') {
    ['http://localhost:3000', 'http://localhost:5173'].forEach((o) => {
      if (!corsOrigins.includes(o)) corsOrigins.push(o);
    });
  }

  const swaggerEnabled = resolveSwaggerEnabled(nodeEnv);

  return {
    nodeEnv,
    port: parseInt(process.env.PORT || '3001', 10),
    apiPrefix: process.env.API_PREFIX || 'api',
    apiVersion: process.env.API_VERSION || 'v1',
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    enableSeedAdmin,
    seedAdminToken,
    corsOrigins,
    swaggerEnabled,
  };
});

/**
 * Swagger/OpenAPI UI exposure.
 *
 * Precedence:
 *   1. `SWAGGER_ENABLED=true|false` — explicit override (any NODE_ENV).
 *   2. Unset — enabled in non-production, disabled when NODE_ENV=production.
 */
export function resolveSwaggerEnabled(nodeEnv: string): boolean {
  const raw = (process.env.SWAGGER_ENABLED || '').trim().toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return nodeEnv !== 'production';
}
