import type { PrismaClient } from '@prisma/client';
import {
  P25_APD_B2_V1,
  P25_APD_B4_V1,
} from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-policy-versions';

export type JointSkipSqlRow = {
  joint_skip_opportunities: bigint;
  distinct_joint_skip_physical_polls: bigint;
};

/**
 * Exact B2∩B4 joint skip savings — same physical SUCCESS poll required.
 */
export async function queryExactJointSkipSavings(
  prisma: PrismaClient,
  input: {
    vehicleIds: string[];
    activationEpochId: string;
    windowStart: Date;
    windowEnd: Date;
  },
): Promise<JointSkipSqlRow> {
  const rows = await prisma.$queryRaw<JointSkipSqlRow[]>`
    SELECT
      COUNT(
        DISTINCT (
          b2.organization_id,
          b2.vehicle_id,
          b2.opportunity_id
        )
      )::bigint AS joint_skip_opportunities,
      COUNT(DISTINCT b2.real_poll_id)::bigint AS distinct_joint_skip_physical_polls
    FROM apd_shadow_reconciliation_decisions b2
    INNER JOIN apd_shadow_reconciliation_decisions b4
      ON b2.organization_id = b4.organization_id
      AND b2.vehicle_id = b4.vehicle_id
      AND b2.activation_epoch_id = b4.activation_epoch_id
      AND b2.opportunity_id = b4.opportunity_id
      AND b2.real_poll_id = b4.real_poll_id
      AND b2.real_poll_id IS NOT NULL
    INNER JOIN dimo_poll_logs dpl
      ON dpl.id = b2.real_poll_id
      AND dpl.vehicle_id = b2.vehicle_id
      AND dpl.status = 'SUCCESS'
      AND dpl.job_type = 'SNAPSHOT'
    WHERE b2.vehicle_id = ANY(${input.vehicleIds}::text[])
      AND b2.activation_epoch_id = ${input.activationEpochId}
      AND b2.decision_at >= ${input.windowStart}
      AND b2.decision_at <= ${input.windowEnd}
      AND b4.decision_at >= ${input.windowStart}
      AND b4.decision_at <= ${input.windowEnd}
      AND b2.policy_version = ${P25_APD_B2_V1}
      AND b4.policy_version = ${P25_APD_B4_V1}
      AND b2.decision = 'WOULD_SKIP'
      AND b4.decision = 'WOULD_SKIP'
      AND b2.real_poll_status = 'SUCCESS'
      AND b4.real_poll_status = 'SUCCESS'`;

  return (
    rows[0] ?? {
      joint_skip_opportunities: BigInt(0),
      distinct_joint_skip_physical_polls: BigInt(0),
    }
  );
}
