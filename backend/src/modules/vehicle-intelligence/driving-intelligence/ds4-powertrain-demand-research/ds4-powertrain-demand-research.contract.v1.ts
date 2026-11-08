import type { Ds4RpmHfV1aTripInputV1 } from '../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import type { Ds4RpmHfV1bShadowResultV1 } from '../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import type { Ds4RpmReferenceIntelligenceV1ComputeInput } from '../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1.contract';
import type { TelemetrySourceFamily } from '../../telemetry-source-family';

export const DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION =
  'ds4-powertrain-demand-research-v1' as const;

export const DS4_KICKDOWN_BUCKET_GRID_RESEARCH_POLICY_VERSION =
  'kickdown-bucket-grid-research-v1' as const;

export const DS4_COLD_ENGINE_BUCKET_GRID_RESEARCH_POLICY_VERSION =
  'cold-engine-bucket-grid-research-v1' as const;

export const DS4_SUSTAINED_LOAD_GAP_AWARE_RESEARCH_POLICY_VERSION =
  'sustained-load-gap-aware-research-v1' as const;

export const DS4_REVIVING_IDLE_DUAL_FACET_RESEARCH_POLICY_VERSION =
  'revving-idle-dual-facet-research-v1' as const;

export const DS4_MULTICHANNEL_MANIFEST_VERSION = 'ds4-multichannel-manifest-v1' as const;

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
  /** When set, must match the bound trip input identity or the row is rejected. */
  providerSourceLinkId?: string | null;
  tripId?: string | null;
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
  /**
   * Caller-declared only — never treated as verified attestation without
   * a separate trust anchor (not implemented in P2-B1).
   */
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
  | 'DECLARED_PHEV_WITHOUT_FUEL_CONTEXT'
  | 'RPM_V1A_UNMATCHED_LABEL'
  | 'RPM_V1A_EXTRA_MULTICHANNEL_LABEL'
  | 'RPM_V1A_VALUE_MISMATCH'
  | 'V1A_RPM_DUPLICATE_CONFLICT'
  | 'MULTICHANNEL_OUT_OF_TRIP_WINDOW'
  | 'MIXED_SOURCE_OBSERVATION'
  | 'INVALID_SIGNAL_DOMAIN'
  | 'INVALID_TIMESTAMP_OR_VALUE'
  | 'MANIFEST_SOURCE_FAMILY_MISMATCH'
  | 'MANIFEST_R1_SNAPSHOT_MISMATCH'
  | 'MANIFEST_CHANNEL_MISMATCH'
  | 'MANIFEST_VERSION_INVALID'
  | 'FORGED_INDEPENDENT_ATTESTATION'
  | 'OFFLINE_SOURCE_ATTESTATION_NOT_VERIFIED'
  | 'INSUFFICIENT_LOCAL_CANDIDATE_WINDOW'
  | 'PHEV_ICE_NOT_CONFIRMED_IN_WINDOW'
  | 'NO_MOVING_OPPORTUNITY_EVIDENCE'
  | 'INSUFFICIENT_ECT_OBSERVATIONS'
  | 'COOLANT_CHANNEL_UNAVAILABLE'
  | 'V1B_REQUIRED_FOR_RPM_EVIDENCE'
  | 'V1B_RPM_EVIDENCE_CONTRADICTS_EMPTY_READ'
  | 'RPM_READ_NOT_GENUINELY_EMPTY'
  | 'HF_CLICKHOUSE_QUERY_FAILED'
  | 'HF_CLICKHOUSE_UNAVAILABLE'
  | 'HF_CLICKHOUSE_DEGRADED'
  | 'HF_CLICKHOUSE_READ_STATUS_NOT_ALLOWED'
  | 'EMPTY_RPM_DATA_QUALITY_INCONSISTENT'
  | 'V1B_UNEXPECTED_ON_ZERO_RPM_PATH'
  | 'VEHICLE_REFERENCE_BINDING_MISMATCH'
  | 'REFERENCE_TRUST_REQUIRES_SYNTHETIC_FIXTURE'
  | 'REFERENCE_SPEC_UNAVAILABLE'
  | 'REFERENCE_PAIR_INCONSISTENT'
  | 'REFERENCE_PROVENANCE_DOWNGRADED'
  | 'ICE_RPM_NOT_APPLICABLE'
  | 'LOAD_CHANNEL_UNAVAILABLE'
  | 'INSUFFICIENT_LOAD_LABEL_OBSERVATIONS'
  | 'INSUFFICIENT_RPM_SPEED_LABEL_OBSERVATIONS';

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
      /** V1B RPM trip window coverage — diagnostic only; not an admission floor. */
      rpmTripCoverage: number | null;
      /** Share of all observed grid buckets with required channels (diagnostic). */
      multichannelObservedGridCoverage: number | null;
      /** Required-channel completeness over observed moving buckets only (admission). */
      movementObservedCompleteness: number | null;
      localCoverageScope: 'OBSERVED_MOVING_BUCKETS_ONLY' | null;
      /** Full-trip wall-clock movement exposure is not independently verified. */
      fullTripMovementCoverageVerdict: 'UNKNOWN' | null;
      observedMovingBucketCount: number;
      observedStationaryBucketCount: number;
      unknownSpeedBucketCount: number;
      eligibleObservationCount: number;
      eligibleMovingObservationCount: number;
    };
  };
  unsupportedScientificClaims: string[];
  r1HistoricalObdRecordTimeUncertain: boolean;
  realDataValidation: 'NOT_EVALUATED' | 'SYNTHETIC_ONLY';
};

