import type { Ds4RpmHfV1aTripInputV1 } from '../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import type { Ds4RpmHfV1bShadowResultV1 } from '../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import type { TelemetrySourceFamily } from '../../telemetry-source-family';

export const DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION =
  'ds4-powertrain-demand-research-v1' as const;

export const DS4_KICKDOWN_BUCKET_GRID_RESEARCH_POLICY_VERSION =
  'kickdown-bucket-grid-research-v1' as const;

export type Ds4PowertrainDemandTimeAuthority = 'BUCKET_LABEL_UNVERIFIED';
export type Ds4PowertrainDemandTemporalMode = 'MODE_A';

export type Ds4PowertrainDemandEvidenceOrigin = 'SYNTHETIC_FIXTURE' | 'OFFLINE_SEALED_BUNDLE';

export const DS4_R1_MULTICHANNEL_CHANNEL_IDS = [
  'speed',
  'powertrainCombustionEngineSpeed',
  'obdThrottlePosition',
  'obdEngineLoad',
  'powertrainCombustionEngineECT',
] as const;

export type Ds4R1MultichannelChannelId = (typeof DS4_R1_MULTICHANNEL_CHANNEL_IDS)[number];

/** Raw provider bucket row before canonical merge. */
export type Ds4MultichannelBucketObservationV1 = {
  recordedAtIso: string;
  speedKmh?: number | null;
  rpm?: number | null;
  throttlePct?: number | null;
  loadPct?: number | null;
  coolantC?: number | null;
  /** Forbidden on R1 boundary — reject if set. */
  gear?: number | null;
  torquePct?: number | null;
  ignitionOn?: boolean | null;
  altitudeM?: number | null;
};

export type Ds4MultichannelChannelProvenanceV1 = {
  channelId: Ds4R1MultichannelChannelId | string;
  present: boolean;
  observedBucketCount: number;
  completenessRatio: number | null;
};

export type Ds4MultichannelSourceManifestV1 = {
  manifestVersion: string;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  providerSourceLinkId: string;
  telemetrySourceFamily: TelemetrySourceFamily;
  r1SnapshotVersion: string | null;
  channels: readonly Ds4MultichannelChannelProvenanceV1[];
  expectedMultichannelFingerprint: string;
  /** True only when independently attested — never for synthetic. */
  independentFieldValidation: boolean;
};

export type Ds4PowertrainDemandProvenanceVerdictV1 = {
  contentConsistencyVerified: boolean;
  sourceProvenanceVerified: boolean;
  independentFieldValidation: boolean;
};

export type Ds4PowertrainDemandBindingAbstainReason =
  | 'ORGANIZATION_ID_MISMATCH'
  | 'VEHICLE_ID_MISMATCH'
  | 'TRIP_ID_MISMATCH'
  | 'PROVIDER_SOURCE_LINK_MISMATCH'
  | 'PROVIDER_SOURCE_LINK_NULL'
  | 'V1B_INPUT_FINGERPRINT_MISMATCH'
  | 'V1B_PROCESSING_NOT_SUCCEEDED'
  | 'V1B_ADMISSION_NOT_ALLOWED'
  | 'V1B_NOT_TIER_AWARE'
  | 'V1B_TIER_EVIDENCE_UNAVAILABLE'
  | 'V1B_TEMPORAL_PROFILE_MISSING'
  | 'V1B_ANALYSIS_MODE_NOT_ELIGIBLE'
  | 'V1B_TEMPORAL_WINDOW_MISMATCH'
  | 'V1B_SEQUENCE_PARITY_MISMATCH'
  | 'TENANT_SCOPE_VIOLATION'
  | 'HF_READ_INCOMPLETE'
  | 'INVALID_TRIP_BOUNDS'
  | 'TELEMETRY_SOURCE_FAMILY_UNKNOWN'
  | 'V1B_RESULT_NULL'
  | 'TRIP_ADMISSION_NOT_ALLOWED'
  | 'ICE_APPLICABILITY_NOT_ADMITTED'
  | 'ICE_APPLICABILITY_V1B_MISMATCH'
  | 'MULTICHANNEL_FINGERPRINT_MISMATCH'
  | 'MULTICHANNEL_MANIFEST_MISSING'
  | 'MULTICHANNEL_MANIFEST_MISMATCH'
  | 'MULTICHANNEL_MANIFEST_TAMPERED'
  | 'R1_FORBIDDEN_CHANNEL_POPULATED'
  | 'RPM_V1A_GRID_MISMATCH'
  | 'CADENCE_EVIDENCE_NULL'
  | 'COVERAGE_EVIDENCE_NULL'
  | 'CHANNEL_COVERAGE_BELOW_MINIMUM'
  | 'INSUFFICIENT_ELIGIBLE_OBSERVATIONS'
  | 'POWERTRAIN_NOT_APPLICABLE'
  | 'ICE_OPERATION_NOT_CONFIRMED'
  | 'ICE_CONFIRMATION_CALLER_ONLY'
  | 'CONFLICTING_DUPLICATE_BUCKETS'
  | 'DECLARED_PHEV_WITHOUT_FUEL_CONTEXT';

