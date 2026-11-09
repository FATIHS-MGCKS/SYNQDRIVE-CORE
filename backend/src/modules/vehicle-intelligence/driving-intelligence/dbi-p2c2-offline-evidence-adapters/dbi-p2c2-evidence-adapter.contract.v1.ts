import type {
  Ds4ColdEngineProxyCandidateV1,
  Ds4ColdEngineProxyKindV1,
  Ds4ColdEngineSubtypeAssessabilityV1,
  Ds4ExcessiveStationaryLikeSpanProxyCandidateV1,
  Ds4GapAwareSustainedLoadCandidateV1,
  Ds4HighRpmStationaryLikeProxyCandidateV1,
  Ds4KickdownCandidateClassification,
  Ds4KickdownLikeCandidateV1,
  Ds4PowertrainDemandEvidenceOrigin,
  Ds4PowertrainDemandProvenanceVerdictV1,
  Ds4PowertrainDemandTemporalMode,
  Ds4PowertrainDemandTimeAuthority,
  Ds4PowertrainDemandTripStatus,
  Ds4RevvingIdleFacetAssessabilityReasonV1,
  Ds4RevvingIdleFacetAssessabilityV1,
  Ds4RevvingIdleFacetATripEvidenceClassificationV1,
  Ds4RevvingIdleFacetBTripEvidenceClassificationV1,
  Ds4RevvingIdleFacetCoverageDiagnosticsV1,
  Ds4SustainedLoadEntryBranchV1,
  Ds4SustainedLoadTripEvidenceClassificationV1,
} from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
import { DS4_RPM_EPISODE_RESEARCH_CONTRACT_VERSION } from '../ds4-rpm-episode-research/ds4-rpm-episode-research.contract.v1';
import type {
  Ds4RpmEpisodeResearchEpisodeCategoryStatus,
  Ds4RpmEpisodeResearchEpisodeItemV1,
  Ds4RpmEpisodeResearchEvidenceOrigin,
  Ds4RpmEpisodeResearchResultStatus,
  Ds4RpmEpisodeResearchSemanticGuardV1,
  Ds4RpmEpisodeResearchTimeAuthority,
} from '../ds4-rpm-episode-research/ds4-rpm-episode-research.contract.v1';

export const DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION = 'dbi-p2c2-evidence-adapter-v1' as const;

/** Fields intentionally unavailable on a source module (distinct from explicit false/null). */
export const DBI_P2C2_NOT_REPORTED = 'NOT_REPORTED' as const;
export type DbiP2c2NotReported = typeof DBI_P2C2_NOT_REPORTED;

export type DbiP2c2TriStateProvenanceFlag = boolean | DbiP2c2NotReported;

export type DbiP2c2EvidencePlaneV1 = 'DESCRIPTIVE_RPM_EPISODES' | 'POWERTRAIN_PROXY_CANDIDATES';

export type DbiP2c2SourceModuleV1 = 'P2-A1' | 'P2-B1' | 'P2-B2' | 'P2-B3' | 'P2-B4';

export type DbiP2c2ProvenanceProjectionV1 = {
  readonly contentConsistencyVerified: DbiP2c2TriStateProvenanceFlag;
  readonly sourceProvenanceVerified: DbiP2c2TriStateProvenanceFlag;
  readonly independentFieldValidation: DbiP2c2TriStateProvenanceFlag;
};

export type DbiP2c2ParticipantIdentityV1 = {
  readonly organizationId: string;
  readonly vehicleId: string;
  readonly tripId: string;
  readonly providerSourceLinkId: string;
  readonly v1bInputFingerprint: string | null;
  readonly multichannelFingerprint: string | null | DbiP2c2NotReported;
  readonly sourceBundleId: string | null;
};

