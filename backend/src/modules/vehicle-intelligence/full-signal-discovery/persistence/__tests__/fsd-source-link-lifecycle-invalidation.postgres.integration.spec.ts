/**
 * FSD P5B — source-link lifecycle invalidation (disposable PostgreSQL).
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
import { ensureOrganizationProductEntitlement } from '@modules/vehicle-onboarding/testing/org-product-test.harness';
import { createVehicleOffboardingServiceForTests } from '@modules/vehicle-onboarding/testing/vehicle-offboarding-test.harness';
import { lockVehicleRowForLifecycleMutation } from '@modules/vehicle-onboarding/offboarding/vehicle-lifecycle-row-lock';
import { BusinessAuditOutboxRepository } from '@modules/business-audit/business-audit-outbox.repository';
import { VehicleOffboardingService } from '@modules/vehicle-onboarding/services/vehicle-offboarding.service';
import { FsdDiscoveryPersistenceRepository } from '../fsd-discovery-persistence.repository';
import { buildFsdDimoConnectionIdentityFingerprint } from '../fsd-discovery-persistence.contract.v1';
import {
  assertFsd2PersistencePostgresCiEnv,
  ensureFsd2DisposableDatabaseOnce,
} from '../fsd-discovery-persistence.postgres-harness';
import {
  FSD_SOURCE_LINK_INVALIDATION_REASON_DEACTIVATED,
  FSD_SOURCE_LINK_INVALIDATION_REASON_SUPERSEDED,
  invalidateExecutableFsdRunsForDimoSourceLinkInTransaction,
} from '../fsd-source-link-lifecycle-invalidation.v1';
import { FsdDiscoveryPersistenceError } from '../fsd-discovery-persistence.contract.v1';

const LIVE = process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1';
const REQUIRED = process.env.FSD_DISCOVERY_PERSISTENCE_PG_REQUIRED === '1';

async function seedVehicleWithDimo(prisma: PrismaClient) {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const dimoVehicleId = randomUUID();
  const linkId = randomUUID();
  const tokenId = 9_000_000 + Math.floor(Math.random() * 100_000);
  await prisma.organization.create({
    data: {
      id: organizationId,
      companyName: `P5B ${organizationId.slice(0, 8)}`,
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
      registryLifecycle: 'ACTIVE',
    },
  });
  await prisma.vehicleOrganizationAssignment.create({
    data: {
      id: randomUUID(),
      vehicleId,
      organizationId,
      validFrom: new Date(),
      assignmentReason: 'P5B_TEST',
      assignmentSource: 'P5B_TEST',
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
  return { organizationId, vehicleId, linkId, dimoVehicleId, tokenId, fingerprint };
}

async function seedExecutableRun(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    linkId: string;
    tokenId: number;
    fingerprint: string;
    stream: 'FSD3_CATALOG_SNAPSHOT' | 'FSD4_HISTORICAL';
    runKey?: string;
    runRevision?: number;
  },
) {
  return prisma.fsdDiscoveryRun.create({
    data: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.linkId,
      runKey: input.runKey ?? randomUUID(),
      runRevision: input.runRevision ?? 1,
      discoveryStream: input.stream,
      dimoTokenId: input.tokenId,
      connectionIdentityFingerprint: input.fingerprint,
      status: 'IN_PROGRESS',
      leaseOwner: 'worker-p5b',
      leaseExpiresAt: new Date(Date.now() + 120_000),
    },
  });
}

(LIVE ? describe : describe.skip)('FSD P5B source-link lifecycle invalidation', () => {
  jest.setTimeout(180_000);
  let prisma: PrismaClient;
  let repo: FsdDiscoveryPersistenceRepository;

  beforeAll(async () => {
    assertFsd2PersistencePostgresCiEnv();
    if (REQUIRED) {
      await ensureFsd2DisposableDatabaseOnce();
    }
    prisma = new PrismaClient();
    repo = new FsdDiscoveryPersistenceRepository(prisma as never);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('invalidates executable FSD3 run and clears leases (one active run per link)', async () => {
    const seed = await seedVehicleWithDimo(prisma);
    const fsd3 = await seedExecutableRun(prisma, {
      ...seed,
      stream: 'FSD3_CATALOG_SNAPSHOT',
    });

    await prisma.$transaction(async (tx) => {
      await invalidateExecutableFsdRunsForDimoSourceLinkInTransaction(tx, {
        organizationId: seed.organizationId,
        vehicleId: seed.vehicleId,
        providerSourceLinkId: seed.linkId,
        invalidationReason: FSD_SOURCE_LINK_INVALIDATION_REASON_DEACTIVATED,
      });
    });

    const run = await prisma.fsdDiscoveryRun.findUnique({ where: { id: fsd3.id } });
    expect(run?.status).toBe('INVALIDATED');
    expect(run?.invalidationReason).toBe('SOURCE_LINK_DEACTIVATED');
    expect(run?.leaseOwner).toBeNull();
    expect(run?.leaseExpiresAt).toBeNull();
    expect(run?.invalidatedAt).not.toBeNull();
  });

  it('invalidates executable FSD4 run after prior run already invalidated', async () => {
    const seed = await seedVehicleWithDimo(prisma);
    const fsd3 = await seedExecutableRun(prisma, { ...seed, stream: 'FSD3_CATALOG_SNAPSHOT' });
    await prisma.$transaction((tx) =>
      invalidateExecutableFsdRunsForDimoSourceLinkInTransaction(tx, {
        organizationId: seed.organizationId,
        vehicleId: seed.vehicleId,
        providerSourceLinkId: seed.linkId,
        invalidationReason: FSD_SOURCE_LINK_INVALIDATION_REASON_DEACTIVATED,
      }),
    );
    const fsd4 = await seedExecutableRun(prisma, {
      ...seed,
      stream: 'FSD4_HISTORICAL',
      runKey: randomUUID(),
      runRevision: 2,
    });
    await prisma.$transaction((tx) =>
      invalidateExecutableFsdRunsForDimoSourceLinkInTransaction(tx, {
        organizationId: seed.organizationId,
        vehicleId: seed.vehicleId,
        providerSourceLinkId: seed.linkId,
        invalidationReason: FSD_SOURCE_LINK_INVALIDATION_REASON_DEACTIVATED,
      }),
    );
    expect(fsd3.id).not.toBe(fsd4.id);
    const historical = await prisma.fsdDiscoveryRun.findUnique({ where: { id: fsd4.id } });
    expect(historical?.status).toBe('INVALIDATED');
    expect(historical?.discoveryStream).toBe('FSD4_HISTORICAL');
  });

  it('idempotent repeated invalidation', async () => {
    const seed = await seedVehicleWithDimo(prisma);
    await seedExecutableRun(prisma, { ...seed, stream: 'FSD3_CATALOG_SNAPSHOT' });
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      invalidationReason: FSD_SOURCE_LINK_INVALIDATION_REASON_DEACTIVATED,
    };
    await prisma.$transaction((tx) => invalidateExecutableFsdRunsForDimoSourceLinkInTransaction(tx, scope));
    await prisma.$transaction((tx) =>
      invalidateExecutableFsdRunsForDimoSourceLinkInTransaction(tx, scope),
    );
    const executable = await prisma.fsdDiscoveryRun.count({
      where: {
        providerSourceLinkId: seed.linkId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        invalidatedAt: null,
      },
    });
    expect(executable).toBe(0);
  });

  it('rejects cross-tenant invalidation scope', async () => {
    const seed = await seedVehicleWithDimo(prisma);
    await seedExecutableRun(prisma, { ...seed, stream: 'FSD3_CATALOG_SNAPSHOT' });
    const otherOrg = randomUUID();
    await expect(
      prisma.$transaction((tx) =>
        invalidateExecutableFsdRunsForDimoSourceLinkInTransaction(tx, {
          organizationId: otherOrg,
          vehicleId: seed.vehicleId,
          providerSourceLinkId: seed.linkId,
          invalidationReason: FSD_SOURCE_LINK_INVALIDATION_REASON_DEACTIVATED,
        }),
      ),
    ).rejects.toBeInstanceOf(FsdDiscoveryPersistenceError);
  });

  it('offboarding atomically invalidates runs and deactivates link', async () => {
    const seed = await seedVehicleWithDimo(prisma);
    const run = await seedExecutableRun(prisma, { ...seed, stream: 'FSD3_CATALOG_SNAPSHOT' });
    const offboarding = createVehicleOffboardingServiceForTests(prisma);
    await offboarding.offboardVehicle({
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId: null,
      idempotencyKey: randomUUID(),
    });
    const link = await prisma.vehicleDataSourceLink.findUnique({ where: { id: seed.linkId } });
    expect(link?.isActive).toBe(false);
    const after = await prisma.fsdDiscoveryRun.findUnique({ where: { id: run.id } });
    expect(after?.status).toBe('INVALIDATED');
    expect(after?.leaseOwner).toBeNull();
  });

  it('rolls back offboarding when FSD invalidation fails', async () => {
    const seed = await seedVehicleWithDimo(prisma);
    const offboarding = createVehicleOffboardingServiceForTests(prisma);
    const badLifecycle = {
      invalidateDimoSourceLinksForVehicleLifecycle: jest.fn().mockRejectedValue(new Error('FSD_INV_FAIL')),
    };
    const broken = new VehicleOffboardingService(
      prisma as never,
      new BusinessAuditOutboxRepository(prisma as never),
      badLifecycle as never,
    );
    await expect(
      broken.offboardVehicle({
        organizationId: seed.organizationId,
        vehicleId: seed.vehicleId,
        reason: 'REMOVE_FROM_PRODUCT',
        actorUserId: null,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow('FSD_INV_FAIL');
    const vehicle = await prisma.vehicle.findUnique({ where: { id: seed.vehicleId } });
    expect(vehicle?.registryLifecycle).toBe('ACTIVE');
    const link = await prisma.vehicleDataSourceLink.findUnique({ where: { id: seed.linkId } });
    expect(link?.isActive).toBe(true);
  });

  it('FSD3 acquire supersession clears leases on invalidated runs', async () => {
    const seed = await seedVehicleWithDimo(prisma);
    const runKey = randomUUID();
    const identity = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      runKey,
      dimoTokenId: seed.tokenId,
      connectionIdentityFingerprint: seed.fingerprint,
      discoveryStream: 'FSD3_CATALOG_SNAPSHOT' as const,
    };
    const first = await repo.acquireRunWithIdempotency(identity);
    expect(first.kind).toBe('CREATED');
    const otherKey = randomUUID();
    await repo.acquireRunWithIdempotency({ ...identity, runKey: otherKey });
    const oldRun = await prisma.fsdDiscoveryRun.findUnique({ where: { id: first.runId } });
    expect(oldRun?.status).toBe('INVALIDATED');
    expect(oldRun?.leaseOwner).toBeNull();
    expect(oldRun?.leaseExpiresAt).toBeNull();
  });

  it('offboarding lock order (vehicle FOR NO KEY UPDATE then FSD advisory) completes', async () => {
    const seed = await seedVehicleWithDimo(prisma);
    await prisma.$transaction(async (tx) => {
      await lockVehicleRowForLifecycleMutation(tx, {
        organizationId: seed.organizationId,
        vehicleId: seed.vehicleId,
      });
      await invalidateExecutableFsdRunsForDimoSourceLinkInTransaction(tx, {
        organizationId: seed.organizationId,
        vehicleId: seed.vehicleId,
        providerSourceLinkId: seed.linkId,
        invalidationReason: FSD_SOURCE_LINK_INVALIDATION_REASON_DEACTIVATED,
      });
    });
    await repo.acquireRunWithIdempotency({
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      runKey: randomUUID(),
      dimoTokenId: seed.tokenId,
      connectionIdentityFingerprint: seed.fingerprint,
      discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
    });
  });

  it('supersession reason is supported for future writers', async () => {
    const seed = await seedVehicleWithDimo(prisma);
    await seedExecutableRun(prisma, { ...seed, stream: 'FSD4_HISTORICAL' });
    await prisma.$transaction((tx) =>
      invalidateExecutableFsdRunsForDimoSourceLinkInTransaction(tx, {
        organizationId: seed.organizationId,
        vehicleId: seed.vehicleId,
        providerSourceLinkId: seed.linkId,
        invalidationReason: FSD_SOURCE_LINK_INVALIDATION_REASON_SUPERSEDED,
      }),
    );
    const run = await prisma.fsdDiscoveryRun.findFirst({ where: { providerSourceLinkId: seed.linkId } });
    expect(run?.invalidationReason).toBe('SOURCE_LINK_SUPERSEDED');
  });
});
