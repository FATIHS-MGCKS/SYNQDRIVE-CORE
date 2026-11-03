import type { TelemetrySourceFamily } from '../../telemetry-source-family';
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

export type Ds4RpmShadowCorrelationEvidenceKind = 'SYNTHETIC_FIXTURE' | 'REAL_OBSERVATION';

export type Ds4RpmShadowCorrelationSourceTimestampPhase = 'UNKNOWN';

export type Ds4RpmShadowCorrelationReasonCode =
  | 'OK'
  | 'TENANCY_MISMATCH'
  | 'TRIP_ID_MISMATCH'
  | 'MOTION_RUN_MISSING'
  | 'MOTION_RUN_NO_MANOEUVRES'
  | 'MOTION_RUN_BINDING_UNPROVEN'
  | 'V1B_RUN_BINDING_UNPROVEN'
  | 'RPM_SAMPLE_BINDING_UNPROVEN'
  | 'TIMESTAMP_MALFORMED_IN_WINDOW'
  | 'INSUFFICIENT_ADMITTED_TEMPORAL_SUPPORT'
  | 'V1B_RUN_MISSING'
  | 'V1B_NOT_SUCCEEDED'
  | 'V1B_ADMISSION_DENIED'
  | 'RPM_SAMPLE_EVIDENCE_MISSING'
  | 'RPM_SAMPLE_FINGERPRINT_MISMATCH'
  | 'RPM_SAMPLE_POINTS_DIGEST_MISMATCH'
  | 'UNVERIFIED_EVIDENCE_SOURCE_CLAIM'
  | 'V1B_CADENCE_TIER_NOT_AUTHORITATIVE'
  | 'SOURCE_LINK_BINDING_UNPROVEN'
  | 'SOURCE_LINK_MISMATCH'
  | 'EVENT_WINDOW_INVALID'
  | 'NO_TEMPORAL_OVERLAP'
  | 'DUPLICATE_RPM_TIMESTAMPS_IN_WINDOW'
  | 'CONFLICTING_RPM_VALUES_IN_WINDOW'
  | 'AGGREGATE_ONLY_NO_POINT_RECONSTRUCTION'
  | 'REFERENCE_ATTACHMENT_UNAVAILABLE'
  | 'DATASET_GAP'
  | 'ICE_RPM_NOT_APPLICABLE'
  | 'ICE_RPM_EVENT_APPLICABILITY_UNKNOWN'
  | 'R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED'
  | 'SOURCE_FAMILY_BINDING_UNPROVEN'
  | 'ZERO_RPM_OBSERVED_NOT_ENGINE_OFF_INFERENCE'
  | 'LOCAL_EVENT_CADENCE_COARSER_THAN_VSI_TIER';

export type Ds4RpmShadowCorrelationRpmSampleEvidenceV1 = {
  source: 'V1A_TRIP_INPUT' | 'PINNED_FIXTURE' | 'AUTHORIZED_CLICKHOUSE_READ';
  inputFingerprint: string;
  providerSourceLinkId: string | null;
  /**
   * Must be resolved from DIMO vehicle identity (`rawJson`) — never inferred from vehicle model.
   * When absent on REAL_OBSERVATION evidence, source-family authority is unproven.
   */
  telemetrySourceFamily?: TelemetrySourceFamily | null;
  sourceFamilyAttestation?: 'PROVEN_FROM_DIMO_IDENTITY' | 'UNPROVEN' | null;
  points: ReadonlyArray<{ recordedAtIso: string; valueRpm: number }>;
  invalidValueCount: number;
  duplicateTimestampCount: number;
};

export type Ds4RpmShadowCorrelationIceRpmEventApplicability =
  | 'APPLICABLE'
  | 'NOT_APPLICABLE'
  | 'UNKNOWN';

export type Ds4RpmShadowCorrelationRobustDirectionSign =
  | 'INCREASING'
  | 'DECREASING'
  | 'FLAT'
  | 'ABSTAIN_INSUFFICIENT_SUPPORT'
  | 'ABSTAIN_CONFLICTING';

export const DS4_RPM_SHADOW_CORRELATION_RPM_ORDER_STATISTICS_SEMANTICS =
  'DESCRIPTIVE_ORDER_STATISTICS_NOT_TRANSIENT_RESPONSE_PROOF' as const;

