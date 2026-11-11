import type { TelemetrySourceFamily } from '../../telemetry-source-family';
import type {
  Ds4RpmDynamicsResearchResultV1,
  Ds4RpmDynamicsResearchDynamicsStatus,
} from '../ds4-rpm-dynamics-research/ds4-rpm-dynamics-research.contract.v1';
import type {
  Ds4RpmShadowCorrelationAlignmentEnvelopeV1,
  Ds4RpmShadowCorrelationContextClassification,
  Ds4RpmShadowCorrelationEventResultV1,
  Ds4RpmShadowCorrelationEvidenceKind,
  Ds4RpmShadowCorrelationReasonCode,
  Ds4RpmShadowCorrelationSourceTimestampPhase,
} from '../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-v1.contract';
import type { DiV0MotionCoreShadowPersistedEventRow } from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';

export const DS4_RPM_DYNAMICS_FUSION_RESEARCH_CONTRACT_VERSION =
  'ds4-rpm-dynamics-fusion-research-v1' as const;
export const DS4_RPM_DYNAMICS_FUSION_RESEARCH_KERNEL_VERSION =
  'ds4-rpm-dynamics-fusion-kernel-v1' as const;

export type Ds4RpmDynamicsFusionResearchReasonCode =
  | Ds4RpmShadowCorrelationReasonCode
  | 'A2_DYNAMICS_NOT_COMPUTED'
  | 'A2_DYNAMICS_NOT_ASSESSABLE'
  | 'A2_DYNAMICS_ABSTAINED'
  | 'FUSION_LABEL_TIME_HYPOTHESIS_ONLY'
  | 'NO_ADMITTED_PAIRS_IN_EVENT_WINDOW'
  | 'TELEMETRY_SOURCE_FAMILY_UNKNOWN'
  | 'TELEMETRY_SOURCE_FAMILY_CONTRADICTS_DIMO_IDENTITY'
  | 'FUSION_PROVENANCE_EVIDENCE_KIND_MISMATCH'
  | 'FUSION_SYNTHETIC_GATE_REJECTS_REAL_OBSERVATION'
  | 'FUSION_EVIDENCE_ORIGIN_INCOMPATIBLE'
  | 'FUSION_MOTION_EVENT_PAYLOAD_MISMATCH';

export type Ds4RpmDynamicsFusionResearchContextClassification =
  | 'AVAILABLE'
  | 'PARTIAL'
  | 'AMBIGUOUS'
  | 'UNAVAILABLE';

export type Ds4RpmDynamicsFusionResearchAlignmentOffsetDiagnosticV1 = {
  offsetSeconds: number;
  admittedPairCountInWindow: number;
  classification: Ds4RpmDynamicsFusionResearchContextClassification;
  researchDiagnosticOnly: true;
};

export type Ds4RpmDynamicsFusionEventLocalDynamicsV1 = {
  dynamicsStatus: Ds4RpmDynamicsResearchDynamicsStatus;
  localAdmittedPairCount: number;
  deltaDistribution: {
    positiveCount: number;
    negativeCount: number;
    zeroCount: number;
  };
  observedDirectionReversalCount: number;
  minAbsDeltaRpm: number | null;
  maxAbsDeltaRpm: number | null;
  labelGapMsMin: number | null;
  labelGapMsMax: number | null;
};

export type Ds4RpmDynamicsFusionResearchEventResultV1 = {
  eventIndex: number;
  motionEvent: Pick<
    DiV0MotionCoreShadowPersistedEventRow,
    'kind' | 'startLabel' | 'endLabel' | 'quality' | 'flags'
  >;
  /** Unmodified shadow-correlation metrics (Theil–Sen, temporal support). */
  shadowCorrelation: Ds4RpmShadowCorrelationEventResultV1;
  fusionClassification: Ds4RpmDynamicsFusionResearchContextClassification;
  reasonCodes: readonly Ds4RpmDynamicsFusionResearchReasonCode[];
  eventLocalDynamics: Ds4RpmDynamicsFusionEventLocalDynamicsV1 | null;
  alignmentHypothesisNote: 'RESEARCH_LABEL_TIME_HYPOTHESIS_NOT_PHYSICAL_SYNC';
  alignmentEnvelope: Ds4RpmShadowCorrelationAlignmentEnvelopeV1;
  dynamicsAlignmentSensitivity: readonly Ds4RpmDynamicsFusionResearchAlignmentOffsetDiagnosticV1[];
  scientificLimitationFlags: readonly string[];
};

export type Ds4RpmDynamicsFusionResearchResultV1 = {
  contractVersion: typeof DS4_RPM_DYNAMICS_FUSION_RESEARCH_CONTRACT_VERSION;
  kernelVersion: typeof DS4_RPM_DYNAMICS_FUSION_RESEARCH_KERNEL_VERSION;
  researchOnly: true;
  evidenceKind: Ds4RpmShadowCorrelationEvidenceKind;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  providerSourceLinkId: string | null;
  motionRunId: string;
  v1bInputFingerprint: string | null;
  a2ContractVersion: string | null;
  a2KernelVersion: string | null;
  telemetrySourceFamily: TelemetrySourceFamily | null;
  sourceTimestampPhase: Ds4RpmShadowCorrelationSourceTimestampPhase;
  rpmObservationSupportWidthSeconds: 'UNKNOWN';
  status: 'COMPUTED' | 'UNAVAILABLE';
  tripReasonCodes: readonly Ds4RpmDynamicsFusionResearchReasonCode[];
  dynamicsTripResult: Ds4RpmDynamicsResearchResultV1 | null;
  events: readonly Ds4RpmDynamicsFusionResearchEventResultV1[];
  scientificGuards: {
    notPhysicalSynchronization: true;
    notCausalRpmResponse: true;
    notGearShiftConfirmation: true;
    notEngineLoadFromRpmAlone: true;
    notMisuseOrScoring: true;
    r1TemporalFusionIneligible: true;
    unknownSourceFamilyUntrusted: true;
  };
  unsupportedScientificClaims: readonly string[];
};
