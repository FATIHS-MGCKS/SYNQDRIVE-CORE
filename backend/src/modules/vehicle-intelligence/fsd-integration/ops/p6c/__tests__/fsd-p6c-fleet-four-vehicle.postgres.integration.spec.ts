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
import { NestFactory } from '@nestjs/core';
import { ensureOrganizationProductEntitlement } from '@modules/vehicle-onboarding/testing/org-product-test.harness';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSourceLinkOperatorAuthorizationService } from '@modules/vehicle-onboarding/services/dimo-source-link-operator-authorization.service';
import {
  assertFsd2PersistencePostgresCiEnv,
  ensureFsd2DisposableDatabaseOnce,
} from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.postgres-harness';
import { FSD_P2E_HISTORICAL_WINDOW_V1 } from '@modules/vehicle-intelligence/full-signal-discovery/__fixtures__/fsd-p2e-tesla.fixture.v1';
import { createDefaultFsdBudgetConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';
import { resolveFsdP6cOfflineDeclaredFieldNamesV1 } from '../fsd-p6c-fleet-vehicle-profiles.v1';
import {
  FSD_P6C_FLEET_VEHICLE_LABELS_V1,
  type FsdP6cFleetManifestV1,
} from '../fsd-p6c-fleet-manifest.v1';
import { FsdDiscoveryOpsModule } from '../../fsd-discovery-ops.module';
import { FsdP6cFleetDiscoveryService } from '../../fsd-p6c-fleet-discovery.service';

const LIVE = process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1';
const REQUIRED = process.env.FSD_DISCOVERY_PERSISTENCE_PG_REQUIRED === '1';

async function ensurePlatformUser(prisma: PrismaClient, userId: string) {
  const email = `${userId}@p6c-fleet-4.test`;
  await prisma.$executeRaw`
    INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
    VALUES (
      ${userId}, ${email}, 'P6C Fleet4', 'ACTIVE'::"UserStatus",
      'MASTER_ADMIN'::"UserPlatformRole", NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      status = 'ACTIVE'::"UserStatus",
      platform_role = 'MASTER_ADMIN'::"UserPlatformRole"
  `;
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

  it('runs four vehicles sequentially with FULL_DISCOVERY_SUCCESS or controlled stop', async () => {
    const organizationId = randomUUID();
    const actorUserId = randomUUID();
    await ensurePlatformUser(prisma, actorUserId);
    await prisma.organization.create({
      data: { id: organizationId, companyName: 'P6C Fleet4', businessType: BusinessType.FLEET },
    });
    await ensureOrganizationProductEntitlement(prisma, organizationId, ProductSlug.FLEET);

    const labels = [...FSD_P6C_FLEET_VEHICLE_LABELS_V1];
    const manifestVehicles: FsdP6cFleetManifestV1['vehicles'] = [];

    for (const label of labels) {
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
        declaredFieldNames: [...resolveFsdP6cOfflineDeclaredFieldNamesV1(label)],
        catalogProvenance: 'VERIFIED_LIVE_CATALOG',
      });
    }

    const manifest: FsdP6cFleetManifestV1 = {
      schemaVersion: 'FSD_P6C_FLEET_MANIFEST_V1',
      productionManifest: true,
      organizationId,
      historicalWindow: FSD_P2E_HISTORICAL_WINDOW_V1,
      budget: createDefaultFsdBudgetConfigV1({ maxRequestsPerRun: 64 }),
      vehicles: manifestVehicles,
    };

    const app = await NestFactory.createApplicationContext(FsdDiscoveryOpsModule, { logger: false });
    try {
      const prismaSvc = app.get(PrismaService);
      Object.assign(prismaSvc, { prisma });
      const authSvc = app.get(DimoSourceLinkOperatorAuthorizationService);
      jest.spyOn(authSvc, 'assertAuthorizedDimoSourceLinkOperator').mockResolvedValue({
        authorizationReference: 'p6c-fleet-4-test',
      });

      const fleetSvc = app.get(FsdP6cFleetDiscoveryService);
      const result = await fleetSvc.executeFleetSequentialMock({
        manifest,
        actorUserId,
        releaseSha: 'pg-fleet-4',
      });

      expect(result.vehicles.length).toBeGreaterThanOrEqual(1);
      for (const row of result.vehicles) {
        expect(['FULL_DISCOVERY_SUCCESS', 'INCOMPLETE_DISCOVERY']).toContain(row.discoveryOutcome);
        if (row.discoveryOutcome === 'FULL_DISCOVERY_SUCCESS') {
          expect(row.fsd3TerminalStatus).toBe('COMPLETED');
          expect(row.fsd4TerminalStatus).toBe('COMPLETED');
        }
      }
      if (result.fleetStopped) {
        expect(result.stopReason).toMatch(/FSD_P6C_FLEET_STOPPED/);
      } else {
        expect(result.vehicles).toHaveLength(4);
        expect(result.vehicles.every((v) => v.discoveryOutcome === 'FULL_DISCOVERY_SUCCESS')).toBe(
          true,
        );
      }
    } finally {
      await app.close();
    }
  });
});
