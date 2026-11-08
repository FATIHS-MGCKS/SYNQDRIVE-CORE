import { assertFsd2PersistencePostgresCiEnv } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.postgres-harness';

/**
 * EXECUTE_MOCK may only run against verified disposable CI/test databases — fail-closed on production URLs.
 */
export function assertFsdP6cMockExecuteDatabaseAllowedV1(env: NodeJS.ProcessEnv = process.env): void {
  if (env.FSD_P6C_MOCK_EXECUTE_FORCE_ALLOWED === '1') {
    return;
  }
  try {
    assertFsd2PersistencePostgresCiEnv();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`FSD_P6C_MOCK_EXECUTE_DB_FORBIDDEN:${message}`);
  }
  if (env.FSD_DISCOVERY_PERSISTENCE_PG !== '1') {
    throw new Error('FSD_P6C_MOCK_EXECUTE_REQUIRES_DISPOSABLE_PG_FLAG');
  }
}
