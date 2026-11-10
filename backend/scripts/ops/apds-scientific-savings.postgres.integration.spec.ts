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

describePg('apds-scientific-savings SQL parity (H2)', () => {
  const prisma = new PrismaClient();
  let organizationId = '';
  let vehicleId = '';
  let epochId = '';
  const windowStart = new Date('2026-10-25T10:00:00.000Z');
  const windowEnd = new Date('2026-10-26T10:00:00.000Z');
  let pollId = '';
  const opportunityId = randomUUID();

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        companyName: `apds-savings-pg-${randomUUID()}`,
        businessType: BusinessType.RENTAL,
      },
      select: { id: true },
    });
    organizationId = org.id;
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId,
        make: 'Test',
        model: 'Savings',
        year: 2026,
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        fuelType: FuelType.GASOLINE,
        vehicleName: 'apd-savings-veh',
      },
      select: { id: true },
    });
    vehicleId = vehicle.id;

    const cohort: ApdShadowCohortConfig = {
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId, vehicleId }],
    };
    const cohortFingerprint = computeApdShadowCohortFingerprintSha256(cohort);

    const epoch = await prisma.apdShadowActivationEpoch.create({
      data: {
        activationScopeKey: buildApdShadowActivationScopeKey(cohortFingerprint),
        organizationId,
        cohortConfigFingerprintSha256: cohortFingerprint,
        cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
        b2PolicyVersion: P25_APD_B2_V1,
        b4PolicyVersion: P25_APD_B4_V1,
        lifecycleState: ApdShadowActivationEpochLifecycle.ACTIVE,
        activatedAt: windowStart,
      },
      select: { id: true },
    });
    epochId = epoch.id;

    const poll = await prisma.dimoPollLog.create({
      data: {
        vehicleId,
        jobType: DimoPollJobType.SNAPSHOT,
        status: DimoPollStatus.SUCCESS,
        startedAt: new Date('2026-10-25T11:00:00.000Z'),
        finishedAt: new Date('2026-10-25T11:00:05.000Z'),
      },
      select: { id: true },
    });
    pollId = poll.id;

    const base = {
      organizationId,
      vehicleId,
      opportunityId,
      activationEpochId: epochId,
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

    await prisma.apdShadowReconciliationDecision.createMany({
      data: [
        { ...base, policyVersion: P25_APD_B2_V1 },
        { ...base, policyVersion: P25_APD_B4_V1 },
      ],
    });
  });

  afterAll(async () => {
    await prisma.apdShadowReconciliationDecision.deleteMany({
      where: { vehicleId },
    });
    await prisma.dimoPollLog.deleteMany({ where: { vehicleId } });
    await prisma.apdShadowActivationEpoch.deleteMany({ where: { id: epochId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it('SQL and TypeScript core agree on exact B2∩B4 joint skip', async () => {
    const sql = await queryExactJointSkipSavings(prisma, {
      vehicleIds: [vehicleId],
      activationEpochId: epochId,
      windowStart,
      windowEnd,
    });

    const rows = await prisma.apdShadowReconciliationDecision.findMany({
      where: { vehicleId, activationEpochId: epochId },
    });
    const byOpp = new Map<string, SavingsEvidenceRow[]>();
    for (const r of rows) {
      const list = byOpp.get(r.opportunityId) ?? [];
      list.push({
        organizationId: r.organizationId,
        vehicleId: r.vehicleId,
        opportunityId: r.opportunityId,
        activationEpochId: r.activationEpochId ?? epochId,
        policyVersion: r.policyVersion,
        decision: r.decision,
        realPollStatus: r.realPollStatus,
        realPollId: r.realPollId,
      });
      byOpp.set(r.opportunityId, list);
    }
    let coreCount = 0;
    for (const oppRows of byOpp.values()) {
      if (classifyOpportunityJointWouldSkipSuccess(oppRows, epochId) === 'JOINT_SKIP') {
        coreCount += 1;
      }
    }

    expect(Number(sql.joint_skip_opportunities)).toBe(1);
    expect(Number(sql.distinct_joint_skip_physical_polls)).toBe(1);
    expect(coreCount).toBe(1);
  });
});
