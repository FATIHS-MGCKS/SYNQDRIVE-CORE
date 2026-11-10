import { randomUUID } from 'node:crypto';
import {
  ApdShadowActivationEpochLifecycle,
  BusinessType,
  DimoPollJobType,
  DimoPollStatus,
  FuelType,
  PrismaClient,
} from '@prisma/client';
import {
  classifyOpportunityJointWouldSkipSuccess,
  type SavingsEvidenceRow,
} from './apds-scientific-savings-core';
import { queryExactJointSkipSavings } from './apds-scientific-savings-sql';
import {
  P25_APD_B2_V1,
  P25_APD_B4_V1,
} from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-policy-versions';
import {
  computeApdShadowCohortFingerprintSha256,
  P25_APD_LTE_R1_COHORT_V1,
  type ApdShadowCohortConfig,
} from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-shadow/adaptive-polling-shadow-cohort.config';
import { buildApdShadowActivationScopeKey } from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-shadow/apd-shadow-activation-epoch.types';
import { P25_APD_SHADOW_EXECUTION_V2 } from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-shadow/p25-apd-shadow-execution-versions';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

type TestScope = {
  organizationId: string;
  vehicleId: string;
  epochId: string;
  windowStart: Date;
  windowEnd: Date;
};

async function seedScope(prisma: PrismaClient): Promise<TestScope> {
  const windowStart = new Date('2026-10-25T10:00:00.000Z');
  const windowEnd = new Date('2026-10-26T10:00:00.000Z');
  const org = await prisma.organization.create({
    data: {
      companyName: `apds-savings-pg-${randomUUID()}`,
      businessType: BusinessType.RENTAL,
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      make: 'Test',
      model: 'Savings',
      year: 2026,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      fuelType: FuelType.GASOLINE,
      vehicleName: 'apd-savings-veh',
    },
    select: { id: true },
  });
  const cohort: ApdShadowCohortConfig = {
    version: P25_APD_LTE_R1_COHORT_V1,
    members: [{ organizationId: org.id, vehicleId: vehicle.id }],
  };
  const cohortFingerprint = computeApdShadowCohortFingerprintSha256(cohort);
  const epoch = await prisma.apdShadowActivationEpoch.create({
    data: {
      activationScopeKey: buildApdShadowActivationScopeKey(cohortFingerprint),
      organizationId: org.id,
      cohortConfigFingerprintSha256: cohortFingerprint,
      cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      lifecycleState: ApdShadowActivationEpochLifecycle.ACTIVE,
      activatedAt: windowStart,
    },
    select: { id: true },
  });
  return {
    organizationId: org.id,
    vehicleId: vehicle.id,
    epochId: epoch.id,
    windowStart,
    windowEnd,
  };
}

async function createSuccessPoll(
  prisma: PrismaClient,
  vehicleId: string,
  startedAt = new Date('2026-10-25T11:00:00.000Z'),
) {
  return prisma.dimoPollLog.create({
    data: {
      vehicleId,
      jobType: DimoPollJobType.SNAPSHOT,
      status: DimoPollStatus.SUCCESS,
      startedAt,
      finishedAt: new Date(startedAt.getTime() + 5_000),
    },
    select: { id: true },
  });
}

function decisionBase(scope: TestScope, opportunityId: string, pollId: string) {
  return {
    organizationId: scope.organizationId,
    vehicleId: scope.vehicleId,
    opportunityId,
    activationEpochId: scope.epochId,
    decision: 'WOULD_SKIP',
    reason: 'TEST_SKIP',
    profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
    profileClass: 'STABLE_PERIODIC',
    realPollStatus: 'SUCCESS',
    realPollId: pollId,
    decisionAt: new Date('2026-10-25T11:00:05.000Z'),
    realPollCompletedAt: new Date('2026-10-25T11:00:05.000Z'),
    shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_V2,
  };
}