export type DbiP2c2ParticipantHeaderV1 = {
  readonly contractVersion: typeof DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION;
  readonly sourceModule: DbiP2c2SourceModuleV1;
  readonly sourceContractVersion: string;
  readonly sourcePolicyVersionOrKernelVersion: string;
  readonly originalKernelStatus: string;
  readonly originalAbstainReasons: readonly string[];
  readonly researchOnly: true;
  readonly evidenceOrigin: Ds4RpmEpisodeResearchEvidenceOrigin | Ds4PowertrainDemandEvidenceOrigin;
  readonly timeAuthority: Ds4RpmEpisodeResearchTimeAuthority | Ds4PowertrainDemandTimeAuthority;
  readonly temporalMode: Ds4PowertrainDemandTemporalMode | DbiP2c2NotReported;
  readonly identity: DbiP2c2ParticipantIdentityV1;
  readonly provenance: DbiP2c2ProvenanceProjectionV1;
  readonly unsupportedScientificClaims: readonly string[];
  readonly scientificLimitationCodes: readonly string[];
  /**
   * Adapter-local gate — never true when source trip status is ABSTAINED or when no positive
   * proxy classifications are present (B4: both facets NOT_ASSESSABLE).
   */
  readonly adapterClaimsPositiveEvidence: boolean;
};

export type DbiP2c2DescriptiveEpisodeRecordV1 = {
  readonly adapterLocalReference: string;
  readonly crossDomainJoinEligible: false;
  readonly sourceSequenceIndex: number;
  readonly sourceEpisode: Ds4RpmEpisodeResearchEpisodeItemV1;
};

export type DbiP2c2A1ModuleAssessabilityV1 = {
  readonly highEpisodesStatus: Ds4RpmEpisodeResearchEpisodeCategoryStatus;
  readonly normalizedEpisodesEligible: boolean;
  readonly semanticGuards: Ds4RpmEpisodeResearchSemanticGuardV1;
};

export type DbiP2c2A1EvidenceParticipantV1 = DbiP2c2ParticipantHeaderV1 & {
  readonly sourceModule: 'P2-A1';
  readonly sourceContractVersion: typeof DS4_RPM_EPISODE_RESEARCH_CONTRACT_VERSION;
  readonly moduleAssessability: DbiP2c2A1ModuleAssessabilityV1;
  readonly referenceContext: {
    readonly trustTier: string | null;
    readonly idleRpmProvenance: string | null;
    readonly maxRpmProvenance: string | null;
    readonly referenceObservationConflict: boolean;
    readonly riAvailability: string | null;
    readonly riReasonCodes: readonly string[];
  };
  readonly highEpisodesMassAccounting: Ds4RpmEpisodeResearchResultV1HighEpisodesMetaV1;
};

/** Slim mirror of A1 high-episodes meta without re-importing full result type in consumers. */
export type Ds4RpmEpisodeResearchResultV1HighEpisodesMetaV1 = {
  readonly status: Ds4RpmEpisodeResearchEpisodeCategoryStatus;
  readonly rejectedCandidateCount: number;
  readonly countRange: { readonly min: number; readonly max: number | null };
};

export type DbiP2c2DescriptiveRpmEpisodesPlaneV1 = {
  readonly evidencePlane: 'DESCRIPTIVE_RPM_EPISODES';
  readonly participant: DbiP2c2A1EvidenceParticipantV1;
  readonly episodes: readonly DbiP2c2DescriptiveEpisodeRecordV1[];
};

