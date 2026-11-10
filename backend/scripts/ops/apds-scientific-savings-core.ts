import {
  P25_APD_B2_V1,
  P25_APD_B4_V1,
} from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-policy-versions';

export type SavingsEvidenceRow = {
  organizationId: string;
  vehicleId: string;
  opportunityId: string;
  activationEpochId: string;
  policyVersion: string;
  decision: string;
  realPollStatus: string | null;
  realPollId: string | null;
};

export type JointSkipClassification = 'JOINT_SKIP' | 'NOT_ASSESSABLE';

/**
 * Exact two-policy joint skip: both B2 and B4 WOULD_SKIP on the same SUCCESS physical poll.
 */
export function classifyOpportunityJointWouldSkipSuccess(
  rows: SavingsEvidenceRow[],
  expectedActivationEpochId: string,
): JointSkipClassification {
  if (rows.length === 0) return 'NOT_ASSESSABLE';

  const organizationIds = new Set(rows.map((r) => r.organizationId));
  const vehicleIds = new Set(rows.map((r) => r.vehicleId));
  const opportunityIds = new Set(rows.map((r) => r.opportunityId));
  const epochIds = new Set(rows.map((r) => r.activationEpochId));

  if (
    organizationIds.size !== 1 ||
    vehicleIds.size !== 1 ||
    opportunityIds.size !== 1 ||
    epochIds.size !== 1
  ) {
    return 'NOT_ASSESSABLE';
  }
  if (epochIds.values().next().value !== expectedActivationEpochId) {
    return 'NOT_ASSESSABLE';
  }

  const b2 = rows.find((r) => r.policyVersion === P25_APD_B2_V1);
  const b4 = rows.find((r) => r.policyVersion === P25_APD_B4_V1);
  if (!b2 || !b4) return 'NOT_ASSESSABLE';
  if (rows.some((r) => r.policyVersion !== P25_APD_B2_V1 && r.policyVersion !== P25_APD_B4_V1)) {
    return 'NOT_ASSESSABLE';
  }

  if (b2.decision !== 'WOULD_SKIP' || b4.decision !== 'WOULD_SKIP') {
    return 'NOT_ASSESSABLE';
  }
  if (b2.realPollStatus !== 'SUCCESS' || b4.realPollStatus !== 'SUCCESS') {
    return 'NOT_ASSESSABLE';
  }
  if (!b2.realPollId || !b4.realPollId || b2.realPollId !== b4.realPollId) {
    return 'NOT_ASSESSABLE';
  }

  return 'JOINT_SKIP';
}

export function countDistinctJointSkipPhysicalPolls(
  byOpportunity: Map<string, SavingsEvidenceRow[]>,
  expectedActivationEpochId: string,
): number {
  let count = 0;
  for (const rows of byOpportunity.values()) {
    if (
      classifyOpportunityJointWouldSkipSuccess(rows, expectedActivationEpochId) ===
      'JOINT_SKIP'
    ) {
      count += 1;
    }
  }
  return count;
}
