export type MasterApdsPresentationAvailability =
  | 'AVAILABLE'
  | 'NOT_ACTIVATED'
  | 'NO_DECISIONS_CAPTURED'
  | 'HISTORY_UNAVAILABLE'
  | 'EVIDENCE_INCOMPLETE';

export type MasterApdsDecisionSummaryDto = {
  id: string;
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
  realPollLinkStatus: string;
  reconciliation: boolean | null;
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
  policyProvenance: Record<string, unknown>;
  epoch: MasterApdsEpochSummaryDto | null;
  realPollEvidence: Record<string, unknown> | null;
  missingEvidence: string[];
  shadowRecommendationIsNotRealPoll: true;
};

export type MasterApdsVsiCorrelationDto = {
  providerSourceLinkId: string;
  decisionAt: string;
  policyVersion: string;
  opportunityIdPrefix: string;
  offlineCorrelationRows: number;
  offlineCorrelationNote: string;
  revisionHistoryCaptureStatus: string;
  revisionAsOfAuthority: string | null;
  revisionAsOfLimitations: string[];
  selectedRevisionPrefix: string | null;
  attributionQuality: string;
  historicalCorrelationIsNotRuntimeDriver: true;
  vsiProfileAtDecisionIsNotCurrentProfile: true;
};
