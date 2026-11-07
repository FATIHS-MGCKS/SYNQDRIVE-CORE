/**
 * FSD P5B H1/H3 — adversarial offboarding vs FSD acquire lock interleaving.
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
import { acquirePgAdvisoryXactLock64 } from '@shared/database/pg-advisory-lock.util';
import { ensureOrganizationProductEntitlement } from '@modules/vehicle-onboarding/testing/org-product-test.harness';
import { createVehicleOffboardingServiceForTests } from '@modules/vehicle-onboarding/testing/vehicle-offboarding-test.harness';
import { buildFsdDiscoverySourceLinkLockKey } from '../fsd-source-link-lifecycle-invalidation.v1';
import { buildFsdDimoConnectionIdentityFingerprint } from '../fsd-discovery-persistence.contract.v1';
import { FsdDiscoveryPersistenceRepository } from '../fsd-discovery-persistence.repository';
import {
  assertFsd2PersistencePostgresCiEnv,
  ensureFsd2DisposableDatabaseOnce,
} from '../fsd-discovery-persistence.postgres-harness';
import { lockDimoSourceLinkRowForLifecycleMutation } from '../fsd-dimo-source-link-row-lock.v1';
import { lockVehicleRowForLifecycleMutation } from '@modules/vehicle-onboarding/offboarding/vehicle-lifecycle-row-lock';
import { createFsd3MockDiscoveryProvider } from '../../orchestration/fsd3-mock-provider.v1';
import { Fsd3CatalogSnapshotOrchestratorService } from '../../orchestration/fsd3-orchestration.service.v1';
import { createDefaultFsd3OrchestrationConfigV1 } from '../../orchestration/fsd3-orchestration.config.v1';

const LIVE = process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1';
const REQUIRED = process.env.FSD_DISCOVERY_PERSISTENCE_PG_REQUIRED === '1';

function defer(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function seedDimo(prisma: PrismaClient) {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const dimoVehicleId = randomUUID();
  const linkId = randomUUID();
  const tokenId = 8_100_000 + Math.floor(Math.random() * 50_000);
  await prisma.organization.create({
    data: {
      id: organizationId,
      companyName: `P5B-ADV ${organizationId.slice(0, 8)}`,
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
      assignmentReason: 'P5B_ADV',
      assignmentSource: 'P5B_ADV',
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

(LIVE ? describe : describe.skip)('FSD P5B adversarial offboard vs acquire', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;

  beforeAll(async () => {
    assertFsd2PersistencePostgresCiEnv();
    if (REQUIRED) {
      await ensureFsd2DisposableDatabaseOnce();
    }
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('H1: documents FOR UPDATE + FK interleaving deadlock (40P01)', async () => {
    const seed = await seedDimo(prisma);
    const prismaB = new PrismaClient();
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
    };
    const lockKey = buildFsdDiscoverySourceLinkLockKey(scope);
    const bHoldsAdvisory = defer();
    const aHoldsVehicle = defer();

    const legacyForUpdate = async () =>
      prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT registry_lifecycle FROM vehicles
            WHERE id = ${seed.vehicleId} AND organization_id = ${seed.organizationId}
            FOR UPDATE
          `;
          aHoldsVehicle.resolve();
          await bHoldsAdvisory.promise;
          await acquirePgAdvisoryXactLock64(tx, lockKey);
        },
        { timeout: 8_000 },
      );

    const acquireWhileBlocked = prismaB.$transaction(
      async (tx) => {
        await acquirePgAdvisoryXactLock64(tx, lockKey);
        bHoldsAdvisory.resolve();
        await aHoldsVehicle.promise;
        await tx.fsdDiscoveryRun.create({
          data: {
            organizationId: seed.organizationId,
            vehicleId: seed.vehicleId,
            providerSourceLinkId: seed.linkId,
            runKey: randomUUID(),
            runRevision: 1,
            discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
            dimoTokenId: seed.tokenId,
            connectionIdentityFingerprint: seed.fingerprint,
            status: 'PENDING',
          },
        });
      },
      { timeout: 8_000 },
    );

    const outcome = await Promise.allSettled([legacyForUpdate(), acquireWhileBlocked]);
    await prismaB.$disconnect();
    const deadlockSeen = outcome.some(
      (r) =>
        r.status === 'rejected' &&
        String((r.reason as Error)?.message ?? '').includes('deadlock detected'),
    );
    expect(deadlockSeen).toBe(true);
  });

  it('H1: FOR NO KEY UPDATE offboard vs held advisory completes without deadlock', async () => {
    const seed = await seedDimo(prisma);
    const prismaB = new PrismaClient();
    const offboarding = createVehicleOffboardingServiceForTests(prisma);
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
    };
    const lockKey = buildFsdDiscoverySourceLinkLockKey(scope);
    const bHoldsAdvisory = defer();
    const aHoldsVehicle = defer();

    const fsdInsert = prismaB.$transaction(
      async (tx) => {
        await acquirePgAdvisoryXactLock64(tx, lockKey);
        bHoldsAdvisory.resolve();
        await aHoldsVehicle.promise;
        await tx.fsdDiscoveryRun.create({
          data: {
            organizationId: seed.organizationId,
            vehicleId: seed.vehicleId,
            providerSourceLinkId: seed.linkId,
            runKey: randomUUID(),
            runRevision: 1,
            discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
            dimoTokenId: seed.tokenId,
            connectionIdentityFingerprint: seed.fingerprint,
            status: 'PENDING',
          },
        });
      },
      { timeout: 25_000 },
    );

    const offboard = (async () => {
      await bHoldsAdvisory.promise;
      return offboarding.offboardVehicle({
        organizationId: seed.organizationId,
        vehicleId: seed.vehicleId,
        reason: 'REMOVE_FROM_PRODUCT',
        actorUserId: null,
        idempotencyKey: randomUUID(),
        operationalGate: async () => {
          aHoldsVehicle.resolve();
        },
      });
    })();

    await expect(Promise.all([offboard, fsdInsert])).resolves.toBeDefined();
    await prismaB.$disconnect();
  });

  it('H4: source link FOR UPDATE + FSD run FK insert reproduces 40P01', async () => {
    const seed = await seedDimo(prisma);
    const prismaB = new PrismaClient();
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
    };
    const lockKey = buildFsdDiscoverySourceLinkLockKey(scope);
    const aHoldsLink = defer();
    const bHoldsAdvisory = defer();

    const legacyLinkForUpdate = () =>
      prisma.$transaction(
        async (tx) => {
          await lockVehicleRowForLifecycleMutation(tx, {
            organizationId: seed.organizationId,
            vehicleId: seed.vehicleId,
          });
          await tx.$queryRaw`
            SELECT l.id FROM vehicle_data_source_links l
            INNER JOIN vehicles v ON v.id = l.vehicle_id
            WHERE l.id = ${seed.linkId} AND v.organization_id = ${seed.organizationId}
            FOR UPDATE OF l
          `;
          aHoldsLink.resolve();
          await bHoldsAdvisory.promise;
          await acquirePgAdvisoryXactLock64(tx, lockKey);
        },
        { timeout: 8_000 },
      );

    const insertWhileLinkLocked = prismaB.$transaction(
      async (tx) => {
        await acquirePgAdvisoryXactLock64(tx, lockKey);
        bHoldsAdvisory.resolve();
        await aHoldsLink.promise;
        await tx.fsdDiscoveryRun.create({
          data: {
            organizationId: seed.organizationId,
            vehicleId: seed.vehicleId,
            providerSourceLinkId: seed.linkId,
            runKey: randomUUID(),
            runRevision: 1,
            discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
            dimoTokenId: seed.tokenId,
            connectionIdentityFingerprint: seed.fingerprint,
            status: 'PENDING',
          },
        });
      },
      { timeout: 8_000 },
    );

    const outcome = await Promise.allSettled([legacyLinkForUpdate(), insertWhileLinkLocked]);
    await prismaB.$disconnect();
    expect(
      outcome.some(
        (r) =>
          r.status === 'rejected' &&
          String((r.reason as Error)?.message ?? '').includes('deadlock detected'),
      ),
    ).toBe(true);
  });

  it('H4: source link FOR NO KEY UPDATE path completes without 40P01', async () => {
    const seed = await seedDimo(prisma);
    const prismaB = new PrismaClient();
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
    };
    const lockKey = buildFsdDiscoverySourceLinkLockKey(scope);
    const aHoldsLink = defer();
    const bHoldsAdvisory = defer();

    const correctedPath = () =>
      prisma.$transaction(
        async (tx) => {
          await lockVehicleRowForLifecycleMutation(tx, {
            organizationId: seed.organizationId,
            vehicleId: seed.vehicleId,
          });
          await lockDimoSourceLinkRowForLifecycleMutation(tx, {
            organizationId: seed.organizationId,
            vehicleId: seed.vehicleId,
            providerSourceLinkId: seed.linkId,
          });
          aHoldsLink.resolve();
          await bHoldsAdvisory.promise;
          await acquirePgAdvisoryXactLock64(tx, lockKey);
        },
        { timeout: 25_000 },
      );

    const insertWhileLinkLocked = prismaB.$transaction(
      async (tx) => {
        await acquirePgAdvisoryXactLock64(tx, lockKey);
        bHoldsAdvisory.resolve();
        await aHoldsLink.promise;
        await tx.fsdDiscoveryRun.create({
          data: {
            organizationId: seed.organizationId,
            vehicleId: seed.vehicleId,
            providerSourceLinkId: seed.linkId,
            runKey: randomUUID(),
            runRevision: 1,
            discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
            dimoTokenId: seed.tokenId,
            connectionIdentityFingerprint: seed.fingerprint,
            status: 'PENDING',
          },
        });
      },
      { timeout: 25_000 },
    );

    await expect(Promise.all([correctedPath(), insertWhileLinkLocked])).resolves.toBeDefined();
    await prismaB.$disconnect();
  });

  it('H6: catalog gate — offboard during blocked mock provider, no second HTTP, no stale evidence', async () => {
    const seed = await seedDimo(prisma);
    const repo = new FsdDiscoveryPersistenceRepository(prisma as never);
    let releaseCatalog: () => void = () => undefined;
    const blockUntilReleased = new Promise<void>((resolve) => {
      releaseCatalog = resolve;
    });
    const entered = defer();
    const provider = createFsd3MockDiscoveryProvider({
      mode: 'TESLA_REFERENCE_26',
      catalogGate: {
        onCatalogEntered: () => entered.resolve(),
        blockUntilReleased,
      },
    });
    const typedProvider = provider as ReturnType<typeof createFsd3MockDiscoveryProvider> & {
      getCatalogCallCount(): number;
    };
    const config = {
      ...createDefaultFsd3OrchestrationConfigV1(),
      enabled: true,
      allowedVehicleIds: new Set([seed.vehicleId]),
      providerExecutionEnabled: true,
    };
    const svc = new Fsd3CatalogSnapshotOrchestratorService(repo, provider, config);
    const offboarding = createVehicleOffboardingServiceForTests(prisma);

    const discovery = svc.runCatalogSnapshotDiscovery({
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      dimoVehicleId: seed.dimoVehicleId,
      dimoTokenId: seed.tokenId,
      discoveryRequestKey: randomUUID(),
      leaseOwner: 'gate-mock-worker',
      leaseExpiresAt: new Date(Date.now() + 120_000),
    });

    await entered.promise;
    await offboarding.offboardVehicle({
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId: null,
      idempotencyKey: randomUUID(),
    });
    releaseCatalog();

    const result = await discovery;
    expect(typedProvider.getCatalogCallCount()).toBe(1);
    const run = await prisma.fsdDiscoveryRun.findFirst({
      where: { providerSourceLinkId: seed.linkId },
      orderBy: { createdAt: 'desc' },
    });
    expect(run?.status).toBe('INVALIDATED');
    expect(result.status).not.toBe('COMPLETED');
    const catalogEvidence = await prisma.fsdDiscoverySignalEvidence.count({
      where: { runId: run!.id, stageType: 'CATALOG' },
    });
    expect(catalogEvidence).toBe(0);
  });
});