export const DS4_RPM_SHADOW_CORRELATION_DIRECTION_ESTIMATE_METHOD =
  'THEIL_SEN_PAIRWISE_SLOPE_SIGN_V1' as const;

export type Ds4RpmShadowCorrelationDirectionSignEnvelopeStability =
  | 'STABLE_ASSESSED'
  | 'UNSTABLE_ASSESSED'
  | 'NOT_ASSESSABLE';

export const DS4_RPM_SHADOW_CORRELATION_GAP_DEFICIENCY_ZERO_SEMANTICS =
  'ZERO_OBSERVATION_SPACING_VS_LOCAL_CADENCE_NOT_PHYSICAL_SENSOR_COVERAGE' as const;

export const DS4_RPM_SHADOW_CORRELATION_MISSING_INTERVAL_ALIAS_SEMANTICS =
  'LEGACY_ALIAS_EQUALS_gapDeficiencySeconds_NOT_EPOCH_GRID_MISSING' as const;

export type Ds4RpmShadowCorrelationDescriptiveRpmStatsV1 = {
  orderStatisticsSemantics: typeof DS4_RPM_SHADOW_CORRELATION_RPM_ORDER_STATISTICS_SEMANTICS;
  directionEstimateMethod: typeof DS4_RPM_SHADOW_CORRELATION_DIRECTION_ESTIMATE_METHOD;
  rpmFirstObserved: number | null;
  rpmLastObserved: number | null;
  /** Time-ordered endpoint delta (rpm); not a transient-response proof. */
  rpmEndpointDelta: number | null;
  /**
   * Sign from Theil–Sen median pairwise slope over time-ordered samples (research diagnostic).
   * Name retained for contract stability; not endpoint-only.
   */
  robustDirectionSign: Ds4RpmShadowCorrelationRobustDirectionSign;
  directionAbstainReason: string | null;
};

export type Ds4RpmShadowCorrelationAlignmentEnvelopeV1 = {
  ds4LabelUncertaintySeconds: number;
  ds4KernelHalfSupportSeconds: number;
  rpmAggregationSupportWidthSeconds: 'UNKNOWN';
  providerTimestampPhase: 'UNKNOWN';
  ds4SideAlignmentBoundSeconds: number;
  offsetSecondsProbed: readonly number[];
  offsetDerivationNote: string;
  classificationStableAcrossEnvelope: boolean;
  /** True only when ≥1 offset yields a non-ABSTAIN direction sign and all such signs agree. */
  directionSignStableAcrossEnvelope: boolean;
  directionSignEnvelopeStability: Ds4RpmShadowCorrelationDirectionSignEnvelopeStability;
};

export type Ds4RpmShadowCorrelationMotionRunRefV1 = {
  runId: string;
  workItemId?: string | null;
  intentKey?: string | null;
  /** Attested motion input identity when independently proven — not algorithm bundle version. */
  inputFingerprint?: string | null;
  /** Attested motion snapshot hash when independently proven — null when unproven. */
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
  gapDeficiencySeconds: number;
  robustDirectionSign: Ds4RpmShadowCorrelationRobustDirectionSign;
  researchDiagnosticOnly: true;
};

export type Ds4RpmShadowCorrelationEffectiveCadenceSource =
  | 'OBSERVED_MEDIAN_IN_WINDOW'
  | 'INFERRED_FROM_VSI_TIER_NOMINAL'
  | 'UNKNOWN';

