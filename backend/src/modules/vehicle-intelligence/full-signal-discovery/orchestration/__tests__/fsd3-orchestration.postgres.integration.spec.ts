/**
 * FSD-3 catalog/snapshot orchestration against disposable PostgreSQL + mock provider.
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
} from '../../__fixtures__/fsd-p2e-tesla.fixture.v1';
import { FsdDiscoveryPersistenceRepository } from '../../persistence/fsd-discovery-persistence.repository';
import {
  assertFsd2PersistencePostgresCiEnv,
  ensureFsd2DisposableDatabaseOnce,
} from '../../persistence/fsd-discovery-persistence.postgres-harness';
import { buildFsdDimoConnectionIdentityFingerprint } from '../../persistence/fsd-discovery-persistence.contract.v1';
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
      companyName: `FSD3 ${organizationId.slice(0, 8)}`,
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

(LIVE ? describe : describe.skip)('FSD-3 orchestration (PostgreSQL + mock provider)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;

  function assertRunResult(
    result: Awaited<ReturnType<Fsd3CatalogSnapshotOrchestratorService['runCatalogSnapshotDiscovery']>>,
  ): asserts result is Extract<typeof result, { status: 'COMPLETED' | 'PARTIAL' | 'FAILED' }> {
    if (result.status === 'SKIPPED') {
      throw new Error(`unexpected skip: ${result.reason}`);
    }
  }

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

  function serviceFor(input: {
    vehicleId: string;
    mode: Parameters<typeof createFsd3MockDiscoveryProvider>[0]['mode'];
    budget?: { maxRequestsPerRun: number; maxSnapshotFieldsPerDocument?: number };
    catalogDelayMs?: number;
    catalogSignals?: readonly string[];
  }) {
    const repo = new FsdDiscoveryPersistenceRepository(prisma as never);
    return new Fsd3CatalogSnapshotOrchestratorService(
      repo,
      createFsd3MockDiscoveryProvider({
        mode: input.mode,
        catalogDelayMs: input.catalogDelayMs,
        catalogSignals: input.catalogSignals,
      }),
      {
        enabled: true,
        allowedVehicleIds: new Set([input.vehicleId]),
        providerExecutionEnabled: false,
      },
    );
  }

  async function runDiscovery(
    svc: Fsd3CatalogSnapshotOrchestratorService,
    seed: Awaited<ReturnType<typeof seedDimoBinding>>,
    extra?: {
      budget?: Fsd3OrchestrationInputV1['budget'];
      leaseExpiresAt?: Date;
      leaseOwner?: string;
      discoveryRequestKey?: string;
    },
  ) {
    return svc.runCatalogSnapshotDiscovery({
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      dimoVehicleId: seed.dimoVehicleId,
      dimoTokenId: seed.tokenId,
      discoveryRequestKey: extra?.discoveryRequestKey ?? randomUUID(),
      leaseOwner: extra?.leaseOwner ?? `worker-${randomUUID().slice(0, 8)}`,
      leaseExpiresAt: extra?.leaseExpiresAt ?? new Date(Date.now() + 120_000),
      budget: extra?.budget,
    });
  }

  it('Tesla reference parity: 26 catalog rows, 25 observed snapshot values', async () => {
    const seed = await seedDimoBinding(prisma);
    const svc = serviceFor({ vehicleId: seed.vehicleId, mode: 'TESLA_REFERENCE_26' });
    const result = await runDiscovery(svc, seed);
    assertRunResult(result);
    expect(result.status).toBe('COMPLETED');
    expect(result.catalogSignalCount).toBe(26);
    expect(result.observedSignalCount).toBe(
      FSD_P2E_AGGREGATE_EXPECTATIONS_V1.historicalSignalsWithValues,
    );

    const catalogEvidence = await prisma.fsdDiscoverySignalEvidence.count({
      where: {
        runId: result.runId,
        stageType: 'CATALOG',
        signalName: { not: { startsWith: '__fsd3_' } },
      },
    });
    expect(catalogEvidence).toBe(26);

    const nullRow = await prisma.fsdDiscoverySignalEvidence.findFirst({
      where: {
        runId: result.runId,
        stageType: 'SNAPSHOT',
        signalName: FSD_P2E_AGGREGATE_EXPECTATIONS_V1.nullOnlySignal,
      },
    });
    expect(nullRow?.qualityJson).toEqual(
      expect.objectContaining({ observationKind: 'NULL' }),
    );
  });

  it('captures full large catalog without 256 cap', async () => {
    const seed = await seedDimoBinding(prisma);
    const svc = serviceFor({ vehicleId: seed.vehicleId, mode: 'LARGE_CATALOG_300' });
    const result = await runDiscovery(svc, seed, {
      budget: {
        maxRequestsPerRun: 1,
        maxHistoricalWindowSeconds: 3600,
        maxSnapshotFieldsPerDocument: 26,
        maxHistoricalFloatFieldsPerChunk: 8,
        maxResponseBytes: 524_288,
      },
    });
    assertRunResult(result);
    expect(result.catalogSignalCount).toBe(300);
    const catalogEvidence = await prisma.fsdDiscoverySignalEvidence.count({
      where: {
        runId: result.runId,
        stageType: 'CATALOG',
        signalName: { not: { startsWith: '__fsd3_' } },
      },
    });
    expect(catalogEvidence).toBe(300);
  });

  it('UNKNOWN_OUTCOME terminates snapshot without automatic retry', async () => {
    const seed = await seedDimoBinding(prisma);
    const svc = serviceFor({ vehicleId: seed.vehicleId, mode: 'AMBIGUOUS_GRAPHQL_ERRORS' });
    const result = await runDiscovery(svc, seed);
    assertRunResult(result);
    expect(result.unknownOutcomeStage).toBe(true);
    const stage = await prisma.fsdDiscoveryStage.findFirst({
      where: { runId: result.runId, stageType: 'SNAPSHOT' },
    });
    expect(stage?.status).toBe('UNKNOWN_OUTCOME');
    const retry = await prisma.fsdDiscoveryStage.findFirst({
      where: { runId: result.runId, stageType: 'SNAPSHOT', status: 'IN_PROGRESS' },
    });
    expect(retry).toBeNull();
  });

  it('deactivated source link blocks writes fail-closed', async () => {
    const seed = await seedDimoBinding(prisma);
    const svc = serviceFor({ vehicleId: seed.vehicleId, mode: 'TESLA_REFERENCE_26' });
    await prisma.vehicleDataSourceLink.update({
      where: { id: seed.linkId },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    await expect(
      svc.runCatalogSnapshotDiscovery({
        organizationId: seed.organizationId,
        vehicleId: seed.vehicleId,
        providerSourceLinkId: seed.linkId,
        dimoVehicleId: seed.dimoVehicleId,
        dimoTokenId: seed.tokenId,
        discoveryRequestKey: randomUUID(),
        leaseOwner: 'worker-blocked',
        leaseExpiresAt: new Date(Date.now() + 120_000),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_LINK_INVALID' });
  });

  it('does not write VSI profile tables', async () => {
    const seed = await seedDimoBinding(prisma);
    const svc = serviceFor({ vehicleId: seed.vehicleId, mode: 'TESLA_REFERENCE_26' });
    const before = await prisma.vehicleSignalCapabilityProfile.count();
    await svc.runCatalogSnapshotDiscovery({
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      dimoVehicleId: seed.dimoVehicleId,
      dimoTokenId: seed.tokenId,
      discoveryRequestKey: randomUUID(),
      leaseOwner: 'worker-vsi',
      leaseExpiresAt: new Date(Date.now() + 120_000),
    });
    const after = await prisma.vehicleSignalCapabilityProfile.count();
    expect(after).toBe(before);
  });

  it('persists FLOAT, STRING, LOCATION, and UNKNOWN catalog schema shapes', async () => {
    const seed = await seedDimoBinding(prisma);
    const svc = serviceFor({
      vehicleId: seed.vehicleId,
      mode: 'TESLA_REFERENCE_26',
      catalogSignals: [
        'speed',
        'vin',
        'currentLocationCoordinates',
        'notAValidGraphqlFieldName',
      ],
    });
    const result = await runDiscovery(svc, seed);
    assertRunResult(result);
    const shapes = await prisma.fsdDiscoverySignalEvidence.findMany({
      where: {
        runId: result.runId,
        stageType: 'CATALOG',
        signalName: { not: { startsWith: '__fsd3_' } },
      },
      select: { signalName: true, schemaShape: true },
    });
    expect(shapes).toEqual(
      expect.arrayContaining([
        { signalName: 'speed', schemaShape: 'FLOAT' },
        { signalName: 'vin', schemaShape: 'STRING' },
        { signalName: 'currentLocationCoordinates', schemaShape: 'LOCATION' },
        { signalName: 'notAValidGraphqlFieldName', schemaShape: 'UNKNOWN' },
      ]),
    );
  });

  it('records partial GraphQL field errors without treating speed as observed', async () => {
    const seed = await seedDimoBinding(prisma);
    const svc = serviceFor({ vehicleId: seed.vehicleId, mode: 'PARTIAL_GRAPHQL_ERRORS' });
    const result = await runDiscovery(svc, seed);
    assertRunResult(result);
    const speed = await prisma.fsdDiscoverySignalEvidence.findFirst({
      where: { runId: result.runId, stageType: 'SNAPSHOT', signalName: 'speed' },
    });
    expect(speed?.evidenceState).toBe('QUERY_FAILED');
    expect(speed?.observedValue).not.toBe(true);
  });

  it('defers snapshot signals when request budget is exhausted after catalog slot', async () => {
    const seed = await seedDimoBinding(prisma);
    const svc = serviceFor({ vehicleId: seed.vehicleId, mode: 'LARGE_CATALOG_300' });
    const result = await runDiscovery(svc, seed, {
      budget: {
        maxRequestsPerRun: 2,
        maxHistoricalWindowSeconds: 3600,
        maxSnapshotFieldsPerDocument: 26,
        maxHistoricalFloatFieldsPerChunk: 8,
        maxResponseBytes: 524_288,
      },
    });
    assertRunResult(result);
    const deferred = await prisma.fsdDiscoverySignalEvidence.count({
      where: { runId: result.runId, stageType: 'SNAPSHOT', evidenceState: 'DEFERRED' },
    });
    expect(deferred).toBeGreaterThan(0);
  });

  it('idempotent replay returns without re-executing snapshot documents', async () => {
    const seed = await seedDimoBinding(prisma);
    const svc = serviceFor({ vehicleId: seed.vehicleId, mode: 'TESLA_REFERENCE_26' });
    const discoveryRequestKey = randomUUID();
    const first = await runDiscovery(svc, seed, { discoveryRequestKey });
    assertRunResult(first);
    const second = await runDiscovery(svc, seed, { discoveryRequestKey });
    assertRunResult(second);
    expect(second.status).toBe('COMPLETED');
    expect(second.snapshotDocumentsExecuted).toBe(first.snapshotDocumentsExecuted);
  });

  it('rejects writes after lease expiry during snapshot execution', async () => {
    const seed = await seedDimoBinding(prisma);
    const repo = new FsdDiscoveryPersistenceRepository(prisma as never);
    const provider = createFsd3MockDiscoveryProvider({
      mode: 'TESLA_REFERENCE_26',
      snapshotDelayMs: 80,
    });
    const svc = new Fsd3CatalogSnapshotOrchestratorService(repo, provider, {
      enabled: true,
      allowedVehicleIds: new Set([seed.vehicleId]),
      providerExecutionEnabled: false,
    });
    const result = await runDiscovery(svc, seed, { leaseExpiresAt: new Date(Date.now() + 20) });
    expect(result.status).toBe('FAILED');
  });

  it('concurrent workers: only one run completes under the same catalog', async () => {
    const seed = await seedDimoBinding(prisma);
    const svc = serviceFor({ vehicleId: seed.vehicleId, mode: 'TESLA_REFERENCE_26' });
    const discoveryRequestKey = randomUUID();
    const [a, b] = await Promise.all([
      runDiscovery(svc, seed, { leaseOwner: 'worker-a', discoveryRequestKey }),
      runDiscovery(svc, seed, { leaseOwner: 'worker-b', discoveryRequestKey }),
    ]);
    const completed = [a, b].filter(
      (r) => r.status !== 'SKIPPED' && r.snapshotDocumentsExecuted > 0,
    );
    const replayed = [a, b].filter(
      (r) => r.status !== 'SKIPPED' && r.snapshotDocumentsExecuted === 0,
    );
    expect(completed.length).toBe(1);
    expect(replayed.length).toBe(1);
  });

  it('does not retry identical rejected query fingerprints within a run', async () => {
    const seed = await seedDimoBinding(prisma);
    const provider = createFsd3MockDiscoveryProvider({ mode: 'HTTP_422_DOCUMENT' });
    const repo = new FsdDiscoveryPersistenceRepository(prisma as never);
    const svc = new Fsd3CatalogSnapshotOrchestratorService(repo, provider, {
      enabled: true,
      allowedVehicleIds: new Set([seed.vehicleId]),
      providerExecutionEnabled: false,
    });
    const result = await runDiscovery(svc, seed);
    assertRunResult(result);
    const calls = (provider as unknown as { getSnapshotCallCount(): number }).getSnapshotCallCount();
    expect(calls).toBeGreaterThan(0);
    expect(result.snapshotDocumentsExecuted).toBe(0);
  });
});
