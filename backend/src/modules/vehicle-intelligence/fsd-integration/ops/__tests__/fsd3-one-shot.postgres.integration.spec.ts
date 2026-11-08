/**
 * P6B — one-shot preflight, mock execution, inspector (disposable PostgreSQL).
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
import { buildFsdDimoConnectionIdentityFingerprint } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.contract.v1';
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
  const fingerprint = buildFsdDimoConnectionIdentityFingerprint({ dimoVehicleId, tokenId });
  return { organizationId, vehicleId, linkId, dimoVehicleId, tokenId, fingerprint };
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
    return {
      preflight: new Fsd3OneShotPreflightService(prismaSvc, operatorAuth, persistence),
      execution: new Fsd3OneShotExecutionService(persistence),
      inspector: new Fsd3DiscoveryRunInspectorService(prismaSvc, persistence),
    };
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
        scope: {
          organizationId: seed.organizationId,
          vehicleId: seed.vehicleId,
          providerSourceLinkId: seed.linkId,
          discoveryRequestKey: randomUUID(),
          executableReleaseSha: 'e32880da1beb99642f1e994f45c4e9038fc1a541',
        },
      }),
    ).rejects.toThrow();
  });

  it('mock execute + inspector read path', async () => {
    const seed = await seedDimoBinding(prisma);
    const actorUserId = randomUUID();
    await ensurePlatformUser(prisma, actorUserId, 'MASTER_ADMIN', 'ACTIVE');
    const discoveryRequestKey = randomUUID();
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      discoveryRequestKey,
      executableReleaseSha: 'e32880da1beb99642f1e994f45c4e9038fc1a541',
    };
    const { preflight, execution, inspector } = services();
    const pre = await preflight.runAuthorizedReadOnlyPreflight({ actorUserId, scope });
    expect(pre.status).toBe('PREFLIGHT_OK');
    const provider = createFsd3MockDiscoveryProvider({ mode: 'TESLA_REFERENCE_26' });
    const result = await execution.executeAuthorizedOneShot({
      scope,
      approvalReference: 'test-approval-ref-p6b',
      preflight: pre,
      provider,
    });
    expect(['COMPLETED', 'PARTIAL']).toContain(result.terminalStatus);
    expect(result.runId.length).toBeGreaterThan(10);
    const report = await inspector.inspectTenantScoped({
      organizationId: seed.organizationId,
      runId: result.runId,
    });
    expect(report.runId).toBe(result.runId);
    expect(report.ledgerAttemptCount).not.toBeNull();
    expect(report.catalogSignalCount).toBe(26);
  });

  it('duplicate discoveryRequestKey is idempotent on second execute', async () => {
    const seed = await seedDimoBinding(prisma);
    const actorUserId = randomUUID();
    await ensurePlatformUser(prisma, actorUserId, 'MASTER_ADMIN', 'ACTIVE');
    const discoveryRequestKey = randomUUID();
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      discoveryRequestKey,
      executableReleaseSha: 'e32880da1beb99642f1e994f45c4e9038fc1a541',
    };
    const { preflight, execution } = services();
    const pre = await preflight.runAuthorizedReadOnlyPreflight({ actorUserId, scope });
    const provider = createFsd3MockDiscoveryProvider({ mode: 'TESLA_REFERENCE_26' });
    const first = await execution.executeAuthorizedOneShot({
      scope,
      approvalReference: 'dup-test',
      preflight: pre,
      provider,
    });
    const second = await execution.executeAuthorizedOneShot({
      scope,
      approvalReference: 'dup-test',
      preflight: pre,
      provider,
    });
    expect(first.terminalStatus).not.toBe('SKIPPED');
    expect(second.runId).toBe(first.runId);
    expect(second.terminalStatus).toBe(first.terminalStatus);
  });
});
