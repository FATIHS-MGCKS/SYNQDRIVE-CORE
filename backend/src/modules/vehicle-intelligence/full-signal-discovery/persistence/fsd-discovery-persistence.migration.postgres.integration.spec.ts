import { PrismaClient } from '@prisma/client';
import {
  assertFsd2PersistencePostgresCiEnv,
  ensureFsd2DisposableDatabaseOnce,
  FSD2_PERSISTENCE_H1H5_MIGRATION_NAME,
} from './fsd-discovery-persistence.postgres-harness';

const LIVE = process.env.FSD_DISCOVERY_PERSISTENCE_MIGRATION_PG === '1';

(LIVE ? describe : describe.skip)('FSD-2 discovery persistence migration (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let migrationExecuted = false;

  beforeAll(async () => {
    assertFsd2PersistencePostgresCiEnv();
    if (process.env.FSD_DISCOVERY_PERSISTENCE_PG_REQUIRED === '1') {
      const boot = await ensureFsd2DisposableDatabaseOnce();
      migrationExecuted = boot.migrationExecuted;
    }
    prisma = new PrismaClient();
    await prisma.$connect();
  }, 600_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('applies H1–H5 correction indexes and evidence stage scope FK', async () => {
    const partial = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'fsd_discovery_runs_idempotency_active_key',
          'fsd_discovery_runs_executable_source_link_uq',
          'fsd_discovery_stages_id_run_stage_scope_key'
        )
    `;
    expect(partial.length).toBe(3);
    if (process.env.FSD_DISCOVERY_PERSISTENCE_PG_REQUIRED === '1') {
      expect(migrationExecuted).toBe(true);
    }
    expect(FSD2_PERSISTENCE_H1H5_MIGRATION_NAME).toContain('fsd2_persistence_architecture_h1_h5');
  });
});
