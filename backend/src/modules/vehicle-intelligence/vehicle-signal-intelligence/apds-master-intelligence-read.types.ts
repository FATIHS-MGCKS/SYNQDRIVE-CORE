export type MasterApdsPresentationAvailability =
  | 'AVAILABLE'
  | 'NOT_ACTIVATED'
  | 'NO_DECISIONS_CAPTURED'
  | 'HISTORY_UNAVAILABLE'
  | 'EVIDENCE_INCOMPLETE';

export type MasterApdsRealPollLinkStatus =
  | 'NOT_LINKED'
  | 'LINKED_UNVERIFIED'
  | 'LINKED_SUCCESS'
  | 'LINKED_NON_SUCCESS'
  | 'NOT_AVAILABLE';

export type MasterApdsDecisionSummaryDto = {
  id: string;
  /** Full id for scoped detail navigation (MASTER_ADMIN read APIs only). */
  opportunityId: string;
  opportunityIdPrefix: string;
  decisionAt: string;
  policyVersion: string;
  profileVersion: string;
  profileClass: string;
  shadowExecutionVersion: string | null;
  decision: string;
  reason: string;
  activationEpochIdPrefix: string | null;
  simulatedNextPollAt: string | null;
  simulatedNextPollAtIsNotExecutedPoll: true;
  realPollIdPrefix: string | null;
  realPollStatus: string | null;
  realPollLinkStatus: MasterApdsRealPollLinkStatus;
  reconciliation: boolean | null;
};

export type MasterApdsOverviewDto = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string | null;
  availability: MasterApdsPresentationAvailability;
  availabilityExplanation: string[];
  activeEpoch: MasterApdsEpochSummaryDto | null;
  latestEpoch: MasterApdsEpochSummaryDto | null;
  latestDecision: MasterApdsDecisionSummaryDto | null;
  decisionCountForVehicle: number;
};

export type MasterApdsEpochSummaryDto = {
  idPrefix: string;
  lifecycleState: string;
  activationScopeKeyPrefix: string;
  cohortConfigFingerprintPrefix: string;
  cohortConfigVersion: string;
  b2PolicyVersion: string;
  b4PolicyVersion: string;
  preparedAt: string;
  activatedAt: string | null;
  pausedAt: string | null;
  closedAt: string | null;
  vehicleDecisionCount: number | null;
};

export type MasterApdsEpochHistoryPageDto = {
  items: MasterApdsEpochSummaryDto[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
};

export type MasterApdsDecisionHistoryPageDto = {
  items: MasterApdsDecisionSummaryDto[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
};

export type MasterApdsDecisionDetailDto = {
  summary: MasterApdsDecisionSummaryDto;
  persistedInputs: Record<string, unknown>;
  persistedOutputs: Record<string, unknown>;
  policyProvenance: {
    policyVersion: string;
    profileVersion: string;
    profileClass: string;
    shadowExecutionVersion: string | null;
    fromPersistedDecision: true;
  };
  epoch: MasterApdsEpochSummaryDto | null;
  realPollEvidence: MasterApdsRealPollEvidenceDto | null;
  missingEvidence: string[];
  shadowRecommendationIsNotRealPoll: true;
};

export type MasterApdsRealPollEvidenceDto = {
  realPollIdPrefix: string;
  pollLogFound: boolean;
  pollStatus: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  jobType: string | null;
  decisionRecordedStatus: string | null;
  decisionRecordedStartedAt: string | null;
  decisionRecordedCompletedAt: string | null;
  executionVerified: boolean;
  limitations: string[];
};

export type MasterApdsVsiCorrelationDto = {
  providerSourceLinkId: string;
  decisionAt: string;
  policyVersion: string;
  opportunityIdPrefix: string;
  offlineCorrelationRows: number;
  offlineCorrelationNote: string;
  revisionHistoryCaptureStatus: 'CAPTURE_ENABLED' | 'NOT_CAPTURED';
  revisionAsOfAuthority: string | null;
  revisionAsOfLimitations: string[];
  selectedRevisionPrefix: string | null;
  attributionQuality: 'PROVEN' | 'LIMITED' | 'NOT_AVAILABLE';
  historicalCorrelationIsNotRuntimeDriver: true;
  vsiProfileAtDecisionIsNotCurrentProfile: true;
};
