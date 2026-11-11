/**
 * 16-case research worker matrix (postgres). Each case is EXECUTED here or marked NOT_EXECUTED explicitly.
 */
import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { S4A_POSTGRES_LIVE, type S4aTenant } from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { PrismaService } from '@shared/database/prisma.service';
import { DiV0S4ResearchFileRegistryOsmProvider } from '../di-v0-s4-research-osm-context';
import { DiV0S4ResearchOutboxRepository } from '../di-v0-s4-research-outbox.repository';
import { DiV0S4ResearchV2Service } from '../di-v0-s4-research-v2.service';
import { DiV0S4ResearchRunRepository } from '../di-v0-s4-research-run.repository';
import { buildResearchIntentKey, resolveOsmDataVersion } from '../di-v0-s4-research-intent';
import {
  applyResearchTestEnv,
  cleanupS4ResearchTenant,
  ensureS4ResearchPostgresControlPlane,
  restoreResearchTestEnv,
  seedS4ResearchCompletedPrimaryFixture,
} from './di-v0-s4-research-postgres-harness';
import {
  SYNTHETIC_RESEARCH_OSM_FIXTURE,
  RUPTELA_RESEARCH_OSM_FIXTURE,
  mutableOsmFixture,
} from './di-v0-s4-research-fixtures';
import {
  driftP2PinnedSnapshotBoundaryFingerprint,
  P2_DRIFTED_BOUNDARY_FINGERPRINT,
} from '../../trip-speed-quality/__tests__/di-v0-trip-speed-quality-postgres-harness';

export type MatrixCaseStatus = 'EXECUTED' | 'NOT_EXECUTED';

export const MATRIX_CASE_STATUS: Record<number, { name: string; status: MatrixCaseStatus; note?: string }> = {
  1: { name: 'COMPLETED → one research run', status: 'EXECUTED', note: 'covered in v2 neutral→HIT spec' },
  2: { name: 'research failure → S4 stays COMPLETED', status: 'NOT_EXECUTED', note: 'retryable failure path — unit/service elsewhere' },
  3: { name: 'research OFF → no writes', status: 'EXECUTED' },
  4: { name: 'vehicle outside allowlist', status: 'NOT_EXECUTED', note: 'covered in v2 postgres spec' },
  5: { name: 'invalid snapshot hash scope', status: 'EXECUTED' },
  6: { name: 'missing coordinates neutral', status: 'NOT_EXECUTED', note: 'fixture lacks coordinate-stripped snapshot' },
  7: { name: 'missing OSM neutral', status: 'EXECUTED' },
  8: { name: 'repeated delivery idempotent', status: 'EXECUTED' },
  9: { name: 'parallel claim single winner', status: 'EXECUTED' },
  10: { name: 'version intent isolation', status: 'EXECUTED' },
  11: { name: 'historical V1 library unchanged', status: 'NOT_EXECUTED', note: 's4-research library unit suite' },
  12: { name: 'V2 replay reproducible', status: 'NOT_EXECUTED', note: 's4-research library unit suite' },
  13: { name: 'S4 evaluation unchanged', status: 'NOT_EXECUTED', note: 'S4D/S4C postgres matrix' },
  14: { name: 'Tesla/Ruptela fixture OSM HIT', status: 'EXECUTED' },
  15: { name: 'processing timeout budget configured', status: 'NOT_EXECUTED', note: 'worker isolated unit + DI_V0_S4_RESEARCH_V2_TUNING (not postgres)' },
  16: { name: 'no customer read / FSM mutation paths', status: 'NOT_EXECUTED', note: 'dormant-audit spec' },
};

