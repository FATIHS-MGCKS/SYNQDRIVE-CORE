import type { Ds4RpmHfV1bShadowResultV1 } from '../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import type { Ds4RpmReferenceIntelligenceV1V1bShadowSummaryAttachmentV1 } from '../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1-v1b-shadow-attach';
import type { DiV0MotionCoreShadowPersistedEventRow } from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';

export const DS4_RPM_SHADOW_CORRELATION_CONTRACT_VERSION =
  'ds4-rpm-shadow-correlation-v1' as const;

export type Ds4RpmShadowCorrelationContextClassification =
  | 'AVAILABLE'
  | 'PARTIAL'
  | 'AMBIGUOUS'
  | 'UNAVAILABLE';

export type Ds4RpmShadowCorrelationReasonCode =
  | 'OK'
  | 'TENANCY_MISMATCH'
  | 'TRIP_ID_MISMATCH'
  | 'MOTION_RUN_MISSING'
  | 'V1B_RUN_MISSING'
  | 'V1B_NOT_SUCCEEDED'
  | 'V1B_ADMISSION_DENIED'
  | 'RPM_SAMPLE_EVIDENCE_MISSING'
  | 'RPM_SAMPLE_FINGERPRINT_MISMATCH'
  | 'SOURCE_LINK_MISMATCH'
  | 'EVENT_WINDOW_INVALID'
  | 'NO_TEMPORAL_OVERLAP'
  | 'DUPLICATE_RPM_TIMESTAMPS_IN_WINDOW'
  | 'CONFLICTING_RPM_VALUES_IN_WINDOW'
  | 'AGGREGATE_ONLY_NO_POINT_RECONSTRUCTION'
  | 'REFERENCE_ATTACHMENT_UNAVAILABLE'
  | 'DATASET_GAP';

export type Ds4RpmShadowCorrelationRpmSampleEvidenceV1 = {
  source: 'V1A_TRIP_INPUT' | 'PINNED_FIXTURE' | 'AUTHORIZED_CLICKHOUSE_READ';
  inputFingerprint: string;
  providerSourceLinkId: string | null;
  points: ReadonlyArray<{ recordedAtIso: string; valueRpm: number }>;
  invalidValueCount: number;
  duplicateTimestampCount: number;
};

export type Ds4RpmShadowCorrelationMotionRunRefV1 = {
  runId: string;
  workItemId?: string | null;
  intentKey?: string | null;
  inputFingerprint?: string | null;
  pinnedSnapshotHash?: string | null;
};

export type Ds4RpmShadowCorrelationV1bRunRefV1 = {
  runId: string;
  engineVersion: string;
  inputFingerprint: string;
  summary: Ds4RpmHfV1bShadowResultV1;
  rpmReferenceIntelligenceV1?: Ds4RpmReferenceIntelligenceV1V1bShadowSummaryAttachmentV1;
};

export type Ds4RpmShadowCorrelationInputV1 = {
  contractVersion: typeof DS4_RPM_SHADOW_CORRELATION_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  motion: Ds4RpmShadowCorrelationMotionRunRefV1;
  events: ReadonlyArray<DiV0MotionCoreShadowPersistedEventRow>;
  v1b: Ds4RpmShadowCorrelationV1bRunRefV1 | null;
  rpmSamples: Ds4RpmShadowCorrelationRpmSampleEvidenceV1 | null;
};

export type Ds4RpmShadowCorrelationAlignmentDiagnosticV1 = {
  offsetSeconds: number;
  observedPointCount: number;
  classification: Ds4RpmShadowCorrelationContextClassification;
};

export type Ds4RpmShadowCorrelationEventResultV1 = {
  eventIndex: number;
  eventId: string;
  kind: string;
  startLabelUtc: string;
  endLabelUtc: string;
  ds4EventQuality: string;
  ds4MeanAccelMps2: number | null;
  ds4DurationS: number | null;
  contextClassification: Ds4RpmShadowCorrelationContextClassification;
  reasonCodes: Ds4RpmShadowCorrelationReasonCode[];
  cadenceTier: string | null;
  cadenceConfidence: string | null;
  analysisReadiness: string | null;
  qualityExposureContractVersion: string | null;
  observedRpmPointCountInWindow: number;
  admittedWindowCoverageNote: string;
  rpmMin: number | null;
  rpmMedian: number | null;
  rpmMax: number | null;
  alignmentUncertaintyMs: number | null;
  referenceOperatingBand: string | null;
  referenceProvenanceSummary: string | null;
  alignmentSensitivity: Ds4RpmShadowCorrelationAlignmentDiagnosticV1[];
  speedOnlyBaselineNote: 'DS4_SPEED_INTENSITY_ONLY_NO_RPM_CLAIM';
};

export type Ds4RpmShadowCorrelationTripReportV1 = {
  contractVersion: typeof DS4_RPM_SHADOW_CORRELATION_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  scenarioId: string | null;
  events: Ds4RpmShadowCorrelationEventResultV1[];
  summary: {
    totalEvents: number;
    eventsWithDefensibleContext: number;
    defensibleContextShare: number | null;
    byContextClassification: Record<Ds4RpmShadowCorrelationContextClassification, number>;
    byCadenceTier: Record<string, number>;
  };
  ds4OnlyBaseline: {
    eventCount: number;
    intensityEligibleNote: 'UNCHANGED_BY_HARNESS';
  };
  provenance: Ds4RpmShadowCorrelationProvenanceManifestV1;
};

export type Ds4RpmShadowCorrelationProvenanceManifestV1 = {
  codeSha: string;
  generatedAtIso: string;
  motionRunId: string;
  v1bRunId: string | null;
  v1bInputFingerprint: string | null;
  rpmSampleInputFingerprint: string | null;
  rpmSampleSource: string | null;
  v1bEngineVersion: string | null;
  v1bContractVersion: string | null;
  qualityScope: string | null;
  bucketSemanticsNote: string;
  gapInterpretationPolicy: string;
  omissions: string[];
  unknowns: string[];
};

export type Ds4RpmShadowCorrelationCohortReportV1 = {
  contractVersion: typeof DS4_RPM_SHADOW_CORRELATION_CONTRACT_VERSION;
  cohortId: string;
  tripReports: Ds4RpmShadowCorrelationTripReportV1[];
  aggregate: {
    tripCount: number;
    datasetGaps: string[];
    defensibleContextShareAcrossEvents: number | null;
    byTier: Record<
      string,
      { trips: number; defensibleShare: number | null; eventCount: number }
    >;
  };
  provenance: Ds4RpmShadowCorrelationProvenanceManifestV1;
};
