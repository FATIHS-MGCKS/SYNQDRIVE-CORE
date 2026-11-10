import { randomUUID } from 'node:crypto';
import {
  ApdShadowActivationEpochLifecycle,
  BusinessType,
  FuelType,
  PrismaClient,
} from '@prisma/client';
import { AdaptivePollingShadowRepository } from './adaptive-polling-shadow.repository';
import { ApdShadowBaselinePollEvidenceService } from './apd-shadow-baseline-poll-evidence.service';
import {
  computeApdShadowCohortFingerprintSha256,
  P25_APD_LTE_R1_COHORT_V1,
  type ApdShadowCohortConfig,
} from './adaptive-polling-shadow-cohort.config';
import { buildApdShadowActivationScopeKey } from './apd-shadow-activation-epoch.types';
import { P25_APD_B2_V1, P25_APD_B4_V1 } from '../adaptive-polling-policy/p25-apd-policy-versions';
import { P25_APD_SHADOW_EXECUTION_VERSION_CURRENT } from './p25-apd-shadow-execution-versions';
import { P25_APD_DELAY_EVIDENCE_V1_1_IMMEDIATE_NEXT } from './p25-apd-shadow-baseline-poll-evidence';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('APDS baseline poll evidence (Postgres integration)', () => {
  const prisma = new PrismaClient();
  const repository = new AdaptivePollingShadowRepository(prisma as never);
  const evidence = new ApdShadowBaselinePollEvidenceService(prisma as never);

  let organizationId = '';
  let vehicleId = '';
  let epochId = '';
  let cohortFingerprint = '';
  const activatedAt = new Date('2026-10-25T10:00:00.000Z');
  const cleanup: Array<{
    organizationId: string;
    vehicleId: string;
    opportunityId: string;
  }> = [];

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        companyName: `apd-evidence-pg-${randomUUID()}`,
        businessType: BusinessType.RENTAL,
      },
      select: { id: true },
    });
    organizationId = org.id;
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId,
        make: 'Test',
        model: 'Evidence',
        year: 2026,
        fuelType: FuelType.GASOLINE,
        vehicleName: 'apd-evidence-veh',
      },
      select: { id: true },
    });
    vehicleId = vehicle.id;

    const cohort: ApdShadowCohortConfig = {
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId, vehicleId }],
    };
    cohortFingerprint = computeApdShadowCohortFingerprintSha256(cohort);
    const epoch = await prisma.apdShadowActivationEpoch.create({
      data: {
        activationScopeKey: buildApdShadowActivationScopeKey(cohortFingerprint),
        organizationId,
        cohortConfigFingerprintSha256: cohortFingerprint,
        cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
        b2PolicyVersion: P25_APD_B2_V1,
        b4PolicyVersion: P25_APD_B4_V1,
        lifecycleState: ApdShadowActivationEpochLifecycle.ACTIVE,
        activatedAt,
      },
      select: { id: true },
    });
    epochId = epoch.id;
  });

  afterAll(async () => {
    for (const key of cleanup) {
      await prisma.apdShadowReconciliationDecision.deleteMany({ where: key });
    }
    await prisma.apdShadowActivationEpoch.deleteMany({ where: { id: epochId } });
    await prisma.dimoPollLog.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it('durable discovery delay backfill when next baseline poll is observed', async () => {
    const opportunityId = randomUUID();
    cleanup.push({ organizationId, vehicleId, opportunityId });
    const priorPollId = randomUUID();
    const nextPollId = randomUUID();
    const priorCompleted = new Date('2026-10-25T10:29:05.000Z');
    const nextStarted = new Date('2026-10-25T10:30:02.808Z');
    const nextCompleted = new Date('2026-10-25T10:30:08.000Z');

    await prisma.dimoPollLog.createMany({
      data: [
        {
          id: priorPollId,
          vehicleId,
          jobType: 'SNAPSHOT',
          status: 'SUCCESS',
          startedAt: new Date('2026-10-25T10:29:02.655Z'),
          finishedAt: priorCompleted,
        },
        {
          id: nextPollId,
          vehicleId,
          jobType: 'SNAPSHOT',
          status: 'SUCCESS',
          startedAt: nextStarted,
          finishedAt: nextCompleted,
        },
      ],
    });

    for (const policyVersion of [P25_APD_B2_V1, P25_APD_B4_V1]) {
      await repository.upsertPrePollDecision({
        organizationId,
        vehicleId,
        opportunityId,
        decisionAt: new Date('2026-10-25T10:29:02.655Z'),
        activationEpochId: epochId,
        policyVersion,
        profileVersion: 'v1',
        profileClass: 'MULTIMODAL',
        decision: 'WOULD_SKIP',
        reason: 'PHASE_WINDOW_OUTSIDE_HEARTBEAT',
        reconciliation: true,
        shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_VERSION_CURRENT,
        lastLvSourceAt: new Date('2026-10-24T13:03:50.000Z'),
      });
      await repository.updateSuccessfulPollOutcome({
        organizationId,
        vehicleId,
        opportunityId,
        policyVersion,
        activationEpochId: epochId,
        realPollId: priorPollId,
        realPollStartedAt: new Date('2026-10-25T10:29:02.655Z'),
        realPollCompletedAt: priorCompleted,
        patch: {
          newLvSourceObserved: true,
          newLvSourceAt: new Date('2026-10-24T21:05:19.000Z'),
          newTopLevelSourceObserved: false,
        },
      });
    }

    await evidence.reconcilePriorSkipDiscoveryDelayFromObservingPoll({
      organizationId,
      vehicleId,
      activationEpochId: epochId,
      observingPollId: nextPollId,
      observingPollStartedAtMs: nextStarted.getTime(),
      observingPollCompletedAtMs: nextCompleted.getTime(),
    });

    const row = await prisma.apdShadowReconciliationDecision.findFirst({
      where: {
        organizationId,
        vehicleId,
        opportunityId,
        policyVersion: P25_APD_B2_V1,
      },
    });
    expect(row?.additionalDiscoveryDelayMs).toBe(
      nextStarted.getTime() - priorCompleted.getTime(),
    );
    expect(row?.simulatedDiscoveryAt).toBeNull();
    expect(row?.simulatedNextPollAt?.getTime()).toBe(nextStarted.getTime());
    expect(row?.discoveryDelayEvidenceVersion).toBe(
      P25_APD_DELAY_EVIDENCE_V1_1_IMMEDIATE_NEXT,
    );
    expect(row?.simulatedNextPollId).toBe(nextPollId);
  });
});
