import type { Ds4LongitudinalLoadKindObservablesV1, Ds4LongitudinalLoadObservablesV1 } from '../ds4-longitudinal-load-observables.v1.contract';

export const DS4_LAYER2_P4E_A3_A4_INTERPRETABILITY_SCHEMA_VERSION_V1 =
  'DS4_LAYER2_P4E_A3_A4_INTERPRETABILITY_V1' as const;

/**
 * Evidence quantity tier for FULL-duration (≥3s) admissible event counts.
 * Reuses existing Layer-2 percentile gates (median @ N≥3, P90 @ N≥10).
 * Describes count support only — not event accuracy or admission confidence.
 */
export type Ds4Layer2P4eFullEventEvidenceQuantityTierV1 =
  | 'UNAVAILABLE'
  | 'FULL_EVENT_COUNT_LT_3'
  | 'FULL_EVENT_COUNT_3_TO_9'
  | 'FULL_EVENT_COUNT_GTE_10';

export type Ds4Layer2P4eA3IntensityDecompositionV1 = {
  /** I_k from load model (`normalizedMeanAccelMps2`) [m/s²]. */
  exposureNormalizedIntensityMps2: number | null;
  /** S_k from load model (`maneuverTimeShare`). */
  admissibleEventTimeShare: number | null;
  /** Duration-weighted mean |a| over admissible events: B_k / Σ T_i [m/s²]. */
  meanEventAccelerationMps2: number | null;
  admissibleDurationSumS: number | null;
  /** S_k × meanEventAcceleration_k [m/s²]; null when decomposition unavailable. */
  reconstructedIntensityMps2: number | null;
  /** I_k − reconstructedIntensity; null when either side unavailable. */
  identityResidualMps2: number | null;
  identityHoldsWithinTolerance: boolean | null;
};

export type Ds4Layer2P4eA4EvidenceSupportAnnotationV1 = {
  fullEventCount: number;
  admissibleEventCount: number;
  evidenceQuantityTier: Ds4Layer2P4eFullEventEvidenceQuantityTierV1;
  /** Human-readable research label (quantity only). */
  evidenceQuantityLabel: string;
  medianFullIntensitySupported: boolean;
  p90FullIntensitySupported: boolean;
};

export type Ds4Layer2P4eKindInterpretabilityV1 = {
  kind: 'acceleration' | 'deceleration';
  loadKindObservables: Ds4LongitudinalLoadKindObservablesV1;
  intensityDecomposition: Ds4Layer2P4eA3IntensityDecompositionV1;
  evidenceSupport: Ds4Layer2P4eA4EvidenceSupportAnnotationV1;
};

export type Ds4Layer2P4eTripInterpretabilityV1 = {
  tripId: string;
  exposureSeconds: number | null;
  longitudinalLoad: Ds4LongitudinalLoadObservablesV1;
  acceleration: Ds4Layer2P4eKindInterpretabilityV1;
  deceleration: Ds4Layer2P4eKindInterpretabilityV1;
};

export type Ds4Layer2P4eCohortInterpretabilitySummaryV1 = {
  schemaVersion: typeof DS4_LAYER2_P4E_A3_A4_INTERPRETABILITY_SCHEMA_VERSION_V1;
  tripCount: number;
  admissibleEventCount: number;
  a3IdentityPassCount: number;
  a3IdentityFailCount: number;
  a3IdentityUnavailableCount: number;
  a4SupportDistribution: Record<Ds4Layer2P4eFullEventEvidenceQuantityTierV1, number>;
};
