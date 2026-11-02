import type { VsiIceRpmApplicability } from '../../vehicle-signal-intelligence/vsi-profile-cadence.types';
import type { Ds4RpmHfV1bAdmissionQualityExposureV1 } from '../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import type { Ds4RpmReferenceIntelligenceV1AuthoritativeV1bTemporalV1 } from './ds4-rpm-reference-intelligence-v1-v1b-temporal-binding';

export const DS4_RPM_REFERENCE_INTELLIGENCE_V1_CONTRACT_VERSION =
  'ds4-rpm-reference-intelligence-v1' as const;

/** Stable reason codes — contract surface for consumers and tests. */
export const DS4_RPM_REF_INTEL_REASON = {
  HF_TELEMETRY_MISSING: 'RPM_REF_INTEL_HF_TELEMETRY_MISSING',
  HF_ADMISSION_NOT_ELIGIBLE: 'RPM_REF_INTEL_HF_ADMISSION_NOT_ELIGIBLE',
  ICE_RPM_NOT_APPLICABLE: 'RPM_REF_INTEL_ICE_RPM_NOT_APPLICABLE',
  REFERENCE_SPEC_UNAVAILABLE: 'RPM_REF_INTEL_REFERENCE_SPEC_UNAVAILABLE',
  REFERENCE_PAIR_INCONSISTENT: 'RPM_REF_INTEL_REFERENCE_PAIR_INCONSISTENT',
  REFERENCE_PROVENANCE_DOWNGRADED: 'RPM_REF_INTEL_REFERENCE_PROVENANCE_DOWNGRADED',
  REFERENCE_PROVENANCE_UNKNOWN: 'RPM_REF_INTEL_REFERENCE_PROVENANCE_UNKNOWN',
  V1B_TEMPORAL_PROFILE_UNAVAILABLE: 'RPM_REF_INTEL_V1B_TEMPORAL_PROFILE_UNAVAILABLE',
  INSUFFICIENT_ELIGIBLE_OBSERVATION: 'RPM_REF_INTEL_INSUFFICIENT_ELIGIBLE_OBSERVATION',
  VSI_TIER_ANALYTICS_NOT_READY: 'RPM_REF_INTEL_VSI_TIER_ANALYTICS_NOT_READY',
  NORMALIZED_OUT_OF_RANGE_OBSERVED: 'RPM_REF_INTEL_NORMALIZED_OUT_OF_RANGE_OBSERVED',
} as const;

export type Ds4RpmReferenceIntelligenceV1ReasonCode =
  (typeof DS4_RPM_REF_INTEL_REASON)[keyof typeof DS4_RPM_REF_INTEL_REASON];

export type Ds4RpmReferenceIntelligenceV1Availability = 'KNOWN' | 'PARTIAL' | 'UNKNOWN';

export type Ds4RpmReferenceSpecProvenanceClass =
  | 'USER_CONFIRMED'
  | 'AI_ESTIMATED'
  | 'KNOWLEDGE_ONLY'
  | 'UNKNOWN'
  | 'MISSING';

export type Ds4RpmReferenceIntelligenceV1ReferenceQualityV1 = {
  contractVersion: 'ds4-rpm-reference-spec-quality-v1';
  idleRpmProvenance: Ds4RpmReferenceSpecProvenanceClass;
  maxRpmProvenance: Ds4RpmReferenceSpecProvenanceClass;
  pairConsistent: boolean;
  iceRpmApplicability: VsiIceRpmApplicability;
  referenceTrustTier: 'OEM_USER_CONFIRMED' | 'DOWNGRADED_ESTIMATE' | 'UNAVAILABLE';
};

export type Ds4RpmReferenceIntelligenceV1HfQualityV1 = {
  contractVersion: 'ds4-rpm-reference-hf-quality-v1';
  /** Orthogonal to reference spec quality — sourced from V1B admission exposure when provided. */
  qualityExposure: Ds4RpmHfV1bAdmissionQualityExposureV1 | null;
  observedPointCount: number;
  eligibleContinuousSequenceCount: number;
  eligibleObservedDurationSeconds: number;
  authoritativeSequenceMaxGapSeconds: number | null;
  authoritativeCadenceTier: string | null;
};

export type Ds4RpmReferenceIntelligenceV1ReferenceSnapshotV1 = {
  idleRpm: number | null;
  maxRpm: number | null;
  referenceSpanRpm: number | null;
};

export type Ds4RpmReferenceIntelligenceV1NormalizedPositionV1 = {
  /** Raw (obs - idle) / (max - idle); not clamped. */
  rawNormalizedMin: number | null;
  rawNormalizedMax: number | null;
  rawNormalizedMedian: number | null;
  observedSampleCount: number;
  belowReferenceIdleCount: number;
  aboveReferenceMaxCount: number;
  /** Optional presentation clamp in [0,1]; not used for load inference. */
  clampedNormalizedMedian: number | null;
};

