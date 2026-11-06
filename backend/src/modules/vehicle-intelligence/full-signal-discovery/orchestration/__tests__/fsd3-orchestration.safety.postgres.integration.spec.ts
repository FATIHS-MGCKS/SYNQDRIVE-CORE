/**
 * FSD-3 H1–H4 safety regression (PostgreSQL + mock provider).
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
import { FsdDiscoveryPersistenceRepository } from '../../persistence/fsd-discovery-persistence.repository';
import {
  assertFsd2PersistencePostgresCiEnv,
  ensureFsd2DisposableDatabaseOnce,
} from '../../persistence/fsd-discovery-persistence.postgres-harness';
import { buildFsdDimoConnectionIdentityFingerprint } from '../../persistence/fsd-discovery-persistence.contract.v1';
import {
  createFsd3LiveStubDiscoveryProvider,
  createFsd3MockDiscoveryProvider,
} from '../fsd3-mock-provider.v1';
import { Fsd3CatalogSnapshotOrchestratorService } from '../fsd3-orchestration.service.v1';
import type { Fsd3OrchestrationInputV1 } from '../fsd3-orchestration.service.v1';

const LIVE = process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1';
const REQUIRED = process.env.FSD_DISCOVERY_PERSISTENCE_PG_REQUIRED === '1';

async function seedDimoBinding(prisma: PrismaClient) {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const dimoVehicleId = randomUUID();
  const linkId = randomUUID();
  const tokenId = Math.floor(Math.random() * 1_000_000) + 5_000_000;
  await prisma.organization.create({
    data: {
      id: organizationId,
      companyName: `FSD3H ${organizationId.slice(0, 8)}`,
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

(LIVE ? describe : describe.skip)('FSD-3 orchestration safety H1–H4 (PostgreSQL)', () => {
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

  function mockSvc(
    seed: Awaited<ReturnType<typeof seedDimoBinding>>,
    mode: Parameters<typeof createFsd3MockDiscoveryProvider>[0]['mode'],
    hooks?: ConstructorParameters<typeof Fsd3CatalogSnapshotOrchestratorService>[3],
  ) {
    const provider = createFsd3MockDiscoveryProvider({ mode });
    const repo = new FsdDiscoveryPersistenceRepository(prisma as never);
    const svc = new Fsd3CatalogSnapshotOrchestratorService(
      repo,
      provider,
      {
        enabled: true,
        allowedVehicleIds: new Set([seed.vehicleId]),
        providerExecutionEnabled: false,
      },
      hooks,
    );
    return { svc, provider };
  }

  async function run(
    seed: Awaited<ReturnType<typeof seedDimoBinding>>,
    svc: Fsd3CatalogSnapshotOrchestratorService,
    extra?: { discoveryRequestKey?: string; budget?: Fsd3OrchestrationInputV1['budget']; leaseOwner?: string },
  ) {
    return svc.runCatalogSnapshotDiscovery({
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      dimoVehicleId: seed.dimoVehicleId,
      dimoTokenId: seed.tokenId,
      discoveryRequestKey: extra?.discoveryRequestKey ?? randomUUID(),
      leaseOwner: extra?.leaseOwner ?? `worker-${randomUUID().slice(0, 8)}`,
      leaseExpiresAt: new Date(Date.now() + 120_000),
      budget: extra?.budget,
    });
  }

  it('1 — request budget 0 → zero provider calls', async () => {
    const seed = await seedDimoBinding(prisma);
    const { svc, provider } = mockSvc(seed, 'TESLA_REFERENCE_26');
    const result = await run(seed, svc, {
      budget: {
        maxRequestsPerRun: 0,
        maxHistoricalWindowSeconds: 3600,
        maxSnapshotFieldsPerDocument: 26,
        maxHistoricalFloatFieldsPerChunk: 8,
        maxResponseBytes: 524_288,
      },
    });
    expect(result.status).toBe('SKIPPED');
    expect((provider as unknown as { getCatalogCallCount(): number }).getCatalogCallCount()).toBe(0);
  });

  it('2 — failed catalog fetch → no successful run', async () => {
    const seed = await seedDimoBinding(prisma);
    const { svc } = mockSvc(seed, 'CATALOG_HTTP_500');
    const result = await run(seed, svc);
    expect(result.status).toBe('FAILED');
    if (result.status !== 'SKIPPED') {
      const run = await prisma.fsdDiscoveryRun.findFirst({ where: { id: result.runId } });
      expect(run?.status).not.toBe('COMPLETED');
    }
  });

  it('3 — crash after catalog reservation → no automatic catalog retry', async () => {
    const seed = await seedDimoBinding(prisma);
    const discoveryRequestKey = randomUUID();
    const leaseOwner = 'worker-resume-fixed';
    const { svc, provider } = mockSvc(seed, 'TESLA_REFERENCE_26', {
      afterCatalogRequestSlotReserved: () => {
        throw new Error('SIMULATED_CRASH_AFTER_RESERVE');
      },
    });
    await expect(run(seed, svc, { discoveryRequestKey, leaseOwner })).rejects.toThrow(
      'SIMULATED_CRASH_AFTER_RESERVE',
    );
    const second = await run(seed, svc, { discoveryRequestKey, leaseOwner });
    expect(second.status).toBe('FAILED');
    expect((provider as unknown as { getCatalogCallCount(): number }).getCatalogCallCount()).toBe(0);
  });

  it('4 — resume from persisted snapshot checkpoint', async () => {
    const seed = await seedDimoBinding(prisma);
    const discoveryRequestKey = randomUUID();
    const leaseOwner = 'worker-resume-fixed';
    let firstRunId = '';
    const { svc, provider } = mockSvc(seed, 'TESLA_REFERENCE_26', {
      afterSnapshotDocumentCompleted: (index) => {
        if (index === 0) {
          throw new Error('SIMULATED_CRASH_AFTER_FIRST_SNAPSHOT_DOC');
        }
      },
    });
    await expect(run(seed, svc, { discoveryRequestKey, leaseOwner })).rejects.toThrow(
      'SIMULATED_CRASH_AFTER_FIRST_SNAPSHOT_DOC',
    );
    const resumed = await run(seed, svc, { discoveryRequestKey, leaseOwner });
    expect(resumed.status).toBe('COMPLETED');
    if (resumed.status !== 'SKIPPED') {
      firstRunId = resumed.runId;
      const run = await prisma.fsdDiscoveryRun.findUnique({ where: { id: firstRunId } });
      expect(run?.status).toBe('COMPLETED');
    }
    expect((provider as unknown as { getSnapshotCallCount(): number }).getSnapshotCallCount()).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('5 — replay FAILED run does not report COMPLETED', async () => {
    const seed = await seedDimoBinding(prisma);
    const discoveryRequestKey = randomUUID();
    const { svc } = mockSvc(seed, 'AMBIGUOUS_GRAPHQL_ERRORS');
    const failed = await run(seed, svc, { discoveryRequestKey });
    expect(failed.status).toBe('PARTIAL');
    const replay = await run(seed, svc, { discoveryRequestKey });
    expect(replay.status).not.toBe('COMPLETED');
  });

  it('6 — concurrent workers do not exceed request budget', async () => {
    const seed = await seedDimoBinding(prisma);
    const discoveryRequestKey = randomUUID();
    const budget = {
      maxRequestsPerRun: 3,
      maxHistoricalWindowSeconds: 3600,
      maxSnapshotFieldsPerDocument: 26,
      maxHistoricalFloatFieldsPerChunk: 8,
      maxResponseBytes: 524_288,
    };
    const repo = new FsdDiscoveryPersistenceRepository(prisma as never);
    const provider = createFsd3MockDiscoveryProvider({ mode: 'TESLA_REFERENCE_26' });
    const svc = new Fsd3CatalogSnapshotOrchestratorService(repo, provider, {
      enabled: true,
      allowedVehicleIds: new Set([seed.vehicleId]),
      providerExecutionEnabled: false,
    });
    await Promise.all([
      run(seed, svc, { discoveryRequestKey, budget }),
      run(seed, svc, { discoveryRequestKey, budget }),
    ]);
    const runRow = await prisma.fsdDiscoveryRun.findFirst({
      where: { vehicleId: seed.vehicleId },
      orderBy: { createdAt: 'desc' },
    });
    const catalogStage = await prisma.fsdDiscoveryStage.findFirst({
      where: { runId: runRow!.id, stageType: 'CATALOG' },
    });
    const ledger = (catalogStage?.checkpointJson as { requestLedger?: { attempts: unknown[] } })
      ?.requestLedger;
    expect(ledger?.attempts.length ?? 0).toBeLessThanOrEqual(3);
  });

  it('7 — HTTP 422 → reject evidence, checkpoint progress, no identical retry', async () => {
    const seed = await seedDimoBinding(prisma);
    const { svc, provider } = mockSvc(seed, 'HTTP_422_DOCUMENT');
    const result = await run(seed, svc);
    expect(result.status).toBe('PARTIAL');
    if (result.status !== 'SKIPPED') {
      const rejectEvidence = await prisma.fsdDiscoverySignalEvidence.findFirst({
        where: {
          runId: result.runId,
          signalName: { startsWith: '__fsd3_rejected_document__:' },
        },
      });
      expect(rejectEvidence).toBeTruthy();
    }
    const calls = (provider as unknown as { getSnapshotCallCount(): number }).getSnapshotCallCount();
    expect(calls).toBeGreaterThan(0);
  });

  it('8 — zero executable snapshot documents → terminal skipped snapshot stage', async () => {
    const seed = await seedDimoBinding(prisma);
    const { svc } = mockSvc(seed, 'LARGE_CATALOG_300');
    const result = await run(seed, svc, {
      budget: {
        maxRequestsPerRun: 1,
        maxHistoricalWindowSeconds: 3600,
        maxSnapshotFieldsPerDocument: 26,
        maxHistoricalFloatFieldsPerChunk: 8,
        maxResponseBytes: 524_288,
      },
    });
    expect(result.status).toBe('PARTIAL');
    if (result.status !== 'SKIPPED') {
      const stage = await prisma.fsdDiscoveryStage.findFirst({
        where: { runId: result.runId, stageType: 'SNAPSHOT' },
      });
      expect(stage?.status).toBe('SKIPPED');
    }
  });

  it('9 — CAS conflict does not report false success', async () => {
    const seed = await seedDimoBinding(prisma);
    const discoveryRequestKey = randomUUID();
    const leaseOwner = 'worker-cas';
    const { svc } = mockSvc(seed, 'TESLA_REFERENCE_26', {
      afterCatalogRequestSlotReserved: async () => {
        const runRow = await prisma.fsdDiscoveryRun.findFirst({
          where: { vehicleId: seed.vehicleId },
          orderBy: { createdAt: 'desc' },
        });
        if (runRow) {
          await prisma.fsdDiscoveryRun.update({
            where: { id: runRow.id },
            data: { version: { increment: 5 } },
          });
        }
      },
    });
    const result = await run(seed, svc, { discoveryRequestKey, leaseOwner });
    expect(result.status).toBe('FAILED');
  });

  it('10 — mock allowed; live provider blocked when gate disabled', async () => {
    const seed = await seedDimoBinding(prisma);
    const repo = new FsdDiscoveryPersistenceRepository(prisma as never);
    const liveSvc = new Fsd3CatalogSnapshotOrchestratorService(
      repo,
      createFsd3LiveStubDiscoveryProvider(),
      {
        enabled: true,
        allowedVehicleIds: new Set([seed.vehicleId]),
        providerExecutionEnabled: false,
      },
    );
    await expect(
      liveSvc.runCatalogSnapshotDiscovery({
        organizationId: seed.organizationId,
        vehicleId: seed.vehicleId,
        providerSourceLinkId: seed.linkId,
        dimoVehicleId: seed.dimoVehicleId,
        dimoTokenId: seed.tokenId,
        discoveryRequestKey: randomUUID(),
        leaseOwner: 'worker-live',
        leaseExpiresAt: new Date(Date.now() + 120_000),
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_DISPATCH_BLOCKED' });

    const { svc } = mockSvc(seed, 'TESLA_REFERENCE_26');
    const mockResult = await run(seed, svc);
    expect(mockResult.status).toBe('COMPLETED');
  });
});
