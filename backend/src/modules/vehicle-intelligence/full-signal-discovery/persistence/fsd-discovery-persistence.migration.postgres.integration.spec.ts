import { PrismaClient } from '@prisma/client';

const LIVE = process.env.FSD_DISCOVERY_PERSISTENCE_MIGRATION_PG === '1';

async function tableExists(prisma: PrismaClient, table: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    ) AS exists
  `;
  return rows[0]?.exists === true;
}

async function partialIndexExists(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'fsd_discovery_runs_active_source_link_uq'
    ) AS exists
  `;
  return rows[0]?.exists === true;
}

(LIVE ? describe : describe.skip)('FSD-2 discovery persistence migration (PostgreSQL)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('exposes fsd_discovery_* tables after migrate deploy', async () => {
    expect(await tableExists(prisma, 'fsd_discovery_runs')).toBe(true);
    expect(await tableExists(prisma, 'fsd_discovery_stages')).toBe(true);
    expect(await tableExists(prisma, 'fsd_discovery_signal_evidence')).toBe(true);
    expect(await partialIndexExists(prisma)).toBe(true);
  });
});
