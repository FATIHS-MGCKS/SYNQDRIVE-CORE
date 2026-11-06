/**
 * FSD-3 durable ledger closeout R1–R3 (PostgreSQL + mock provider).
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
import { createFsd3MockDiscoveryProvider } from '../fsd3-mock-provider.v1';
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
      companyName: `FSD3LC ${organizationId.slice(0, 8)}`,
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

(LIVE ? describe : describe.skip)('FSD-3 ledger closeout R1–R3 (PostgreSQL)', () => {
  let prisma: PrismaClient;

  jest.setTimeout(120_000);

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

  const multiDocBudget = {
    maxRequestsPerRun: 6,
    maxHistoricalWindowSeconds: 3600,
    maxSnapshotFieldsPerDocument: 8,
    maxHistoricalFloatFieldsPerChunk: 8,
    maxResponseBytes: 524_288,
  };

  it('1 — at least three snapshot documents within budget are processed', async () => {
    const seed = await seedDimoBinding(prisma);
    const { svc, provider } = mockSvc(seed, 'LARGE_CATALOG_300');
    const result = await run(seed, svc, { budget: multiDocBudget });
    expect(result.status).toBe('PARTIAL');
    if (result.status !== 'SKIPPED') {
      expect(result.snapshotDocumentsExecuted).toBeGreaterThanOrEqual(3);
    }
    expect((provider as unknown as { getSnapshotCallCount(): number }).getSnapshotCallCount()).toBeGreaterThanOrEqual(
      3,
    );
  });

  it('2 — crash after snapshot reservation → no automatic provider retry', async () => {
    const seed = await seedDimoBinding(prisma);
    const discoveryRequestKey = randomUUID();
    const leaseOwner = 'worker-snap-reserve';
    const { svc, provider } = mockSvc(seed, 'LARGE_CATALOG_300', {
      afterSnapshotRequestSlotReserved: () => {
        throw new Error('SIMULATED_CRASH_AFTER_SNAPSHOT_RESERVE');
      },
    });
    await expect(run(seed, svc, { discoveryRequestKey, leaseOwner, budget: multiDocBudget })).rejects.toThrow(
      'SIMULATED_CRASH_AFTER_SNAPSHOT_RESERVE',
    );
    const callsBefore = (provider as unknown as { getSnapshotCallCount(): number }).getSnapshotCallCount();
    const second = await run(seed, svc, { discoveryRequestKey, leaseOwner, budget: multiDocBudget });
    expect(second.status).toBe('FAILED');
    expect((provider as unknown as { getSnapshotCallCount(): number }).getSnapshotCallCount()).toBe(callsBefore);
  });

  it('3 — crash after provider response before checkpoint → no double dispatch', async () => {
    const seed = await seedDimoBinding(prisma);
    const discoveryRequestKey = randomUUID();
    const leaseOwner = 'worker-snap-response';
    const { svc, provider } = mockSvc(seed, 'LARGE_CATALOG_300', {
      afterSnapshotProviderResponse: () => {
        throw new Error('SIMULATED_CRASH_AFTER_PROVIDER_RESPONSE');
      },
    });
    const first = await run(seed, svc, { discoveryRequestKey, leaseOwner, budget: multiDocBudget });
    expect(first.status).toBe('FAILED');
    if (first.status !== 'SKIPPED') {
      expect(first.failureReason).toBe('SIMULATED_CRASH_AFTER_PROVIDER_RESPONSE');
    }
    const callsAfterCrash = (provider as unknown as { getSnapshotCallCount(): number }).getSnapshotCallCount();
    expect(callsAfterCrash).toBeGreaterThanOrEqual(1);
    const second = await run(seed, svc, { discoveryRequestKey, leaseOwner, budget: multiDocBudget });
    expect(second.status).toBe('FAILED');
    expect((provider as unknown as { getSnapshotCallCount(): number }).getSnapshotCallCount()).toBe(
      callsAfterCrash,
    );
  });

  it('4 — HTTP 422 on first document, second succeeds → ledger versions advance', async () => {
    const seed = await seedDimoBinding(prisma);
    const discoveryRequestKey = randomUUID();
    const { svc, provider } = mockSvc(seed, 'HTTP_422_FIRST_DOCUMENT_ONLY');
    const result = await run(seed, svc, { discoveryRequestKey, budget: multiDocBudget });
    expect(result.status).toBe('PARTIAL');
    expect((provider as unknown as { getSnapshotCallCount(): number }).getSnapshotCallCount()).toBeGreaterThanOrEqual(
      2,
    );
    if (result.status !== 'SKIPPED') {
      const catalogStage = await prisma.fsdDiscoveryStage.findFirst({
        where: { runId: result.runId, stageType: 'CATALOG' },
      });
      expect(catalogStage?.version).toBeGreaterThanOrEqual(4);
      const ledger = (catalogStage?.checkpointJson as { requestLedger?: { attempts: unknown[] } })
        ?.requestLedger;
      expect((ledger?.attempts.length ?? 0)).toBeGreaterThanOrEqual(3);
    }
  });

  it('5 — rejected fingerprint stays terminal on replay', async () => {
    const seed = await seedDimoBinding(prisma);
    const discoveryRequestKey = randomUUID();
    const { svc, provider } = mockSvc(seed, 'HTTP_422_FIRST_DOCUMENT_ONLY');
    const first = await run(seed, svc, { discoveryRequestKey, budget: multiDocBudget });
    expect(first.status).toBe('PARTIAL');
    const callsAfterFirst = (provider as unknown as { getSnapshotCallCount(): number }).getSnapshotCallCount();
    const replay = await run(seed, svc, { discoveryRequestKey, budget: multiDocBudget });
    expect(replay.status).toBe('PARTIAL');
    expect((provider as unknown as { getSnapshotCallCount(): number }).getSnapshotCallCount()).toBe(
      callsAfterFirst,
    );
  });

  it('6 — PARTIAL due to deferred signals → replay stays PARTIAL', async () => {
    const seed = await seedDimoBinding(prisma);
    const discoveryRequestKey = randomUUID();
    const { svc } = mockSvc(seed, 'LARGE_CATALOG_300');
    const first = await run(seed, svc, {
      discoveryRequestKey,
      budget: {
        ...multiDocBudget,
        maxRequestsPerRun: 4,
        maxSnapshotFieldsPerDocument: 8,
      },
    });
    expect(first.status).toBe('PARTIAL');
    const replay = await run(seed, svc, { discoveryRequestKey, budget: multiDocBudget });
    expect(replay.status).toBe('PARTIAL');
    expect(replay.status).not.toBe('COMPLETED');
  });

  it('7 — PARTIAL due to HTTP 422 → replay stays PARTIAL', async () => {
    const seed = await seedDimoBinding(prisma);
    const discoveryRequestKey = randomUUID();
    const { svc } = mockSvc(seed, 'HTTP_422_FIRST_DOCUMENT_ONLY');
    const first = await run(seed, svc, { discoveryRequestKey, budget: multiDocBudget });
    expect(first.status).toBe('PARTIAL');
    const replay = await run(seed, svc, { discoveryRequestKey, budget: multiDocBudget });
    expect(replay.status).toBe('PARTIAL');
  });

  it('8 — CAS conflict on snapshot ledger finalize → no further dispatch, no false success', async () => {
    const seed = await seedDimoBinding(prisma);
    const discoveryRequestKey = randomUUID();
    const leaseOwner = 'worker-ledger-cas';
    const { svc, provider } = mockSvc(seed, 'LARGE_CATALOG_300', {
      afterSnapshotProviderResponse: async () => {
        const runRow = await prisma.fsdDiscoveryRun.findFirst({
          where: { vehicleId: seed.vehicleId },
          orderBy: { createdAt: 'desc' },
        });
        if (runRow) {
          await prisma.fsdDiscoveryStage.updateMany({
            where: { runId: runRow.id, stageType: 'CATALOG' },
            data: { version: { increment: 3 } },
          });
        }
      },
    });
    const result = await run(seed, svc, { discoveryRequestKey, leaseOwner, budget: multiDocBudget });
    expect(result.status).toBe('FAILED');
    const runRow = await prisma.fsdDiscoveryRun.findFirst({
      where: { vehicleId: seed.vehicleId },
      orderBy: { createdAt: 'desc' },
    });
    expect(runRow?.status).not.toBe('COMPLETED');
    const calls = (provider as unknown as { getSnapshotCallCount(): number }).getSnapshotCallCount();
    expect(calls).toBeGreaterThanOrEqual(1);
  });

  it('9 — budget change on resume → plan mismatch, no silent replan', async () => {
    const seed = await seedDimoBinding(prisma);
    const discoveryRequestKey = randomUUID();
    const leaseOwner = 'worker-plan-mismatch';
    const { svc } = mockSvc(seed, 'LARGE_CATALOG_300', {
      afterSnapshotDocumentCompleted: (index) => {
        if (index === 0) {
          throw new Error('SIMULATED_CRASH_AFTER_FIRST_DOC');
        }
      },
    });
    await expect(
      run(seed, svc, { discoveryRequestKey, leaseOwner, budget: multiDocBudget }),
    ).rejects.toThrow('SIMULATED_CRASH_AFTER_FIRST_DOC');
    const resumed = await run(seed, svc, {
      discoveryRequestKey,
      leaseOwner,
      budget: { ...multiDocBudget, maxRequestsPerRun: 10 },
    });
    expect(resumed.status).toBe('FAILED');
    if (resumed.status !== 'SKIPPED') {
      expect(resumed.failureReason).toBe('RESUME_SNAPSHOT_PLAN_MISMATCH');
    }
  });
});
