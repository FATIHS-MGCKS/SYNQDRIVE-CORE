/**
 * FSD-2 data integrity closeout (C1–C4) — disposable PostgreSQL only.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  assertFsd2PersistencePostgresCiEnv,
  ensureFsd2DisposableDatabaseOnce,
} from './fsd-discovery-persistence.postgres-harness';
import {
  buildFsdDiscoveryRunKey,
  FsdDiscoveryPersistenceRepository,
} from './index';
import {
  buildFsdDimoConnectionIdentityFingerprint,
} from './fsd-discovery-persistence.contract.v1';
import {
  BusinessType,
  DriveType,
  FuelType,
  HealthStatus,
  ProductSlug,
  VehicleStatus,
} from '@prisma/client';
import { ensureOrganizationProductEntitlement } from '@modules/vehicle-onboarding/testing/org-product-test.harness';

const LIVE = process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1';
const REQUIRED = process.env.FSD_DISCOVERY_PERSISTENCE_PG_REQUIRED === '1';

async function seedDimoBinding(prisma: PrismaClient) {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const dimoVehicleId = randomUUID();
  const linkId = randomUUID();
  const tokenId = Math.floor(Math.random() * 1_000_000) + 5_000_000;
  await prisma.organization.create({
    data: {
      id: organizationId,
      companyName: `FSD2 ${organizationId.slice(0, 8)}`,
      businessType: BusinessType.FLEET,
    },
  });
  await ensureOrganizationProductEntitlement(prisma, organizationId, ProductSlug.FLEET);
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      organizationId,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      make: 'Tesla',
      model: 'M3',
      year: 2022,
      fuelType: FuelType.ELECTRIC,
      status: VehicleStatus.AVAILABLE,
      healthStatus: HealthStatus.GOOD,
      driveType: DriveType.RWD,
    },
  });
  await prisma.dimoVehicle.create({
    data: {
      id: dimoVehicleId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      tokenId,
      make: 'Tesla',
      model: 'M3',
      year: 2022,
      fuelType: 'ELECTRIC',
    },
  });
  await prisma.vehicleDataSourceLink.create({
    data: {
      id: linkId,
      vehicleId,
      provider: 'DIMO',
      sourceType: 'DIMO',
      dimoVehicleId,
      isActive: true,
    },
  });
  const fingerprint = buildFsdDimoConnectionIdentityFingerprint({ dimoVehicleId, tokenId });
  return { organizationId, vehicleId, linkId, tokenId, fingerprint };
}

(LIVE ? describe : describe.skip)('FSD-2 data integrity closeout (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let repo: FsdDiscoveryPersistenceRepository;

  beforeAll(async () => {
    assertFsd2PersistencePostgresCiEnv();
    if (REQUIRED) {
      await ensureFsd2DisposableDatabaseOnce();
    }
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new FsdDiscoveryPersistenceRepository(prisma as never);
  }, 600_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('C1 — composite FK uses ON DELETE RESTRICT and run cascade removes evidence', async () => {
    const seed = await seedDimoBinding(prisma);
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
    };
    const runKey = buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'c1-fk' });
    const acquired = await repo.acquireRunWithIdempotency({
      ...scope,
      runKey,
      dimoTokenId: seed.tokenId,
      connectionIdentityFingerprint: seed.fingerprint,
    });
    const leaseOwner = 'worker-c1';
    await repo.claimRunLease({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version,
      leaseOwner,
      leaseExpiresAt: new Date(Date.now() + 120_000),
    });
    const auth = {
      ...scope,
      runId: acquired.runId,
      expectedRunVersion: acquired.version + 1,
      leaseOwner,
    };
    const stage = await repo.upsertStagePlan({
      auth,
      stageType: 'CATALOG',
      planFingerprint: 'plan-c1',
    });
    await repo.recordSignalEvidence({
      ...auth,
      stageId: stage.stageId,
      stageType: 'CATALOG',
      signalName: 'speed',
      evidenceState: 'OBSERVED',
    });

    const fk = await prisma.$queryRaw<Array<{ confdeltype: string }>>`
      SELECT c.confdeltype
      FROM pg_constraint c
      WHERE c.conname = 'fsd_discovery_signal_evidence_stage_scope_fkey'
    `;
    expect(fk[0]?.confdeltype).toBe('r');

    await expect(
      prisma.fsdDiscoveryStage.delete({ where: { id: stage.stageId } }),
    ).rejects.toThrow();

    await prisma.fsdDiscoveryRun.delete({ where: { id: acquired.runId } });
    const evidenceCount = await prisma.fsdDiscoverySignalEvidence.count({
      where: { runId: acquired.runId },
    });
    expect(evidenceCount).toBe(0);
  });

  it('C2 — replay ignores caller revision after run 2 created', async () => {
    const seed = await seedDimoBinding(prisma);
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
    };
    const identityBase = {
      ...scope,
      dimoTokenId: seed.tokenId,
      connectionIdentityFingerprint: seed.fingerprint,
    };
    const run1 = await repo.acquireRunWithIdempotency({
      ...identityBase,
      runKey: buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'c2-run-1' }),
      runRevision: 999,
    });
    const run2Key = buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'c2-run-2' });
    const run2 = await repo.acquireRunWithIdempotency({
      ...identityBase,
      runKey: run2Key,
      runRevision: 1,
    });
    expect(run2.kind).toBe('CREATED');
    expect(run2.runRevision).toBeGreaterThan(run1.runRevision);

    const replayWrongRevision = await repo.acquireRunWithIdempotency({
      ...identityBase,
      runKey: run2Key,
      runRevision: 1,
    });
    expect(replayWrongRevision.kind).toBe('REPLAYED');
    expect(replayWrongRevision.runId).toBe(run2.runId);
    expect(replayWrongRevision.runRevision).toBe(run2.runRevision);

    const maxRevision = await prisma.fsdDiscoveryRun.aggregate({
      where: { providerSourceLinkId: seed.linkId },
      _max: { runRevision: true },
    });
    expect(maxRevision._max.runRevision).toBe(run2.runRevision);
  });

  it('C2 — conflicting connection identity throws RUN_IDENTITY_CONFLICT', async () => {
    const seed = await seedDimoBinding(prisma);
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
    };
    const runKey = buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'c2-conflict' });
    await repo.acquireRunWithIdempotency({
      ...scope,
      runKey,
      dimoTokenId: seed.tokenId,
      connectionIdentityFingerprint: null,
    });
    await expect(
      repo.acquireRunWithIdempotency({
        ...scope,
        runKey,
        dimoTokenId: seed.tokenId,
        connectionIdentityFingerprint: seed.fingerprint,
      }),
    ).rejects.toMatchObject({ code: 'RUN_IDENTITY_CONFLICT' });
  });

  it('C3 — evidence identical replay is no-op; provenance change bumps version', async () => {
    const seed = await seedDimoBinding(prisma);
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
    };
    const acquired = await repo.acquireRunWithIdempotency({
      ...scope,
      runKey: buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'c3-evidence' }),
      dimoTokenId: seed.tokenId,
      connectionIdentityFingerprint: seed.fingerprint,
    });
    const leaseOwner = 'worker-c3';
    await repo.claimRunLease({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version,
      leaseOwner,
      leaseExpiresAt: new Date(Date.now() + 120_000),
    });
    const auth = {
      ...scope,
      runId: acquired.runId,
      expectedRunVersion: acquired.version + 1,
      leaseOwner,
    };
    const write = {
      ...auth,
      stageId: null,
      stageType: 'SNAPSHOT' as const,
      signalName: 'hvBattery',
      evidenceState: 'QUERY_PLANNED' as const,
      queryPlanned: true,
      queryAccepted: null,
      schemaShape: 'float',
      declaredByProvider: true,
      provenanceJson: { window: '7d' },
      qualityJson: { tier: 'A' },
    };
    const first = await repo.recordSignalEvidence(write);
    const replay = await repo.recordSignalEvidence(write);
    expect(replay.noOp).toBe(true);
    expect(replay.evidenceId).toBe(first.evidenceId);

    const changed = await repo.recordSignalEvidence({
      ...write,
      provenanceJson: { window: '14d' },
    });
    expect(changed.noOp).toBe(false);
    const row = await prisma.fsdDiscoverySignalEvidence.findUnique({
      where: { id: first.evidenceId },
    });
    expect(row?.version).toBe(2);
    expect(row?.provenanceJson).toEqual({ window: '14d' });
  });

  it('C4 — deactivated source link blocks stage and evidence writes', async () => {
    const seed = await seedDimoBinding(prisma);
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
    };
    const acquired = await repo.acquireRunWithIdempotency({
      ...scope,
      runKey: buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'c4-link' }),
      dimoTokenId: seed.tokenId,
      connectionIdentityFingerprint: seed.fingerprint,
    });
    const leaseOwner = 'worker-c4';
    await repo.claimRunLease({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version,
      leaseOwner,
      leaseExpiresAt: new Date(Date.now() + 120_000),
    });
    const auth = {
      ...scope,
      runId: acquired.runId,
      expectedRunVersion: acquired.version + 1,
      leaseOwner,
    };
    await prisma.vehicleDataSourceLink.update({
      where: { id: seed.linkId },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    const stageCountBefore = await prisma.fsdDiscoveryStage.count({
      where: { runId: acquired.runId },
    });
    await expect(
      repo.upsertStagePlan({ auth, stageType: 'CATALOG', planFingerprint: 'blocked' }),
    ).rejects.toMatchObject({ code: 'STALE_SOURCE_LINK' });
    await expect(
      repo.recordSignalEvidence({
        ...auth,
        stageId: null,
        stageType: 'CATALOG',
        signalName: 'blocked',
        evidenceState: 'DECLARED_ONLY',
      }),
    ).rejects.toMatchObject({ code: 'STALE_SOURCE_LINK' });
    const stageCountAfter = await prisma.fsdDiscoveryStage.count({
      where: { runId: acquired.runId },
    });
    expect(stageCountAfter).toBe(stageCountBefore);
  });
});
