import type { Ds4RpmDynamicsFusionResearchResultV1 } from '../ds4-rpm-dynamics-fusion-research/ds4-rpm-dynamics-fusion-research.contract.v1';
import type { TelemetrySourceFamily } from '../../telemetry-source-family';
import type { Ds4RpmRealDataAttestationStateV1 } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-source-attestation.contract.v1';
import type { Ds4RpmRealDataSourceAttestationResultV1 } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-source-attestation.contract.v1';
import type { Ds4RpmRealDataReplayTripArtifactV1 } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-replay.contract.v1';
import type { Ds4RpmRealDataReferenceCohortVehicleLabel } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-source-eligibility.contract.v1';

export const DS4_RPM_REAL_DATA_FUSION_REPLAY_CONTRACT_VERSION =
  'ds4-rpm-real-data-fusion-replay-v1' as const;
export const DS4_RPM_REAL_DATA_FUSION_REPLAY_ORCHESTRATOR_VERSION =
  'ds4-rpm-real-data-fusion-replay-orchestrator-v1' as const;

export type Ds4RpmRealDataFusionReplayOutcomeLabelV1 =
  | 'RESEARCH_REPLAY_EXECUTED'
  | 'FUSION_NOT_AUTHORIZED'
  | 'SOURCE_NOT_ATTESTED'
  | 'TEMPORAL_ALIGNMENT_UNVERIFIED';

export type Ds4RpmRealDataFusionReplayEvidencePolicyV1 =
  | 'OFFLINE_INJECTED_SYNTHETIC_GATE'
  | 'REAL_OBSERVATION_REQUESTED';

export type Ds4RpmRealDataFusionReplayCompletenessRowV1 = {
  dimension: string;
  state: Ds4RpmRealDataAttestationStateV1 | 'UNKNOWN';
  reasonCode: string;
};

export type Ds4RpmRealDataFusionReplayResearchReplayStatusV1 = 'EXECUTED' | 'NOT_EXECUTED';

export type Ds4RpmRealDataFusionReplaySyntheticFusionStatusV1 =
  | 'COMPUTED'
  | 'UNAVAILABLE'
  | 'NOT_RUN';

export type Ds4RpmRealDataFusionReplayRealObservationAuthorizationV1 =
  | 'NOT_AUTHORIZED'
  | 'BLOCKED_BY_POLICY'
  | 'BLOCKED_BY_ATTESTATION'
  | 'BLOCKED_BY_R1';

export type Ds4RpmRealDataFusionReplayMotionProvenanceV1 = {
  motionRunId: string;
  motionEventCount: number;
  /** Offline bundle self-consistency only — not independent DS4 run attestation. */
  offlineBundleIdentityBinding: 'CONSISTENT' | 'REJECTED';
  persistedMotionRunAttestation: 'UNVERIFIED_INJECTED' | 'REJECTED_BINDING_FAILURE';
  externalMotionRunProvenanceDigest: null;
  ds4SpeedBucketCount: number;
};

export type Ds4RpmRealDataFusionReplayR1ContainmentV1 = {
  historicalRpmPointTimeFusionForbidden: true;
  family: TelemetrySourceFamily | 'UNKNOWN';
  r1VetoActive: boolean;
  reasonCodes: readonly string[];
};

export type Ds4RpmRealDataFusionReplayRealObservationStatusV1 = {
  shadowProhibitionEffective: true;
  /** Synthetic COMPUTED fusion never grants REAL_OBSERVATION authorization on this bridge. */
  realObservationFusionAuthorized: false;
  authorizationStatus: Ds4RpmRealDataFusionReplayRealObservationAuthorizationV1;
  policy: Ds4RpmRealDataFusionReplayEvidencePolicyV1;
  blockingReasonCodes: readonly string[];
};

export type Ds4RpmRealDataFusionReplayAlignmentDiagnosticsV1 = {
  sourceTimestampPhase: 'UNKNOWN';
  rpmObservationSupportWidthSeconds: 'UNKNOWN';
  shadowGapDeficiencyEventCount: number;
  alignmentSensitivityProbeCount: number;
  limitations: readonly string[];
};

export type Ds4RpmRealDataFusionReplayArtifactV1 = {
  contractVersion: typeof DS4_RPM_REAL_DATA_FUSION_REPLAY_CONTRACT_VERSION;
  orchestratorVersion: typeof DS4_RPM_REAL_DATA_FUSION_REPLAY_ORCHESTRATOR_VERSION;
  researchOnly: true;
  executionBoundary: 'OFFLINE_INJECTED_BUNDLE_ONLY';
  codeSha: string;
  generatedAtIso: string;
  bundleId: string;
  inputFingerprint: string;
  rpmInputFingerprint: string | null;
  outcomeLabels: readonly Ds4RpmRealDataFusionReplayOutcomeLabelV1[];
  blockingReasons: readonly string[];
  missingEvidenceInventory: readonly string[];
  identity: {
    cohortVehicleLabel: Ds4RpmRealDataReferenceCohortVehicleLabel;
    organizationId: string;
    vehicleId: string;
    tripId: string;
    providerSourceLinkId: string;
  };
  completenessMatrix: readonly Ds4RpmRealDataFusionReplayCompletenessRowV1[];
  sourceAttestation: Ds4RpmRealDataSourceAttestationResultV1;
  sourceAttestationVerdict: 'ATTESTED_FOR_OFFLINE_INJECTION_ONLY' | 'SOURCE_NOT_ATTESTED' | 'BLOCKED';
  shadowReplay: Ds4RpmRealDataReplayTripArtifactV1;
  fusionResult: Ds4RpmDynamicsFusionResearchResultV1 | null;
  researchReplayStatus: Ds4RpmRealDataFusionReplayResearchReplayStatusV1;
  syntheticFusionStatus: Ds4RpmRealDataFusionReplaySyntheticFusionStatusV1;
  fusionEligibility: {
    /** @deprecated Use syntheticFusionStatus — never implies REAL_OBSERVATION authorization. */
    authorized: boolean;
    a2DynamicsStatus: 'COMPUTED' | 'UNAVAILABLE' | 'NOT_RUN';
    ds4EventCoverage: {
      eventCount: number;
      fusionComputedEventCount: number;
    };
    reasonCodes: readonly string[];
  };
  alignmentDiagnostics: Ds4RpmRealDataFusionReplayAlignmentDiagnosticsV1;
  motionProvenance: Ds4RpmRealDataFusionReplayMotionProvenanceV1;
  r1Containment: Ds4RpmRealDataFusionReplayR1ContainmentV1;
  realObservationStatus: Ds4RpmRealDataFusionReplayRealObservationStatusV1;
  scientificLimitations: readonly string[];
  unsupportedScientificClaims: readonly string[];
  deterministicArtifactFingerprint: string;
};
