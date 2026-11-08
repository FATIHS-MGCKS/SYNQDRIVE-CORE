import type { Ds4RpmHfV1aTripInputV1 } from '../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import type { Ds4RpmHfV1bShadowResultV1 } from '../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import type { Ds4RpmReferenceIntelligenceV1ComputeInput } from '../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1.contract';
import type { TelemetrySourceFamily } from '../../telemetry-source-family';

export const DS4_RPM_EPISODE_RESEARCH_CONTRACT_VERSION = 'ds4-rpm-episode-research-v1' as const;
export const DS4_RPM_EPISODE_RESEARCH_KERNEL_VERSION = 'ds4-rpm-episode-research-kernel-v1' as const;

/** Observed RPM labels at or above this value count as rotating (reuse P36 ice confirmation scale). */
export const DS4_RPM_EPISODE_RESEARCH_ICE_RPM_ROTATING_MIN = 400;
export const DS4_RPM_EPISODE_RESEARCH_MIN_ROTATING_LABELS = 3;
export const DS4_RPM_EPISODE_RESEARCH_MIN_CORE_POINTS = 3;
export const DS4_RPM_EPISODE_RESEARCH_EXCEEDANCE_GRID_RPM = 250;
/** Maximum 250-rpm exceedance thresholds emitted per trip (research contract v1). */
export const DS4_RPM_EPISODE_RESEARCH_EXCEEDANCE_GRID_MAX_THRESHOLDS = 128;

export type Ds4RpmEpisodeResearchHighCoreAboveReferenceMaxStatus =
  | 'NOT_APPLICABLE'
  | 'SATISFIED'
  | 'VIOLATED';
export const DS4_RPM_EPISODE_RESEARCH_REFERENCE_CONFLICT_MIN_LABELS_ABOVE_MAX = 3;

/** Research-only normalized thresholds — aligned with Reference Intelligence band edges. */
export const DS4_RPM_EPISODE_RESEARCH_HIGH_ENTRY_U = 0.65;
export const DS4_RPM_EPISODE_RESEARCH_HIGH_EXIT_U = 0.57;
export const DS4_RPM_EPISODE_RESEARCH_NEAR_MAX_ENTRY_U = 0.9;
export const DS4_RPM_EPISODE_RESEARCH_NEAR_MAX_EXIT_U = 0.82;

export type Ds4RpmEpisodeResearchEvidenceOrigin = 'SYNTHETIC_FIXTURE' | 'OFFLINE_SEALED_BUNDLE';

export type Ds4RpmEpisodeResearchTimeAuthority = 'BUCKET_LABEL_UNVERIFIED';

export type Ds4RpmEpisodeResearchBindingAbstainReason =
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
  | 'V1B_TIER_TRIP_MISMATCH'
  | 'V1B_TEMPORAL_PROFILE_MISSING'
  | 'V1B_ANALYSIS_MODE_NOT_ELIGIBLE'
  | 'V1B_TEMPORAL_WINDOW_MISMATCH'
  | 'V1B_SEQUENCE_PARITY_MISMATCH'
  | 'TENANT_SCOPE_VIOLATION'
  | 'HF_READ_INCOMPLETE'
  | 'INVALID_TRIP_BOUNDS'
  | 'TELEMETRY_SOURCE_FAMILY_UNKNOWN'
  | 'V1B_RESULT_NULL';

export type Ds4RpmEpisodeResearchInputV1 = {
  contractVersion: typeof DS4_RPM_EPISODE_RESEARCH_CONTRACT_VERSION;
  evidenceOrigin: Ds4RpmEpisodeResearchEvidenceOrigin;
  sourceBundleId: string | null;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  providerSourceLinkId: string;
  dimoVehicleRawJson: unknown;
  tripInput: Ds4RpmHfV1aTripInputV1;
  v1bResult: Ds4RpmHfV1bShadowResultV1 | null;
  reference: Ds4RpmReferenceIntelligenceV1ComputeInput['reference'];
};

export type Ds4RpmEpisodeResearchResultStatus = 'COMPUTED' | 'ABSTAINED' | 'NOT_APPLICABLE';

export type Ds4RpmEpisodeResearchEpisodeCategoryStatus =
  | 'SUPPORTED_DESCRIPTIVE'
  | 'NOT_OBSERVED'
  | 'NOT_ASSESSABLE';

export type Ds4RpmEpisodeResearchAbsoluteDistributionStatus = 'COMPLETE' | 'PARTIAL' | 'NOT_AVAILABLE';

export type Ds4RpmEpisodeResearchCountRangeV1 = {
  min: number;
  max: number;
};

export type Ds4RpmEpisodeResearchEpisodeItemV1 = {
  sequenceIndex: number;
  startIdx: number;
  endIdx: number;
  providerBucketLabelStartIso: string;
  providerBucketLabelEndIso: string;
  pointCount: number;
  corePointCount: number;
  peakU: number;
  peakRpm: number;
  leftCensored: boolean;
  rightCensored: boolean;
  nearMaxSubEpisodeCount: number;
};