export type DbiP2c2ProxyCandidateEnvelopeV1 =
  | {
      readonly sourceModule: 'P2-B1';
      readonly originalCandidate: Ds4KickdownLikeCandidateV1;
      readonly originalClassification: Ds4KickdownCandidateClassification;
      readonly originalCandidateSupportTier: Ds4KickdownLikeCandidateV1['candidateSupportTier'];
      readonly sourceEpisodeKey: string;
    }
  | {
      readonly sourceModule: 'P2-B2';
      readonly originalCandidate: Ds4ColdEngineProxyCandidateV1;
      readonly originalClassification: Ds4ColdEngineProxyCandidateV1['classification'];
      readonly proxyKind: Ds4ColdEngineProxyKindV1;
      readonly sourceEpisodeKey: string;
    }
  | {
      readonly sourceModule: 'P2-B3';
      readonly originalCandidate: Ds4GapAwareSustainedLoadCandidateV1;
      readonly originalClassification: Ds4GapAwareSustainedLoadCandidateV1['classification'];
      readonly sourceEpisodeKey: string;
    }
  | {
      readonly sourceModule: 'P2-B4';
      readonly facet: 'HIGH_RPM_STATIONARY_LIKE_PROXY' | 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY';
      readonly originalCandidate:
        | Ds4HighRpmStationaryLikeProxyCandidateV1
        | Ds4ExcessiveStationaryLikeSpanProxyCandidateV1;
      readonly originalClassification: string;
      readonly sourceEpisodeKey: string;
    };

export type DbiP2c2B1ModuleCoverageV1 = {
  readonly movementObservedCompleteness: number | null;
  readonly fullTripMovementCoverageVerdict: 'UNKNOWN' | null;
  readonly localCoverageScope: 'OBSERVED_MOVING_BUCKETS_ONLY' | null;
  readonly observedMovingBucketCount: number;
  readonly unknownSpeedBucketCount: number;
};

export type DbiP2c2B1EvidenceParticipantV1 = DbiP2c2ParticipantHeaderV1 & {
  readonly sourceModule: 'P2-B1';
  readonly originalKernelStatus: Ds4PowertrainDemandTripStatus;
  readonly moduleCoverage: DbiP2c2B1ModuleCoverageV1;
};

export type DbiP2c2B2SubtypeAssessabilityV1 = Record<
  Ds4ColdEngineProxyKindV1,
  Ds4ColdEngineSubtypeAssessabilityV1
>;

export type DbiP2c2B2ModuleCoverageV1 = {
  readonly localCoverageScope: 'ECT_LABELLED_BUCKETS_ONLY' | null;
  readonly fullTripColdStateCoverageVerdict: 'UNKNOWN' | null;
  readonly referenceTrustTier:
    | 'SYNTHETIC_FIXTURE_ONLY'
    | 'DOWNGRADED_ESTIMATE'
    | 'UNAVAILABLE'
    | null;
  readonly vehicleRpmReferenceBinding: { organizationId: string; vehicleId: string } | null;
};

export type DbiP2c2B2EvidenceParticipantV1 = DbiP2c2ParticipantHeaderV1 & {
  readonly sourceModule: 'P2-B2';
  readonly originalKernelStatus: Ds4PowertrainDemandTripStatus;
  readonly subtypeAssessability: DbiP2c2B2SubtypeAssessabilityV1;
  readonly moduleCoverage: DbiP2c2B2ModuleCoverageV1;
};

export type DbiP2c2B3EvidenceParticipantV1 = DbiP2c2ParticipantHeaderV1 & {
  readonly sourceModule: 'P2-B3';
  readonly originalKernelStatus: Ds4PowertrainDemandTripStatus;
  readonly tripEvidenceClassification: Ds4SustainedLoadTripEvidenceClassificationV1;
  readonly partialCoverage: {
    readonly loadPresentBucketCount: number;
    readonly loadMissingBucketCount: number;
    readonly gridBucketCount: number;
    readonly entryLabelCount: number;
    readonly distinctMsLabelsInTrip: number;
  };
};

export type DbiP2c2B4FacetProjectionV1 = {
  readonly facet: 'HIGH_RPM_STATIONARY_LIKE_PROXY' | 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY';
  readonly assessability: Ds4RevvingIdleFacetAssessabilityV1;
  readonly tripEvidenceClassification:
    | Ds4RevvingIdleFacetATripEvidenceClassificationV1
    | Ds4RevvingIdleFacetBTripEvidenceClassificationV1;
  readonly assessabilityReasonCodes: readonly Ds4RevvingIdleFacetAssessabilityReasonV1[];
  readonly coverageDiagnostics: Ds4RevvingIdleFacetCoverageDiagnosticsV1;
  readonly entryLabelCount: number;
  readonly deduplicatedCandidateCount: number;
};

