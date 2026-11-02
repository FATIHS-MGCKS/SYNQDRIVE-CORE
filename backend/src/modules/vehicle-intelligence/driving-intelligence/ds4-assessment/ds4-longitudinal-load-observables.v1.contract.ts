import type { Ds4SpeedAuthorityPartitionV1, Ds4TripAssessmentStatusV1 } from './ds4-trip-assessment-v1.contract';
import type { Ds4DrivingExposureV1 } from './ds4-assessment-driving-exposure.v1';
import type { Ds4EventIntensityEligibilityRecordV1 } from './ds4-assessment-event-intensity-eligibility.v1';

/** Layer 2 longitudinal load observables (Fable LAYERED_LONGITUDINAL_LOAD_OBSERVABLES_V1). */
export const DS4_LONGITUDINAL_LOAD_OBSERVABLES_MODEL_VERSION_V1 = 'DS4_LOAD_OBSERVABLES_V1' as const;

/** E_min / c_min gates are not calibrated — normalized fields remain internal-only. */
export const DS4_LONGITUDINAL_LOAD_EXPOSURE_GATE_UNCALIBRATED = 'UNCALIBRATED' as const;

export type Ds4LongitudinalLoadExposureGateV1 = typeof DS4_LONGITUDINAL_LOAD_EXPOSURE_GATE_UNCALIBRATED;

export type Ds4LongitudinalLoadReasonCodeV1 =
  | 'EVIDENCE_QUALITY_NOT_PRESENT'
  | 'LONGITUDINAL_EVIDENCE_API_SYNTHETIC_POSITION_NOT_PRESENT'
  | 'LONGITUDINAL_EVIDENCE_API_SYNTHETIC_SPEED_AUTHORITY_AMBIGUOUS'
  | 'LONGITUDINAL_EVIDENCE_API_SYNTHETIC_EXPOSURE_OR_TEMPORAL_FAIL'
  | 'LONGITUDINAL_EVIDENCE_API_SYNTHETIC_RATED_EVENTS_ABSENT'
  | 'ASSESSMENT_STATUS_NOT_ELIGIBLE'
  | 'DRIVING_EXPOSURE_NOT_DERIVABLE'
  | 'EXPOSURE_SECONDS_INVALID'
  | 'DISTANCE_KM_INVALID'
  | 'EVENT_RECORDS_INCONSISTENT'
  | 'DUPLICATE_EVENT_INDEX'
  | 'NON_FINITE_INPUT'
  | 'ZERO_ADMISSIBLE_WITH_EXCLUDED_EVENTS'
  | 'COLLECTION_INCOMPLETE';

/** Assessment statuses that permit Layer 2 computation (same as L2 evidence collection). */
export const DS4_LONGITUDINAL_LOAD_ELIGIBLE_ASSESSMENT_STATUSES_V1: readonly Ds4TripAssessmentStatusV1[] = [
  'RATED',
  'UNRATED_COUNTS_ONLY',
] as const;

export type Ds4LongitudinalLoadImpulseSemanticsV1 =
  | 'SPECIFIC_LONGITUDINAL_IMPULSE_MPS'
  | 'INTENSITY_DURATION_PROXY_MPS'
  | 'UNAVAILABLE';

export type Ds4LongitudinalLoadKindObservablesV1 = {
  admissibleEventCount: number;
  fullEventCount: number;
  binOnlyEventCount: number;
  /** B_k = sum(a_i * T_i) when admissible; [m/s] under secant intensity semantics. */
  specificLongitudinalImpulseMps: number | null;
  impulseSemantics: Ds4LongitudinalLoadImpulseSemanticsV1;
  /** I_k = B_k / E_s [m/s²]; null when trip-level gates fail. */
  normalizedMeanAccelMps2: number | null;
  /** Phi_k = 60 * N_k / E_s [events/min]. */
  eventFrequencyPerMinute: number | null;
  /** Phi_d_k = N_k / D [events/km]; null when D invalid. */
  eventFrequencyPerKm: number | null;
  /** S_k = sum(T_i) / E_s [dimensionless]. */
  maneuverTimeShare: number | null;
  /** Median of FULL (>=3s) admissible intensities [m/s²]; requires N_FULL >= 3. */
  intensityMedianFullMps2: number | null;
  /** 90th percentile of FULL intensities [m/s²]; requires N_FULL >= 10. */
  intensityP90FullMps2: number | null;
  /** Max over all admissible intensities [m/s²]. */
  intensityMaxAdmissibleMps2: number | null;
};

export type Ds4LongitudinalLoadObservablesV1 = {
  modelVersion: typeof DS4_LONGITUDINAL_LOAD_OBSERVABLES_MODEL_VERSION_V1;
  exposureGate: Ds4LongitudinalLoadExposureGateV1;
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
  exposureSeconds: number | null;
  distanceKm: number | null;
  /** v_bar = 3600 * D / E_s [km/h] when exposure and distance valid. */
  meanMovingSpeedKmh: number | null;
  /** qualifyingIntervalCount / fsmMovingDirectLabelCount when provenance present. */
  exposureCoverageRatio: number | null;
  reasonCodes: Ds4LongitudinalLoadReasonCodeV1[];
  /** True when event list length matches accepted manoeuvre coverage expectation. */
  collectionComplete: boolean;
  acceleration: Ds4LongitudinalLoadKindObservablesV1;
  deceleration: Ds4LongitudinalLoadKindObservablesV1;
};

export type Ds4LongitudinalLoadObservablesInputV1 = {
  assessmentStatus: Ds4TripAssessmentStatusV1;
  evidenceQuality: string | null;
  /** API_SYNTHETIC family-specific detail when EVIDENCE_QUALITY_NOT_PRESENT (additive). */
  longitudinalEvidenceSupplementaryReasonCodes?: Ds4LongitudinalLoadReasonCodeV1[];
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
  ratedEventCount: number;
  unratedEventCount: number;
  artefactSuspectCount: number;
  drivingExposure: Ds4DrivingExposureV1;
  eventIntensityRecords: readonly Ds4EventIntensityEligibilityRecordV1[];
};
