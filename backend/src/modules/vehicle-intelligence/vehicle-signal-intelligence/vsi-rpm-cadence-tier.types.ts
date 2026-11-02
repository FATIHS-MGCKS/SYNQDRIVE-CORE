export const VSI_RPM_CADENCE_TIER_CONTRACT_VERSION = 'vsi-rpm-cadence-tier-v1' as const;

export type VsiRpmCadenceTierLabel = 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | 'SPARSE' | 'UNKNOWN';

export type VsiRpmCadenceConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Observed active-span coverage relative to canonical trip duration.
 * Not engine-on inference — only sum of active inter-point intervals vs trip window.
 */
export type VsiRpmTripCoverageBand = 'MINIMAL_SPAN' | 'PARTIAL_SPAN' | 'FULL_SPAN';

/**
 * Whether downstream RPM analytics may run at full trip scope for this tier.
 * Deliberately independent from cadenceConfidence.
 */
export type VsiRpmAnalysisReadiness =
  | 'NOT_READY'
  | 'ACTIVE_SPAN_ONLY'
  | 'LIMITED_TRIP'
  | 'TIER_ANALYTICS_OK';

export type VsiRpmCadenceTierDecisionCode =
  | 'EVIDENCE_THIN'
  | 'P50_GT_3S'
  | 'QUORUM'
  | 'IRREGULAR_SPREAD'
  | 'TIER_ASSIGNED';

export type VsiRpmCadenceTierV1 = {
  contractVersion: typeof VSI_RPM_CADENCE_TIER_CONTRACT_VERSION;
  tier: VsiRpmCadenceTierLabel;
  /** Confidence in the effective resolution tier (R4). Null when tier is SPARSE or UNKNOWN. */
  cadenceConfidence: VsiRpmCadenceConfidenceLevel | null;
  decisionCode: VsiRpmCadenceTierDecisionCode;
  decisionSummary: string;
  tierCandidateSeconds: 1 | 2 | 3 | null;
  activeIntervalCount: number;
  qualifyingSequenceCount: number;
  longestSequenceIntervals: number;
  p50ActiveSeconds: number | null;
  p75ActiveSeconds: number | null;
  p90ActiveSeconds: number | null;
  shareLe1s: number | null;
  shareLe2s: number | null;
  shareLe3s: number | null;
  tierPuritySharePlusOne: number | null;
  activeSpanSeconds: number;
  activeSpanRatio: number | null;
  /**
   * Local interval density vs nominal tier grid inside the active span only
   * (c * activeIntervalCount / activeSpanSeconds). NOT global trip completeness.
   */
  activeDensityVsTier: number | null;
  tripCoverageBand: VsiRpmTripCoverageBand | null;
  analysisReadiness: VsiRpmAnalysisReadiness;
  semantics: {
    tierNote: 'EFFECTIVE_RESOLUTION_TIER_NOT_DEVICE_CADENCE';
    bucketNote: 'DIMO_1S_AVG_BUCKETS_NOT_OEM_CAN_HZ';
    gapPolicy: 'MISSING_DATA_NOT_ENGINE_OFF';
    densityNote: 'ACTIVE_SPAN_LOCAL_DENSITY_NOT_GLOBAL_COMPLETENESS';
  };
};
