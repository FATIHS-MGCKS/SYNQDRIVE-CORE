import type {
  Ds4RpmEpisodeResearchBindingAbstainReason,
  Ds4RpmEpisodeResearchEvidenceOrigin,
  Ds4RpmEpisodeResearchInputV1,
  Ds4RpmEpisodeResearchTimeAuthority,
} from '../ds4-rpm-episode-research/ds4-rpm-episode-research.contract.v1';
import type { TelemetrySourceFamily } from '../../telemetry-source-family';

export const DS4_RPM_DYNAMICS_RESEARCH_CONTRACT_VERSION = 'ds4-rpm-dynamics-research-v1' as const;
export const DS4_RPM_DYNAMICS_RESEARCH_KERNEL_VERSION = 'ds4-rpm-dynamics-research-kernel-v1' as const;

/** Reuses P2-A1 admission envelope (V1A trip + tier-aware V1B + reference ICE gates). */
export type Ds4RpmDynamicsResearchInputV1 = Omit<Ds4RpmEpisodeResearchInputV1, 'contractVersion'> & {
  readonly contractVersion: typeof DS4_RPM_DYNAMICS_RESEARCH_CONTRACT_VERSION;
};

export type Ds4RpmDynamicsResearchDynamicsStatus =
  | 'SUPPORTED_DESCRIPTIVE'
  | 'NOT_OBSERVED'
  | 'NOT_ASSESSABLE';

export type Ds4RpmDynamicsResearchObservedDeltaDirectionV1 = 'RISE' | 'FALL' | 'FLAT';

export type Ds4RpmDynamicsResearchAdjacentDeltaV1 = {
  sequenceIndex: number;
  fromGlobalIdx: number;
  toGlobalIdx: number;
  fromRpm: number;
  toRpm: number;
  deltaRpm: number;
  labelGapMs: number;
  direction: Ds4RpmDynamicsResearchObservedDeltaDirectionV1;
};

export type Ds4RpmDynamicsResearchMonotonicRunKindV1 = 'RISING' | 'FALLING' | 'FLAT';

export type Ds4RpmDynamicsResearchMonotonicRunV1 = {
  sequenceIndex: number;
  kind: Ds4RpmDynamicsResearchMonotonicRunKindV1;
  startGlobalIdx: number;
  endGlobalIdx: number;
  pointCount: number;
  netDeltaRpm: number;
};

export type Ds4RpmDynamicsResearchSemanticGuardV1 = {
  bucketGridSpanIsNotPhysicalDuration: true;
  labelsNotForCrossDomainJoin: true;
  observedDeltaIsNotPhysicalDrpmDt: true;
  observedTrendIsNotGearShift: true;
  observedTrendIsNotEngineLoad: true;
  observedTrendIsNotMisuse: true;
  notEvidenceCandidate: true;
  misuseEligibility: 'NOT_EVALUATED_BY_DESIGN';
};

export type Ds4RpmDynamicsResearchResultStatus = 'COMPUTED' | 'ABSTAINED' | 'NOT_APPLICABLE';

export type Ds4RpmDynamicsResearchResultV1 = {
  contractVersion: typeof DS4_RPM_DYNAMICS_RESEARCH_CONTRACT_VERSION;
  kernelVersion: typeof DS4_RPM_DYNAMICS_RESEARCH_KERNEL_VERSION;
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
    sequenceMaxGapSeconds: number | null;
    nominalCadenceSeconds: number | null;
  };
  timeAuthority: Ds4RpmEpisodeResearchTimeAuthority;
  status: Ds4RpmDynamicsResearchResultStatus;
  abstainReasons: readonly (Ds4RpmEpisodeResearchBindingAbstainReason | 'CONFLICTING_RPM_LABELS_AT_SHARED_TIMESTAMP')[];
  denominators: {
    observedUniqueLabelCount: number;
    eligibleSequencePointCount: number;
    continuousSequenceCount: number;
    adjacentObservedPairCount: number;
    identicalDuplicateCollapsedCount: number;
    conflictingDuplicateLabelCount: number;
    invalidTimestampOrRpmCount: number;
    negativeOrNonFiniteRpmExcludedCount: number;
  };
  observedDynamics: {
    status: Ds4RpmDynamicsResearchDynamicsStatus;
    deltaDistribution: {
      positiveCount: number;
      negativeCount: number;
      zeroCount: number;
    };
    adjacentDeltas: readonly Ds4RpmDynamicsResearchAdjacentDeltaV1[];
    monotonicRuns: readonly Ds4RpmDynamicsResearchMonotonicRunV1[];
    observedDirectionReversalCount: number;
  };
  semanticGuards: Ds4RpmDynamicsResearchSemanticGuardV1;
  unsupportedScientificClaims: readonly string[];
  r1HistoricalObdRecordTimeUncertain: boolean;
};
