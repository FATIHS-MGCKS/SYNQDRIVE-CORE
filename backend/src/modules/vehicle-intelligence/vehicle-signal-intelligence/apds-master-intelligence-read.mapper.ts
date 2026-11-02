import type { ApdShadowActivationEpoch, ApdShadowReconciliationDecision, DimoPollLog } from '@prisma/client';
import type {
  MasterApdsDecisionSummaryDto,
  MasterApdsEpochSummaryDto,
  MasterApdsRealPollEvidenceDto,
  MasterApdsRealPollLinkStatus,
} from './apds-master-intelligence-read.types';

export function maskIdentifier(id: string | null | undefined): string | null {
  if (!id?.trim()) return null;
  const t = id.trim();
  if (t.length <= 12) return t;
  return `${t.slice(0, 12)}…`;
}

function resolveRealPollLinkStatus(row: ApdShadowReconciliationDecision): MasterApdsRealPollLinkStatus {
  if (!row.realPollId) return 'NOT_LINKED';
  if (!row.realPollStatus) return 'LINKED_UNVERIFIED';
  if (row.realPollStatus === 'SUCCESS') return 'LINKED_SUCCESS';
  return 'LINKED_NON_SUCCESS';
}

export function mapDecisionRowToSummary(row: ApdShadowReconciliationDecision): MasterApdsDecisionSummaryDto {
  return {
    id: row.id,
    opportunityId: row.opportunityId,
    opportunityIdPrefix: maskIdentifier(row.opportunityId) ?? row.opportunityId,
    decisionAt: row.decisionAt.toISOString(),
    policyVersion: row.policyVersion,
    profileVersion: row.profileVersion,
    profileClass: row.profileClass,
    shadowExecutionVersion: row.shadowExecutionVersion,
    decision: row.decision,
    reason: row.reason,
    activationEpochIdPrefix: maskIdentifier(row.activationEpochId),
    simulatedNextPollAt: row.simulatedNextPollAt?.toISOString() ?? null,
    simulatedNextPollAtIsNotExecutedPoll: true,
    realPollIdPrefix: maskIdentifier(row.realPollId),
    realPollStatus: row.realPollStatus,
    realPollLinkStatus: resolveRealPollLinkStatus(row),
    reconciliation: row.reconciliation,
  };
}

export function mapEpochRow(
  row: ApdShadowActivationEpoch,
  vehicleDecisionCount: number | null,
): MasterApdsEpochSummaryDto {
  return {
    idPrefix: maskIdentifier(row.id) ?? row.id,
    lifecycleState: row.lifecycleState,
    activationScopeKeyPrefix: maskIdentifier(row.activationScopeKey) ?? row.activationScopeKey,
    cohortConfigFingerprintPrefix: maskIdentifier(row.cohortConfigFingerprintSha256) ?? '—',
    cohortConfigVersion: row.cohortConfigVersion,
    b2PolicyVersion: row.b2PolicyVersion,
    b4PolicyVersion: row.b4PolicyVersion,
    preparedAt: row.preparedAt.toISOString(),
    activatedAt: row.activatedAt?.toISOString() ?? null,
    pausedAt: row.pausedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    vehicleDecisionCount,
  };
}

export function mapRealPollEvidence(
  row: ApdShadowReconciliationDecision,
  pollLog: DimoPollLog | null,
): MasterApdsRealPollEvidenceDto | null {
  if (!row.realPollId) return null;
  const limitations: string[] = [];
  if (!pollLog) {
    limitations.push('POLL_LOG_NOT_FOUND_FOR_DECISION_REAL_POLL_ID');
  } else if (pollLog.vehicleId && pollLog.vehicleId !== row.vehicleId) {
    limitations.push('POLL_LOG_VEHICLE_MISMATCH');
  }
  const executionVerified =
    row.realPollStatus === 'SUCCESS' &&
    row.realPollCompletedAt != null &&
    pollLog != null &&
    pollLog.status === 'SUCCESS';
  if (row.realPollId && !executionVerified) {
    limitations.push('REAL_POLL_ID_ALONE_IS_NOT_SUCCESS_PROOF');
  }
  return {
    realPollIdPrefix: maskIdentifier(row.realPollId) ?? row.realPollId,
    pollLogFound: pollLog != null,
    pollStatus: pollLog?.status ?? null,
    startedAt: pollLog?.startedAt?.toISOString() ?? null,
    finishedAt: pollLog?.finishedAt?.toISOString() ?? null,
    durationMs: pollLog?.durationMs ?? null,
    jobType: pollLog?.jobType ?? null,
    decisionRecordedStatus: row.realPollStatus,
    decisionRecordedStartedAt: row.realPollStartedAt?.toISOString() ?? null,
    decisionRecordedCompletedAt: row.realPollCompletedAt?.toISOString() ?? null,
    executionVerified,
    limitations,
  };
}
