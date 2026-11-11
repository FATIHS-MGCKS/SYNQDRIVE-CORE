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

export type Ds4RpmRealDataFusionReplayMotionProvenanceV1 = {
  motionRunId: string;
  motionEventCount: number;
  motionPayloadIntegrity: 'BOUND_TO_OFFLINE_BUNDLE' | 'REJECTED';
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
  fusionPathAllowed: boolean;
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
  fusionEligibility: {
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