export type Ds4PowertrainDemandResearchInputV1 = {
  contractVersion: typeof DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION;
  evidenceOrigin: Ds4PowertrainDemandEvidenceOrigin;
  sourceBundleId: string | null;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  providerSourceLinkId: string;
  dimoVehicleRawJson: unknown;
  tripInput: Ds4RpmHfV1aTripInputV1;
  v1bResult: Ds4RpmHfV1bShadowResultV1 | null;
  multichannelObservations: readonly Ds4MultichannelBucketObservationV1[];
  /** Required when evidenceOrigin=OFFLINE_SEALED_BUNDLE */
  multichannelManifest: Ds4MultichannelSourceManifestV1 | null;
  multichannelFingerprint: string;
  fuelType: string | null;
  isEvPowertrain: boolean;
  /** Ignored for admission — ICE must be proven from bound signals (P36-style). */
  declaredIceOperationConfirmed: boolean | null;
};

export type Ds4KickdownCandidateClassification =
  | 'THROTTLE_STEP_OBSERVED'
  | 'KICKDOWN_LIKE_PROXY_CANDIDATE'
  | 'NOT_ASSESSABLE';

export type Ds4KickdownCandidateSupportTier = 'STRONG' | 'MODERATE' | 'WEAK';

export type Ds4PowertrainDemandTripStatus = 'COMPUTED' | 'NOT_OBSERVED' | 'ABSTAINED';

export type Ds4KickdownLikeCandidateV1 = {
  episodeKey: string;
  classification: Ds4KickdownCandidateClassification;
  candidateSupportTier: Ds4KickdownCandidateSupportTier;
  providerBucketLabelStartIso: string;
  providerBucketLabelEndIso: string;
  startBucketIndex: number;
  endBucketIndex: number;
  observedBucketSpanCount: number;
  peakThrottlePct: number;
  throttleRisePct: number;
  rpmRiseLabelDelta: number | null;
  speedRiseLabelDelta: number | null;
  peakEngineLoadPct: number | null;
  requiredChannelPresence: Record<string, boolean>;
  peakThrottleBucketIndexDeltaFromPeakRpm: number | null;
  limitationCodes: string[];
};

export type Ds4PowertrainDemandKickdownResultV1 = {
  contractVersion: typeof DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION;
  policyVersion: typeof DS4_KICKDOWN_BUCKET_GRID_RESEARCH_POLICY_VERSION;
  researchOnly: true;
  timeAuthority: Ds4PowertrainDemandTimeAuthority;
  temporalMode: Ds4PowertrainDemandTemporalMode;
  misuseEligibility: 'NOT_EVALUATED_BY_DESIGN';
  evidenceOrigin: Ds4PowertrainDemandEvidenceOrigin;
  status: Ds4PowertrainDemandTripStatus;
  abstainReasons: readonly Ds4PowertrainDemandBindingAbstainReason[];
  provenance: Ds4PowertrainDemandProvenanceVerdictV1;
  bindings: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    providerSourceLinkId: string;
    v1bInputFingerprint: string | null;
    multichannelFingerprint: string | null;
    telemetrySourceFamily: TelemetrySourceFamily | null;
    sourceBundleId: string | null;
  };
  kickdown: {
    rawWindowCount: number;
    deduplicatedCandidateCount: number;
    candidates: Ds4KickdownLikeCandidateV1[];
    coverageEvidence: {
      requiredChannelCoverage: number | null;
      rpmCoverageEcho: number | null;
      eligibleObservationCount: number;
    };
  };
  unsupportedScientificClaims: string[];
  r1HistoricalObdRecordTimeUncertain: boolean;
  realDataValidation: 'NOT_EVALUATED' | 'SYNTHETIC_ONLY';
};
