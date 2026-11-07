/**
 * FSD P5B M5 — DIMO link reactivation invalidates executable FSD runs (disposable Postgres).
 */
import {
  BusinessType,
  DriveType,
  FuelType,
  HealthStatus,
  PrismaClient,
  ProductSlug,
  VehicleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { FsdDiscoveryPersistenceRepository } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import {
  buildFsdDimoConnectionIdentityFingerprint,
  buildFsdDiscoveryRunKey,
} from '@modules/vehicle-intelligence/full-signal-discovery/persistence';
import { createDimoVehicleDataSourceLinkServiceForTests } from '@modules/vehicle-onboarding/testing/vehicle-onboarding-test.harness';
import { ensureOrganizationProductEntitlement } from '@modules/vehicle-onboarding/testing/org-product-test.harness';
import { DimoVehicleDataSourceLinkService } from './dimo-vehicle-data-source-link.service';
import type { FsdSourceLinkLifecycleService as FsdLifecycleType } from '@modules/vehicle-intelligence/fsd-integration/fsd-source-link-lifecycle.service';

const run =
  process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1' ||
  process.env.VO5A_OFFBOARDING_PG === '1';

async function oobDeactivateLink(prisma: PrismaClient, linkId: string) {
  await prisma.vehicleDataSourceLink.update({
    where: { id: linkId },
    data: {
      isActive: false,
      deactivatedAt: new Date(),
      metadata: { reactivationEligible: true },
    },
  });
}

async function seedDimoBinding(prisma: PrismaClient) {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const linkId = randomUUID();
  const dimoVehicleId = randomUUID();
  const tokenId = 6_100_000 + Math.floor(Math.random() * 1_000_000);
  await prisma.organization.create({
    data: {
      id: organizationId,
      companyName: `react ${organizationId.slice(0, 8)}`,
      businessType: BusinessType.FLEET,
    },
  });
  await ensureOrganizationProductEntitlement(prisma, organizationId, ProductSlug.FLEET);
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
      registryLifecycle: 'ACTIVE',
      dimoVehicleId,
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
  return { organizationId, vehicleId, linkId, dimoVehicleId, tokenId, fingerprint };
}

async function seedExecutableRun(
  prisma: PrismaClient,
  seed: Awaited<ReturnType<typeof seedDimoBinding>>,
) {
  const scope = {
    organizationId: seed.organizationId,
    vehicleId: seed.vehicleId,
    providerSourceLinkId: seed.linkId,
  };
  const repo = new FsdDiscoveryPersistenceRepository(prisma as never);
  const acquired = await repo.acquireRunWithIdempotency({
    ...scope,
    runKey: buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: randomUUID() }),
    runRevision: 1,
    dimoTokenId: seed.tokenId,
    connectionIdentityFingerprint: seed.fingerprint,
  });
  const leaseOwner = `run-${randomUUID().slice(0, 8)}`;
  await repo.claimRunLease({
    scope,
    runId: acquired.runId,
    expectedVersion: acquired.version,
    leaseOwner,
    leaseExpiresAt: new Date(Date.now() + 120_000),
  });
  return { ...scope, runId: acquired.runId, leaseOwner, version: acquired.version + 1 };
}

