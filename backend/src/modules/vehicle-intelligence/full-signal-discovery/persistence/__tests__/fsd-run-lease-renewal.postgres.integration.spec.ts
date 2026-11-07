/**
 * FSD P5B M7 — run lease renewal semantics (disposable Postgres).
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
import {
  FSD_DISCOVERY_RUN_LEASE_RENEWAL_TTL_MS_V1,
  FsdDiscoveryPersistenceRepository,
  buildFsdDimoConnectionIdentityFingerprint,
  buildFsdDiscoveryRunKey,
} from '../index';

const run =
  process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1' ||
  process.env.VO5A_OFFBOARDING_PG === '1';

async function seedBinding(prisma: PrismaClient) {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const linkId = randomUUID();
  const dimoVehicleId = randomUUID();
  const tokenId = 6_000_000 + Math.floor(Math.random() * 1_000_000);
  await prisma.organization.create({
    data: {
      id: organizationId,
      companyName: `lease ${organizationId.slice(0, 8)}`,
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

(run ? describe : describe.skip)('FSD run lease renewal (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaClient();
  const repo = () => new FsdDiscoveryPersistenceRepository(prisma as never);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function acquireInProgress(seed: Awaited<ReturnType<typeof seedBinding>>) {
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
    };
    const runKey = buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: randomUUID() });
    const acquired = await repo().acquireRunWithIdempotency({
      ...scope,
      runKey,
      runRevision: 1,
      dimoTokenId: seed.tokenId,
      connectionIdentityFingerprint: seed.fingerprint,
    });
    const leaseOwner = `owner-${randomUUID().slice(0, 8)}`;
    const leaseExpiresAt = new Date(Date.now() + 60_000);
    const claimed = await repo().claimRunLease({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version,
      leaseOwner,
      leaseExpiresAt,
    });
    expect(claimed).toBe(true);
    return { scope, acquired, leaseOwner, leaseExpiresAt };
  }

  it('valid owner extends an active lease with bounded TTL', async () => {
    const seed = await seedBinding(prisma);
    const { scope, acquired, leaseOwner } = await acquireInProgress(seed);
    const before = await prisma.fsdDiscoveryRun.findUniqueOrThrow({ where: { id: acquired.runId } });
    const renewed = await repo().renewRunLease({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version + 1,
      leaseOwner,
    });
    expect(renewed.renewed).toBe(true);
    const after = await prisma.fsdDiscoveryRun.findUniqueOrThrow({ where: { id: acquired.runId } });
    expect(after.version).toBe(acquired.version + 2);
    expect(after.leaseExpiresAt!.getTime()).toBeGreaterThan(before.leaseExpiresAt!.getTime());
    expect(after.leaseExpiresAt!.getTime() - Date.now()).toBeLessThanOrEqual(
      FSD_DISCOVERY_RUN_LEASE_RENEWAL_TTL_MS_V1 + 5_000,
    );
  });

  it('expired owner cannot renew', async () => {
    const seed = await seedBinding(prisma);
    const { scope, acquired, leaseOwner } = await acquireInProgress(seed);
    await prisma.fsdDiscoveryRun.update({
      where: { id: acquired.runId },
      data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
    });
    const renewed = await repo().renewRunLease({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version + 1,
      leaseOwner,
    });
    expect(renewed.renewed).toBe(false);
  });

  it('competing replica claims after expiry; previous owner cannot renew', async () => {
    const seed = await seedBinding(prisma);
    const { scope, acquired, leaseOwner } = await acquireInProgress(seed);
    await prisma.fsdDiscoveryRun.update({
      where: { id: acquired.runId },
      data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
    });
    const newOwner = `replica-${randomUUID().slice(0, 8)}`;
    const reclaim = await repo().claimRunLease({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version + 1,
      leaseOwner: newOwner,
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    expect(reclaim).toBe(true);
    const staleRenew = await repo().renewRunLease({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version + 2,
      leaseOwner,
    });
    expect(staleRenew.renewed).toBe(false);
  });

  it('version conflict rejects renewal', async () => {
    const seed = await seedBinding(prisma);
    const { scope, acquired, leaseOwner } = await acquireInProgress(seed);
    const renewed = await repo().renewRunLease({
      scope,
      runId: acquired.runId,
      expectedVersion: 1,
      leaseOwner,
    });
    expect(renewed.renewed).toBe(false);
  });

  it('stale owner cannot COMPLETE with lease fence', async () => {
    const seed = await seedBinding(prisma);
    const { scope, acquired, leaseOwner } = await acquireInProgress(seed);
    await prisma.fsdDiscoveryRun.update({
      where: { id: acquired.runId },
      data: { status: 'IN_PROGRESS' },
    });
    const otherOwner = `other-${randomUUID().slice(0, 8)}`;
    const applied = await repo().transitionRunStatus({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version + 1,
      fromStatus: 'IN_PROGRESS',
      toStatus: 'COMPLETED',
      leaseFence: { leaseOwner: otherOwner },
    });
    expect(applied.applied).toBe(false);
    const row = await prisma.fsdDiscoveryRun.findUniqueOrThrow({ where: { id: acquired.runId } });
    expect(row.status).toBe('IN_PROGRESS');
  });

  it('stale owner cannot FAIL with lease fence', async () => {
    const seed = await seedBinding(prisma);
    const { scope, acquired, leaseOwner } = await acquireInProgress(seed);
    await prisma.fsdDiscoveryRun.update({
      where: { id: acquired.runId },
      data: { status: 'IN_PROGRESS' },
    });
    const applied = await repo().transitionRunStatus({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version + 1,
      fromStatus: 'IN_PROGRESS',
      toStatus: 'FAILED',
      leaseFence: { leaseOwner: `stale-${randomUUID().slice(0, 6)}` },
    });
    expect(applied.applied).toBe(false);
  });

  it('current owner COMPLETED succeeds with active lease', async () => {
    const seed = await seedBinding(prisma);
    const { scope, acquired, leaseOwner } = await acquireInProgress(seed);
    await prisma.fsdDiscoveryRun.update({
      where: { id: acquired.runId },
      data: { status: 'IN_PROGRESS' },
    });
    const applied = await repo().transitionRunStatus({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version + 1,
      fromStatus: 'IN_PROGRESS',
      toStatus: 'COMPLETED',
      leaseFence: { leaseOwner },
    });
    expect(applied.applied).toBe(true);
    const row = await prisma.fsdDiscoveryRun.findUniqueOrThrow({ where: { id: acquired.runId } });
    expect(row.status).toBe('COMPLETED');
    expect(row.leaseOwner).toBeNull();
  });

  it('expired lease cannot COMPLETE even for current owner', async () => {
    const seed = await seedBinding(prisma);
    const { scope, acquired, leaseOwner } = await acquireInProgress(seed);
    await prisma.fsdDiscoveryRun.update({
      where: { id: acquired.runId },
      data: { status: 'IN_PROGRESS', leaseExpiresAt: new Date(Date.now() - 500) },
    });
    const applied = await repo().transitionRunStatus({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version + 1,
      fromStatus: 'IN_PROGRESS',
      toStatus: 'COMPLETED',
      leaseFence: { leaseOwner },
    });
    expect(applied.applied).toBe(false);
  });

  it('competing replica takeover prevents old owner terminalization', async () => {
    const seed = await seedBinding(prisma);
    const { scope, acquired, leaseOwner } = await acquireInProgress(seed);
    await prisma.fsdDiscoveryRun.update({
      where: { id: acquired.runId },
      data: { status: 'IN_PROGRESS', leaseExpiresAt: new Date(Date.now() - 500) },
    });
    const newOwner = `replica-${randomUUID().slice(0, 8)}`;
    expect(
      await repo().claimRunLease({
        scope,
        runId: acquired.runId,
        expectedVersion: acquired.version + 1,
        leaseOwner: newOwner,
        leaseExpiresAt: new Date(Date.now() + 60_000),
      }),
    ).toBe(true);
    await prisma.fsdDiscoveryRun.update({
      where: { id: acquired.runId },
      data: { status: 'IN_PROGRESS' },
    });
    const stale = await repo().transitionRunStatus({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version + 2,
      fromStatus: 'IN_PROGRESS',
      toStatus: 'COMPLETED',
      leaseFence: { leaseOwner },
    });
    expect(stale.applied).toBe(false);
    const current = await repo().transitionRunStatus({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version + 2,
      fromStatus: 'IN_PROGRESS',
      toStatus: 'COMPLETED',
      leaseFence: { leaseOwner: newOwner },
    });
    expect(current.applied).toBe(true);
  });

  it('invalidated run rejects renewal', async () => {
    const seed = await seedBinding(prisma);
    const { scope, acquired, leaseOwner } = await acquireInProgress(seed);
    await prisma.fsdDiscoveryRun.update({
      where: { id: acquired.runId },
      data: { status: 'INVALIDATED', invalidatedAt: new Date() },
    });
    const renewed = await repo().renewRunLease({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version + 1,
      leaseOwner,
    });
    expect(renewed.renewed).toBe(false);
  });
});
