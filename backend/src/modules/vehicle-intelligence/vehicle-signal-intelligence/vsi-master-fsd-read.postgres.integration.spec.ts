/**
 * VSI Master FSD read projection — isolated PostgreSQL (synthetic fixtures, no provider dispatch).
 *
 *   VSI_MASTER_FSD_READ_PG=1 npx jest vsi-master-fsd-read.postgres.integration --runInBand
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
import {
  assertFsd2PersistencePostgresCiEnv,
  ensureFsd2DisposableDatabaseOnce,
} from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.postgres-harness';
import {
  build26SignalCatalogNamesV1,
  buildLiveCatalog26CheckpointFixtureV1,
} from './__fixtures__/vsi-master-fsd-read.fixture.v1';
import { VsiMasterFsdReadService } from './vsi-master-fsd-read.service';

const LIVE = process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1';

async function seedOrgVehicleLink(prisma: PrismaClient) {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const linkId = randomUUID();
  const dimoVehicleId = randomUUID();
  await prisma.organization.create({
    data: { id: organizationId, companyName: 'VSI FSD Read PG', businessType: BusinessType.FLEET },
  });
  await ensureOrganizationProductEntitlement(prisma, organizationId, ProductSlug.FLEET);
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      organizationId,
      vin: `VIN${organizationId.slice(0, 8)}`,
      make: 'Test',
      model: 'fsd_read',
      year: 2024,
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
      tokenId: 9_900_001,
      make: 'Test',
      model: 'fsd_read',
      year: 2024,
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
  return { organizationId, vehicleId, linkId, tokenId: 9_900_001 };
}

(LIVE ? describe : describe.skip)('VsiMasterFsdReadService (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let service: VsiMasterFsdReadService;

  jest.setTimeout(120_000);

  beforeAll(async () => {
    assertFsd2PersistencePostgresCiEnv();
    await ensureFsd2DisposableDatabaseOnce();
    prisma = new PrismaClient();
    await prisma.$connect();
    service = new VsiMasterFsdReadService(prisma as unknown as PrismaService);
  }, 600_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('enforces tenant isolation and unique-signal pagination over persisted evidence', async () => {
    const { organizationId, vehicleId, linkId, tokenId } = await seedOrgVehicleLink(prisma);
    const otherOrg = randomUUID();
    await prisma.organization.create({
      data: { id: otherOrg, companyName: 'Other', businessType: BusinessType.FLEET },
    });

    const checkpoint = buildLiveCatalog26CheckpointFixtureV1();
    const names = build26SignalCatalogNamesV1();
    const fsd3RunId = randomUUID();
    const fsd4RunId = randomUUID();
    const fp = checkpoint.catalogFetch!.declaredCatalogFingerprint!;

    await prisma.fsdDiscoveryRun.create({
      data: {
        id: fsd3RunId,
        organizationId,
        vehicleId,
        providerSourceLinkId: linkId,
        runKey: `fsd3-${fsd3RunId}`,
        runRevision: 1,
        discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
        status: 'COMPLETED',
        dimoTokenId: tokenId,
        connectionIdentityFingerprint: 'pg-fp',
        completedAt: new Date('2026-11-09T12:00:00Z'),
        stages: {
          create: [
            {
              stageType: 'CATALOG',
              status: 'SUCCEEDED',
              checkpointJson: checkpoint as object,
              lastHttpStatus: 200,
            },
            { stageType: 'SNAPSHOT', status: 'UNKNOWN_OUTCOME', checkpointJson: {}, lastHttpStatus: 200 },
          ],
        },
      },
    });

    await prisma.fsdDiscoveryRun.create({
      data: {
        id: fsd4RunId,
        organizationId,
        vehicleId,
        providerSourceLinkId: linkId,
        runKey: `fsd4-${fsd4RunId}`,
        runRevision: 2,
        discoveryStream: 'FSD4_HISTORICAL',
        status: 'COMPLETED',
        dimoTokenId: tokenId,
        connectionIdentityFingerprint: 'pg-fp',
        completedAt: new Date('2026-11-09T13:00:00Z'),
        stages: {
          create: [
            {
              stageType: 'CATALOG',
              status: 'SUCCEEDED',
              checkpointJson: {
                catalogFetch: { declaredCatalogFingerprint: fp, providerKind: 'live', catalogFetchSucceeded: true },
              },
              lastHttpStatus: 200,
            },
            { stageType: 'HISTORICAL', status: 'SUCCEEDED', checkpointJson: {}, lastHttpStatus: 200 },
          ],
        },
      },
    });

    const fsd3Stages = await prisma.fsdDiscoveryStage.findMany({ where: { runId: fsd3RunId } });
    const catalogStage = fsd3Stages.find((s) => s.stageType === 'CATALOG')!;
    const snapshotStage = fsd3Stages.find((s) => s.stageType === 'SNAPSHOT')!;
    const fsd4Stages = await prisma.fsdDiscoveryStage.findMany({ where: { runId: fsd4RunId } });
    const historicalStage = fsd4Stages.find((s) => s.stageType === 'HISTORICAL')!;

    const partialSnapshotNames = names.slice(0, 10);
    const evidenceCreate: Array<{
      runId: string;
      stageId: string;
      stageType: 'CATALOG' | 'SNAPSHOT' | 'HISTORICAL';
      signalName: string;
      evidenceState: 'DECLARED_ONLY' | 'OBSERVED';
      queryPlanned: boolean;
      queryAccepted?: boolean;
      observedValue?: boolean;
      qualityJson?: object;
    }> = [];

    for (const signalName of names) {
      evidenceCreate.push({
        runId: fsd3RunId,
        stageId: catalogStage.id,
        stageType: 'CATALOG',
        signalName,
        evidenceState: 'DECLARED_ONLY',
        queryPlanned: false,
      });
      if (partialSnapshotNames.includes(signalName)) {
        evidenceCreate.push({
          runId: fsd3RunId,
          stageId: snapshotStage.id,
          stageType: 'SNAPSHOT',
          signalName,
          evidenceState: 'OBSERVED',
          queryPlanned: true,
          queryAccepted: true,
          observedValue: true,
          qualityJson: { observationKind: 'OBSERVED' },
        });
      }
      evidenceCreate.push({
        runId: fsd4RunId,
        stageId: historicalStage.id,
        stageType: 'HISTORICAL',
        signalName,
        evidenceState: 'OBSERVED',
        queryPlanned: true,
        queryAccepted: true,
        observedValue: true,
        qualityJson: { observationKind: 'OBSERVED' },
      });
    }
    await prisma.fsdDiscoverySignalEvidence.createMany({ data: evidenceCreate });

    await prisma.fsdDiscoveryRun.create({
      data: {
        id: randomUUID(),
        organizationId,
        vehicleId,
        providerSourceLinkId: linkId,
        runKey: `fsd4-failed-${randomUUID()}`,
        runRevision: 4,
        discoveryStream: 'FSD4_HISTORICAL',
        status: 'FAILED',
        dimoTokenId: tokenId,
        connectionIdentityFingerprint: 'pg-fp',
        createdAt: new Date('2026-11-11T12:00:00Z'),
        stages: {
          create: [
            {
              stageType: 'CATALOG',
              status: 'SUCCEEDED',
              checkpointJson: {
                catalogFetch: { declaredCatalogFingerprint: fp, providerKind: 'live', catalogFetchSucceeded: true },
              },
            },
            { stageType: 'HISTORICAL', status: 'PLANNED', checkpointJson: {} },
          ],
        },
      },
    });

    await prisma.fsdDiscoveryRun.create({
      data: {
        id: randomUUID(),
        organizationId,
        vehicleId,
        providerSourceLinkId: linkId,
        runKey: `fsd3-failed-${randomUUID()}`,
        runRevision: 3,
        discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
        status: 'FAILED',
        dimoTokenId: tokenId,
        connectionIdentityFingerprint: 'pg-fp',
        createdAt: new Date('2026-11-10T12:00:00Z'),
      },
    });

    const summary = await service.getSummary(organizationId, vehicleId, linkId);
    expect(summary.catalog.authoritativeRunId).toBe(fsd3RunId);
    expect(summary.execution.fsd3.state).toBe('FAILED');
    expect(summary.evidence.snapshot).toBe('PARTIAL');
    expect(summary.evidence.historical).toBe('AVAILABLE');
    expect(summary.catalog.selectionLimitation).toBeNull();

    const page = await service.getSignalExplorer({
      organizationId,
      vehicleId,
      providerSourceLinkId: linkId,
      limit: 15,
    });
    expect(page.items).toHaveLength(15);
    expect(page.aggregates.declaredSignalCount).toBe(26);
    expect(page.historicalLink).toBe('LINKED');

    await expect(service.getSummary(otherOrg, vehicleId, linkId)).rejects.toThrow();
    await expect(
      service.getRunInspector({
        organizationId,
        vehicleId,
        providerSourceLinkId: linkId,
        runId: fsd3RunId,
      }),
    ).resolves.toMatchObject({ runId: fsd3RunId });

    await expect(
      service.getRunInspector({
        organizationId: otherOrg,
        vehicleId,
        providerSourceLinkId: linkId,
        runId: fsd3RunId,
      }),
    ).rejects.toThrow();
  });
});
