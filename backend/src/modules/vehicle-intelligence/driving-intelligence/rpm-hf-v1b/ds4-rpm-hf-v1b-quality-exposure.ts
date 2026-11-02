import type { Ds4RpmHfTierAnalysisMode } from '../ds4-rpm-hf-tier-evidence.types';
import type {
  Ds4RpmHfV1bAdmissionQualityExposureV1,
  Ds4RpmHfV1bQualityScope,
  Ds4RpmHfV1bShadowVariant,
  Ds4RpmHfV1bTemporalCoverage,
  Ds4RpmHfV1bTierEvidenceResultSlice,
} from './ds4-rpm-hf-v1b.contract';

export const DS4_RPM_HF_V1B_ADMISSION_QUALITY_CONTRACT_VERSION =
  'ds4-rpm-hf-v1b-admission-quality-v1' as const;

/**
 * Temporal/RPM metrics are computed from observed HF samples within the canonical trip window.
 * Does not assert DIMO/OEM continuity, engine-on duration, or full-trip RPM observability.
 */
export const DS4_RPM_HF_V1B_QUALITY_SCOPE_OBSERVED_HF_TEMPORAL: Ds4RpmHfV1bQualityScope =
  'OBSERVED_HF_TEMPORAL';

export function buildDs4RpmHfV1bAdmissionQualityExposure(input: {
  shadowVariant: Ds4RpmHfV1bShadowVariant;
  temporalCoverage: Ds4RpmHfV1bTemporalCoverage;
  tierEvidence?: Ds4RpmHfV1bTierEvidenceResultSlice;
}): Ds4RpmHfV1bAdmissionQualityExposureV1 {
  const tier = input.tierEvidence;
  const analysisReadiness = tier?.analysisReadiness ?? null;

  return {
    contractVersion: DS4_RPM_HF_V1B_ADMISSION_QUALITY_CONTRACT_VERSION,
    cadenceTier: tier?.tier ?? null,
    cadenceConfidence: tier?.cadenceConfidence ?? null,
    analysisMode: tier?.analysisMode ?? null,
    analysisReadiness,
    tripCoverageBand: tier?.tripCoverageBand ?? null,
    observedBucketCoverageRatio: input.temporalCoverage.observedBucketCoverageRatio,
    qualityScope: DS4_RPM_HF_V1B_QUALITY_SCOPE_OBSERVED_HF_TEMPORAL,
    tierAnalyticsReady: analysisReadiness === 'TIER_ANALYTICS_OK',
    impliesFullTripCoverage: false,
  };
}

/** @internal exported for tests documenting HIGH_RESOLUTION vs readiness orthogonality */
export function isHighResolutionAnalysisMode(
  mode: Ds4RpmHfTierAnalysisMode | null,
): boolean {
  return mode === 'HIGH_RESOLUTION';
}