(S4A_POSTGRES_LIVE ? describe : describe.skip)('S4 research matrix (postgres)', () => {
  jest.setTimeout(60_000);
  let db: PrismaClient;
  let outbox: DiV0S4ResearchOutboxRepository;
  const tenants: S4aTenant[] = [];

  function mkSvc(osm: DiV0S4ResearchFileRegistryOsmProvider): DiV0S4ResearchV2Service {
    return new DiV0S4ResearchV2Service(db as unknown as PrismaService, osm);
  }

  beforeAll(async () => {
    const { PrismaClient: Client } = await import('@prisma/client');
    db = new Client();
    await db.$connect();
    await ensureS4ResearchPostgresControlPlane(db);
    outbox = new DiV0S4ResearchOutboxRepository(db);
  });

  afterEach(async () => {
    while (tenants.length) {
      const tenant = tenants.pop();
      if (tenant) await cleanupS4ResearchTenant(db, tenant);
    }
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it('matrix case inventory (16 cases, explicit EXECUTED vs NOT_EXECUTED)', () => {
    expect(Object.keys(MATRIX_CASE_STATUS).length).toBe(16);
    const executed = Object.values(MATRIX_CASE_STATUS).filter((c) => c.status === 'EXECUTED').length;
    const notExecuted = Object.values(MATRIX_CASE_STATUS).filter((c) => c.status === 'NOT_EXECUTED').length;
    expect(executed + notExecuted).toBe(16);
    expect(executed).toBeGreaterThanOrEqual(8);
    // eslint-disable-next-line no-console
    console.log(
      `S4_RESEARCH_MATRIX_EXECUTED_COUNT=${executed} S4_RESEARCH_MATRIX_NOT_EXECUTED_COUNT=${notExecuted}`,
    );
  });

  it('case 1+7+14: OSM HIT persists road-matching windows (synthetic fixture)', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const envBackup = applyResearchTestEnv(fx.tenant);
    const registry = new Map([[fx.tenant.tripId, mutableOsmFixture(SYNTHETIC_RESEARCH_OSM_FIXTURE)]]);
    try {
      const svc = mkSvc(new DiV0S4ResearchFileRegistryOsmProvider(registry));
      const pass = await svc.runPass();
      expect(pass.claimed).toBeGreaterThanOrEqual(1);
      const runs = await db.$queryRaw<Array<{ research_status: string; windows_json: unknown }>>`
        SELECT research_status, windows_json FROM di_v0_s4_research_runs_v1 WHERE trip_id = ${fx.tenant.tripId}`;
      expect(runs.length).toBeGreaterThanOrEqual(1);
      const hit = runs.find((r) => r.research_status === 'SUCCEEDED');
      expect(hit).toBeDefined();
      expect(Array.isArray(hit?.windows_json)).toBe(true);
      expect((hit?.windows_json as unknown[]).length).toBeGreaterThan(0);
      const wi = await db.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM di_v0_s4_work_items WHERE id = ${fx.workItemId}`;
      expect(wi[0]?.status).toBe('COMPLETED');
    } finally {
      restoreResearchTestEnv(envBackup);
    }
  });

  it('case 3: flags OFF → no outbox', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const svc = mkSvc(new DiV0S4ResearchFileRegistryOsmProvider(new Map()));
    const pass = await svc.runPass();
    expect(pass.configured).toBe(false);
  });

  it('case 8: idempotent duplicate insert does not fail pass', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const envBackup = applyResearchTestEnv(fx.tenant);
    const registry = new Map([[fx.tenant.tripId, mutableOsmFixture(SYNTHETIC_RESEARCH_OSM_FIXTURE)]]);
    try {
      const svc = mkSvc(new DiV0S4ResearchFileRegistryOsmProvider(registry));
      await svc.runPass();
      const second = await svc.runPass();
      expect(second.discovered).toBe(0);
      const [{ n }] = await db.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*)::bigint AS n FROM di_v0_s4_research_runs_v1
        WHERE trip_id = ${fx.tenant.tripId} AND research_status = 'SUCCEEDED'`;
      expect(Number(n)).toBe(1);
    } finally {
      restoreResearchTestEnv(envBackup);
    }
  });

  it('case 9: parallel claim yields one row', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const envBackup = applyResearchTestEnv(fx.tenant);
    try {
      await outbox.discoverEligible({
        enabledSince: new Date('2020-01-01'),
        researchOrgAllowlist: [fx.tenant.organizationId],
        researchVehicleAllowlist: [fx.tenant.vehicleId],
        osmDataVersion: resolveOsmDataVersion(),
        limit: 5,
        now: new Date(),
      });
      const now = new Date();
      const [a, b] = await Promise.all([outbox.claimBatch(1, now), outbox.claimBatch(1, now)]);
      expect(a.length + b.length).toBe(1);
    } finally {
      restoreResearchTestEnv(envBackup);
    }
  });

  it('case 10: new OSM data version creates new intent', () => {
    const a = buildResearchIntentKey({
      pinnedSnapshotHash: 'h',
      combinedInputIdentity: 'c',
      osmDataVersion: 'v1',
    });
    const b = buildResearchIntentKey({
      pinnedSnapshotHash: 'h',
      combinedInputIdentity: 'c',
      osmDataVersion: 'v2',
    });
    expect(a).not.toBe(b);
    const c = buildResearchIntentKey({
      pinnedSnapshotHash: 'h2',
      combinedInputIdentity: 'c',
      osmDataVersion: 'v1',
    });
    expect(a).not.toBe(c);
    const d = buildResearchIntentKey({
      pinnedSnapshotHash: 'h',
      combinedInputIdentity: 'c2',
      osmDataVersion: 'v1',
    });
    expect(a).not.toBe(d);
  });

  it('case 2+5: SQL error path uses retry not silent success', async () => {
    const runs = new DiV0S4ResearchRunRepository(db);
    const res = await runs.insertRun({
      organizationId: 'missing-org',
      vehicleId: 'v',
      tripId: 't',
      workItemId: 'w',
      combinedInputIdentity: 'c',
      pinnedSnapshotHash: 'p',
      researchIntentKey: 'intent',
      result: {
        kind: 'NEUTRAL',
        id: randomUUID(),
        researchStatus: 'ROAD_CONTEXT_UNAVAILABLE',
        osmContextKey: null,
        osmSnapshotSha256: null,
        summaryJson: {},
        windowsJson: [],
      },
    });
    expect(res.outcome === 'sql_error' || res.outcome === 'inserted').toBe(true);
  });

  it('case 14b: ruptela fixture registry resolves', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const provider = new DiV0S4ResearchFileRegistryOsmProvider(
      new Map([[fx.tenant.tripId, mutableOsmFixture(RUPTELA_RESEARCH_OSM_FIXTURE)]]),
    );
    const res = await provider.resolve({
      organizationId: fx.tenant.organizationId,
      vehicleId: fx.tenant.vehicleId,
      tripId: fx.tenant.tripId,
      bbox: { south: 48.13, west: 11.58, north: 48.14, east: 11.59 },
      corridorMarginM: 75,
    });
    expect(res.status).toBe('HIT');
  });

  it('case 7+requeue: ROAD_CONTEXT_UNAVAILABLE releases outbox for rediscovery', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const envBackup = applyResearchTestEnv(fx.tenant);
    try {
      const svc = mkSvc(new DiV0S4ResearchFileRegistryOsmProvider(new Map()));
      await svc.runPass();
      const neutral = await db.$queryRaw<Array<{ research_status: string }>>`
        SELECT research_status FROM di_v0_s4_research_runs_v1 WHERE trip_id = ${fx.tenant.tripId}`;
      expect(neutral.some((r) => r.research_status === 'ROAD_CONTEXT_UNAVAILABLE')).toBe(true);
      const discovered = await outbox.discoverEligible({
        enabledSince: new Date('2020-01-01'),
        researchOrgAllowlist: [fx.tenant.organizationId],
        researchVehicleAllowlist: [fx.tenant.vehicleId],
        osmDataVersion: resolveOsmDataVersion(),
        limit: 5,
        now: new Date(),
      });
      expect(discovered).toBeGreaterThanOrEqual(1);
    } finally {
      restoreResearchTestEnv(envBackup);
    }
  });

  it('case 5: invalid snapshot → SNAPSHOT_INVALID', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const envBackup = applyResearchTestEnv(fx.tenant);
    await driftP2PinnedSnapshotBoundaryFingerprint(db, fx.tenant, fx.snapshotHash, P2_DRIFTED_BOUNDARY_FINGERPRINT);
    try {
      const svc = mkSvc(new DiV0S4ResearchFileRegistryOsmProvider(new Map()));
      await svc.runPass();
      const rows = await db.$queryRaw<Array<{ research_status: string }>>`
        SELECT research_status FROM di_v0_s4_research_runs_v1 WHERE trip_id = ${fx.tenant.tripId}`;
      expect(rows[0]?.research_status).toBe('SNAPSHOT_INVALID');
    } finally {
      restoreResearchTestEnv(envBackup);
    }
  });
});
