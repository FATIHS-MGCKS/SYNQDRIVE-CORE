import type { VsiProfileRevisionAsOfAuthority } from './vsi-profile-revision-as-of.types';
import type { VsiRpmCombinedEvidenceAvailabilityV1 } from './vsi-engine-rpm-combined-evidence-v1.util';
import { VSI_RPM_COMBINED_EVIDENCE_CONTRACT_V1 } from './vsi-engine-rpm-combined-evidence-v1.util';

export type VsiMasterIntelligenceHistoryCaptureStatus =
  | 'CAPTURE_ENABLED'
  | 'NOT_CAPTURED';

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
  powertrainApplicability: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN' | null;
  rpmCombinedEvidenceContractV1?: typeof VSI_RPM_COMBINED_EVIDENCE_CONTRACT_V1;
  rpmCombinedEvidenceAvailabilityV1?: VsiRpmCombinedEvidenceAvailabilityV1 | null;
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
  captureStatus: VsiMasterIntelligenceHistoryCaptureStatus;
  items: MasterVsiRevisionTimelineItemDto[];
  page: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
};

export type MasterVsiRevisionAsOfDto = {
  captureStatus: VsiMasterIntelligenceHistoryCaptureStatus;
  decisionAt: string;
  authority: VsiProfileRevisionAsOfAuthority;
  limitations: string[];
  queryEvidence: Record<string, unknown>;
  selectedRevision: MasterVsiRevisionTimelineItemDto | null;
};

export type MasterVsiFleetOverviewDto = {
  organizationId: string;
  vehicleId: string;
  profiles: MasterVsiProfileSummaryDto[];
};