describePg('apds-scientific-savings SQL parity (H2)', () => {
  const prisma = new PrismaClient();
  const orgIds: string[] = [];
  const vehicleIds: string[] = [];

  afterAll(async () => {
    if (vehicleIds.length > 0) {
      await prisma.apdShadowReconciliationDecision.deleteMany({
        where: { vehicleId: { in: vehicleIds } },
      });
      await prisma.dimoPollLog.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
      await prisma.apdShadowActivationEpoch.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    }
    if (orgIds.length > 0) {
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await prisma.$disconnect();
  });

  it('SQL and TypeScript core agree on exact B2∩B4 joint skip', async () => {
    const scope = await seedScope(prisma);
    orgIds.push(scope.organizationId);
    vehicleIds.push(scope.vehicleId);
    const poll = await createSuccessPoll(prisma, scope.vehicleId);
    const opportunityId = randomUUID();
    const base = decisionBase(scope, opportunityId, poll.id);
    await prisma.apdShadowReconciliationDecision.createMany({
      data: [
        { ...base, policyVersion: P25_APD_B2_V1 },
        { ...base, policyVersion: P25_APD_B4_V1 },
      ],
    });

    const sql = await queryExactJointSkipSavings(prisma, {
      vehicleIds: [scope.vehicleId],
      activationEpochId: scope.epochId,
      windowStart: scope.windowStart,
      windowEnd: scope.windowEnd,
    });

    const rows = await prisma.apdShadowReconciliationDecision.findMany({
      where: { vehicleId: scope.vehicleId, opportunityId },
    });
    const byOpp = new Map<string, SavingsEvidenceRow[]>();
    for (const r of rows) {
      const list = byOpp.get(r.opportunityId) ?? [];
      list.push({
        organizationId: r.organizationId,
        vehicleId: r.vehicleId,
        opportunityId: r.opportunityId,
        activationEpochId: r.activationEpochId ?? scope.epochId,
        policyVersion: r.policyVersion,
        decision: r.decision,
        realPollStatus: r.realPollStatus,
        realPollId: r.realPollId,
      });
      byOpp.set(r.opportunityId, list);
    }
    let coreCount = 0;
    for (const oppRows of byOpp.values()) {
      if (classifyOpportunityJointWouldSkipSuccess(oppRows, scope.epochId) === 'JOINT_SKIP') {
        coreCount += 1;
      }
    }

    expect(Number(sql.joint_skip_opportunities)).toBe(1);
    expect(Number(sql.distinct_joint_skip_physical_polls)).toBe(1);
    expect(coreCount).toBe(1);
  });

  it('excludes wrong vehicle on referenced physical poll', async () => {
    const scope = await seedScope(prisma);
    orgIds.push(scope.organizationId);
    vehicleIds.push(scope.vehicleId);
    const otherVehicle = await prisma.vehicle.create({
      data: {
        organizationId: scope.organizationId,
        make: 'Other',
        model: 'V',
        year: 2026,
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        fuelType: FuelType.GASOLINE,
        vehicleName: 'other-veh',
      },
      select: { id: true },
    });
    vehicleIds.push(otherVehicle.id);
    const pollOnOther = await createSuccessPoll(prisma, otherVehicle.id);
    const opportunityId = randomUUID();
    const base = decisionBase(scope, opportunityId, pollOnOther.id);
    await prisma.apdShadowReconciliationDecision.createMany({
      data: [
        { ...base, policyVersion: P25_APD_B2_V1 },
        { ...base, policyVersion: P25_APD_B4_V1 },
      ],
    });

    const sql = await queryExactJointSkipSavings(prisma, {
      vehicleIds: [scope.vehicleId],
      activationEpochId: scope.epochId,
      windowStart: scope.windowStart,
      windowEnd: scope.windowEnd,
    });
    expect(Number(sql.joint_skip_opportunities)).toBe(0);
  });

  it('excludes single-policy-only evidence', async () => {
    const scope = await seedScope(prisma);
    orgIds.push(scope.organizationId);
    vehicleIds.push(scope.vehicleId);
    const poll = await createSuccessPoll(prisma, scope.vehicleId);
    const base = decisionBase(scope, randomUUID(), poll.id);
    await prisma.apdShadowReconciliationDecision.create({
      data: { ...base, policyVersion: P25_APD_B2_V1 },
    });

    const sql = await queryExactJointSkipSavings(prisma, {
      vehicleIds: [scope.vehicleId],
      activationEpochId: scope.epochId,
      windowStart: scope.windowStart,
      windowEnd: scope.windowEnd,
    });
    expect(Number(sql.joint_skip_opportunities)).toBe(0);
  });

  it('excludes B2 and B4 on different physical polls', async () => {
    const scope = await seedScope(prisma);
    orgIds.push(scope.organizationId);
    vehicleIds.push(scope.vehicleId);
    const poll1 = await createSuccessPoll(prisma, scope.vehicleId);
    const poll2 = await createSuccessPoll(
      prisma,
      scope.vehicleId,
      new Date('2026-10-25T12:00:00.000Z'),
    );
    const opportunityId = randomUUID();
    const base = decisionBase(scope, opportunityId, poll1.id);
    await prisma.apdShadowReconciliationDecision.createMany({
      data: [
        { ...base, policyVersion: P25_APD_B2_V1, realPollId: poll1.id },
        { ...base, policyVersion: P25_APD_B4_V1, realPollId: poll2.id },
      ],
    });

    const sql = await queryExactJointSkipSavings(prisma, {
      vehicleIds: [scope.vehicleId],
      activationEpochId: scope.epochId,
      windowStart: scope.windowStart,
      windowEnd: scope.windowEnd,
    });
    expect(Number(sql.joint_skip_opportunities)).toBe(0);
  });

  it('excludes failed physical poll in dimo_poll_logs', async () => {
    const scope = await seedScope(prisma);
    orgIds.push(scope.organizationId);
    vehicleIds.push(scope.vehicleId);
    const poll = await prisma.dimoPollLog.create({
      data: {
        vehicleId: scope.vehicleId,
        jobType: DimoPollJobType.SNAPSHOT,
        status: DimoPollStatus.FAILURE,
        startedAt: new Date('2026-10-25T11:00:00.000Z'),
        finishedAt: new Date('2026-10-25T11:00:05.000Z'),
      },
      select: { id: true },
    });
    const base = decisionBase(scope, randomUUID(), poll.id);
    await prisma.apdShadowReconciliationDecision.createMany({
      data: [
        { ...base, policyVersion: P25_APD_B2_V1 },
        { ...base, policyVersion: P25_APD_B4_V1 },
      ],
    });

    const sql = await queryExactJointSkipSavings(prisma, {
      vehicleIds: [scope.vehicleId],
      activationEpochId: scope.epochId,
      windowStart: scope.windowStart,
      windowEnd: scope.windowEnd,
    });
    expect(Number(sql.joint_skip_opportunities)).toBe(0);
  });

  it('does not collapse identical opportunity ids across tenants', async () => {
    const sharedOpp = 'shared-opportunity-id';
    const scopeA = await seedScope(prisma);
    const scopeB = await seedScope(prisma);
    orgIds.push(scopeA.organizationId, scopeB.organizationId);
    vehicleIds.push(scopeA.vehicleId, scopeB.vehicleId);

    const pollA = await createSuccessPoll(prisma, scopeA.vehicleId);
    const pollB = await createSuccessPoll(prisma, scopeB.vehicleId);
    const baseA = decisionBase(scopeA, sharedOpp, pollA.id);
    const baseB = decisionBase(scopeB, sharedOpp, pollB.id);

    await prisma.apdShadowReconciliationDecision.createMany({
      data: [
        { ...baseA, policyVersion: P25_APD_B2_V1 },
        { ...baseA, policyVersion: P25_APD_B4_V1 },
        { ...baseB, policyVersion: P25_APD_B2_V1 },
        { ...baseB, policyVersion: P25_APD_B4_V1 },
      ],
    });

    const sqlA = await queryExactJointSkipSavings(prisma, {
      vehicleIds: [scopeA.vehicleId],
      activationEpochId: scopeA.epochId,
      windowStart: scopeA.windowStart,
      windowEnd: scopeA.windowEnd,
    });
    const sqlB = await queryExactJointSkipSavings(prisma, {
      vehicleIds: [scopeB.vehicleId],
      activationEpochId: scopeB.epochId,
      windowStart: scopeB.windowStart,
      windowEnd: scopeB.windowEnd,
    });
    expect(Number(sqlA.joint_skip_opportunities)).toBe(1);
    expect(Number(sqlB.joint_skip_opportunities)).toBe(1);

    const sqlCross = await queryExactJointSkipSavings(prisma, {
      vehicleIds: [scopeA.vehicleId, scopeB.vehicleId],
      activationEpochId: scopeA.epochId,
      windowStart: scopeA.windowStart,
      windowEnd: scopeA.windowEnd,
    });
    expect(Number(sqlCross.joint_skip_opportunities)).toBe(1);
  });

  it('counts duplicate policy rows for one opportunity once', async () => {
    const scope = await seedScope(prisma);
    orgIds.push(scope.organizationId);
    vehicleIds.push(scope.vehicleId);
    const poll = await createSuccessPoll(prisma, scope.vehicleId);
    const opportunityId = randomUUID();
    const base = decisionBase(scope, opportunityId, poll.id);
    await prisma.apdShadowReconciliationDecision.create({
      data: { ...base, policyVersion: P25_APD_B2_V1 },
    });
    await prisma.apdShadowReconciliationDecision.create({
      data: { ...base, policyVersion: P25_APD_B4_V1 },
    });

    const sql = await queryExactJointSkipSavings(prisma, {
      vehicleIds: [scope.vehicleId],
      activationEpochId: scope.epochId,
      windowStart: scope.windowStart,
      windowEnd: scope.windowEnd,
    });
    expect(Number(sql.joint_skip_opportunities)).toBe(1);
    expect(Number(sql.distinct_joint_skip_physical_polls)).toBe(1);
  });
});
