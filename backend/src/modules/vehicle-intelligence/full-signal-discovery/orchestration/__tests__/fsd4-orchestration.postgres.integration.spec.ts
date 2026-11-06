/**
 * FSD-4 historical orchestration against disposable PostgreSQL + mock provider.
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
import {
  FSD_P2E_AGGREGATE_EXPECTATIONS_V1,
  FSD_P2E_HISTORICAL_WINDOW_V1,
} from '../../__fixtures__/fsd-p2e-tesla.fixture.v1';
import {
  buildFsdDimoConnectionIdentityFingerprint,
  FsdDiscoveryPersistenceError,
} from '../../persistence/fsd-discovery-persistence.contract.v1';
import { FsdDiscoveryPersistenceRepository } from '../../persistence/fsd-discovery-persistence.repository';
import {
  assertFsd2PersistencePostgresCiEnv,
  ensureFsd2DisposableDatabaseOnce,
} from '../../persistence/fsd-discovery-persistence.postgres-harness';
import { createDefaultFsdBudgetConfigV1 } from '../../fsd-budget.contract.v1';
import { createFsd3MockDiscoveryProvider } from '../fsd3-mock-provider.v1';
import { Fsd3CatalogSnapshotOrchestratorService } from '../fsd3-orchestration.service.v1';
import { createFsd4MockHistoricalProvider } from '../fsd4-mock-provider.v1';
import { Fsd4HistoricalDiscoveryOrchestratorService } from '../fsd4-orchestration.service.v1';
import type { Fsd4OrchestrationInputV1 } from '../fsd4-orchestration.types.v1';
import type { Fsd3OrchestrationRunResultV1 } from '../fsd3-orchestration.service.v1';
import type { Fsd4OrchestrationRunResultV1 } from '../fsd4-orchestration.types.v1';

const LIVE = process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1';
const REQUIRED = process.env.FSD_DISCOVERY_PERSISTENCE_PG_REQUIRED === '1';

type Fsd3RunResultWithId = Exclude<Fsd3OrchestrationRunResultV1, { status: 'SKIPPED' }>;
type Fsd4RunResultWithId = Exclude<Fsd4OrchestrationRunResultV1, { status: 'SKIPPED' }>;

function assertFsd3RunResultWithId(
  r: Fsd3OrchestrationRunResultV1,
): asserts r is Fsd3RunResultWithId {
  if (r.status === 'SKIPPED') {
    throw new Error(`unexpected FSD-3 skip: ${r.reason}`);
  }
}

function assertFsd4RunResultWithId(
  r: Fsd4OrchestrationRunResultV1,
): asserts r is Fsd4RunResultWithId {
  if (r.status === 'SKIPPED') {
    throw new Error(`unexpected FSD-4 skip: ${r.reason}`);
  }
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
      companyName: `FSD4 ${organizationId.slice(0, 8)}`,
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

/** Enough for catalog (1) + Tesla P2E historical chunks (~8) with reuse path headroom */
const fullBudget = (): Fsd4OrchestrationInputV1['budget'] =>
  createDefaultFsdBudgetConfigV1({ maxRequestsPerRun: 64 });

