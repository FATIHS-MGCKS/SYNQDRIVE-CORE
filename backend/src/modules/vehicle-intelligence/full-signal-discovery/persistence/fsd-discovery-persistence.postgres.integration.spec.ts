/**
 * FSD-2 persistence PostgreSQL integration (disposable fsd2_test_* database only).
 * CI: bash backend/scripts/test/fsd2-persistence-postgres-ci.sh
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
  bootstrapFsd2DisposableDatabase,
  ensureFsd2DisposableDatabaseOnce,
  assertFsd2PersistencePostgresCiEnv,
} from './fsd-discovery-persistence.postgres-harness';
import {
  buildFsdDimoConnectionIdentityFingerprint,
  buildFsdDiscoveryRunKey,
  FsdDiscoveryPersistenceRepository,
  type FsdDiscoveryWriteAuthorizationV1,
} from './index';

const LIVE = process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1';
const REQUIRED = process.env.FSD_DISCOVERY_PERSISTENCE_PG_REQUIRED === '1';

export let testDbIsolated = false;
export let testMigrationExecuted = false;

async function seedDimoBinding(prisma: PrismaClient, opts?: { inactive?: boolean }) {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const dimoVehicleId = randomUUID();
  const linkId = randomUUID();
  const tokenId = Math.floor(Math.random() * 1_000_000) + 5_000_000;
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
      isActive: opts?.inactive ? false : true,
      deactivatedAt: opts?.inactive ? new Date() : null,
    },
  });
  const fingerprint = buildFsdDimoConnectionIdentityFingerprint({ dimoVehicleId, tokenId });
  return { organizationId, vehicleId, linkId, tokenId, fingerprint };
}

async function acquireWithLease(
  repo: FsdDiscoveryPersistenceRepository,
  input: {
    organizationId: string;
    vehicleId: string;
    linkId: string;
    tokenId: number;
    fingerprint: string;
    catalogFingerprint: string;
    runRevision?: number;
  },
) {
  const scope = {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    providerSourceLinkId: input.linkId,
  };
  const runKey = buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: input.catalogFingerprint });
  const acquired = await repo.acquireRunWithIdempotency({
    ...scope,
    runKey,
    runRevision: input.runRevision ?? 1,
    dimoTokenId: input.tokenId,
    connectionIdentityFingerprint: input.fingerprint,
  });
  const leaseOwner = `worker-${randomUUID().slice(0, 8)}`;
  const leaseExpiresAt = new Date(Date.now() + 120_000);
  const claimed = await repo.claimRunLease({
    scope,
    runId: acquired.runId,
    expectedVersion: acquired.version,
    leaseOwner,
    leaseExpiresAt,
  });
  expect(claimed).toBe(true);
  const auth: FsdDiscoveryWriteAuthorizationV1 = {
    ...scope,
    runId: acquired.runId,
    expectedRunVersion: acquired.version + 1,
    leaseOwner,
  };
  return { scope, runKey, acquired, auth, leaseOwner, leaseExpiresAt };
}

(LIVE ? describe : describe.skip)('FSD-2 discovery persistence (PostgreSQL H1–H5)', () => {
  let prisma: PrismaClient;
  let repo: FsdDiscoveryPersistenceRepository;

  beforeAll(async () => {
    assertFsd2PersistencePostgresCiEnv();
    if (REQUIRED) {
      const boot = await ensureFsd2DisposableDatabaseOnce();
      testDbIsolated = boot.isolated;
      testMigrationExecuted = boot.migrationExecuted;
    }
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new FsdDiscoveryPersistenceRepository(prisma as never);
  }, 600_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('meta: disposable database gate', () => {
    if (REQUIRED) {
      expect(testDbIsolated).toBe(true);
      expect(testMigrationExecuted).toBe(true);
    }
  });

  it('1 — supersession during stage update rejects fenced writer', async () => {
    const seed = await seedDimoBinding(prisma);
    const first = await acquireWithLease(repo, { ...seed, catalogFingerprint: 'supersede-stage' });
    await repo.upsertStagePlan({
      auth: first.auth,
      stageType: 'CATALOG',
      planFingerprint: 'plan-a',
    });
    const secondKey = buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'supersede-stage-v2' });
    await repo.acquireRunWithIdempotency({
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      runKey: secondKey,
      runRevision: 99,
      dimoTokenId: seed.tokenId,
      connectionIdentityFingerprint: seed.fingerprint,
    });
    await expect(
      repo.transitionStageStatus({
        auth: first.auth,
        stageType: 'CATALOG',
        expectedStageVersion: 1,
        fromStatus: 'PLANNED',
        toStatus: 'IN_PROGRESS',
        incrementAttempt: true,
      }),
    ).rejects.toMatchObject({ code: 'LEASE_LOST' });
  });

  it('2 — lease loss before evidence write', async () => {
    const seed = await seedDimoBinding(prisma);
    const run = await acquireWithLease(repo, { ...seed, catalogFingerprint: 'lease-loss' });
    await prisma.fsdDiscoveryRun.update({
      where: { id: run.acquired.runId },
      data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
    });
    await expect(
      repo.recordSignalEvidence({
        auth: run.auth,
        stageId: null,
        stageType: 'CATALOG',
        signalName: 'speed',
        evidenceState: 'DECLARED_ONLY',
      }),
    ).rejects.toMatchObject({ code: 'LEASE_LOST' });
  });

  it('3 — concurrent checkpoint write CAS', async () => {
    const seed = await seedDimoBinding(prisma);
    const run = await acquireWithLease(repo, { ...seed, catalogFingerprint: 'checkpoint-race' });
    await repo.upsertStagePlan({
      auth: run.auth,
      stageType: 'SNAPSHOT',
      planFingerprint: 'snap-plan',
    });
    const [a, b] = await Promise.all([
      repo.advanceStageCheckpoint({
        auth: run.auth,
        stageType: 'SNAPSHOT',
        expectedStageVersion: 1,
        planFingerprint: 'snap-plan',
        checkpointJson: { cursor: 'a' },
      }),
      repo.advanceStageCheckpoint({
        auth: run.auth,
        stageType: 'SNAPSHOT',
        expectedStageVersion: 1,
        planFingerprint: 'snap-plan',
        checkpointJson: { cursor: 'b' },
      }),
    ]);
    expect(a.applied !== b.applied).toBe(true);
  });

  it('4 — divergent fingerprint on existing stage is explicit conflict', async () => {
    const seed = await seedDimoBinding(prisma);
    const run = await acquireWithLease(repo, { ...seed, catalogFingerprint: 'fp-conflict' });
    await repo.upsertStagePlan({
      auth: run.auth,
      stageType: 'HISTORICAL',
      planFingerprint: 'plan-v1',
    });
    await expect(
      repo.upsertStagePlan({
        auth: run.auth,
        stageType: 'HISTORICAL',
        planFingerprint: 'plan-v2',
      }),
    ).rejects.toMatchObject({ code: 'PLAN_FINGERPRINT_CONFLICT' });
  });

  it('5 — UNKNOWN_OUTCOME stage remains immutable', async () => {
    const seed = await seedDimoBinding(prisma);
    const run = await acquireWithLease(repo, { ...seed, catalogFingerprint: 'unknown-immutable' });
    await repo.upsertStagePlan({
      auth: run.auth,
      stageType: 'HISTORICAL',
      planFingerprint: 'plan-u',
    });
    await repo.transitionStageStatus({
      auth: run.auth,
      stageType: 'HISTORICAL',
      expectedStageVersion: 1,
      fromStatus: 'PLANNED',
      toStatus: 'IN_PROGRESS',
      incrementAttempt: true,
    });
    await repo.transitionStageStatus({
      auth: run.auth,
      stageType: 'HISTORICAL',
      expectedStageVersion: 2,
      fromStatus: 'IN_PROGRESS',
      toStatus: 'UNKNOWN_OUTCOME',
      lastOutcome: 'UNKNOWN_OUTCOME',
    });
    await expect(
      repo.advanceStageCheckpoint({
        auth: run.auth,
        stageType: 'HISTORICAL',
        expectedStageVersion: 3,
        planFingerprint: 'plan-u',
        checkpointJson: { cursor: 'late' },
      }),
    ).rejects.toMatchObject({ code: 'STAGE_IMMUTABLE' });
  });

  it('6 — foreign/inactive/nonexistent source link fail-closed', async () => {
    const seed = await seedDimoBinding(prisma);
    const inactive = await seedDimoBinding(prisma, { inactive: true });
    const runKey = buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'bad-link' });
    await expect(
      repo.acquireRunWithIdempotency({
        organizationId: inactive.organizationId,
        vehicleId: inactive.vehicleId,
        providerSourceLinkId: inactive.linkId,
        runKey,
        runRevision: 1,
        dimoTokenId: inactive.tokenId,
        connectionIdentityFingerprint: inactive.fingerprint,
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_LINK_INVALID' });

    await expect(
      repo.acquireRunWithIdempotency({
        organizationId: seed.organizationId,
        vehicleId: seed.vehicleId,
        providerSourceLinkId: randomUUID(),
        runKey,
        runRevision: 1,
        dimoTokenId: seed.tokenId,
        connectionIdentityFingerprint: seed.fingerprint,
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_LINK_INVALID' });
  });

  it('7 — new run after completed run without rewriting terminal status', async () => {
    const seed = await seedDimoBinding(prisma);
    const first = await acquireWithLease(repo, { ...seed, catalogFingerprint: 'completed-then-new' });
    await repo.transitionRunStatus({
      scope: first.scope,
      runId: first.acquired.runId,
      expectedVersion: first.auth.expectedRunVersion,
      fromStatus: 'PENDING',
      toStatus: 'IN_PROGRESS',
    });
    await repo.transitionRunStatus({
      scope: first.scope,
      runId: first.acquired.runId,
      expectedVersion: first.auth.expectedRunVersion + 1,
      fromStatus: 'IN_PROGRESS',
      toStatus: 'COMPLETED',
    });
    const completed = await prisma.fsdDiscoveryRun.findUnique({ where: { id: first.acquired.runId } });
    expect(completed?.status).toBe('COMPLETED');

    const second = await repo.acquireRunWithIdempotency({
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      runKey: buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'completed-then-new-2' }),
      runRevision: 1,
      dimoTokenId: seed.tokenId,
      connectionIdentityFingerprint: seed.fingerprint,
    });
    expect(second.kind).toBe('CREATED');
    const completedAfter = await prisma.fsdDiscoveryRun.findUnique({
      where: { id: first.acquired.runId },
    });
    expect(completedAfter?.status).toBe('COMPLETED');
  });

  it('8 — same run key after invalidation creates a fresh active run', async () => {
    const seed = await seedDimoBinding(prisma);
    const runKey = buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'reuse-key' });
    const first = await repo.acquireRunWithIdempotency({
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      runKey,
      runRevision: 1,
      dimoTokenId: seed.tokenId,
      connectionIdentityFingerprint: seed.fingerprint,
    });
    await repo.acquireRunWithIdempotency({
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      runKey: buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'reuse-key-v2' }),
      runRevision: 1,
      dimoTokenId: seed.tokenId,
      connectionIdentityFingerprint: seed.fingerprint,
    });
    const invalidated = await prisma.fsdDiscoveryRun.findUnique({ where: { id: first.runId } });
    expect(invalidated?.status).toBe('INVALIDATED');

    const reopened = await repo.acquireRunWithIdempotency({
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      runKey,
      runRevision: 1,
      dimoTokenId: seed.tokenId,
      connectionIdentityFingerprint: seed.fingerprint,
    });
    expect(reopened.kind).toBe('CREATED');
    expect(reopened.runId).not.toBe(first.runId);
  });

  it('9 — concurrent run revision allocation is monotonic', async () => {
    const seed = await seedDimoBinding(prisma);
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
    };
    const [a, b] = await Promise.all([
      repo.acquireRunWithIdempotency({
        ...scope,
        runKey: buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'rev-a' }),
        runRevision: 1,
        dimoTokenId: seed.tokenId,
        connectionIdentityFingerprint: seed.fingerprint,
      }),
      repo.acquireRunWithIdempotency({
        ...scope,
        runKey: buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: 'rev-b' }),
        runRevision: 1,
        dimoTokenId: seed.tokenId,
        connectionIdentityFingerprint: seed.fingerprint,
      }),
    ]);
    expect(a.runRevision).not.toBe(b.runRevision);
  });

  it('10 — foreign stageId on evidence write rejected', async () => {
    const seedA = await seedDimoBinding(prisma);
    const seedB = await seedDimoBinding(prisma);
    const runA = await acquireWithLease(repo, { ...seedA, catalogFingerprint: 'evidence-scope-a' });
    const runB = await acquireWithLease(repo, { ...seedB, catalogFingerprint: 'evidence-scope-b' });
    const stageB = await repo.upsertStagePlan({
      auth: runB.auth,
      stageType: 'CATALOG',
      planFingerprint: 'b-plan',
    });
    await expect(
      repo.recordSignalEvidence({
        auth: runA.auth,
        stageId: stageB.stageId,
        stageType: 'CATALOG',
        signalName: 'rpm',
        evidenceState: 'OBSERVED',
      }),
    ).rejects.toMatchObject({ code: 'EVIDENCE_SCOPE_VIOLATION' });
  });

  it('11 — concurrent evidence upsert is idempotent or CAS-safe', async () => {
    const seed = await seedDimoBinding(prisma);
    const run = await acquireWithLease(repo, { ...seed, catalogFingerprint: 'evidence-race' });
    const payload = {
      auth: run.auth,
      stageId: null as string | null,
      stageType: 'CATALOG' as const,
      signalName: 'odometer',
      evidenceState: 'DECLARED_ONLY' as const,
    };
    const [a, b] = await Promise.all([
      repo.recordSignalEvidence(payload),
      repo.recordSignalEvidence(payload),
    ]);
    expect(a.evidenceId).toBe(b.evidenceId);
    const count = await prisma.fsdDiscoverySignalEvidence.count({
      where: { runId: run.acquired.runId, signalName: 'odometer' },
    });
    expect(count).toBe(1);
  });

  it('12 — failed fenced write leaves no partial stage mutation', async () => {
    const seed = await seedDimoBinding(prisma);
    const run = await acquireWithLease(repo, { ...seed, catalogFingerprint: 'no-partial' });
    await repo.upsertStagePlan({
      auth: run.auth,
      stageType: 'CATALOG',
      planFingerprint: 'stable',
    });
    await repo.transitionStageStatus({
      auth: run.auth,
      stageType: 'CATALOG',
      expectedStageVersion: 1,
      fromStatus: 'PLANNED',
      toStatus: 'IN_PROGRESS',
      incrementAttempt: true,
    });
    const transitioned = await repo.transitionStageStatus({
      auth: run.auth,
      stageType: 'CATALOG',
      expectedStageVersion: 2,
      fromStatus: 'IN_PROGRESS',
      toStatus: 'SUCCEEDED',
    });
    expect(transitioned.applied).toBe(true);
    const before = await prisma.fsdDiscoveryStage.findUnique({
      where: { runId_stageType: { runId: run.acquired.runId, stageType: 'CATALOG' } },
    });
    expect(before?.status).toBe('SUCCEEDED');
    await expect(
      repo.upsertStagePlan({
        auth: run.auth,
        stageType: 'CATALOG',
        planFingerprint: 'stable-v2',
      }),
    ).rejects.toMatchObject({ code: 'STAGE_IMMUTABLE' });
    const after = await prisma.fsdDiscoveryStage.findUnique({
      where: { runId_stageType: { runId: run.acquired.runId, stageType: 'CATALOG' } },
    });
    expect(after?.version).toBe(before?.version);
    expect(after?.planFingerprint).toBe(before?.planFingerprint);
  });
});