export type Ds4PowertrainDemandColdEngineResearchInputV1 = Ds4PowertrainDemandResearchInputV1 & {
  vehicleRpmReference: Ds4RpmReferenceIntelligenceV1ComputeInput['reference'];
  /** Must match organizationId/vehicleId on the research input when HIGH_RPM assessability is evaluated. */
  vehicleRpmReferenceBinding: { organizationId: string; vehicleId: string } | null;
};

export type Ds4ColdEngineProxyKindV1 =
  | 'COLD_ENGINE_HIGH_LOAD'
  | 'COLD_ENGINE_HIGH_RPM'
  | 'COLD_ENGINE_FULL_THROTTLE';

export type Ds4ColdEngineSubtypeAssessabilityV1 = {
  status: 'ASSESSABLE' | 'NOT_ASSESSABLE';
  reasonCodes: string[];
};

export type Ds4ColdEngineProxyCandidateV1 = {
  episodeKey: string;
  proxyKind: Ds4ColdEngineProxyKindV1;
  classification:
    | 'COLD_ENGINE_HIGH_LOAD_PROXY_CANDIDATE'
    | 'COLD_ENGINE_HIGH_RPM_PROXY_CANDIDATE'
    | 'COLD_ENGINE_FULL_THROTTLE_PROXY_CANDIDATE'
    | 'NOT_ASSESSABLE';
  providerBucketLabelStartIso: string;
  providerBucketLabelEndIso: string;
  startBucketIndex: number;
  endBucketIndex: number;
  observedBucketSpanCount: number;
  peakValue: number;
  peakUnit: string;
  limitationCodes: string[];
  requiredChannelPresence: Record<string, boolean>;
};

