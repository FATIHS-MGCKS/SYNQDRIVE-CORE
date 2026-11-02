/**
 * Fail-closed guard for VSI-03 disposable PostgreSQL integration tests.
 */

const DISPOSABLE_DB_NAME_PATTERN = /^vsi03_test_[a-z0-9_]+$/i;

const FORBIDDEN_DATABASE_NAMES = new Set(
  [
    'synqdrive',
    'production',
    'prod',
    'app',
    'postgres',
    'template0',
    'template1',
  ].map((n) => n.toLowerCase()),
);

const APPROVED_LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function parsePostgresDatabaseName(databaseUrl: string): string | null {
  const base = databaseUrl.split('?')[0]?.trim() ?? '';
  const slash = base.lastIndexOf('/');
  if (slash < 0 || slash === base.length - 1) {
    return null;
  }
  const name = decodeURIComponent(base.slice(slash + 1)).trim();
  return name.length > 0 ? name : null;
}

export function parsePostgresHost(databaseUrl: string): string {
  const hostMatch = databaseUrl.match(/@([^/:]+)/);
  return hostMatch?.[1]?.toLowerCase() ?? '';
}

export function isVsi03DisposableDatabaseName(databaseName: string): boolean {
  return DISPOSABLE_DB_NAME_PATTERN.test(databaseName);
}

/**
 * Fail-closed guard for VSI-03 disposable PostgreSQL integration tests.
 */
export function assertVsi03DisposablePostgresTarget(): void {
  if (process.env.VSI03_READONLY_COMPOSER_PG !== '1') {
    throw new Error('VSI03_READONLY_COMPOSER_PG=1 required');
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!url.trim()) {
    throw new Error('DATABASE_URL required for VSI03 postgres integration');
  }

  const host = parsePostgresHost(url);
  const forbiddenHost =
    host.includes('synqdrive') ||
    host.includes('hstgr') ||
    host.includes('srv1374778') ||
    host.includes('production') ||
    host === 'app.synqdrive.eu';
  if (forbiddenHost) {
    throw new Error('Refusing production-like database host for VSI03 postgres integration');
  }

  if (!host || (!APPROVED_LOCAL_HOSTS.has(host) && host !== 'postgres')) {
    throw new Error(`Refusing non-local database host for VSI03 integration (${host || 'missing'})`);
  }

  const databaseName = parsePostgresDatabaseName(url);
  if (!databaseName) {
    throw new Error('Refusing ambiguous or missing database name in DATABASE_URL');
  }

  const normalizedDb = databaseName.toLowerCase();
  if (FORBIDDEN_DATABASE_NAMES.has(normalizedDb)) {
    throw new Error(`Refusing production-like database name for VSI03 integration (${databaseName})`);
  }

  if (!isVsi03DisposableDatabaseName(databaseName)) {
    throw new Error(
      `Refusing non-disposable database name (expected vsi03_test_* pattern, got ${databaseName})`,
    );
  }
}

/** Prisma compound key for vehicle_signal_capability_profiles (excludes providerIdentity). */
export function vsiSignalProfileCompoundWhere(input: {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
}) {
  return {
    organizationId_vehicleId_providerSourceLinkId: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
    },
  };
}