(LIVE ? describe : describe.skip)('FSD-4 orchestration (PostgreSQL + mock provider)', () => {
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

  function fsd4Service(vehicleId: string, mode: Parameters<typeof createFsd4MockHistoricalProvider>[0]['mode']) {
    const repo = new FsdDiscoveryPersistenceRepository(prisma as never);
    return new Fsd4HistoricalDiscoveryOrchestratorService(
      repo,
      createFsd4MockHistoricalProvider({ mode }),
      {
        enabled: true,
        allowedVehicleIds: new Set([vehicleId]),
        providerExecutionEnabled: false,
      },
    );
  }

  function fsd3Service(
    vehicleId: string,
    extra?: { catalogDelayMs?: number },
  ) {
    const repo = new FsdDiscoveryPersistenceRepository(prisma as never);
    return new Fsd3CatalogSnapshotOrchestratorService(
      repo,
      createFsd3MockDiscoveryProvider({ mode: 'TESLA_REFERENCE_26', catalogDelayMs: extra?.catalogDelayMs }),
      {
        enabled: true,
        allowedVehicleIds: new Set([vehicleId]),
        providerExecutionEnabled: false,
      },
    );
  }

  const baseFsd4Input = (
    seed: Awaited<ReturnType<typeof seedDimoBinding>>,
    extra?: Partial<Fsd4OrchestrationInputV1>,
  ): Fsd4OrchestrationInputV1 => ({
    organizationId: seed.organizationId,
    vehicleId: seed.vehicleId,
    providerSourceLinkId: seed.linkId,
    dimoVehicleId: seed.dimoVehicleId,
    dimoTokenId: seed.tokenId,
    historicalRequestKey: extra?.historicalRequestKey ?? randomUUID(),
    historicalWindow: extra?.historicalWindow ?? { ...FSD_P2E_HISTORICAL_WINDOW_V1 },
    leaseOwner: extra?.leaseOwner ?? `worker-${randomUUID().slice(0, 8)}`,
    leaseExpiresAt: extra?.leaseExpiresAt ?? new Date(Date.now() + 120_000),
    budget: extra?.budget ?? fullBudget(),
    ...extra,
  });

  it('Tesla P2E historical: 26 catalog signals, 25 with values, expected buckets and coverage counts', async () => {
    const seed = await seedDimoBinding(prisma);
    const svc = fsd4Service(seed.vehicleId, 'TESLA_P2E_HISTORICAL');
    const result = await svc.runHistoricalDiscovery(baseFsd4Input(seed));
    expect(result.status).not.toBe('SKIPPED');
    if (result.status === 'SKIPPED') {
      throw new Error(result.reason);
    }
    expect(result.catalogSignalCount).toBe(FSD_P2E_AGGREGATE_EXPECTATIONS_V1.historicalAcceptedSignals);
    expect(result.signalsWithHistoricalCoverage).toBe(
      FSD_P2E_AGGREGATE_EXPECTATIONS_V1.historicalSignalsWithValues,
    );
    expect(result.expectedBucketPositions).toBe(FSD_P2E_AGGREGATE_EXPECTATIONS_V1.expectedBucketPositions);

    const speed = await prisma.fsdDiscoverySignalEvidence.findFirst({
      where: { runId: result.runId, stageType: 'HISTORICAL', signalName: 'speed' },
    });
    const gps = await prisma.fsdDiscoverySignalEvidence.findFirst({
      where: { runId: result.runId, stageType: 'HISTORICAL', signalName: 'currentLocationCoordinates' },
    });
    const speedQ = speed?.qualityJson as Record<string, unknown> | null;
    const gpsQ = gps?.qualityJson as Record<string, unknown> | null;
    expect(speedQ?.validValueBucketCount).toBe(FSD_P2E_AGGREGATE_EXPECTATIONS_V1.speedValidBuckets);
    expect(gpsQ?.validValueBucketCount).toBe(FSD_P2E_AGGREGATE_EXPECTATIONS_V1.gpsValidBuckets);

    const nullRow = await prisma.fsdDiscoverySignalEvidence.findFirst({
      where: {
        runId: result.runId,
        stageType: 'HISTORICAL',
        signalName: FSD_P2E_AGGREGATE_EXPECTATIONS_V1.nullOnlySignal,
      },
    });
    expect(nullRow?.observedValue).not.toBe(true);
  });

  it('deterministic speed dedupe: duplicate first timestamp is collapsed in coverage quality', async () => {
    const seed = await seedDimoBinding(prisma);
    const provider = createFsd4MockHistoricalProvider({
      mode: 'TESLA_P2E_HISTORICAL',
      duplicateFirstSpeedTimestamp: true,
    });
    const repo = new FsdDiscoveryPersistenceRepository(prisma as never);
    const svc = new Fsd4HistoricalDiscoveryOrchestratorService(
      repo,
      provider,
      { enabled: true, allowedVehicleIds: new Set([seed.vehicleId]), providerExecutionEnabled: false },
    );
    const result = await svc.runHistoricalDiscovery(baseFsd4Input(seed));
    expect(result.status).not.toBe('SKIPPED');
    if (result.status === 'SKIPPED') {
      throw new Error(result.reason);
    }
    const speed = await prisma.fsdDiscoverySignalEvidence.findFirst({
      where: { runId: result.runId, stageType: 'HISTORICAL', signalName: 'speed' },
    });
    const q = speed?.qualityJson as Record<string, unknown> | null;
    expect((q?.duplicateTimestampsIgnored as number) ?? 0).toBeGreaterThan(0);
  });

  it('crash after reserving provider slot but before response finalizes attempt UNKNOWN (fail-closed resume)', async () => {
    const seed = await seedDimoBinding(prisma);
    const svc = new Fsd4HistoricalDiscoveryOrchestratorService(
      new FsdDiscoveryPersistenceRepository(prisma as never),
      createFsd4MockHistoricalProvider({ mode: 'TESLA_P2E_HISTORICAL' }),
      { enabled: true, allowedVehicleIds: new Set([seed.vehicleId]), providerExecutionEnabled: false },
      {
        afterHistoricalRequestSlotReserved: async () => {
          throw new FsdDiscoveryPersistenceError('LEASE_LOST', 'simulated before dispatch');
        },
      },
    );
    const result = await svc.runHistoricalDiscovery(baseFsd4Input(seed, { historicalRequestKey: 'pre-dispatch' }));
    expect(result.status).toBe('FAILED');
    if (result.status === 'FAILED') {
      expect(result.failureReason).toBe('LEASE_LOST');
    }
    const second = await fsd4Service(seed.vehicleId, 'TESLA_P2E_HISTORICAL').runHistoricalDiscovery(
      baseFsd4Input(seed, { historicalRequestKey: 'pre-dispatch' }),
    );
    expect(second.status).toBe('FAILED');
    if (second.status === 'FAILED') {
      expect(
        second.failureReason === 'RESUME_NOT_SAFE_HISTORICAL_ATTEMPT_UNSETTLED' ||
          second.failureReason === 'LEASE_NOT_AVAILABLE_FOR_RESUME',
      ).toBe(true);
    }
  });

  it('idempotent replay with same historicalRequestKey does not duplicate historical evidence rows', async () => {
    const seed = await seedDimoBinding(prisma);
    const svc = fsd4Service(seed.vehicleId, 'TESLA_P2E_HISTORICAL');
    const key = randomUUID();
    const first = await svc.runHistoricalDiscovery(baseFsd4Input(seed, { historicalRequestKey: key }));
    expect(first.status).not.toBe('SKIPPED');
    if (first.status === 'SKIPPED') {
      throw new Error(first.reason);
    }
    const n1 = await prisma.fsdDiscoverySignalEvidence.count({
      where: { runId: first.runId, stageType: 'HISTORICAL', signalName: 'speed' },
    });
    const second = await svc.runHistoricalDiscovery(baseFsd4Input(seed, { historicalRequestKey: key }));
    expect(second.status).toBe('COMPLETED');
    const n2 = await prisma.fsdDiscoverySignalEvidence.count({
      where: { runId: first.runId, stageType: 'HISTORICAL', signalName: 'speed' },
    });
    expect(n2).toBe(n1);
  });

  it('zero request budget skips before persistence allocation', async () => {
    const seed = await seedDimoBinding(prisma);
    const svc = fsd4Service(seed.vehicleId, 'TESLA_P2E_HISTORICAL');
    const result = await svc.runHistoricalDiscovery(
      baseFsd4Input(seed, {
        budget: createDefaultFsdBudgetConfigV1({ maxRequestsPerRun: 0 }),
      }),
    );
    expect(result).toEqual({ status: 'SKIPPED', reason: 'FSD4_REQUEST_BUDGET_ZERO' });
    const runs = await prisma.fsdDiscoveryRun.count({
      where: { vehicleId: seed.vehicleId, providerSourceLinkId: seed.linkId },
    });
    expect(runs).toBe(0);
  });

  it('ACTIVE_RUN_CONFLICT when another executable run exists (no FSD-4 supersession of peer runs)', async () => {
    const seed = await seedDimoBinding(prisma);
    const agg = await prisma.fsdDiscoveryRun.aggregate({
      where: { providerSourceLinkId: seed.linkId },
      _max: { runRevision: true },
    });
    const runRevision = (agg._max.runRevision ?? 0) + 1;
    const blocking = await prisma.fsdDiscoveryRun.create({
      data: {
        organizationId: seed.organizationId,
        vehicleId: seed.vehicleId,
        providerSourceLinkId: seed.linkId,
        runKey: randomUUID(),
        runRevision,
        discoveryStream: 'FSD4_HISTORICAL',
        dimoTokenId: seed.tokenId,
        connectionIdentityFingerprint: buildFsdDimoConnectionIdentityFingerprint({
          dimoVehicleId: seed.dimoVehicleId,
          tokenId: seed.tokenId,
        }),
        status: 'IN_PROGRESS',
        leaseOwner: 'synthetic-block',
        leaseExpiresAt: new Date(Date.now() + 120_000),
      },
    });

    const fsd4 = fsd4Service(seed.vehicleId, 'TESLA_P2E_HISTORICAL');
    const fsd4Result = await fsd4.runHistoricalDiscovery(baseFsd4Input(seed));
    expect(fsd4Result.status).toBe('FAILED');
    if (fsd4Result.status === 'FAILED') {
      expect(fsd4Result.failureReason).toBe('ACTIVE_RUN_CONFLICT');
    }

    const blockingAfter = await prisma.fsdDiscoveryRun.findUnique({ where: { id: blocking.id } });
    expect(blockingAfter?.invalidatedAt).toBeNull();
    expect(blockingAfter?.status).toBe('IN_PROGRESS');
  });

  it('source link invalidation fails closed', async () => {
    const seed = await seedDimoBinding(prisma);
    await prisma.vehicleDataSourceLink.update({
      where: { id: seed.linkId },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    const svc = fsd4Service(seed.vehicleId, 'TESLA_P2E_HISTORICAL');
    await expect(svc.runHistoricalDiscovery(baseFsd4Input(seed))).rejects.toMatchObject({
      code: 'SOURCE_LINK_INVALID',
    });
  });

  it('partial GraphQL errors: speed QUERY_FAILED (aggregates still succeed)', async () => {
    const seed = await seedDimoBinding(prisma);
    const svc = fsd4Service(seed.vehicleId, 'PARTIAL_GRAPHQL_ERRORS');
    const result = await svc.runHistoricalDiscovery(baseFsd4Input(seed));
    expect(['COMPLETED', 'PARTIAL']).toContain(result.status);
    assertFsd4RunResultWithId(result);
    const ext = await prisma.fsdDiscoverySignalEvidence.findFirst({
      where: { runId: result.runId, stageType: 'HISTORICAL', signalName: 'exteriorAirTemperature' },
    });
    expect(ext?.evidenceState).toBe('QUERY_FAILED');
  });

  it('ambiguous GraphQL errors: UNKNOWN_OUTCOME on historical stage', async () => {
    const seed = await seedDimoBinding(prisma);
    const svc = fsd4Service(seed.vehicleId, 'AMBIGUOUS_GRAPHQL_ERRORS');
    const result = await svc.runHistoricalDiscovery(baseFsd4Input(seed));
    assertFsd4RunResultWithId(result);
    expect(result.unknownOutcomeStage).toBe(true);
    const hist = await prisma.fsdDiscoveryStage.findFirst({
      where: { runId: result.runId, stageType: 'HISTORICAL' },
    });
    expect(hist?.status).toBe('UNKNOWN_OUTCOME');
  });

  it('reuses verified FSD-3 catalog run without additional catalog provider calls', async () => {
    const seed = await seedDimoBinding(prisma);
    const fsd3 = fsd3Service(seed.vehicleId);
    const fsd3Res = await fsd3.runCatalogSnapshotDiscovery({
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      dimoVehicleId: seed.dimoVehicleId,
      dimoTokenId: seed.tokenId,
      discoveryRequestKey: randomUUID(),
      leaseOwner: 'cat3',
      leaseExpiresAt: new Date(Date.now() + 120_000),
      budget: fullBudget(),
    });
    expect(fsd3Res.status).toBe('COMPLETED');
    assertFsd3RunResultWithId(fsd3Res);

    const provider = createFsd4MockHistoricalProvider({ mode: 'TESLA_P2E_HISTORICAL' });
    const repo = new FsdDiscoveryPersistenceRepository(prisma as never);
    const svc = new Fsd4HistoricalDiscoveryOrchestratorService(
      repo,
      provider,
      { enabled: true, allowedVehicleIds: new Set([seed.vehicleId]), providerExecutionEnabled: false },
    );
    await svc.runHistoricalDiscovery(
      baseFsd4Input(seed, { verifiedFsd3CatalogRunId: fsd3Res.runId }),
    );
    expect(provider.getCatalogCallCount()).toBe(0);
    expect(provider.getHistoricalCallCount()).toBeGreaterThan(0);
  });

  it('verified FSD-3 catalog replay does not mutate the terminal FSD-3 run row', async () => {
    const seed = await seedDimoBinding(prisma);
    const fsd3 = fsd3Service(seed.vehicleId);
    const fsd3Res = await fsd3.runCatalogSnapshotDiscovery({
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      dimoVehicleId: seed.dimoVehicleId,
      dimoTokenId: seed.tokenId,
      discoveryRequestKey: randomUUID(),
      leaseOwner: 'cat-immutable',
      leaseExpiresAt: new Date(Date.now() + 120_000),
      budget: fullBudget(),
    });
    expect(fsd3Res.status).toBe('COMPLETED');
    assertFsd3RunResultWithId(fsd3Res);
    const before = await prisma.fsdDiscoveryRun.findUnique({ where: { id: fsd3Res.runId } });

    const fsd4 = fsd4Service(seed.vehicleId, 'TESLA_P2E_HISTORICAL');
    await fsd4.runHistoricalDiscovery(
      baseFsd4Input(seed, { verifiedFsd3CatalogRunId: fsd3Res.runId }),
    );

    const after = await prisma.fsdDiscoveryRun.findUnique({ where: { id: fsd3Res.runId } });
    expect(after?.status).toBe(before?.status);
    expect(after?.version).toBe(before?.version);
    expect(after?.invalidatedAt).toBeNull();
    expect(after?.supersededByRunId).toBeNull();
  });

  it('H1 invalid historical window skips before run acquisition (no rows, no provider calls)', async () => {
    const seed = await seedDimoBinding(prisma);
    const provider = createFsd4MockHistoricalProvider({ mode: 'TESLA_P2E_HISTORICAL' });
    const repo = new FsdDiscoveryPersistenceRepository(prisma as never);
    const svc = new Fsd4HistoricalDiscoveryOrchestratorService(
      repo,
      provider,
      { enabled: true, allowedVehicleIds: new Set([seed.vehicleId]), providerExecutionEnabled: false },
    );
    const result = await svc.runHistoricalDiscovery(
      baseFsd4Input(seed, {
        historicalWindow: { fromUtc: '2026-11-04T05:00:00.000Z', toUtc: '2026-11-04T04:00:00.000Z' },
      }),
    );
    expect(result).toEqual({ status: 'SKIPPED', reason: 'HISTORICAL_WINDOW_INVALID' });
    expect(provider.getCatalogCallCount()).toBe(0);
    expect(provider.getHistoricalCallCount()).toBe(0);
    const runs = await prisma.fsdDiscoveryRun.count({
      where: { vehicleId: seed.vehicleId, providerSourceLinkId: seed.linkId },
    });
    expect(runs).toBe(0);
  });

  it('H1 excessive historical window skips before run acquisition (no provider calls)', async () => {
    const seed = await seedDimoBinding(prisma);
    const provider = createFsd4MockHistoricalProvider({ mode: 'TESLA_P2E_HISTORICAL' });
    const repo = new FsdDiscoveryPersistenceRepository(prisma as never);
    const svc = new Fsd4HistoricalDiscoveryOrchestratorService(
      repo,
      provider,
      { enabled: true, allowedVehicleIds: new Set([seed.vehicleId]), providerExecutionEnabled: false },
    );
    const budget = createDefaultFsdBudgetConfigV1({
      maxRequestsPerRun: 64,
      maxHistoricalWindowSeconds: 60,
    });
    const result = await svc.runHistoricalDiscovery(
      baseFsd4Input(seed, {
        budget,
        historicalWindow: {
          fromUtc: '2026-11-04T04:00:00.000Z',
          toUtc: '2026-11-04T06:00:00.000Z',
        },
      }),
    );
    expect(result).toEqual({ status: 'SKIPPED', reason: 'HISTORICAL_WINDOW_TOO_LONG' });
    expect(provider.getCatalogCallCount()).toBe(0);
    expect(provider.getHistoricalCallCount()).toBe(0);
  });

  it('H2 active FSD-3 blocks FSD-4 with ACTIVE_RUN_CONFLICT and leaves FSD-3 executable', async () => {
    const seed = await seedDimoBinding(prisma);
    const agg = await prisma.fsdDiscoveryRun.aggregate({
      where: { providerSourceLinkId: seed.linkId },
      _max: { runRevision: true },
    });
    const runRevision = (agg._max.runRevision ?? 0) + 1;
    const blockingFsd3 = await prisma.fsdDiscoveryRun.create({
      data: {
        organizationId: seed.organizationId,
        vehicleId: seed.vehicleId,
        providerSourceLinkId: seed.linkId,
        runKey: randomUUID(),
        runRevision,
        discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
        dimoTokenId: seed.tokenId,
        connectionIdentityFingerprint: buildFsdDimoConnectionIdentityFingerprint({
          dimoVehicleId: seed.dimoVehicleId,
          tokenId: seed.tokenId,
        }),
        status: 'IN_PROGRESS',
        leaseOwner: 'synthetic-fsd3',
        leaseExpiresAt: new Date(Date.now() + 120_000),
      },
    });

    const fsd4 = fsd4Service(seed.vehicleId, 'TESLA_P2E_HISTORICAL');
    const fsd4Res = await fsd4.runHistoricalDiscovery(baseFsd4Input(seed));
    expect(fsd4Res.status).toBe('FAILED');
    if (fsd4Res.status === 'FAILED') {
      expect(fsd4Res.failureReason).toBe('ACTIVE_RUN_CONFLICT');
    }

    const fsd3After = await prisma.fsdDiscoveryRun.findUnique({ where: { id: blockingFsd3.id } });
    expect(fsd3After?.invalidatedAt).toBeNull();
    expect(fsd3After?.status).toBe('IN_PROGRESS');
  });

  it('H2 active FSD-4 blocks FSD-3 with ACTIVE_RUN_CONFLICT', async () => {
    const seed = await seedDimoBinding(prisma);
    const agg = await prisma.fsdDiscoveryRun.aggregate({
      where: { providerSourceLinkId: seed.linkId },
      _max: { runRevision: true },
    });
    const runRevision = (agg._max.runRevision ?? 0) + 1;
    await prisma.fsdDiscoveryRun.create({
      data: {
        organizationId: seed.organizationId,
        vehicleId: seed.vehicleId,
        providerSourceLinkId: seed.linkId,
        runKey: randomUUID(),
        runRevision,
        discoveryStream: 'FSD4_HISTORICAL',
        dimoTokenId: seed.tokenId,
        connectionIdentityFingerprint: buildFsdDimoConnectionIdentityFingerprint({
          dimoVehicleId: seed.dimoVehicleId,
          tokenId: seed.tokenId,
        }),
        status: 'IN_PROGRESS',
        leaseOwner: 'synthetic-fsd4',
        leaseExpiresAt: new Date(Date.now() + 120_000),
      },
    });

    const repo = new FsdDiscoveryPersistenceRepository(prisma as never);
    const fsd3 = new Fsd3CatalogSnapshotOrchestratorService(
      repo,
      createFsd3MockDiscoveryProvider({ mode: 'TESLA_REFERENCE_26' }),
      {
        enabled: true,
        allowedVehicleIds: new Set([seed.vehicleId]),
        providerExecutionEnabled: false,
      },
    );
    const fsd3Res = await fsd3.runCatalogSnapshotDiscovery({
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      dimoVehicleId: seed.dimoVehicleId,
      dimoTokenId: seed.tokenId,
      discoveryRequestKey: randomUUID(),
      leaseOwner: 'blocked-by-fsd4',
      leaseExpiresAt: new Date(Date.now() + 120_000),
      budget: fullBudget(),
    });
    expect(fsd3Res.status).toBe('FAILED');
    if (fsd3Res.status === 'FAILED') {
      expect(fsd3Res.failureReason).toBe('ACTIVE_RUN_CONFLICT');
    }
  });

  it('H3 verified reuse rejects altered declared catalog fingerprint', async () => {
    const seed = await seedDimoBinding(prisma);
    const fsd3 = fsd3Service(seed.vehicleId);
    const fsd3Res = await fsd3.runCatalogSnapshotDiscovery({
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      dimoVehicleId: seed.dimoVehicleId,
      dimoTokenId: seed.tokenId,
      discoveryRequestKey: randomUUID(),
      leaseOwner: 'cat3-h3',
      leaseExpiresAt: new Date(Date.now() + 120_000),
      budget: fullBudget(),
    });
    expect(fsd3Res.status).toBe('COMPLETED');
    assertFsd3RunResultWithId(fsd3Res);
    const catStage = await prisma.fsdDiscoveryStage.findFirst({
      where: { runId: fsd3Res.runId, stageType: 'CATALOG' },
    });
    expect(catStage).toBeTruthy();
    await prisma.fsdDiscoverySignalEvidence.deleteMany({
      where: {
        runId: fsd3Res.runId,
        stageType: 'CATALOG',
        signalName: 'speed',
      },
    });

    const fsd4 = fsd4Service(seed.vehicleId, 'TESLA_P2E_HISTORICAL');
    const res = await fsd4.runHistoricalDiscovery(
      baseFsd4Input(seed, { verifiedFsd3CatalogRunId: fsd3Res.runId }),
    );
    expect(res.status).toBe('FAILED');
    if (res.status === 'FAILED') {
      expect(res.failureReason).toBe('FSD4_VERIFIED_CATALOG_UNAVAILABLE');
    }
  });

  it('H3 verified reuse rejects stale connection identity', async () => {
    const seed = await seedDimoBinding(prisma);
    const fsd3 = fsd3Service(seed.vehicleId);
    const fsd3Res = await fsd3.runCatalogSnapshotDiscovery({
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      dimoVehicleId: seed.dimoVehicleId,
      dimoTokenId: seed.tokenId,
      discoveryRequestKey: randomUUID(),
      leaseOwner: 'cat3-h3b',
      leaseExpiresAt: new Date(Date.now() + 120_000),
      budget: fullBudget(),
    });
    assertFsd3RunResultWithId(fsd3Res);
    expect(fsd3Res.status).toBe('COMPLETED');

    const rotatedTokenId = seed.tokenId + 9999;
    await prisma.dimoVehicle.update({
      where: { id: seed.dimoVehicleId },
      data: { tokenId: rotatedTokenId },
    });

    const fsd4 = fsd4Service(seed.vehicleId, 'TESLA_P2E_HISTORICAL');
    const res = await fsd4.runHistoricalDiscovery(
      baseFsd4Input(seed, {
        verifiedFsd3CatalogRunId: fsd3Res.runId,
        dimoTokenId: rotatedTokenId,
      }),
    );
    expect(res.status).toBe('FAILED');
    if (res.status === 'FAILED') {
      expect(res.failureReason).toBe('FSD4_VERIFIED_CATALOG_UNAVAILABLE');
    }
  });

  it('H3 verified reuse rejects cross-organization run id', async () => {
    const seedA = await seedDimoBinding(prisma);
    const seedB = await seedDimoBinding(prisma);
    const fsd3 = fsd3Service(seedA.vehicleId);
    const fsd3Res = await fsd3.runCatalogSnapshotDiscovery({
      organizationId: seedA.organizationId,
      vehicleId: seedA.vehicleId,
      providerSourceLinkId: seedA.linkId,
      dimoVehicleId: seedA.dimoVehicleId,
      dimoTokenId: seedA.tokenId,
      discoveryRequestKey: randomUUID(),
      leaseOwner: 'cat-cross',
      leaseExpiresAt: new Date(Date.now() + 120_000),
      budget: fullBudget(),
    });
    assertFsd3RunResultWithId(fsd3Res);

    const fsd4 = fsd4Service(seedB.vehicleId, 'TESLA_P2E_HISTORICAL');
    const res = await fsd4.runHistoricalDiscovery(
      baseFsd4Input(seedB, { verifiedFsd3CatalogRunId: fsd3Res.runId }),
    );
    expect(res.status).toBe('FAILED');
    if (res.status === 'FAILED') {
      expect(res.failureReason).toBe('FSD4_VERIFIED_CATALOG_UNAVAILABLE');
    }
  });

  it('does not write VSI / DS4 shadow / RPM webhook tables', async () => {
    const seed = await seedDimoBinding(prisma);
    const beforeVsi = await prisma.vehicleSignalCapabilityProfile.count();
    const beforeDs4 = await prisma.ds4RpmHfV1bShadowRunV1.count();
    const beforeRpm = await prisma.rpmWebhookCandidate.count();
    const svc = fsd4Service(seed.vehicleId, 'TESLA_P2E_HISTORICAL');
    await svc.runHistoricalDiscovery(baseFsd4Input(seed));
    expect(await prisma.vehicleSignalCapabilityProfile.count()).toBe(beforeVsi);
    expect(await prisma.ds4RpmHfV1bShadowRunV1.count()).toBe(beforeDs4);
    expect(await prisma.rpmWebhookCandidate.count()).toBe(beforeRpm);
  });
});
