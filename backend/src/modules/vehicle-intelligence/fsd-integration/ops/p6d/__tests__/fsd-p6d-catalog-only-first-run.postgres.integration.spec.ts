/**
 * P6D catalog-only ledger dispatch: first run + idempotent replay (budget-1 PARTIAL terminal).
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
import { createDefaultFsdBudgetConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';
import {
  buildFsd3TeslaMockCatalogResultV1,
  buildFsd3TeslaMockSnapshotValues,
} from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-mock-provider.v1';
import type {
  Fsd3DiscoveryProviderPortV1,
  Fsd3ProviderSnapshotFieldValueV1,
} from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-provider.port.v1';
import { FSD_P2E_HISTORICAL_WINDOW_V1 } from '@modules/vehicle-intelligence/full-signal-discovery/__fixtures__/fsd-p2e-tesla.fixture.v1';
import { Fsd3OneShotPreflightService } from '../../fsd3-one-shot-preflight.service';
import { Fsd3OneShotExecutionService } from '../../fsd3-one-shot-execution.service';
import { dispatchFsdP6dCatalogWithLedgerV1 } from '../fsd-p6d-catalog-ledger-dispatch.v1';
import { FSD_P6D_FLEET_PREPARE_ARTIFACT_HMAC_SECRET_ENV } from '../fsd-p6d-fleet-prepare-artifact-auth.v1';

const LIVE = process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1';

async function ensurePlatformUser(prisma: PrismaClient, userId: string) {
  const email = `${userId}@p6d-catalog-only.test`;
  await prisma.$executeRaw`
    INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
    VALUES (
      ${userId}, ${email}, 'P6D Catalog', 'ACTIVE'::"UserStatus",
      ${'MASTER_ADMIN'}::"UserPlatformRole", NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE'::"UserStatus"
  `;
}

(LIVE ? describe : describe.skip)('FSD P6D catalog-only first-run (PostgreSQL)', () => {
  let prisma: PrismaClient;

  jest.setTimeout(180_000);

  beforeAll(async () => {
    assertFsd2PersistencePostgresCiEnv();
    await ensureFsd2DisposableDatabaseOnce();
    prisma = new PrismaClient();
    await prisma.$connect();
  }, 600_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('accepts budget-1 PARTIAL client terminal on first catalog-only run and idempotent replay', async () => {
    const organizationId = randomUUID();
    const actorUserId = randomUUID();
    const vehicleId = randomUUID();
    const linkId = randomUUID();
    const dimoVehicleId = randomUUID();
    const tokenId = 7_100_001;
    const discoveryRequestKey = randomUUID();

    await ensurePlatformUser(prisma, actorUserId);
    await prisma.organization.create({
      data: { id: organizationId, companyName: 'P6D Catalog Only', businessType: BusinessType.FLEET },
    });
    await ensureOrganizationProductEntitlement(prisma, organizationId, ProductSlug.FLEET);
    await prisma.vehicle.create({
      data: {
        id: vehicleId,
        organizationId,
        vin: 'VINCATALOGONLY0001',
        make: 'Test',
        model: 'catalog_only',
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
        make: 'Test',
        model: 'catalog_only',
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

    const prismaSvc = prisma as unknown as PrismaService;
    const persistence = new FsdDiscoveryPersistenceRepository(prismaSvc);
    const operatorAuth = new DimoSourceLinkOperatorAuthorizationService(prismaSvc);
    const preflightSvc = new Fsd3OneShotPreflightService(prismaSvc, operatorAuth, persistence);
    const executionSvc = new Fsd3OneShotExecutionService(persistence);

    const teslaValues = buildFsd3TeslaMockSnapshotValues();
    const provider: Fsd3DiscoveryProviderPortV1 = {
      providerKind: 'mock',
      async fetchAvailableSignals() {
        return buildFsd3TeslaMockCatalogResultV1();
      },
      async executeSnapshotDocument(request) {
        const valuesByField: Record<string, Fsd3ProviderSnapshotFieldValueV1> = {};
        for (const field of request.fieldNamesInDocument) {
          const preset = teslaValues[field];
          valuesByField[field] = preset ?? { kind: 'MISSING' };
        }
        return {
          documentFingerprint: request.documentFingerprint,
          fieldNamesInDocument: request.fieldNamesInDocument,
          dataPresent: true,
          httpStatus: 200,
          valuesByField,
        };
      },
    };

    const env = {
      ...process.env,
      FSD3_ONE_SHOT_HOST_ATTESTATION: '1',
      FSD_DISCOVERY_PERSISTENCE_PG: '1',
      FSD_P6D_FORCE_MOCK_TRANSPORT: '1',
      [FSD_P6D_FLEET_PREPARE_ARTIFACT_HMAC_SECRET_ENV]: 'pg-catalog-only-hmac-secret',
      NODE_ENV: 'test',
    } as NodeJS.ProcessEnv;

    const preflight = await preflightSvc.runAuthorizedReadOnlyPreflight({
      scope: {
        organizationId,
        vehicleId,
        providerSourceLinkId: linkId,
        discoveryRequestKey,
      },
      actorUserId,
    });

    const first = await dispatchFsdP6dCatalogWithLedgerV1({
      prisma: prismaSvc,
      env,
      executionSvc,
      scope: { organizationId, vehicleId, providerSourceLinkId: linkId, discoveryRequestKey },
      preflight,
      liveProvider: 'mock',
      provider,
      releaseSha: 'p6d-catalog-only-first',
      budget: createDefaultFsdBudgetConfigV1(),
    });

    expect(first.clientTerminalStatus).toBe('PARTIAL');
    expect(first.ledgerReplayed).toBe(false);
    expect(first.providerDispatchConsumed).toBe(true);
    expect(first.availableSignals.length).toBeGreaterThan(0);

    const second = await dispatchFsdP6dCatalogWithLedgerV1({
      prisma: prismaSvc,
      env,
      executionSvc,
      scope: { organizationId, vehicleId, providerSourceLinkId: linkId, discoveryRequestKey },
      preflight,
      liveProvider: 'mock',
      provider,
      releaseSha: 'p6d-catalog-only-first',
      budget: createDefaultFsdBudgetConfigV1(),
    });

    expect(second.persistedRunId).toBe(first.persistedRunId);
    expect(second.ledgerReplayed).toBe(true);
    expect(second.providerDispatchConsumed).toBe(false);
  });
});