export type Ds4PowertrainDemandColdEngineResultV1 = {
  contractVersion: typeof DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION;
  policyVersion: typeof DS4_COLD_ENGINE_BUCKET_GRID_RESEARCH_POLICY_VERSION;
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
    vehicleRpmReferenceBinding: { organizationId: string; vehicleId: string } | null;
    highRpmReferenceTrustTier:
      | 'SYNTHETIC_FIXTURE_ONLY'
      | 'DOWNGRADED_ESTIMATE'
      | 'UNAVAILABLE'
      | null;
  };
  coldEngine: {
    rawWindowCount: number;
    deduplicatedCandidateCount: number;
    candidates: Ds4ColdEngineProxyCandidateV1[];
    subtypeAssessability: Record<Ds4ColdEngineProxyKindV1, Ds4ColdEngineSubtypeAssessabilityV1>;
    coverageEvidence: {
      rpmTripCoverage: number | null;
      localCoverageScope: 'ECT_LABELLED_BUCKETS_ONLY' | null;
      fullTripColdStateCoverageVerdict: 'UNKNOWN' | null;
      ectPresentBucketCount: number;
      ectMissingBucketCount: number;
      ectColdObservedBucketCount: number;
      ectWarmObservedBucketCount: number;
      gridBucketCount: number;
    };
  };
  unsupportedScientificClaims: string[];
  r1HistoricalObdRecordTimeUncertain: boolean;
  realDataValidation: 'NOT_EVALUATED' | 'SYNTHETIC_ONLY';
};

export type Ds4SustainedLoadResearchInputV1 = Ds4PowertrainDemandResearchInputV1;

export type Ds4SustainedLoadEntryBranchV1 = 'RPM' | 'THROTTLE' | 'BOTH';

export type Ds4SustainedLoadTripEvidenceClassificationV1 =
  | 'NOT_ASSESSABLE'
  | 'INSUFFICIENT_OBSERVATIONS'
  | 'NOT_OBSERVED'
  | 'SINGLE_HIGH_LOAD_ENTRY_LABEL'
  | 'MULTI_LABEL_HIGH_LOAD_RUN'
  | 'GAP_AWARE_SUSTAINED_PROXY_CANDIDATE';

export type Ds4GapAwareSustainedLoadCandidateV1 = {
  episodeKey: string;
  classification: 'GAP_AWARE_SUSTAINED_PROXY_CANDIDATE';
  startProviderBucketLabelIso: string;
  endProviderBucketLabelIso: string;
  observedLabelCount: number;
  researchLabelSpanMs: number;
  maxObservedLabelGapMs: number;
  peakObservedLoadPct: number;
  entryBranch: Ds4SustainedLoadEntryBranchV1;
  limitationCodes: string[];
  requiredChannelPresence: Record<string, boolean>;
};

export type Ds4PowertrainDemandSustainedLoadResultV1 = {
  contractVersion: typeof DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION;
  policyVersion: typeof DS4_SUSTAINED_LOAD_GAP_AWARE_RESEARCH_POLICY_VERSION;
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
  sustainedLoad: {
    canonicalRowsFullKey: number;
    distinctMsLabelsInTrip: number;
    identicalDuplicateCollapsedCount: number;
    entryLabelCount: number;
    deduplicatedCandidateCount: number;
    candidates: Ds4GapAwareSustainedLoadCandidateV1[];
    tripEvidenceClassification: Ds4SustainedLoadTripEvidenceClassificationV1;
    coverageEvidence: {
      loadPresentBucketCount: number;
      loadMissingBucketCount: number;
      gridBucketCount: number;
    };
  };
  unsupportedScientificClaims: string[];
  r1HistoricalObdRecordTimeUncertain: boolean;
  realDataValidation: 'NOT_EVALUATED' | 'SYNTHETIC_ONLY';
};

export type Ds4RevvingIdleResearchInputV1 = Ds4PowertrainDemandResearchInputV1;

export type Ds4RevvingIdleFacetAssessabilityV1 = 'ASSESSABLE' | 'NOT_ASSESSABLE';

export type Ds4RevvingIdleFacetAssessabilityReasonV1 =
  | 'ASSESSABLE'
  | 'INTEGRITY_NOT_ADMITTED'
  | 'RPM_SPEED_CO_OBSERVATION_UNAVAILABLE'
  | 'INSUFFICIENT_CO_LABEL_COUNT'
  | 'INSUFFICIENT_LABEL_SPAN_OPPORTUNITY'
  | 'INSUFFICIENT_COHERENT_GAP_COVERAGE';

