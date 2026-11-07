/**
 * FSD P5B H5/H7 — audited DIMO link deactivation idempotency + VSI delivery.
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
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';
import { createDimoSourceLinkAuditedDeactivationForTests } from './testing/dimo-source-link-audited-deactivation-test.harness';

const run =
  process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1' ||
  process.env.VO5A_OFFBOARDING_PG === '1';

async function seed(prisma: PrismaClient) {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const linkId = randomUUID();
  await prisma.organization.create({
    data: {
      id: organizationId,
      companyName: `OPS ${organizationId.slice(0, 8)}`,
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
  const dimoVehicleId = randomUUID();
  await prisma.dimoVehicle.create({
    data: {
      id: dimoVehicleId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      tokenId: 7_500_000 + Math.floor(Math.random() * 1_000_000),
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
  const actorUserId = randomUUID();
  return { organizationId, vehicleId, linkId, actorUserId };
}

function defer(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

(run ? describe : describe.skip)('DimoSourceLinkAuditedDeactivation (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaClient();
  const svc = () => createDimoSourceLinkAuditedDeactivationForTests(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('deactivates link, writes audit, enqueues VSI SOURCE_LINK_DEACTIVATED', async () => {
    const { organizationId, vehicleId, linkId, actorUserId } = await seed(prisma);
    const idempotencyKey = randomUUID();
    const result = await svc().deactivateAudited({
      organizationId,
      vehicleId,
      providerSourceLinkId: linkId,
      actorUserId,
      deactivationReason: 'OPS_TEST',
      idempotencyKey,
    });
    expect(result.idempotentReplay).toBe(false);
    const link = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } });
    expect(link?.isActive).toBe(false);
    const vsi = await prisma.vsiProfileLifecycleOutbox.findFirst({
      where: { vehicleId, eventType: 'SOURCE_LINK_DEACTIVATED' },
    });
    expect(vsi).not.toBeNull();
    const audit = await prisma.businessAuditOutbox.findFirst({
      where: { idempotencyKey: `dimo-source-link:DEACTIVATED:audit:v1:${idempotencyKey}` },
    });
    expect(audit?.action).toBe('DIMO_SOURCE_LINK_DEACTIVATED');
  });

  it('same idempotency key replays safely', async () => {
    const { organizationId, vehicleId, linkId, actorUserId } = await seed(prisma);
    const idempotencyKey = randomUUID();
    const input = {
      organizationId,
      vehicleId,
      providerSourceLinkId: linkId,
      actorUserId,
      deactivationReason: 'OPS_TEST',
      idempotencyKey,
    };
    const first = await svc().deactivateAudited(input);
    const second = await svc().deactivateAudited(input);
    expect(first.idempotentReplay).toBe(false);
    expect(second.idempotentReplay).toBe(true);
  });

  it('rejects idempotency key reused for different link', async () => {
    const seedA = await seed(prisma);
    const idempotencyKey = randomUUID();
    await svc().deactivateAudited({
      organizationId: seedA.organizationId,
      vehicleId: seedA.vehicleId,
      providerSourceLinkId: seedA.linkId,
      actorUserId: seedA.actorUserId,
      deactivationReason: 'OPS_TEST',
      idempotencyKey,
    });
    const seedB = await seed(prisma);
    await expect(
      svc().deactivateAudited({
        organizationId: seedB.organizationId,
        vehicleId: seedB.vehicleId,
        providerSourceLinkId: seedB.linkId,
        actorUserId: seedB.actorUserId,
        deactivationReason: 'OPS_TEST',
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: 'OUTBOX_IDEMPOTENCY_CONFLICT' });
  });

  it('rejects idempotency key reused for different organization', async () => {
    const seedA = await seed(prisma);
    const idempotencyKey = randomUUID();
    await svc().deactivateAudited({
      organizationId: seedA.organizationId,
      vehicleId: seedA.vehicleId,
      providerSourceLinkId: seedA.linkId,
      actorUserId: seedA.actorUserId,
      deactivationReason: 'OPS_TEST',
      idempotencyKey,
    });
    const seedB = await seed(prisma);
    await expect(
      svc().deactivateAudited({
        organizationId: seedB.organizationId,
        vehicleId: seedB.vehicleId,
        providerSourceLinkId: seedB.linkId,
        actorUserId: seedB.actorUserId,
        deactivationReason: 'OPS_TEST',
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: 'OUTBOX_IDEMPOTENCY_CONFLICT' });
  });

  it('rejects different deactivation reason on same idempotency key', async () => {
    const { organizationId, vehicleId, linkId, actorUserId } = await seed(prisma);
    const idempotencyKey = randomUUID();
    await svc().deactivateAudited({
      organizationId,
      vehicleId,
      providerSourceLinkId: linkId,
      actorUserId,
      deactivationReason: 'OPS_TEST',
      idempotencyKey,
    });
    await expect(
      svc().deactivateAudited({
        organizationId,
        vehicleId,
        providerSourceLinkId: linkId,
        actorUserId,
        deactivationReason: 'OTHER_REASON',
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: 'OUTBOX_IDEMPOTENCY_CONFLICT' });
  });

  it('rejects different actor on same idempotency key', async () => {
    const { organizationId, vehicleId, linkId, actorUserId } = await seed(prisma);
    const idempotencyKey = randomUUID();
    await svc().deactivateAudited({
      organizationId,
      vehicleId,
      providerSourceLinkId: linkId,
      actorUserId,
      deactivationReason: 'OPS_TEST',
      idempotencyKey,
    });
    await expect(
      svc().deactivateAudited({
        organizationId,
        vehicleId,
        providerSourceLinkId: linkId,
        actorUserId: randomUUID(),
        deactivationReason: 'OPS_TEST',
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: 'OUTBOX_IDEMPOTENCY_CONFLICT' });
  });

  it('concurrent identical idempotency: one mutation, one replay, one audit, one VSI', async () => {
    const seedA = await seed(prisma);
    const idempotencyKey = randomUUID();
    const barrier = defer();
    const input = {
      organizationId: seedA.organizationId,
      vehicleId: seedA.vehicleId,
      providerSourceLinkId: seedA.linkId,
      actorUserId: seedA.actorUserId,
      deactivationReason: 'OPS_TEST',
      idempotencyKey,
    };
    const first = svc().deactivateAudited(input);
    barrier.resolve();
    const second = (async () => {
      await barrier.promise;
      return svc().deactivateAudited(input);
    })();
    const [r1, r2] = await Promise.all([first, second]);
    const replays = [r1.idempotentReplay, r2.idempotentReplay].sort();
    expect(replays).toEqual([false, true]);
    expect(r1.deactivatedAt.toISOString()).toBe(r2.deactivatedAt.toISOString());
    const audits = await prisma.businessAuditOutbox.count({
      where: { idempotencyKey: `dimo-source-link:DEACTIVATED:audit:v1:${idempotencyKey}` },
    });
    expect(audits).toBe(1);
    const vsi = await prisma.vsiProfileLifecycleOutbox.count({
      where: {
        vehicleId: seedA.vehicleId,
        eventType: 'SOURCE_LINK_DEACTIVATED',
        providerSourceLinkId: seedA.linkId,
      },
    });
    expect(vsi).toBe(1);
  });

  it('concurrent same idempotency key on different vehicles yields conflict without second mutation', async () => {
    const seedA = await seed(prisma);
    const seedB = await seed(prisma);
    const idempotencyKey = randomUUID();
    await svc().deactivateAudited({
      organizationId: seedA.organizationId,
      vehicleId: seedA.vehicleId,
      providerSourceLinkId: seedA.linkId,
      actorUserId: seedA.actorUserId,
      deactivationReason: 'OPS_TEST',
      idempotencyKey,
    });
    await expect(
      svc().deactivateAudited({
        organizationId: seedB.organizationId,
        vehicleId: seedB.vehicleId,
        providerSourceLinkId: seedB.linkId,
        actorUserId: seedB.actorUserId,
        deactivationReason: 'OPS_TEST',
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: 'OUTBOX_IDEMPOTENCY_CONFLICT' });
    const linkB = await prisma.vehicleDataSourceLink.findUnique({ where: { id: seedB.linkId } });
    expect(linkB?.isActive).toBe(true);
  });

  it('recovery invalidates executable runs on already-inactive link without toggling active', async () => {
    const { organizationId, vehicleId, linkId, actorUserId } = await seed(prisma);
    await prisma.vehicleDataSourceLink.update({
      where: { id: linkId },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    await prisma.fsdDiscoveryRun.create({
      data: {
        organizationId,
        vehicleId,
        providerSourceLinkId: linkId,
        runKey: randomUUID(),
        runRevision: 1,
        discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
        status: 'IN_PROGRESS',
      },
    });
    const result = await svc().recoverFsdRunsForInactiveLinkAudited({
      organizationId,
      vehicleId,
      providerSourceLinkId: linkId,
      actorUserId,
      idempotencyKey: randomUUID(),
      recoveryReason: 'OOB_RECOVERY',
    });
    expect(result.invalidatedCount).toBeGreaterThanOrEqual(1);
    const run = await prisma.fsdDiscoveryRun.findFirst({ where: { providerSourceLinkId: linkId } });
    expect(run?.status).toBe('INVALIDATED');
    expect(
      await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } }),
    ).toMatchObject({ isActive: false });
  });

  it('already inactive link without audit record fails closed', async () => {
    const { organizationId, vehicleId, linkId, actorUserId } = await seed(prisma);
    await prisma.vehicleDataSourceLink.update({
      where: { id: linkId },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    await expect(
      svc().deactivateAudited({
        organizationId,
        vehicleId,
        providerSourceLinkId: linkId,
        actorUserId,
        deactivationReason: 'OPS_TEST',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'VEHICLE_REGISTRY_INVALID_TRANSITION' });
  });
});
