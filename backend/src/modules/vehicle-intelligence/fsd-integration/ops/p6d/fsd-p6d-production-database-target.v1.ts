import { parseDatabaseNameFromUrl } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.postgres-harness';

const RESERVED_PRODUCTION_DATABASE_NAMES = new Set(['synqdrive', 'production', 'prod']);

/** Authoritative disposable test DB naming (integration harness). */
export function parseFsd2DisposableDatabaseNameV1(databaseUrl: string): string {
  const dbName = parseDatabaseNameFromUrl(databaseUrl);
  if (!/^fsd2_test_[a-zA-Z0-9_]+$/.test(dbName)) {
    throw new Error(`FSD_P6D_DISPOSABLE_DB_NAME_REQUIRED:${dbName}`);
  }
  return dbName;
}

export function isAuthoritativeProductionDatabaseTargetV1(databaseUrl: string): boolean {
  const dbName = parseDatabaseNameFromUrl(databaseUrl).toLowerCase();
  return RESERVED_PRODUCTION_DATABASE_NAMES.has(dbName);
}
