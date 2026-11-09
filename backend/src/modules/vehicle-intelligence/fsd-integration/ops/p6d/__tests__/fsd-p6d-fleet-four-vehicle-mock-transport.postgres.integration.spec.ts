/**
 * P6D four-vehicle live executor with controlled mock transport (no outbound DIMO).
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
  FSD_P2C_GROUP_A_FIELDS_V1,
  FSD_P2E_HISTORICAL_WINDOW_V1,
} from '@modules/vehicle-intelligence/full-signal-discovery/__fixtures__/fsd-p2e-tesla.fixture.v1';
import { createDefaultFsdBudgetConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';
import {
  FSD_P6C_FLEET_VEHICLE_LABELS_V1,
  type FsdP6cFleetManifestV1,
  type FsdP6cFleetVehicleManifestEntryV1,
} from '../../p6c/fsd-p6c-fleet-manifest.v1';
import { Fsd3OneShotPreflightService } from '../../fsd3-one-shot-preflight.service';
import { Fsd3OneShotExecutionService } from '../../fsd3-one-shot-execution.service';
import { Fsd4OneShotExecutionService } from '../../fsd4-one-shot-execution.service';
import { Fsd3DiscoveryRunInspectorService } from '../../fsd3-discovery-run-inspector.service';
import { FsdP6cFleetDiscoveryService } from '../../fsd-p6c-fleet-discovery.service';
import { FsdP6dFleetLiveExecutorService } from '../../fsd-p6d-fleet-live-executor.service';
import { SYNQDRIVE_FSD_P6C_ARCHITECTURE_REVIEW_CLEARED } from '../../p6c/fsd-p6c-go-no-go.v1';
import { SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED } from '../../fsd3-one-shot-live-owner-gate.v1';
import {
  FSD_P6D_FORCE_MOCK_TRANSPORT,
  FSD_P6D_LIVE_FLEET_AUTHORIZED_RELEASE_SHA,
  SYNQDRIVE_FSD_P6D_LIVE_FLEET_EXECUTE_AUTHORIZED,
  SYNQDRIVE_FSD_P6D_LIVE_CATALOG_DISPATCH_AUTHORIZED,
} from '../fsd-p6d-live-fleet-gate.v1';
import { FSD_P6D_FLEET_PREPARE_ARTIFACT_HMAC_SECRET_ENV } from '../fsd-p6d-fleet-prepare-artifact-auth.v1';
import { createFsd3MockDiscoveryProvider } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-mock-provider.v1';
import { FSD_TESLA_P2E_DECLARED_FIELDS_V1 } from '@modules/vehicle-intelligence/full-signal-discovery/__fixtures__/fsd-p2e-tesla.fixture.v1';

const LIVE = process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1';

async function ensurePlatformUser(prisma: PrismaClient, userId: string) {
  const email = `${userId}@p6d-fleet.test`;
  await prisma.$executeRaw`
    INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
    VALUES (
      ${userId}, ${email}, 'P6D Fleet', 'ACTIVE'::"UserStatus",
      ${'MASTER_ADMIN'}::"UserPlatformRole", NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      status = 'ACTIVE'::"UserStatus",
      platform_role = ${'MASTER_ADMIN'}::"UserPlatformRole"
  `;
}

async function seedFourVehicleFleetManifest(prisma: PrismaClient) {
  const organizationId = randomUUID();
  const actorUserId = randomUUID();
  await ensurePlatformUser(prisma, actorUserId);
  await prisma.organization.create({
    data: { id: organizationId, companyName: 'P6D Fleet', businessType: BusinessType.FLEET },
  });
  await ensureOrganizationProductEntitlement(prisma, organizationId, ProductSlug.FLEET);

  const teslaDeclared = [...FSD_P2C_GROUP_A_FIELDS_V1];
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

  return { actorUserId, manifest: buildManifestFromVehicles(organizationId, manifestVehicles) };
}

function buildManifestFromVehicles(
  organizationId: string,
  manifestVehicles: FsdP6cFleetVehicleManifestEntryV1[],
): FsdP6cFleetManifestV1 {
  return {
      schemaVersion: 'FSD_P6C_FLEET_MANIFEST_V1',
      productionManifest: true,
      organizationId,
      historicalWindow: FSD_P2E_HISTORICAL_WINDOW_V1,
      budget: createDefaultFsdBudgetConfigV1(),
      vehicles: manifestVehicles,
  };
}

async function seedFourVehicleFleetCatalogPending(prisma: PrismaClient) {
  const organizationId = randomUUID();
  const actorUserId = randomUUID();
  await ensurePlatformUser(prisma, actorUserId);
  await prisma.organization.create({
    data: { id: organizationId, companyName: 'P6D Fleet Catalog Pending', businessType: BusinessType.FLEET },
  });
  await ensureOrganizationProductEntitlement(prisma, organizationId, ProductSlug.FLEET);

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
      declaredFieldNames: [],
    });
  }

  return { actorUserId, manifest: buildManifestFromVehicles(organizationId, manifestVehicles) };
}

function buildServices(prisma: PrismaClient) {
  const prismaSvc = prisma as unknown as PrismaService;
  const persistence = new FsdDiscoveryPersistenceRepository(prismaSvc);
  const operatorAuth = new DimoSourceLinkOperatorAuthorizationService(prismaSvc);
  const preflight = new Fsd3OneShotPreflightService(prismaSvc, operatorAuth, persistence);
  const fsd3 = new Fsd3OneShotExecutionService(persistence);
  const fsd4 = new Fsd4OneShotExecutionService(persistence);
  const inspector = new Fsd3DiscoveryRunInspectorService(prismaSvc, persistence);
  const fleet = new FsdP6cFleetDiscoveryService(preflight, fsd3, fsd4, inspector);
  const p6d = new FsdP6dFleetLiveExecutorService(
    prismaSvc,
    preflight,
    fsd3,
    fsd4,
    inspector,
    undefined,
  );
  return { fleet, p6d, fsd3, fsd4 };
}

(LIVE ? describe : describe.skip)('FSD P6D four-vehicle mock-transport live executor (PostgreSQL)', () => {
  let prisma: PrismaClient;

  jest.setTimeout(300_000);

  beforeAll(async () => {
    assertFsd2PersistencePostgresCiEnv();
    await ensureFsd2DisposableDatabaseOnce();
    prisma = new PrismaClient();
    await prisma.$connect();
  }, 600_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('prepare then execute across separate prepare artifact invocations (mock transport)', async () => {
    const { manifest, actorUserId } = await seedFourVehicleFleetManifest(prisma);
    const { fleet, p6d } = buildServices(prisma);
    const releaseSha = 'p6d-pg-mock-transport';
    const fleetPrepareRequestKey = randomUUID();

    await fleet.executeFleetSequentialMock({
      manifest,
      actorUserId,
      releaseSha: 'p6d-seed-catalog',
    });

    const env = {
      ...process.env,
      FSD3_ONE_SHOT_HOST_ATTESTATION: '1',
      [SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED]: '1',
      [SYNQDRIVE_FSD_P6C_ARCHITECTURE_REVIEW_CLEARED]: '1',
      [SYNQDRIVE_FSD_P6D_LIVE_FLEET_EXECUTE_AUTHORIZED]: '1',
      [FSD_P6D_LIVE_FLEET_AUTHORIZED_RELEASE_SHA]: releaseSha,
      [FSD_P6D_FORCE_MOCK_TRANSPORT]: '1',
      [FSD_P6D_FLEET_PREPARE_ARTIFACT_HMAC_SECRET_ENV]: 'p6d-four-vehicle-hmac',
      NODE_ENV: 'test',
    } as NodeJS.ProcessEnv;

    const prepared = await p6d.prepareLiveFleetExecution({
      manifest,
      actorUserId,
      releaseSha,
      fleetPrepareRequestKey,
      env,
    });

    expect(prepared.prepareArtifact.vehicles.every((v) => v.catalogPersistedRunId)).toBe(true);

    const result = await p6d.executeFleetSequentialLive({
      manifest,
      actorUserId,
      releaseSha,
      fleetPrepareRequestKey,
      prepareArtifact: prepared.prepareArtifact,
      env,
    });

    expect(result.fleetStopped).toBe(false);
    expect(result.vehicles).toHaveLength(4);
    for (const row of result.vehicles) {
      expect(row.catalogEvidence.source).toBe('PERSISTED_FSD3_RUN');
      expect(row.classification).toBe('FULL_DISCOVERY_SUCCESS');
      expect(row.fsd3TerminalStatus).toBe('COMPLETED');
      expect(row.fsd4TerminalStatus).toBe('COMPLETED');
    }
  });

  it('stops fleet after second vehicle failure without later vehicles', async () => {
    const { manifest, actorUserId } = await seedFourVehicleFleetManifest(prisma);
    const stack = buildServices(prisma);
    const releaseSha = 'p6d-pg-controlled-stop';
    const fleetPrepareRequestKey = randomUUID();

    await stack.fleet.executeFleetSequentialMock({
      manifest,
      actorUserId,
      releaseSha: 'p6d-seed-catalog-stop',
    });

    const env = {
      ...process.env,
      FSD3_ONE_SHOT_HOST_ATTESTATION: '1',
      [SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED]: '1',
      [SYNQDRIVE_FSD_P6C_ARCHITECTURE_REVIEW_CLEARED]: '1',
      [SYNQDRIVE_FSD_P6D_LIVE_FLEET_EXECUTE_AUTHORIZED]: '1',
      [FSD_P6D_LIVE_FLEET_AUTHORIZED_RELEASE_SHA]: releaseSha,
      [FSD_P6D_FORCE_MOCK_TRANSPORT]: '1',
      [FSD_P6D_FLEET_PREPARE_ARTIFACT_HMAC_SECRET_ENV]: 'p6d-four-vehicle-hmac',
      NODE_ENV: 'test',
    } as NodeJS.ProcessEnv;

    const vwTiguan = manifest.vehicles.find((v) => v.label === 'vw_tiguan')!;
    const fsd3Orig = stack.fsd3.executeOneShot.bind(stack.fsd3);
    jest.spyOn(stack.fsd3, 'executeOneShot').mockImplementation(async (input) => {
      if (input.scope.vehicleId === vwTiguan.vehicleId) {
        return {
          mode: 'EXECUTE',
          discoveryRequestKey: input.scope.discoveryRequestKey,
          runId: 'controlled-stop-run',
          terminalStatus: 'FAILED',
          releaseSha,
          operatorAuthorizationReference: 'op-ref',
        };
      }
      return fsd3Orig(input);
    });

    const prepared = await stack.p6d.prepareLiveFleetExecution({
      manifest,
      actorUserId,
      releaseSha,
      fleetPrepareRequestKey,
      env,
    });

    const result = await stack.p6d.executeFleetSequentialLive({
      manifest,
      actorUserId,
      releaseSha,
      fleetPrepareRequestKey,
      prepareArtifact: prepared.prepareArtifact,
      env,
    });

    expect(result.fleetStopped).toBe(true);
    expect(result.vehicles).toHaveLength(2);
    expect(result.stopReason).toMatch(/FSD_P6C_FSD4_BLOCKED_FSD3_FAILED/);
  });

  it('prepare rejects fleet disclosure cap before any catalog provider call', async () => {
    const { manifest, actorUserId } = await seedFourVehicleFleetCatalogPending(prisma);
    const { p6d } = buildServices(prisma);
    const manifestCapped = {
      ...manifest,
      fleetPlannedRequestDisclosureCap: 2,
    };
    const releaseSha = 'p6d-pg-cap-no-go';
    let providerCatalogCalls = 0;
    const catalogProvider = createFsd3MockDiscoveryProvider({
      mode: 'TESLA_REFERENCE_26',
      catalogGate: { onCatalogEntered: () => (providerCatalogCalls += 1) },
    });

    const env = {
      ...process.env,
      FSD3_ONE_SHOT_HOST_ATTESTATION: '1',
      [SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED]: '1',
      [SYNQDRIVE_FSD_P6C_ARCHITECTURE_REVIEW_CLEARED]: '1',
      [SYNQDRIVE_FSD_P6D_LIVE_FLEET_EXECUTE_AUTHORIZED]: '1',
      [SYNQDRIVE_FSD_P6D_LIVE_CATALOG_DISPATCH_AUTHORIZED]: '1',
      [FSD_P6D_LIVE_FLEET_AUTHORIZED_RELEASE_SHA]: releaseSha,
      [FSD_P6D_FORCE_MOCK_TRANSPORT]: '1',
      [FSD_P6D_FLEET_PREPARE_ARTIFACT_HMAC_SECRET_ENV]: 'p6d-four-vehicle-hmac',
      NODE_ENV: 'test',
    } as NodeJS.ProcessEnv;

    await expect(
      p6d.prepareLiveFleetExecution({
        manifest: manifestCapped,
        actorUserId,
        releaseSha,
        fleetPrepareRequestKey: randomUUID(),
        env,
        allowLiveCatalogDispatch: true,
        liveCatalogProvider: catalogProvider,
      }),
    ).rejects.toThrow(/FSD_P6D_PREPARE_FLEET_DISCLOSURE_CAP_NO_GO/);
    expect(providerCatalogCalls).toBe(0);
  });

  it('prepare live catalog dispatch for four vehicles records provider accounting', async () => {
    const { manifest, actorUserId } = await seedFourVehicleFleetCatalogPending(prisma);
    const { p6d } = buildServices(prisma);
    const releaseSha = 'p6d-pg-catalog-only-four';
    const fleetPrepareRequestKey = randomUUID();
    const catalogProvider = createFsd3MockDiscoveryProvider({
      mode: 'TESLA_REFERENCE_26',
      catalogSignals: [...FSD_TESLA_P2E_DECLARED_FIELDS_V1],
    });

    const env = {
      ...process.env,
      FSD3_ONE_SHOT_HOST_ATTESTATION: '1',
      [SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED]: '1',
      [SYNQDRIVE_FSD_P6C_ARCHITECTURE_REVIEW_CLEARED]: '1',
      [SYNQDRIVE_FSD_P6D_LIVE_FLEET_EXECUTE_AUTHORIZED]: '1',
      [SYNQDRIVE_FSD_P6D_LIVE_CATALOG_DISPATCH_AUTHORIZED]: '1',
      [FSD_P6D_LIVE_FLEET_AUTHORIZED_RELEASE_SHA]: releaseSha,
      [FSD_P6D_FORCE_MOCK_TRANSPORT]: '1',
      [FSD_P6D_FLEET_PREPARE_ARTIFACT_HMAC_SECRET_ENV]: 'p6d-four-vehicle-hmac',
      NODE_ENV: 'test',
    } as NodeJS.ProcessEnv;

    const prepared = await p6d.prepareLiveFleetExecution({
      manifest,
      actorUserId,
      releaseSha,
      fleetPrepareRequestKey,
      env,
      allowLiveCatalogDispatch: true,
      liveCatalogProvider: catalogProvider,
    });

    expect(prepared.prepareArtifact.vehicles).toHaveLength(4);
    expect(prepared.prepareArtifact.providerAccounting.prepareCatalogDispatches).toBe(4);
    expect(prepared.prepareArtifact.providerAccounting.prepareCatalogLedgerAttemptsActual).toBe(4);
    expect(prepared.prepareArtifact.providerAccounting.prepareCatalogLedgerReplays).toBe(0);
    expect(prepared.prepareArtifact.artifactAuthenticationTag).toMatch(/^[a-f0-9]{64}$/);

    const manifestWithFields = {
      ...manifest,
      vehicles: manifest.vehicles.map((v) => ({
        ...v,
        declaredFieldNames: prepared.prepareArtifact.vehicles.find((a) => a.vehicleId === v.vehicleId)!
          .catalogPersistedRunId ?
          [...FSD_TESLA_P2E_DECLARED_FIELDS_V1]
        : [],
        catalogProvenance: 'VERIFIED_LIVE_CATALOG' as const,
      })),
    };

    const executed = await p6d.executeFleetSequentialLive({
      manifest: manifestWithFields,
      actorUserId,
      releaseSha,
      fleetPrepareRequestKey,
      prepareArtifact: prepared.prepareArtifact,
      env,
    });

    expect(executed.fleetStopped).toBe(false);
    expect(executed.vehicles).toHaveLength(4);
  });
});