export type Ds4RevvingIdleFacetCoverageDiagnosticsV1 = {
  rpmSpeedCoObservedLabelCount: number;
  rpmMissingRequiredChannelCount: number;
  speedMissingRequiredChannelCount: number;
  longestCoherentRunLabelCount: number;
  longestCoherentResearchLabelSpanMs: number;
  longestCoherentMaxAdjacentGapMs: number;
  assessabilityReasonCodes: readonly Ds4RevvingIdleFacetAssessabilityReasonV1[];
};

export type Ds4RevvingIdleFacetATripEvidenceClassificationV1 =
  | 'NOT_ASSESSABLE'
  | 'INSUFFICIENT_OBSERVATIONS'
  | 'NOT_OBSERVED'
  | 'HIGH_RPM_STATIONARY_LIKE_PROXY_CANDIDATE';

export type Ds4RevvingIdleFacetBTripEvidenceClassificationV1 =
  | 'NOT_ASSESSABLE'
  | 'INSUFFICIENT_OBSERVATIONS'
  | 'NOT_OBSERVED'
  | 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY_CANDIDATE';

export type Ds4HighRpmStationaryLikeProxyCandidateV1 = {
  episodeKey: string;
  classification: 'HIGH_RPM_STATIONARY_LIKE_PROXY_CANDIDATE';
  startProviderBucketLabelIso: string;
  endProviderBucketLabelIso: string;
  observedLabelCount: number;
  researchLabelSpanMs: number;
  maxObservedLabelGapMs: number;
  peakObservedRpm: number;
  limitationCodes: string[];
  requiredChannelPresence: Record<string, boolean>;
};

export type Ds4ExcessiveStationaryLikeSpanProxyCandidateV1 = {
  episodeKey: string;
  classification: 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY_CANDIDATE';
  startProviderBucketLabelIso: string;
  endProviderBucketLabelIso: string;
  observedLabelCount: number;
  researchLabelSpanMs: number;
  maxObservedLabelGapMs: number;
  meanObservedRpmInBand: number | null;
  limitationCodes: string[];
  requiredChannelPresence: Record<string, boolean>;
};

export type Ds4PowertrainDemandRevvingIdleResultV1 = {
  contractVersion: typeof DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION;
  policyVersion: typeof DS4_REVIVING_IDLE_DUAL_FACET_RESEARCH_POLICY_VERSION;
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
  revvingIdle: {
    canonicalRowsFullKey: number;
    distinctMsLabelsInTrip: number;
    identicalDuplicateCollapsedCount: number;
    facetA: {
      assessability: Ds4RevvingIdleFacetAssessabilityV1;
      coverageDiagnostics: Ds4RevvingIdleFacetCoverageDiagnosticsV1;
      entryLabelCount: number;
      deduplicatedCandidateCount: number;
      candidates: Ds4HighRpmStationaryLikeProxyCandidateV1[];
      tripEvidenceClassification: Ds4RevvingIdleFacetATripEvidenceClassificationV1;
    };
    facetB: {
      assessability: Ds4RevvingIdleFacetAssessabilityV1;
      coverageDiagnostics: Ds4RevvingIdleFacetCoverageDiagnosticsV1;
      entryLabelCount: number;
      deduplicatedCandidateCount: number;
      candidates: Ds4ExcessiveStationaryLikeSpanProxyCandidateV1[];
      tripEvidenceClassification: Ds4RevvingIdleFacetBTripEvidenceClassificationV1;
    };
    coverageEvidence: {
      gridBucketCount: number;
      rpmAndSpeedPresentBucketCount: number;
      rpmMissingBucketCount: number;
      speedMissingBucketCount: number;
      loadPresentBucketCount: number;
      coolantPresentBucketCount: number;
    };
    scientificLimitationCodes: string[];
  };
  unsupportedScientificClaims: string[];
  r1HistoricalObdRecordTimeUncertain: boolean;
  realDataValidation: 'NOT_EVALUATED' | 'SYNTHETIC_ONLY';
};
