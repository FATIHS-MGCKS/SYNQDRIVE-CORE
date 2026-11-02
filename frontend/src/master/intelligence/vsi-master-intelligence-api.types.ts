export type MasterVsiProfileSummaryDto = {
  providerSourceLinkId: string;
  providerIdentity: string;
  provider: string | null;
  profileRevision: number;
  profileContractVersion: string;
  evaluatedAt: string;
  lastMaterializedSourceTimestamp: string | null;
  lastMaterializedProviderFetchAt: string | null;
  profileLimitations: string[];
  lvStandbyProfile: 'LV_8H_OBSERVED' | 'LV_24H_OBSERVED' | 'UNKNOWN';
  lvClassificationDecisionCode: string | null;
  lvEvidenceConfidence: string | null;
  rpmActiveProfile: 'RPM_1HZ' | 'RPM_STANDARD' | 'UNKNOWN';
  rpmApplicability: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
  rpmClassificationDecisionCode: string | null;
  observedDensityLabel: string | null;
  evaluationBlocked: boolean;
  evaluationBlockedCodes: string[];
};

export type MasterVsiFleetOverviewDto = {
  organizationId: string;
  vehicleId: string;
  profiles: MasterVsiProfileSummaryDto[];
};

export type MasterVsiSignalDetailDto = {
  canonicalSignalKey: string;
  providerNativeSignalName: string;
  declaredSupport: string;
  empiricalObservation: string;
  qualityClassification: string | null;
  confidenceLevel: string | null;
  lastValidObservationAt: string | null;
  lastSourceTimestamp: string | null;
  lastProviderFetchAt: string | null;
  freshnessClassification: string | null;
  evidenceProvenance: string[];
  limitations: string[];
  cadenceIntelligence: Record<string, unknown> | null;
  powertrainApplicability?: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN' | null;
  rpmCombinedEvidenceContractV1?: 'vsi-rpm-combined-evidence-v1';
  rpmCombinedEvidenceAvailabilityV1?:
    | 'PROVEN_LIVE'
    | 'PROVEN_HISTORICAL_ONLY'
    | 'NOT_PROVEN'
    | 'NOT_APPLICABLE'
    | null;
  rpmCombinedEvidenceLimitationsV1?: string[];
};

export type MasterVsiProfileDetailDto = MasterVsiProfileSummaryDto & {
  contentFingerprintPrefix: string;
  signals: MasterVsiSignalDetailDto[];
  fetchTimeIsNotNewSignalProof: true;
};

export type MasterVsiRevisionTimelineItemDto = {
  profileRevision: number;
  evaluatedAt: string;
  recordedAt: string;
  materializationTrigger: string;
  profileLimitations: string[];
  lvStandbyProfile: string;
  rpmActiveProfile: string;
  contentFingerprintPrefix: string;
};

export type MasterVsiRevisionHistoryPageDto = {
  captureStatus: 'CAPTURE_ENABLED' | 'NOT_CAPTURED';
  items: MasterVsiRevisionTimelineItemDto[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
};

export type MasterVsiRevisionAsOfDto = {
  captureStatus: 'CAPTURE_ENABLED' | 'NOT_CAPTURED';
  decisionAt: string;
  authority: string;
  limitations: string[];
  queryEvidence: Record<string, unknown>;
  selectedRevision: MasterVsiRevisionTimelineItemDto | null;
};