export type DbiP2c2B4CoverageEvidenceV1 = {
  readonly gridBucketCount: number;
  readonly rpmAndSpeedPresentBucketCount: number;
  readonly rpmMissingBucketCount: number;
  readonly speedMissingBucketCount: number;
  readonly loadPresentBucketCount: number;
  readonly coolantPresentBucketCount: number;
};

export type DbiP2c2B4EvidenceParticipantV1 = DbiP2c2ParticipantHeaderV1 & {
  readonly sourceModule: 'P2-B4';
  readonly originalKernelStatus: Ds4PowertrainDemandTripStatus;
  readonly facetA: DbiP2c2B4FacetProjectionV1;
  readonly facetB: DbiP2c2B4FacetProjectionV1;
  readonly coverageEvidence: DbiP2c2B4CoverageEvidenceV1;
};

export type DbiP2c2PowertrainProxyParticipantV1 =
  | DbiP2c2B1EvidenceParticipantV1
  | DbiP2c2B2EvidenceParticipantV1
  | DbiP2c2B3EvidenceParticipantV1
  | DbiP2c2B4EvidenceParticipantV1;

export type DbiP2c2PowertrainProxyCandidatesPlaneV1 = {
  readonly evidencePlane: 'POWERTRAIN_PROXY_CANDIDATES';
  readonly participant: DbiP2c2PowertrainProxyParticipantV1;
  readonly candidates: readonly DbiP2c2ProxyCandidateEnvelopeV1[];
};

export type DbiP2c2AdapterDiagnosticCodeV1 =
  | 'SOURCE_NOT_RESEARCH_ONLY'
  | 'A1_SEMANTIC_GUARD_NOT_EVIDENCE_CANDIDATE'
  | 'A1_SEMANTIC_GUARD_LABELS_NOT_FOR_CROSS_DOMAIN_JOIN'
  | 'INVALID_PROVIDER_BUCKET_LABEL'
  | 'CONTRADICTORY_POSITIVE_EVIDENCE_UNDER_ABSTAIN';

export type DbiP2c2AdapterFailureV1 = {
  readonly ok: false;
  readonly sourceModule: DbiP2c2SourceModuleV1;
  readonly diagnosticCodes: readonly DbiP2c2AdapterDiagnosticCodeV1[];
};

export type DbiP2c2AdapterSuccessV1<TPlane> = {
  readonly ok: true;
  readonly plane: TPlane;
  /** Stable ordering digest for determinism checks (episode keys / indices only). */
  readonly orderingDigest: string;
};

export type DbiP2c2AdapterOutcomeV1<TPlane> = DbiP2c2AdapterSuccessV1<TPlane> | DbiP2c2AdapterFailureV1;

export type DbiP2c2OfflineEvidenceBundleV1 = {
  readonly contractVersion: typeof DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION;
  readonly descriptive: DbiP2c2DescriptiveRpmEpisodesPlaneV1 | null;
  readonly powertrainProxies: readonly DbiP2c2PowertrainProxyCandidatesPlaneV1[];
};

/** Re-export for positive-evidence helpers in tests without importing powertrain contracts again. */
export type DbiP2c2PowertrainTripStatusV1 = Ds4PowertrainDemandTripStatus;
export type DbiP2c2SustainedEntryBranchV1 = Ds4SustainedLoadEntryBranchV1;
export type DbiP2c2PowertrainProvenanceSourceV1 = Ds4PowertrainDemandProvenanceVerdictV1;
export type DbiP2c2A1KernelStatusV1 = Ds4RpmEpisodeResearchResultStatus;
