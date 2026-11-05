import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';

export const FSD2_PERSISTENCE_MIGRATION_NAME = '20261104193000_fsd2_discovery_persistence_v1';
export const FSD2_PERSISTENCE_H1H5_MIGRATION_NAME =
  '20261105193000_fsd2_persistence_architecture_h1_h5';
export const FSD2_PERSISTENCE_C1_MIGRATION_NAME = '20261105203000_fsd2_c1_composite_fk_restrict';

const BACKEND_ROOT = path.resolve(__dirname, '../../../../../');

export function assertFsd2PersistencePostgresCiEnv(): void {
  if (process.env.FSD_DISCOVERY_PERSISTENCE_PG !== '1') {
    throw new Error('FSD_DISCOVERY_PERSISTENCE_PG must be 1');
  }
  if (process.env.FSD_DISCOVERY_PERSISTENCE_PG_REQUIRED === '1' && process.env.FSD_DISCOVERY_PERSISTENCE_PG !== '1') {
    throw new Error('FSD_DISCOVERY_PERSISTENCE_PG_REQUIRED=1 but flag off');
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!url) {
    throw new Error('DATABASE_URL required for FSD-2 persistence PostgreSQL tests');
  }
  const parsed = new URL(url);
  const host = (parsed.hostname ?? '').toLowerCase();
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== 'postgres') {
    throw new Error(`Refusing non-local database host: ${host}`);
  }
  if (
    url.includes('app.synqdrive') ||
    url.includes('srv1374778') ||
    url.includes('hstgr.cloud')
  ) {
    throw new Error('DATABASE_URL appears production-like');
  }
  const dbName = parsed.pathname.replace(/^\//, '').split('?')[0] ?? '';
  if (!/^fsd2_test_[a-zA-Z0-9_]+$/.test(dbName)) {
    throw new Error(
      `Database name must match fsd2_test_* disposable convention (got ${dbName})`,
    );
  }
  const blocked = ['synqdrive', 'production', 'prod', 'app', 'postgres', 'template0', 'template1'];
  if (blocked.includes(dbName.toLowerCase())) {
    throw new Error(`Refusing production-like database name: ${dbName}`);
  }
}

export function parseDatabaseNameFromUrl(url: string): string {
  return new URL(url).pathname.replace(/^\//, '').split('?')[0] ?? '';
}

let disposableBootstrapped = false;

export async function ensureFsd2DisposableDatabaseOnce(): Promise<{
  isolated: true;
  migrationExecuted: boolean;
  databaseName: string;
}> {
  if (disposableBootstrapped) {
    return {
      isolated: true,
      migrationExecuted: true,
      databaseName: parseDatabaseNameFromUrl(process.env.DATABASE_URL as string),
    };
  }
  const boot = await bootstrapFsd2DisposableDatabase();
  disposableBootstrapped = true;
  return boot;
}

export async function bootstrapFsd2DisposableDatabase(): Promise<{
  isolated: true;
  migrationExecuted: boolean;
  databaseName: string;
}> {
  assertFsd2PersistencePostgresCiEnv();
  const url = process.env.DATABASE_URL as string;
  const dbName = parseDatabaseNameFromUrl(url);
  const adminUrl = process.env.FSD2_PG_ADMIN_URL ?? url.replace(`/${dbName}`, '/postgres');
  const admin = new URL(adminUrl);
  const host = admin.hostname;
  const port = admin.port || '5432';
  const user = admin.username;
  const password = admin.password;
  const auth = password ? `PGPASSWORD=${password} ` : '';

  execSync(
    `${auth}psql -h ${host} -p ${port} -U ${user} -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid()"`,
    { stdio: 'pipe' },
  );
  execSync(
    `${auth}psql -h ${host} -p ${port} -U ${user} -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \\"${dbName}\\""`,
    { stdio: 'pipe' },
  );
  execSync(
    `${auth}psql -h ${host} -p ${port} -U ${user} -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \\"${dbName}\\""`,
    { stdio: 'pipe' },
  );

  process.env.PRISMA_MIGRATE_EPHEMERAL_RECOVERY = '1';
  execSync('bash scripts/test/prisma-migrate-deploy-resilient.sh', {
    cwd: BACKEND_ROOT,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  });

  return { isolated: true, migrationExecuted: true, databaseName: dbName };
}