export type Ds4RpmShadowCorrelationEventTemporalSupportV1 = {
  coverageModelVersion: 'ds4-rpm-shadow-window-relative-gap-v1';
  eventWindowHalfOpenNote: string;
  eventWindowDurationSeconds: number;
  observedPointCountInWindow: number;
  admittedPointCountInLongestSequence: number;
  observedSampleSpanMs: number | null;
  supportedDurationMs: number | null;
  continuousSequenceCountInWindow: number;
  /** Window-relative gap deficiency (translation invariant). Legacy alias semantics for `missingIntervalSecondsInWindow`. */
  gapDeficiencySeconds: number;
  gapDeficiencyZeroSemantics: typeof DS4_RPM_SHADOW_CORRELATION_GAP_DEFICIENCY_ZERO_SEMANTICS;
  missingIntervalSecondsInWindowAliasSemantics: typeof DS4_RPM_SHADOW_CORRELATION_MISSING_INTERVAL_ALIAS_SEMANTICS;
  leadGapSeconds: number;
  trailGapSeconds: number;
  maxInternalGapSeconds: number;
  effectiveInterPointCadenceSeconds: number | null;
  effectiveCadenceSource: Ds4RpmShadowCorrelationEffectiveCadenceSource;
  /** Physical DIMO aggregation support width — not proven in Phase 0. */
  rpmObservationSupportWidthSeconds: 'UNKNOWN';
  /** @deprecated naming — equals `gapDeficiencySeconds` under window-relative model. */
  missingIntervalSecondsInWindow: number;
  sequenceGapRuleSeconds: number | null;
  candidateSequenceFromObservedSamples: true;
  v1bAdmittedEventSpanVerified: false;
  authoritativeCadenceTierForCoverage: 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | null;
  translationInvariantCoverage: true;
};

export type Ds4RpmShadowCorrelationTripLevelReferenceBandV1 = {
  dominantOperatingBand: string | null;
  provenanceSummary: string | null;
  scopeNote: 'TRIP_LEVEL_AGGREGATE_NOT_EVENT_MEASURED';
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
  iceRpmEventApplicability: Ds4RpmShadowCorrelationIceRpmEventApplicability;
  reasonCodes: Ds4RpmShadowCorrelationReasonCode[];
  cadenceTier: string | null;
  cadenceConfidence: string | null;
  analysisReadiness: string | null;
  qualityExposureContractVersion: string | null;
  observedRpmPointCountInWindow: number;
  eventTemporalSupport: Ds4RpmShadowCorrelationEventTemporalSupportV1;
  admittedWindowCoverageNote: string;
  rpmMin: number | null;
  rpmMedian: number | null;
  rpmMax: number | null;
  descriptiveRpmStats: Ds4RpmShadowCorrelationDescriptiveRpmStatsV1;
  observedSampleSpanMs: number | null;
  sourceTimestampPhase: Ds4RpmShadowCorrelationSourceTimestampPhase;
  alignmentEnvelope: Ds4RpmShadowCorrelationAlignmentEnvelopeV1;
  alignmentSensitivity: Ds4RpmShadowCorrelationAlignmentDiagnosticV1[];
  speedOnlyBaselineNote: 'DS4_SPEED_INTENSITY_ONLY_NO_RPM_CLAIM';
};

export type Ds4RpmShadowCorrelationTripReportV1 = {
  contractVersion: typeof DS4_RPM_SHADOW_CORRELATION_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  scenarioId: string | null;
  evidenceKind: Ds4RpmShadowCorrelationEvidenceKind;
  events: Ds4RpmShadowCorrelationEventResultV1[];
  tripLevelReferenceBand: Ds4RpmShadowCorrelationTripLevelReferenceBandV1 | null;
  referenceAttachmentStatus: 'UNAVAILABLE' | 'FIXTURE_VERIFIED';
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
  evidenceKind: Ds4RpmShadowCorrelationEvidenceKind;
  motionRunId: string;
  motionSnapshotHashAttested: string | null;
  v1bRunId: string | null;
  v1bInputFingerprint: string | null;
  v1bInputFingerprintRecomputeMethod: string | null;
  rpmSampleInputFingerprint: string | null;
  rpmSampleSource: string | null;
  v1bEngineVersion: string | null;
  v1bContractVersion: string | null;
  qualityScope: string | null;
  bucketSemanticsNote: string;
  gapInterpretationPolicy: string;
  eventWindowSemanticsNote: string;
  sourceTimestampPhase: Ds4RpmShadowCorrelationSourceTimestampPhase;
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
    evidenceKind: Ds4RpmShadowCorrelationEvidenceKind;
    defensibleContextShareAcrossEvents: number | null;
    defensibleContextShareFixtureScenariosExcludingNegativeControls: number | null;
    negativeControlScenarioIdsExcludedFromPrevalence: string[];
    byTier: Record<
      string,
      { trips: number; defensibleShare: number | null; eventCount: number }
    >;
    byTierFixtureScenariosExcludingNegativeControls: Record<
      string,
      { trips: number; defensibleShare: number | null; eventCount: number }
    >;
  };
  provenance: Ds4RpmShadowCorrelationProvenanceManifestV1;
};
