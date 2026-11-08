/**
 * Simplified P6B one-shot — preflight, direct execution, inspector (disposable PostgreSQL).
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
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSourceLinkOperatorAuthorizationService } from '@modules/vehicle-onboarding/services/dimo-source-link-operator-authorization.service';
import { FsdDiscoveryPersistenceRepository } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import {
  assertFsd2PersistencePostgresCiEnv,
  ensureFsd2DisposableDatabaseOnce,
} from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.postgres-harness';
import { createFsd3MockDiscoveryProvider } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-mock-provider.v1';
import { Fsd3OneShotPreflightService } from '../fsd3-one-shot-preflight.service';
import { Fsd3OneShotExecutionService } from '../fsd3-one-shot-execution.service';
import { Fsd3DiscoveryRunInspectorService } from '../fsd3-discovery-run-inspector.service';

const LIVE = process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1';
const REQUIRED = process.env.FSD_DISCOVERY_PERSISTENCE_PG_REQUIRED === '1';

async function ensurePlatformUser(
  prisma: PrismaClient,
  userId: string,
  role: 'MASTER_ADMIN' | 'USER',
  status: 'ACTIVE' | 'SUSPENDED',
) {
  const email = `${userId}@p6b-one-shot.test`;
  await prisma.$executeRaw`
    INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
    VALUES (
      ${userId}, ${email}, 'P6B One Shot', ${status}::"UserStatus",
      ${role}::"UserPlatformRole", NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      status = ${status}::"UserStatus",
      platform_role = ${role}::"UserPlatformRole"
  `;
}

async function seedDimoBinding(prisma: PrismaClient) {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const dimoVehicleId = randomUUID();
  const linkId = randomUUID();
  const tokenId = Math.floor(Math.random() * 1_000_000) + 5_000_000;
  await prisma.organization.create({
    data: {
      id: organizationId,
      companyName: `P6B ${organizationId.slice(0, 8)}`,
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
  return { organizationId, vehicleId, linkId, dimoVehicleId, tokenId };
}

function scopeFor(seed: Awaited<ReturnType<typeof seedDimoBinding>>, discoveryRequestKey: string) {
  return {
    organizationId: seed.organizationId,
    vehicleId: seed.vehicleId,
    providerSourceLinkId: seed.linkId,
    discoveryRequestKey,
  };
}

(LIVE ? describe : describe.skip)('FSD3 one-shot ops (PostgreSQL)', () => {
  jest.setTimeout(180_000);

  let prisma: PrismaClient;

  beforeAll(async () => {
    assertFsd2PersistencePostgresCiEnv();
    if (REQUIRED) {
      await ensureFsd2DisposableDatabaseOnce();
    }
    prisma = new PrismaClient();
    await prisma.$connect();
  }, 600_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  function services() {
    const prismaSvc = prisma as unknown as PrismaService;
    const persistence = new FsdDiscoveryPersistenceRepository(prismaSvc);
    const operatorAuth = new DimoSourceLinkOperatorAuthorizationService(prismaSvc);
    const preflight = new Fsd3OneShotPreflightService(prismaSvc, operatorAuth, persistence);
    return {
      preflight,
      execution: new Fsd3OneShotExecutionService(persistence),
      inspector: new Fsd3DiscoveryRunInspectorService(prismaSvc, persistence),
    };
  }

  async function runMockExecute(
    actorUserId: string,
    scope: ReturnType<typeof scopeFor>,
    provider = createFsd3MockDiscoveryProvider({ mode: 'TESLA_REFERENCE_26' }),
  ) {
    const { preflight, execution } = services();
    const pre = await preflight.runAuthorizedReadOnlyPreflight({ actorUserId, scope });
    return execution.executeOneShot({
      scope,
      preflight: pre,
      liveProvider: 'mock',
      provider,
      releaseSha: 'pg-test',
    });
  }

  it('preflight rejects inactive source link', async () => {
    const seed = await seedDimoBinding(prisma);
    const actorUserId = randomUUID();
    await ensurePlatformUser(prisma, actorUserId, 'MASTER_ADMIN', 'ACTIVE');
    await prisma.vehicleDataSourceLink.update({
      where: { id: seed.linkId },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    const { preflight } = services();
    await expect(
      preflight.runAuthorizedReadOnlyPreflight({
        actorUserId,
        scope: scopeFor(seed, randomUUID()),
      }),
    ).rejects.toThrow();
  });

  it('mock execute + inspector with MASTER_ADMIN', async () => {
    const seed = await seedDimoBinding(prisma);
    const actorUserId = randomUUID();
    await ensurePlatformUser(prisma, actorUserId, 'MASTER_ADMIN', 'ACTIVE');
    const scope = scopeFor(seed, randomUUID());
    const result = await runMockExecute(actorUserId, scope);
    expect(['COMPLETED', 'PARTIAL']).toContain(result.terminalStatus);
    const { inspector } = services();
    const report = await inspector.inspectTenantScoped({
      actorUserId,
      organizationId: seed.organizationId,
      runId: result.runId,
    });
    expect(report.catalogSignalCount).toBe(26);
    await expect(
      inspector.inspectTenantScoped({
        actorUserId: randomUUID(),
        organizationId: seed.organizationId,
        runId: result.runId,
      }),
    ).rejects.toThrow('INSPECTOR_FORBIDDEN');
  });

  it('inspector cross-tenant fails closed', async () => {
    const seed = await seedDimoBinding(prisma);
    const actorUserId = randomUUID();
    await ensurePlatformUser(prisma, actorUserId, 'MASTER_ADMIN', 'ACTIVE');
    const { inspector } = services();
    await expect(
      inspector.inspectTenantScoped({
        actorUserId,
        organizationId: randomUUID(),
        runId: randomUUID(),
      }),
    ).rejects.toThrow('RUN_NOT_FOUND');
  });

  it('duplicate discoveryRequestKey is idempotent on second execute', async () => {
    const seed = await seedDimoBinding(prisma);
    const actorUserId = randomUUID();
    await ensurePlatformUser(prisma, actorUserId, 'MASTER_ADMIN', 'ACTIVE');
    const scope = scopeFor(seed, randomUUID());
    const first = await runMockExecute(actorUserId, scope);
    const second = await runMockExecute(actorUserId, scope);
    expect(first.terminalStatus).not.toBe('SKIPPED');
    expect(second.runId).toBe(first.runId);
    expect(second.terminalStatus).toBe(first.terminalStatus);
  });

  it('second execute does not double-dispatch provider', async () => {
    const seed = await seedDimoBinding(prisma);
    const actorUserId = randomUUID();
    await ensurePlatformUser(prisma, actorUserId, 'MASTER_ADMIN', 'ACTIVE');
    const scope = scopeFor(seed, randomUUID());
    const provider = createFsd3MockDiscoveryProvider({ mode: 'TESLA_REFERENCE_26' }) as ReturnType<
      typeof createFsd3MockDiscoveryProvider
    > & {
      getCatalogCallCount(): number;
      getSnapshotCallCount(): number;
    };
    const first = await runMockExecute(actorUserId, scope, provider);
    const catalogAfterFirst = provider.getCatalogCallCount();
    const snapshotAfterFirst = provider.getSnapshotCallCount();
    expect(catalogAfterFirst + snapshotAfterFirst).toBeLessThanOrEqual(2);
    const replayed = await runMockExecute(actorUserId, scope, provider);
    expect(replayed.runId).toBe(first.runId);
    expect(replayed.terminalStatus).toBe(first.terminalStatus);
    expect(provider.getCatalogCallCount()).toBe(catalogAfterFirst);
    expect(provider.getSnapshotCallCount()).toBe(snapshotAfterFirst);
  });

  it('concurrent mock execute with same discoveryRequestKey serializes to one run', async () => {
    const seed = await seedDimoBinding(prisma);
    const actorUserId = randomUUID();
    await ensurePlatformUser(prisma, actorUserId, 'MASTER_ADMIN', 'ACTIVE');
    const scope = scopeFor(seed, randomUUID());
    const { preflight, execution } = services();
    let releaseCatalog!: () => void;
    const catalogBlock = new Promise<void>((resolve) => {
      releaseCatalog = resolve;
    });
    const provider = createFsd3MockDiscoveryProvider({
      mode: 'TESLA_REFERENCE_26',
      catalogGate: { blockUntilReleased: catalogBlock },
    }) as ReturnType<typeof createFsd3MockDiscoveryProvider> & {
      getCatalogCallCount(): number;
      getSnapshotCallCount(): number;
    };

    const executeOnce = async () => {
      const pre = await preflight.runAuthorizedReadOnlyPreflight({ actorUserId, scope });
      return execution.executeOneShot({
        scope,
        preflight: pre,
        liveProvider: 'mock',
        provider,
        releaseSha: 'pg-test',
      });
    };

    const pending = Promise.all([executeOnce(), executeOnce()]);
    await new Promise((r) => setTimeout(r, 50));
    releaseCatalog();
    const [a, b] = await pending;
    expect(a.runId).toBe(b.runId);
    expect(a.terminalStatus).toBe(b.terminalStatus);
    expect(provider.getCatalogCallCount() + provider.getSnapshotCallCount()).toBeLessThanOrEqual(2);
  });
});