export type Ds4RpmEpisodeResearchMassAccountingCategoryV1 = {
  /** I1: #{u ≥ entry} = admittedCore + rejectedCore */
  eligibleCorePointCount: number;
  admittedCorePointCount: number;
  rejectedCorePointCount: number;
  /** I2: Σ admitted (core+tail) ≤ #{u ≥ exit} */
  admittedCorePlusTailPointCount: number;
  pointsAtOrAboveExitThreshold: number;
  i1Satisfied: boolean;
  i2Satisfied: boolean;
};

export type Ds4RpmEpisodeResearchMassAccountingV1 = {
  high: Ds4RpmEpisodeResearchMassAccountingCategoryV1;
  nearMax: Ds4RpmEpisodeResearchMassAccountingCategoryV1;
  /** I3: same-category episode index ranges are disjoint (tested externally). */
  /** I4: each NEAR_MAX core index is covered by a HIGH candidate. */
  nearMaxCorePointsWithoutHighCandidate: number;
  i4Satisfied: boolean;
  /** I5: HIGH eligible core includes all u > 1 labels when present */
  highCoreAboveReferenceMaxStatus: Ds4RpmEpisodeResearchHighCoreAboveReferenceMaxStatus;
  i3SameCategoryEpisodeRangesDisjoint: boolean;
};

export type Ds4RpmEpisodeResearchSemanticGuardV1 = {
  bucketGridSpanIsNotPhysicalDuration: true;
  labelsNotForCrossDomainJoin: true;
  highRpmIsNotEngineLoad: true;
  nearMaxReferenceIsNotOverRevving: true;
  episodeIsNotMisuse: true;
  notEvidenceCandidate: true;
  misuseEligibility: 'NOT_EVALUATED_BY_DESIGN';
};

export type Ds4RpmEpisodeResearchResultV1 = {
  contractVersion: typeof DS4_RPM_EPISODE_RESEARCH_CONTRACT_VERSION;
  kernelVersion: typeof DS4_RPM_EPISODE_RESEARCH_KERNEL_VERSION;
  researchOnly: true;
  evidenceOrigin: Ds4RpmEpisodeResearchEvidenceOrigin;
  bindings: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    providerSourceLinkId: string;
    v1bInputFingerprint: string | null;
    v1bEngineVersion: string | null;
    sourceBundleId: string | null;
    telemetrySourceFamily: TelemetrySourceFamily | null;
    cadenceTier: string | null;
    analysisMode: string | null;
  };
  timeAuthority: Ds4RpmEpisodeResearchTimeAuthority;
  status: Ds4RpmEpisodeResearchResultStatus;
  abstainReasons: readonly string[];
  denominators: {
    observedUniqueLabelCount: number;
    eligibleSequencePointCount: number;
    runningLabelCount: number;
    engineNotRotatingLabelCount: number;
    identicalDuplicateCollapsedCount: number;
    conflictingDuplicateLabelCount: number;
    invalidTimestampOrRpmCount: number;
    negativeOrNonFiniteRpmExcludedCount: number;
    echoes: {
      tripWindowDurationSeconds: number | null;
      labelHoldSecondsEcho: number | null;
      v1bObservedBucketCoverageRatioEcho: number | null;
      internalMissingBucketCountEcho: number | null;
    };
  };
  absoluteDistribution: {
    status: Ds4RpmEpisodeResearchAbsoluteDistributionStatus;
    countWeightedQuantiles: {
      q05: number | null;
      q50: number | null;
      q90: number | null;
      q95: number | null;
      q99: number | null;
      max: number | null;
    };
    exceedanceCounts250: ReadonlyArray<{ thresholdRpm: number; labelCount: number }>;
    exceedanceGridMaxThresholds: number;
    exceedanceGridTruncated: boolean;
    exceedanceGridTruncationReason: string | null;
    ambiguousLabelsExcluded: boolean;
  };
  referenceContext: {
    trustTier: string | null;
    idleRpmProvenance: string | null;
    maxRpmProvenance: string | null;
    normalizedEpisodesEligible: boolean;
    referenceObservationConflict: boolean;
    riAvailability: string | null;
    riReasonCodes: readonly string[];
  };
  highEpisodes: {
    status: Ds4RpmEpisodeResearchEpisodeCategoryStatus;
    thresholds: {
      highEntryU: number;
      highExitU: number;
      nearMaxEntryU: number;
      nearMaxExitU: number;
    };
    countRange: Ds4RpmEpisodeResearchCountRangeV1;
    rejectedCandidateCount: number;
    items: readonly Ds4RpmEpisodeResearchEpisodeItemV1[];
    massAccounting: Ds4RpmEpisodeResearchMassAccountingV1 | null;
  };
  semanticGuards: Ds4RpmEpisodeResearchSemanticGuardV1;
  unsupportedScientificClaims: readonly string[];
  r1HistoricalObdRecordTimeUncertain: boolean;
};