(run ? describe : describe.skip)('Dimo source-link reactivation FSD fence (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('default client: OOB inactive link + executable run → reactivate invalidates run', async () => {
    const seed = await seedDimoBinding(prisma);
    await seedExecutableRun(prisma, seed);
    await oobDeactivateLink(prisma, seed.linkId);
    const svc = createDimoVehicleDataSourceLinkServiceForTests(prisma);
    const result = await svc.ensureDimoVehicleDataSourceLink({
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      dimoVehicleId: seed.dimoVehicleId,
      provenance: 'manual',
    });
    expect(result.action).toBe('REACTIVATE');
    const runRow = await prisma.fsdDiscoveryRun.findFirst({
      where: { providerSourceLinkId: seed.linkId },
    });
    expect(runRow?.status).toBe('INVALIDATED');
    expect(runRow?.leaseOwner).toBeNull();
    expect(runRow?.leaseExpiresAt).toBeNull();
    const link = await prisma.vehicleDataSourceLink.findUniqueOrThrow({ where: { id: seed.linkId } });
    expect(link.isActive).toBe(true);
  });

  it('supplied transaction client participates in same tx as invalidation', async () => {
    const seed = await seedDimoBinding(prisma);
    await seedExecutableRun(prisma, seed);
    await oobDeactivateLink(prisma, seed.linkId);
    const svc = createDimoVehicleDataSourceLinkServiceForTests(prisma);
    await prisma.$transaction(async (tx) => {
      const result = await svc.ensureDimoVehicleDataSourceLink(
        {
          organizationId: seed.organizationId,
          vehicleId: seed.vehicleId,
          dimoVehicleId: seed.dimoVehicleId,
          provenance: 'manual',
        },
        tx,
      );
      expect(result.action).toBe('REACTIVATE');
      const runRow = await tx.fsdDiscoveryRun.findFirst({
        where: { providerSourceLinkId: seed.linkId },
      });
      expect(runRow?.status).toBe('INVALIDATED');
    });
  });

  it('stale writer rejected after reactivation invalidates run', async () => {
    const seed = await seedDimoBinding(prisma);
    const run = await seedExecutableRun(prisma, seed);
    await oobDeactivateLink(prisma, seed.linkId);
    const svc = createDimoVehicleDataSourceLinkServiceForTests(prisma);
    await svc.ensureDimoVehicleDataSourceLink({
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      dimoVehicleId: seed.dimoVehicleId,
      provenance: 'manual',
    });
    const repo = new FsdDiscoveryPersistenceRepository(prisma as never);
    await expect(
      repo.recordSignalEvidence({
        organizationId: run.organizationId,
        vehicleId: run.vehicleId,
        providerSourceLinkId: run.providerSourceLinkId,
        runId: run.runId,
        expectedRunVersion: run.version,
        leaseOwner: run.leaseOwner,
        stageId: null,
        stageType: 'CATALOG',
        signalName: 'speed',
        evidenceState: 'DECLARED_ONLY',
      }),
    ).rejects.toMatchObject({ code: 'LEASE_LOST' });
  });

  it('invalidation failure rolls back reactivation', async () => {
    const seed = await seedDimoBinding(prisma);
    await oobDeactivateLink(prisma, seed.linkId);
    const throwingFsd = {
      invalidateSingleDimoSourceLinkForLifecycle: jest
        .fn()
        .mockRejectedValue(new Error('forced-invalidation-failure')),
    } as unknown as FsdLifecycleType;
    const svc = new DimoVehicleDataSourceLinkService(prisma as never, throwingFsd);
    await expect(
      svc.ensureDimoVehicleDataSourceLink({
        organizationId: seed.organizationId,
        vehicleId: seed.vehicleId,
        dimoVehicleId: seed.dimoVehicleId,
        provenance: 'manual',
      }),
    ).rejects.toThrow('forced-invalidation-failure');
    const link = await prisma.vehicleDataSourceLink.findUniqueOrThrow({ where: { id: seed.linkId } });
    expect(link.isActive).toBe(false);
  });

  it('reactivation scoped to link tenant — other org run unchanged', async () => {
    const seedA = await seedDimoBinding(prisma);
    const seedB = await seedDimoBinding(prisma);
    await seedExecutableRun(prisma, seedA);
    const runB = await seedExecutableRun(prisma, seedB);
    await oobDeactivateLink(prisma, seedA.linkId);
    await oobDeactivateLink(prisma, seedB.linkId);
    const svc = createDimoVehicleDataSourceLinkServiceForTests(prisma);
    await svc.ensureDimoVehicleDataSourceLink({
      organizationId: seedA.organizationId,
      vehicleId: seedA.vehicleId,
      dimoVehicleId: seedA.dimoVehicleId,
      provenance: 'manual',
    });
    const runA = await prisma.fsdDiscoveryRun.findFirst({ where: { id: { not: runB.runId } } });
    expect(runA?.status).toBe('INVALIDATED');
    const still = await prisma.fsdDiscoveryRun.findUniqueOrThrow({ where: { id: runB.runId } });
    expect(still.status).not.toBe('INVALIDATED');
    expect(still.invalidatedAt).toBeNull();
  });

  it('concurrent reactivation vs FSD acquire serializes safely', async () => {
    const seed = await seedDimoBinding(prisma);
    await seedExecutableRun(prisma, seed);
    await oobDeactivateLink(prisma, seed.linkId);
    const svc = createDimoVehicleDataSourceLinkServiceForTests(prisma);
    const repo = new FsdDiscoveryPersistenceRepository(prisma as never);
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
    };
    const [reactivateResult, acquireOutcome] = await Promise.all([
      svc.ensureDimoVehicleDataSourceLink({
        organizationId: seed.organizationId,
        vehicleId: seed.vehicleId,
        dimoVehicleId: seed.dimoVehicleId,
        provenance: 'manual',
      }),
      repo
        .acquireRunWithIdempotency({
          ...scope,
          runKey: buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: randomUUID() }),
          runRevision: 2,
          dimoTokenId: seed.tokenId,
          connectionIdentityFingerprint: seed.fingerprint,
        })
        .then((v) => ({ ok: true as const, value: v }))
        .catch((err) => ({ ok: false as const, err })),
    ]);
    expect(reactivateResult.action).toBe('REACTIVATE');
    if (!acquireOutcome.ok) {
      expect(acquireOutcome.err).toMatchObject({ code: 'SOURCE_LINK_INVALID' });
    }
    const runs = await prisma.fsdDiscoveryRun.findMany({
      where: { providerSourceLinkId: seed.linkId },
    });
    expect(runs.some((r) => r.status === 'INVALIDATED')).toBe(true);
  });
});
