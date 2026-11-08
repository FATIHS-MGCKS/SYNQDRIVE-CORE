/**
 * P6C FSD3+FSD4 ops mock chain with catalog reuse (disposable PostgreSQL).
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
import { FSD_P2E_HISTORICAL_WINDOW_V1 } from '@modules/vehicle-intelligence/full-signal-discovery/__fixtures__/fsd-p2e-tesla.fixture.v1';
import { createDefaultFsdBudgetConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';
import { createFsd3MockDiscoveryProvider } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-mock-provider.v1';
import { createFsd4MockHistoricalProvider } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd4-mock-provider.v1';
import { resolveFsdP6cOfflineDeclaredFieldNamesV1 } from '../fsd-p6c-fleet-vehicle-profiles.v1';
import { Fsd3OneShotPreflightService } from '../../fsd3-one-shot-preflight.service';
import { Fsd3OneShotExecutionService } from '../../fsd3-one-shot-execution.service';
import { Fsd4OneShotExecutionService } from '../../fsd4-one-shot-execution.service';
import { Fsd3DiscoveryRunInspectorService } from '../../fsd3-discovery-run-inspector.service';

const LIVE = process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1';
const REQUIRED = process.env.FSD_DISCOVERY_PERSISTENCE_PG_REQUIRED === '1';

async function ensurePlatformUser(
  prisma: PrismaClient,
  userId: string,
  role: 'MASTER_ADMIN' | 'USER',
) {
  const email = `${userId}@p6c-fleet.test`;
  await prisma.$executeRaw`
    INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
    VALUES (
      ${userId}, ${email}, 'P6C Fleet', 'ACTIVE'::"UserStatus",
      ${role}::"UserPlatformRole", NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      status = 'ACTIVE'::"UserStatus",
      platform_role = ${role}::"UserPlatformRole"
  `;
}

async function seedDimoBinding(prisma: PrismaClient) {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const linkId = randomUUID();
  const dimoVehicleId = randomUUID();
  const tokenId = Math.floor(Math.random() * 1_000_000) + 5_000_000;
  await prisma.organization.create({
    data: { id: organizationId, companyName: 'P6C', businessType: BusinessType.FLEET },
  });
  await ensureOrganizationProductEntitlement(prisma, organizationId, ProductSlug.FLEET);
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      organizationId,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      make: 'Tesla',
      model: 'Model 3',
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
      model: 'Model 3',
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
  return { organizationId, vehicleId, linkId };
}

(LIVE ? describe : describe.skip)('FSD P6C ops FSD3+FSD4 mock chain (PostgreSQL)', () => {
  let prisma: PrismaClient;

  jest.setTimeout(180_000);

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
      fsd3: new Fsd3OneShotExecutionService(persistence),
      fsd4: new Fsd4OneShotExecutionService(persistence),
      inspector: new Fsd3DiscoveryRunInspectorService(prismaSvc, persistence),
    };
  }

  it('executes FSD3 then FSD4 with verified catalog reuse and separate inspector reports', async () => {
    const seed = await seedDimoBinding(prisma);
    const actorUserId = randomUUID();
    await ensurePlatformUser(prisma, actorUserId, 'MASTER_ADMIN');
    const discoveryRequestKey = randomUUID();
    const historicalRequestKey = randomUUID();
    const budget = createDefaultFsdBudgetConfigV1({ maxRequestsPerRun: 64 });
    const declared = [...resolveFsdP6cOfflineDeclaredFieldNamesV1('tesla_model_3')];

    const { preflight, fsd3, fsd4, inspector } = services();
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      discoveryRequestKey,
    };
    const pre = await preflight.runAuthorizedReadOnlyPreflight({ actorUserId, scope });

    const fsd3Res = await fsd3.executeOneShot({
      scope,
      preflight: pre,
      liveProvider: 'mock',
      provider: createFsd3MockDiscoveryProvider({
        mode: 'TESLA_REFERENCE_26',
        catalogSignals: declared,
      }),
      budget,
      releaseSha: 'pg-p6c',
    });
    expect(fsd3Res.terminalStatus).toBe('COMPLETED');

    const fsd4Res = await fsd4.executeHistoricalOneShot({
      scope: {
        organizationId: seed.organizationId,
        vehicleId: seed.vehicleId,
        providerSourceLinkId: seed.linkId,
        historicalRequestKey,
      },
      preflight: pre,
      liveProvider: 'mock',
      provider: createFsd4MockHistoricalProvider({ mode: 'TESLA_P2E_HISTORICAL' }),
      historicalWindow: FSD_P2E_HISTORICAL_WINDOW_V1,
      budget,
      verifiedFsd3CatalogRunId: fsd3Res.runId,
      releaseSha: 'pg-p6c',
    });
    expect(fsd4Res.terminalStatus).toBe('COMPLETED');

    const fsd3Inspector = await inspector.inspectTenantScoped({
      actorUserId,
      organizationId: seed.organizationId,
      runId: fsd3Res.runId,
    });
    const fsd4Inspector = await inspector.inspectTenantScoped({
      actorUserId,
      organizationId: seed.organizationId,
      runId: fsd4Res.runId,
    });
    expect(fsd3Inspector.discoveryStream).toBe('FSD3_CATALOG_SNAPSHOT');
    expect(fsd4Inspector.discoveryStream).toBe('FSD4_HISTORICAL');
    expect(fsd3Inspector.strandedInProgress).toBe(false);
    expect(fsd4Inspector.strandedInProgress).toBe(false);
  });
});
