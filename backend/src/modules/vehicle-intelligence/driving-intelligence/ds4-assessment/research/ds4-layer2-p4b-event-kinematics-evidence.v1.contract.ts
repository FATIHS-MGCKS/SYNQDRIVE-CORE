export const DS4_LAYER2_P4B_EVENT_KINEMATICS_EVIDENCE_SCHEMA_VERSION_V1 =
  'DS4_LAYER2_P4B_EVENT_KINEMATICS_EVIDENCE_V1' as const;

export const DS4_LAYER2_P4B_SIDEcar_ARTIFACT_FILES_V1 = [
  'p4b_manifest.json',
  'p4b_event_speed_evidence.csv',
  'p4b_join_exclusions.csv',
  'p4b_coverage_summary.json',
] as const;

export type Ds4Layer2P4bEvidenceClassV1 = 'PERSISTED_BOUNDARY' | 'DERIVED_IN_WINDOW' | 'UNAVAILABLE';

export type Ds4Layer2P4bPeakEvidenceStatusV1 = 'UNAVAILABLE';

export type Ds4Layer2P4bPeakUnavailabilityReasonV1 = 'NOT_PERSISTED_IN_MOTION_V2_CONTRACT';

export type Ds4Layer2P4bJoinFailureReasonV1 =
  | 'MISSING_PAYLOAD'
  | 'CORRUPT_PAYLOAD'
  | 'SOURCE_RUN_MISMATCH'
  | 'CONTENT_FINGERPRINT_MISMATCH'
  | 'EVENT_INDEX_OUT_OF_RANGE'
  | 'DUPLICATE_EVENT_INDEX'
  | 'KIND_MISMATCH'
  | 'START_LABEL_MISMATCH'
  | 'END_LABEL_MISMATCH'
  | 'MISSING_BOUNDARY_SPEED'
  | 'INVALID_BOUNDARY_SPEED';

export type Ds4Layer2P4bWindowSpeedLimitationV1 =
  | 'INSUFFICIENT_SPEED_SAMPLES'
  | 'BIN_ONLY_SPARSE_SUPPORT'
  | 'NO_NUMERIC_SPEED_IN_WINDOW'
  | 'REPAIR_INFLUENCED_SAMPLE';

export type Ds4Layer2P4bP2AdmissibleEventRowV1 = {
  offlineReconstructionKey: string;
  tripId: string;
  vehicleId: string;
  sourceMotionRunId: string;
  eventIndex: number;
  eventKind: string;
  startLabelUtc: string;
  endLabelUtc: string;
  durationS: number;
  steps: number | null;
  coverageRatio: number | null;
  durationTier: string;
  eligibilityClassification: string;
  speedAuthority: string | null;
};

export type Ds4Layer2P4bEventSpeedEvidenceRowV1 = {
  offlineReconstructionKey: string;
  tripId: string;
  vehicleId: string;
  sourceMotionRunId: string;
  motionContentFingerprint: string;
  sourceMotionRevision: string;
  eventIndex: number;
  eventKind: string;
  startLabelUtc: string;
  endLabelUtc: string;
  durationTier: string;
  eligibilityClassification: string;
  p2SpeedAuthority: string | null;
  payloadSpeedAuthority: string | null;
  startSpeedKmh: number | null;
  endSpeedKmh: number | null;
  boundaryEvidenceClass: Ds4Layer2P4bEvidenceClassV1;
  windowMinSpeedKmh: number | null;
  windowMaxSpeedKmh: number | null;
  windowMeanSpeedKmh: number | null;
  windowSampleCount: number | null;
  windowExpectedSampleCount: number | null;
  windowCoverageRatio: number | null;
  windowEvidenceClass: Ds4Layer2P4bEvidenceClassV1;
  windowLimitationReasonsJson: string;
  repairInfluenced: boolean;
  peakAccelMps2: null;
  peakEvidenceStatus: Ds4Layer2P4bPeakEvidenceStatusV1;
  peakUnavailabilityReason: Ds4Layer2P4bPeakUnavailabilityReasonV1;
  qualityLimitationReasonsJson: string;
};

export type Ds4Layer2P4bJoinExclusionRowV1 = {
  tripId: string;
  sourceMotionRunId: string;
  eventIndex: number | null;
  offlineReconstructionKey: string | null;
  failureReason: Ds4Layer2P4bJoinFailureReasonV1;
  detail: string;
};
