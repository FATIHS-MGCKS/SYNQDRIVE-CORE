/**
 * P6C four-vehicle sequential fleet mock on disposable PostgreSQL.
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
import {
  FSD_P2E_HISTORICAL_WINDOW_V1,
  FSD_TESLA_P2E_DECLARED_FIELDS_V1,
} from '@modules/vehicle-intelligence/full-signal-discovery/__fixtures__/fsd-p2e-tesla.fixture.v1';
import { createDefaultFsdBudgetConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';
import { createFsd4MockHistoricalProvider } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd4-mock-provider.v1';
import {
  FSD_P6C_FLEET_VEHICLE_LABELS_V1,
  type FsdP6cFleetManifestV1,
  type FsdP6cFleetVehicleManifestEntryV1,
} from '../fsd-p6c-fleet-manifest.v1';
import { Fsd3OneShotPreflightService } from '../../fsd3-one-shot-preflight.service';
import { Fsd3OneShotExecutionService } from '../../fsd3-one-shot-execution.service';
import { Fsd4OneShotExecutionService } from '../../fsd4-one-shot-execution.service';
import { Fsd3DiscoveryRunInspectorService } from '../../fsd3-discovery-run-inspector.service';
import { FsdP6cFleetDiscoveryService } from '../../fsd-p6c-fleet-discovery.service';

const LIVE = process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1';
const REQUIRED = process.env.FSD_DISCOVERY_PERSISTENCE_PG_REQUIRED === '1';

async function ensurePlatformUser(prisma: PrismaClient, userId: string) {
  const email = `${userId}@p6c-fleet-4.test`;
  await prisma.$executeRaw`
    INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
    VALUES (
      ${userId}, ${email}, 'P6C Fleet4', 'ACTIVE'::"UserStatus",
      ${'MASTER_ADMIN'}::"UserPlatformRole", NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      status = 'ACTIVE'::"UserStatus",
      platform_role = ${'MASTER_ADMIN'}::"UserPlatformRole"
  `;
}

type FleetSeed = {
  manifest: FsdP6cFleetManifestV1;
  actorUserId: string;
};

async function seedFourVehicleFleetManifest(prisma: PrismaClient): Promise<FleetSeed> {
  const organizationId = randomUUID();
  const actorUserId = randomUUID();
  await ensurePlatformUser(prisma, actorUserId);
  await prisma.organization.create({
    data: { id: organizationId, companyName: 'P6C Fleet4', businessType: BusinessType.FLEET },
  });
  await ensureOrganizationProductEntitlement(prisma, organizationId, ProductSlug.FLEET);

  const teslaDeclared = [...FSD_TESLA_P2E_DECLARED_FIELDS_V1];
  const manifestVehicles: FsdP6cFleetVehicleManifestEntryV1[] = [];

  for (const label of FSD_P6C_FLEET_VEHICLE_LABELS_V1) {
    const vehicleId = randomUUID();
    const linkId = randomUUID();
    const dimoVehicleId = randomUUID();
    const tokenId = Math.floor(Math.random() * 1_000_000) + 6_000_000;
    await prisma.vehicle.create({
      data: {
        id: vehicleId,
        organizationId,
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        make: 'Test',
        model: label,
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
        model: label,
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
    manifestVehicles.push({
      label,
      vehicleId,
      providerSourceLinkId: linkId,
      discoveryRequestKey: randomUUID(),
      historicalRequestKey: randomUUID(),
      declaredFieldNames: teslaDeclared,
      catalogProvenance: 'VERIFIED_LIVE_CATALOG',
    });
  }

  return {
    actorUserId,
    manifest: {
      schemaVersion: 'FSD_P6C_FLEET_MANIFEST_V1',
      productionManifest: true,
      organizationId,
      historicalWindow: FSD_P2E_HISTORICAL_WINDOW_V1,
      budget: createDefaultFsdBudgetConfigV1(),
      vehicles: manifestVehicles,
    },
  };
}

function buildFleetStack(prisma: PrismaClient) {
  const prismaSvc = prisma as unknown as PrismaService;
  const persistence = new FsdDiscoveryPersistenceRepository(prismaSvc);
  const operatorAuth = new DimoSourceLinkOperatorAuthorizationService(prismaSvc);
  const preflight = new Fsd3OneShotPreflightService(prismaSvc, operatorAuth, persistence);
  const fsd3 = new Fsd3OneShotExecutionService(persistence);
  const fsd4 = new Fsd4OneShotExecutionService(persistence);
  const inspector = new Fsd3DiscoveryRunInspectorService(prismaSvc, persistence);
  return { preflight, fsd3, fsd4, inspector };
}

(LIVE ? describe : describe.skip)('FSD P6C four-vehicle fleet sequence (PostgreSQL)', () => {
  let prisma: PrismaClient;

  jest.setTimeout(300_000);

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

  it('A) completes all four vehicles with FULL_DISCOVERY_SUCCESS', async () => {
    const { manifest, actorUserId } = await seedFourVehicleFleetManifest(prisma);
    const stack = buildFleetStack(prisma);
    const fleetSvc = new FsdP6cFleetDiscoveryService(
      stack.preflight,
      stack.fsd3,
      stack.fsd4,
      stack.inspector,
    );

    const result = await fleetSvc.executeFleetSequentialMock({
      manifest,
      actorUserId,
      releaseSha: 'pg-fleet-4-success',
    });

    expect(result.fleetStopped).toBe(false);
    expect(result.vehicles).toHaveLength(4);
    for (const row of result.vehicles) {
      expect(row.discoveryOutcome).toBe('FULL_DISCOVERY_SUCCESS');
      expect(row.fsd3TerminalStatus).toBe('COMPLETED');
      expect(row.fsd4TerminalStatus).toBe('COMPLETED');
    }
  });

  it('B) stops fleet on FSD4 PARTIAL without running later vehicles', async () => {
    const { manifest, actorUserId } = await seedFourVehicleFleetManifest(prisma);
    const stack = buildFleetStack(prisma);
    const vwTiguan = manifest.vehicles.find((v) => v.label === 'vw_tiguan')!;
    const orig = stack.fsd4.executeHistoricalOneShot.bind(stack.fsd4);

    jest.spyOn(stack.fsd4, 'executeHistoricalOneShot').mockImplementation(async (input) => {
      if (input.scope.historicalRequestKey === vwTiguan.historicalRequestKey) {
        return orig({
          ...input,
          provider: createFsd4MockHistoricalProvider({ mode: 'HTTP_422_DOCUMENT' }),
        });
      }
      return orig(input);
    });

    const fleetSvc = new FsdP6cFleetDiscoveryService(
      stack.preflight,
      stack.fsd3,
      stack.fsd4,
      stack.inspector,
    );

    const result = await fleetSvc.executeFleetSequentialMock({
      manifest,
      actorUserId,
      releaseSha: 'pg-fleet-4-stop',
    });

    expect(result.fleetStopped).toBe(true);
    expect(result.stopReason).toMatch(/FSD_P6C_FLEET_STOPPED_FSD4_PARTIAL/);
    expect(result.vehicles).toHaveLength(2);
    expect(result.vehicles[0]!.label).toBe('tesla_model_3');
    expect(result.vehicles[0]!.discoveryOutcome).toBe('FULL_DISCOVERY_SUCCESS');
    expect(result.vehicles[1]!.label).toBe('vw_tiguan');
    expect(result.vehicles[1]!.discoveryOutcome).toBe('INCOMPLETE_DISCOVERY');
    expect(result.vehicles[1]!.fsd4TerminalStatus).toBe('PARTIAL');
  });
});
