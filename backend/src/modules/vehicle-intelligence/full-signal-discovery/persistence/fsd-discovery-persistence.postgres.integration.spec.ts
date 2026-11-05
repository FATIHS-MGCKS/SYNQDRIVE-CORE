/**
 * FSD-2 discovery persistence idempotency (PostgreSQL).
 * FSD_DISCOVERY_PERSISTENCE_PG=1 DATABASE_URL=postgresql://.../synqdrive_ci_ephemeral npm test -- fsd-discovery-persistence.postgres.integration
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
  buildFsdDiscoveryRunKey,
  buildFsdDiscoveryStagePlanFingerprint,
  FsdDiscoveryPersistenceRepository,
} from './index';

const LIVE = process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1';

function assertDisposableDatabaseUrl(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('FSD_DISCOVERY_PERSISTENCE_PG=1 requires DATABASE_URL');
  const dbName = new URL(url).pathname.replace(/^\//, '').split('?')[0] ?? '';
  if (!/synqdrive|test|ci|fsd|ephemeral/i.test(dbName)) {
    throw new Error(`Refusing non-disposable database name: ${dbName}`);
  }
}

async function seedOrgVehicle(prisma: PrismaClient) {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const linkId = randomUUID();
  await prisma.organization.create({
    data: {
      id: organizationId,
      companyName: `FSD2 ${organizationId.slice(0, 8)}`,
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
  await prisma.vehicleDataSourceLink.create({
    data: {
      id: linkId,
      vehicleId,
      provider: 'DIMO',
      sourceType: 'DIMO',
      isActive: true,
    },
  });
  return { organizationId, vehicleId, linkId };
}

(LIVE ? describe : describe.skip)('FSD-2 discovery persistence (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const repo = new FsdDiscoveryPersistenceRepository(prisma as never);

  beforeAll(() => {
    assertDisposableDatabaseUrl();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates run/stage and replays identical idempotent request', async () => {
    const { organizationId, vehicleId, linkId } = await seedOrgVehicle(prisma);
    const scope = { organizationId, vehicleId, providerSourceLinkId: linkId };
    const runKey = buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'tesla-26' });
    const identity = {
      ...scope,
      runKey,
      runRevision: 1,
      dimoTokenId: 4242,
      connectionIdentityFingerprint: 'fp-test',
    };
    const first = await repo.acquireRunWithIdempotency(identity);
    expect(first.kind).toBe('CREATED');
    const second = await repo.acquireRunWithIdempotency(identity);
    expect(second.kind).toBe('REPLAYED');

    const planFingerprint = buildFsdDiscoveryStagePlanFingerprint({
      stageType: 'CATALOG',
      planDocumentFingerprints: ['doc-a'],
    });
    const stage = await repo.upsertStagePlan({
      scope,
      runId: first.runId,
      stageType: 'CATALOG',
      planFingerprint,
    });
    expect(stage.created).toBe(true);
    const stageReplay = await repo.upsertStagePlan({
      scope,
      runId: first.runId,
      stageType: 'CATALOG',
      planFingerprint,
    });
    expect(stageReplay.noOp).toBe(true);
  });

  it('enforces CAS run transition and tenant isolation', async () => {
    const { organizationId, vehicleId, linkId } = await seedOrgVehicle(prisma);
    const other = await seedOrgVehicle(prisma);
    const scope = { organizationId, vehicleId, providerSourceLinkId: linkId };
    const runKey = buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'cas-test' });
    const acquired = await repo.acquireRunWithIdempotency({
      ...scope,
      runKey,
      runRevision: 1,
      dimoTokenId: 1,
      connectionIdentityFingerprint: 'fp',
    });
    const ok = await repo.transitionRunStatus({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version,
      fromStatus: 'PENDING',
      toStatus: 'IN_PROGRESS',
    });
    expect(ok.applied).toBe(true);
    const stale = await repo.transitionRunStatus({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version,
      fromStatus: 'IN_PROGRESS',
      toStatus: 'COMPLETED',
    });
    expect(stale.applied).toBe(false);

    await expect(
      repo.transitionRunStatus({
        scope: {
          organizationId: other.organizationId,
          vehicleId: other.vehicleId,
          providerSourceLinkId: other.linkId,
        },
        runId: acquired.runId,
        expectedVersion: acquired.version + 1,
        fromStatus: 'IN_PROGRESS',
        toStatus: 'COMPLETED',
      }),
    ).rejects.toMatchObject({ code: 'RUN_NOT_FOUND' });
  });

  it('records UNKNOWN_OUTCOME stage without retry transition', async () => {
    const { organizationId, vehicleId, linkId } = await seedOrgVehicle(prisma);
    const scope = { organizationId, vehicleId, providerSourceLinkId: linkId };
    const acquired = await repo.acquireRunWithIdempotency({
      ...scope,
      runKey: buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'unknown-outcome' }),
      runRevision: 1,
      dimoTokenId: 9,
      connectionIdentityFingerprint: 'fp',
    });
    const stage = await repo.upsertStagePlan({
      scope,
      runId: acquired.runId,
      stageType: 'HISTORICAL',
      planFingerprint: 'plan-h1',
    });
    await repo.transitionStageStatus({
      scope,
      runId: acquired.runId,
      stageType: 'HISTORICAL',
      expectedVersion: 1,
      fromStatus: 'PLANNED',
      toStatus: 'IN_PROGRESS',
      incrementAttempt: true,
    });
    const unknown = await repo.transitionStageStatus({
      scope,
      runId: acquired.runId,
      stageType: 'HISTORICAL',
      expectedVersion: 2,
      fromStatus: 'IN_PROGRESS',
      toStatus: 'UNKNOWN_OUTCOME',
      lastOutcome: 'UNKNOWN_OUTCOME',
    });
    expect(unknown.applied).toBe(true);
    const row = await prisma.fsdDiscoveryStage.findUnique({ where: { id: stage.stageId } });
    expect(row?.status).toBe('UNKNOWN_OUTCOME');
    const blocked = await repo.transitionStageStatus({
      scope,
      runId: acquired.runId,
      stageType: 'HISTORICAL',
      expectedVersion: 3,
      fromStatus: 'UNKNOWN_OUTCOME',
      toStatus: 'IN_PROGRESS',
    });
    expect(blocked.applied).toBe(false);
  });

  it('supersedes prior active runs when a new run is acquired', async () => {
    const { organizationId, vehicleId, linkId } = await seedOrgVehicle(prisma);
    const scope = { organizationId, vehicleId, providerSourceLinkId: linkId };
    const first = await repo.acquireRunWithIdempotency({
      ...scope,
      runKey: buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'rev-1' }),
      runRevision: 1,
      dimoTokenId: 1,
      connectionIdentityFingerprint: 'fp1',
    });
    const second = await repo.acquireRunWithIdempotency({
      ...scope,
      runKey: buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'rev-2' }),
      runRevision: 2,
      dimoTokenId: 1,
      connectionIdentityFingerprint: 'fp2',
    });
    expect(second.kind).toBe('CREATED');
    const invalidated = await prisma.fsdDiscoveryRun.findUnique({ where: { id: first.runId } });
    expect(invalidated?.status).toBe('INVALIDATED');
    const count = await repo.supersedeActiveRunsForSourceLink({
      scope,
      supersededByRunId: second.runId,
      reason: 'SOURCE_LINK_SUPERSESSION',
    });
    expect(count).toBe(0);
  });

  it('serializes concurrent identical acquire requests', async () => {
    const { organizationId, vehicleId, linkId } = await seedOrgVehicle(prisma);
    const identity = {
      organizationId,
      vehicleId,
      providerSourceLinkId: linkId,
      runKey: buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'concurrent' }),
      runRevision: 1,
      dimoTokenId: 77,
      connectionIdentityFingerprint: 'fp-concurrent',
    };
    const [a, b] = await Promise.all([
      repo.acquireRunWithIdempotency(identity),
      repo.acquireRunWithIdempotency(identity),
    ]);
    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(['CREATED', 'REPLAYED']);
    expect(a.runId).toBe(b.runId);
  });

  it('claims run lease exclusively for concurrent workers', async () => {
    const { organizationId, vehicleId, linkId } = await seedOrgVehicle(prisma);
    const scope = { organizationId, vehicleId, providerSourceLinkId: linkId };
    const acquired = await repo.acquireRunWithIdempotency({
      ...scope,
      runKey: buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'lease' }),
      runRevision: 1,
      dimoTokenId: 1,
      connectionIdentityFingerprint: 'fp',
    });
    const expires = new Date(Date.now() + 60_000);
    const [w1, w2] = await Promise.all([
      repo.claimRunLease({
        scope,
        runId: acquired.runId,
        expectedVersion: acquired.version,
        leaseOwner: 'worker-a',
        leaseExpiresAt: expires,
      }),
      repo.claimRunLease({
        scope,
        runId: acquired.runId,
        expectedVersion: acquired.version,
        leaseOwner: 'worker-b',
        leaseExpiresAt: expires,
      }),
    ]);
    expect(w1 !== w2).toBe(true);
    expect(w1 || w2).toBe(true);
  });

  it('resumes interrupted stage from persisted checkpoint', async () => {
    const { organizationId, vehicleId, linkId } = await seedOrgVehicle(prisma);
    const scope = { organizationId, vehicleId, providerSourceLinkId: linkId };
    const acquired = await repo.acquireRunWithIdempotency({
      ...scope,
      runKey: buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'resume' }),
      runRevision: 1,
      dimoTokenId: 1,
      connectionIdentityFingerprint: 'fp',
    });
    await repo.upsertStagePlan({
      scope,
      runId: acquired.runId,
      stageType: 'SNAPSHOT',
      planFingerprint: 'snap-plan',
      checkpointJson: { cursor: 'chunk-0' },
    });
    await repo.transitionStageStatus({
      scope,
      runId: acquired.runId,
      stageType: 'SNAPSHOT',
      expectedVersion: 1,
      fromStatus: 'PLANNED',
      toStatus: 'IN_PROGRESS',
      incrementAttempt: true,
      checkpointJson: { cursor: 'chunk-1' },
    });
    const resumed = await repo.upsertStagePlan({
      scope,
      runId: acquired.runId,
      stageType: 'SNAPSHOT',
      planFingerprint: 'snap-plan',
      checkpointJson: { cursor: 'chunk-1' },
    });
    expect(resumed.noOp).toBe(false);
    const row = await prisma.fsdDiscoveryStage.findUnique({
      where: { runId_stageType: { runId: acquired.runId, stageType: 'SNAPSHOT' } },
    });
    expect(row?.checkpointJson).toEqual({ cursor: 'chunk-1' });
  });

  it('rejects stage writes on stale invalidated source-link run', async () => {
    const { organizationId, vehicleId, linkId } = await seedOrgVehicle(prisma);
    const scope = { organizationId, vehicleId, providerSourceLinkId: linkId };
    const first = await repo.acquireRunWithIdempotency({
      ...scope,
      runKey: buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'stale-link' }),
      runRevision: 1,
      dimoTokenId: 1,
      connectionIdentityFingerprint: 'fp',
    });
    await repo.acquireRunWithIdempotency({
      ...scope,
      runKey: buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'stale-link-v2' }),
      runRevision: 2,
      dimoTokenId: 1,
      connectionIdentityFingerprint: 'fp2',
    });
    await expect(
      repo.upsertStagePlan({
        scope,
        runId: first.runId,
        stageType: 'CATALOG',
        planFingerprint: 'plan',
      }),
    ).rejects.toMatchObject({ code: 'STALE_SOURCE_LINK' });
  });

  it('fail-closed on invalid run status transition', async () => {
    const { organizationId, vehicleId, linkId } = await seedOrgVehicle(prisma);
    const scope = { organizationId, vehicleId, providerSourceLinkId: linkId };
    const acquired = await repo.acquireRunWithIdempotency({
      ...scope,
      runKey: buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'invalid-run' }),
      runRevision: 1,
      dimoTokenId: 1,
      connectionIdentityFingerprint: 'fp',
    });
    await repo.transitionRunStatus({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version,
      fromStatus: 'PENDING',
      toStatus: 'IN_PROGRESS',
    });
    await repo.transitionRunStatus({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version + 1,
      fromStatus: 'IN_PROGRESS',
      toStatus: 'COMPLETED',
    });
    const invalid = await repo.transitionRunStatus({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version + 2,
      fromStatus: 'COMPLETED',
      toStatus: 'IN_PROGRESS',
    });
    expect(invalid.applied).toBe(false);
    if (!invalid.applied) {
      expect(invalid.reason).toBe('INVALID_STATE_TRANSITION');
    }
  });
});