export type Ds4RpmReferenceIntelligenceV1IdleProximityV1 = {
  /** Minimum absolute RPM distance to idle target across eligible samples. */
  minAbsRpmFromIdle: number | null;
  /** Minimum raw normalized distance to 0 (idle reference). */
  minRawNormalizedFromIdle: number | null;
  /** Share of eligible observation mass within idle proximity band (see engine constants). */
  timeShareNearIdle: number | null;
};

export type Ds4RpmReferenceOperatingBandId =
  | 'BELOW_IDLE_REFERENCE'
  | 'IDLE_PROXIMITY'
  | 'LOW'
  | 'MID'
  | 'HIGH'
  | 'NEAR_MAX'
  | 'ABOVE_MAX_REFERENCE';

export type Ds4RpmReferenceIntelligenceV1OperatingBandsV1 = {
  /** Absolute RPM min/median/max on eligible samples (telemetry-only). */
  observedRpmMin: number | null;
  observedRpmMedian: number | null;
  observedRpmMax: number | null;
  /** Time-weighted shares on eligible intervals (no gap interpolation). */
  timeShareByBand: Partial<Record<Ds4RpmReferenceOperatingBandId, number>>;
  totalEligibleWeightedSeconds: number;
};

export type Ds4RpmReferenceIntelligenceV1TimeWeightedExposureV1 = {
  /** Sum of interval weights on eligible continuous sequences only. */
  totalEligibleWeightedSeconds: number;
  /** Trip window duration when trip bounds provided; null otherwise. */
  tripWindowDurationSeconds: number | null;
  /** 1 - (eligible mass / trip window) when trip window known; else null. */
  uncoveredTripMassRatio: number | null;
  impliesFullTripCoverage: false;
};

export type Ds4RpmReferenceIntelligenceV1MetricsV1 = {
  normalizedPosition: Ds4RpmReferenceIntelligenceV1NormalizedPositionV1 | null;
  idleProximity: Ds4RpmReferenceIntelligenceV1IdleProximityV1 | null;
  operatingBands: Ds4RpmReferenceIntelligenceV1OperatingBandsV1;
  timeWeightedExposure: Ds4RpmReferenceIntelligenceV1TimeWeightedExposureV1;
};

export type Ds4RpmReferenceIntelligenceV1SemanticGuardV1 = {
  /** Normalized RPM position is not engine load, wear, or driving impact. */
  normalizedRpmIsEngineLoadProxy: false;
  referenceMetadataDoesNotSubstituteHfTelemetry: true;
};

export type Ds4RpmReferenceIntelligenceV1Result = {
  contractVersion: typeof DS4_RPM_REFERENCE_INTELLIGENCE_V1_CONTRACT_VERSION;
  semanticGuard: Ds4RpmReferenceIntelligenceV1SemanticGuardV1;
  availability: Ds4RpmReferenceIntelligenceV1Availability;
  reasonCodes: Ds4RpmReferenceIntelligenceV1ReasonCode[];
  referenceQuality: Ds4RpmReferenceIntelligenceV1ReferenceQualityV1;
  hfQuality: Ds4RpmReferenceIntelligenceV1HfQualityV1;
  referenceSnapshot: Ds4RpmReferenceIntelligenceV1ReferenceSnapshotV1;
  metrics: Ds4RpmReferenceIntelligenceV1MetricsV1 | null;
};

export type Ds4RpmReferenceIntelligenceV1HfPoint = {
  recordedAtIso: string;
  valueRpm: number;
};

export type Ds4RpmReferenceIntelligenceV1HfAdmissionSlice = {
  processingAllowed: boolean;
  iceRpmApplicability: VsiIceRpmApplicability;
};

export type Ds4RpmReferenceIntelligenceV1ComputeInput = {
  tripStartIso?: string;
  tripEndIso?: string;
  reference: {
    idleRpm: number | null;
    maxRpm: number | null;
    idleRpmProvenance: Ds4RpmReferenceSpecProvenanceClass;
    maxRpmProvenance: Ds4RpmReferenceSpecProvenanceClass;
    iceRpmApplicability: VsiIceRpmApplicability;
  };
  hf: {
    points: ReadonlyArray<Ds4RpmReferenceIntelligenceV1HfPoint>;
    admission: Ds4RpmReferenceIntelligenceV1HfAdmissionSlice;
    qualityExposure?: Ds4RpmHfV1bAdmissionQualityExposureV1 | null;
    /** Authoritative V1B/VSI temporal evidence for sequence gap limits (not inferred from HF). */
    authoritativeV1bTemporal?: Ds4RpmReferenceIntelligenceV1AuthoritativeV1bTemporalV1 | null;
  };
  /** Minimum eligible weighted seconds before band/normalized aggregates publish as KNOWN. */
  minEligibleWeightedSecondsForKnown?: number;
};
