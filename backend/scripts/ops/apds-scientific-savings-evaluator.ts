#!/usr/bin/env npx ts-node
/**
 * Read-only scientific savings report for APDS shadow evidence (offline / prod RO).
 * Single frozen observation endpoint per run (evaluationCompletedAtUtc).
 */
import { PrismaClient } from '@prisma/client';
import {
  P25_APD_B2_V1,
  P25_APD_B4_V1,
} from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-policy-versions';
import {
  P25_APD_DELAY_EVIDENCE_V1_0_LEGACY,
  P25_APD_DELAY_EVIDENCE_V1_1_IMMEDIATE_NEXT,
} from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-shadow/p25-apd-shadow-baseline-poll-evidence';
import { queryExactJointSkipSavings } from './apds-scientific-savings-sql';

type Args = {
  vehicleIds: string[];
  activationEpochId: string;
  activationT0: Date;
  windowDays: number;
  evaluationCompletedAtUtc: Date;
};

function parseArgs(): Args {
  const vehicleIds = (process.env.APD_EVAL_VEHICLE_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const activationEpochId = process.env.APD_EVAL_EPOCH_ID ?? '';
  const activationT0 = new Date(
    process.env.APD_EVAL_T0_UTC ?? '1970-01-01T00:00:00.000Z',
  );
  const windowDays = Number(process.env.APD_EVAL_WINDOW_DAYS ?? '30');
  const evaluationCompletedAtUtc = new Date(
    process.env.APD_EVAL_OBSERVATION_END_UTC ?? new Date().toISOString(),
  );
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL required');
  }
  if (vehicleIds.length === 0 || !activationEpochId) {
    throw new Error('APD_EVAL_VEHICLE_IDS and APD_EVAL_EPOCH_ID required');
  }
  return {
    vehicleIds,
    activationEpochId,
    activationT0,
    windowDays,
    evaluationCompletedAtUtc,
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const prisma = new PrismaClient();

  const epochRow = await prisma.apdShadowActivationEpoch.findUnique({
    where: { id: args.activationEpochId },
    select: { activatedAt: true, lifecycleState: true },
  });
  if (!epochRow) {
    throw new Error(`activation epoch not found: ${args.activationEpochId}`);
  }
  const authoritativeT0 = epochRow.activatedAt;
  if (!authoritativeT0) {
    throw new Error(
      `activation epoch missing activatedAt: ${args.activationEpochId}`,
    );
  }

  const windowStart = new Date(
    Math.max(
      authoritativeT0.getTime(),
      args.evaluationCompletedAtUtc.getTime() - args.windowDays * 86_400_000,
    ),
  );

  const physicalSuccess = await prisma.dimoPollLog.groupBy({
    by: ['status'],
    where: {
      vehicleId: { in: args.vehicleIds },
      jobType: 'SNAPSHOT',
      startedAt: { gte: windowStart, lte: args.evaluationCompletedAtUtc },
    },
    _count: { _all: true },
  });

  const distinctSuccessPolls = await prisma.dimoPollLog.count({
    where: {
      vehicleId: { in: args.vehicleIds },
      jobType: 'SNAPSHOT',
      status: 'SUCCESS',
      startedAt: { gte: windowStart, lte: args.evaluationCompletedAtUtc },
    },
  });

  const shadowRows = await prisma.apdShadowReconciliationDecision.count({
    where: {
      vehicleId: { in: args.vehicleIds },
      activationEpochId: args.activationEpochId,
      decisionAt: { gte: windowStart, lte: args.evaluationCompletedAtUtc },
    },
  });

  const distinctLinkedPolls = await prisma.apdShadowReconciliationDecision.groupBy({
    by: ['realPollId'],
    where: {
      vehicleId: { in: args.vehicleIds },
      activationEpochId: args.activationEpochId,
      decisionAt: { gte: windowStart, lte: args.evaluationCompletedAtUtc },
      realPollId: { not: null },
    },
  });

  const savingsRow = await queryExactJointSkipSavings(prisma, {
    vehicleIds: args.vehicleIds,
    activationEpochId: args.activationEpochId,
    windowStart,
    windowEnd: args.evaluationCompletedAtUtc,
  });

  const unionAnySkipRows = await prisma.apdShadowReconciliationDecision.groupBy({
    by: ['opportunityId'],
    where: {
      vehicleId: { in: args.vehicleIds },
      activationEpochId: args.activationEpochId,
      decisionAt: { gte: windowStart, lte: args.evaluationCompletedAtUtc },
      decision: 'WOULD_SKIP',
      realPollStatus: 'SUCCESS',
    },
  });
  const unionAnySkip = unionAnySkipRows.length;

  const savings = [
    {
      joint_skip_opportunities: savingsRow.joint_skip_opportunities,
      distinct_joint_skip_physical_polls:
        savingsRow.distinct_joint_skip_physical_polls,
      union_any_skip_success_opportunities: BigInt(unionAnySkip),
    },
  ];

  const strictLvDistinct = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
    SELECT COUNT(DISTINCT real_poll_id)::bigint AS cnt
    FROM apd_shadow_reconciliation_decisions
    WHERE vehicle_id = ANY(${args.vehicleIds}::text[])
      AND activation_epoch_id = ${args.activationEpochId}
      AND decision_at >= ${windowStart}
      AND decision_at <= ${args.evaluationCompletedAtUtc}
      AND decision = 'WOULD_SKIP'
      AND real_poll_status = 'SUCCESS'
      AND new_lv_source_observed = true
      AND real_poll_id IS NOT NULL`;

  const delayQuality = await prisma.apdShadowReconciliationDecision.groupBy({
    by: ['discoveryDelayEvidenceVersion'],
    where: {
      vehicleId: { in: args.vehicleIds },
      activationEpochId: args.activationEpochId,
      decisionAt: { gte: windowStart, lte: args.evaluationCompletedAtUtc },
      additionalDiscoveryDelayMs: { not: null },
    },
    _count: { _all: true },
  });

  const enqueuePopulated = await prisma.apdShadowReconciliationDecision.count({
    where: {
      vehicleId: { in: args.vehicleIds },
      activationEpochId: args.activationEpochId,
      decisionAt: { gte: windowStart, lte: args.evaluationCompletedAtUtc },
      enqueueOutcome: { not: null },
    },
  });

  const report = {
    operation: 'APDS_SCIENTIFIC_SAVINGS_EVALUATOR',
    evaluationCompletedAtUtc: args.evaluationCompletedAtUtc.toISOString(),
    window: {
      days: args.windowDays,
      startUtc: windowStart.toISOString(),
      endUtc: args.evaluationCompletedAtUtc.toISOString(),
      activationT0UtcAuthoritative: authoritativeT0.toISOString(),
      activationT0UtcEnvOverride: args.activationT0.toISOString(),
      activationEpochId: args.activationEpochId,
      epochLifecycleState: epochRow.lifecycleState,
    },
    policyVersions: [P25_APD_B2_V1, P25_APD_B4_V1],
    vehicleIds: args.vehicleIds,
    physicalPollEvidence: {
      snapshotAttemptsByStatus: physicalSuccess.map((r) => ({
        status: r.status,
        count: r._count._all,
      })),
      uniqueSuccessfulPhysicalPolls: distinctSuccessPolls,
      providerRequestLimitations:
        'dimo_poll_logs: one row per SNAPSHOT job outcome; no http_status column',
    },
    shadowEvidence: {
      policyRows: shadowRows,
      distinctLinkedPhysicalPollIds: distinctLinkedPolls.length,
      reconciliation: {
        physicalSuccessVsLinkedPollsDelta:
          distinctSuccessPolls - distinctLinkedPolls.length,
        note: 'Non-zero delta requires per-vehicle failure/coalesce forensics',
      },
    },
    savingsCandidates: {
      jointSkipOpportunitiesExactB2B4: Number(
        savings[0]?.joint_skip_opportunities ?? 0,
      ),
      distinctJointSkipPhysicalPolls: Number(
        savings[0]?.distinct_joint_skip_physical_polls ?? 0,
      ),
      unionAnyWouldSkipSuccessOpportunities: Number(
        savings[0]?.union_any_skip_success_opportunities ?? 0,
      ),
      notAdditiveRule: 'Do not sum per-policy WOULD_SKIP rows',
      unpairedOrInconsistent: 'NOT_ASSESSABLE for joint skip unless both policies match same real_poll_id',
    },
    informativeSkipLoss: {
      strictLvAdvanceDistinctPhysicalPolls: Number(strictLvDistinct[0]?.cnt ?? 0),
      strictTopLevelProvableLoss: 'NOT_ASSESSABLE_WITHOUT_P2C',
    },
    detectionDelayEvidenceQuality: {
      byVersion: delayQuality.map((r) => ({
        version:
          r.discoveryDelayEvidenceVersion ??
          'UNVERSIONED_HISTORICAL_OR_IN_FLIGHT',
        rows: r._count._all,
      })),
      knownVersions: [
        P25_APD_DELAY_EVIDENCE_V1_0_LEGACY,
        P25_APD_DELAY_EVIDENCE_V1_1_IMMEDIATE_NEXT,
      ],
    },
    enqueueOutcomeRows: enqueuePopulated,
  };

  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
