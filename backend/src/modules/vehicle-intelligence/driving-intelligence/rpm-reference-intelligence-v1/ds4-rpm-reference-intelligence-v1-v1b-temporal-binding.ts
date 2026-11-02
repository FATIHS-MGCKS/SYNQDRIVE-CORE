import type { Ds4RpmHfV1bAdmissionQualityExposureV1 } from '../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import {
  resolveTemporalCadenceProfileForTier,
  type Ds4RpmHfV1bTemporalCadenceProfile,
} from '../rpm-hf-v1b/ds4-rpm-hf-v1b-temporal.engine';

export type Ds4RpmReferenceIntelligenceV1AuthoritativeV1bTemporalV1 = {
  /**
   * From V1B tier evidence slice (`temporalCadenceProfile`) when present.
   * Must not be inferred from HF point spacing.
   */
  temporalCadenceProfile: Ds4RpmHfV1bTemporalCadenceProfile | null;
  /** VSI-authorized cadence tier echoed by V1B quality exposure / tier evidence. */
  cadenceTier: string | null;
};

const KNOWN_VSI_CADENCE_TIERS = ['RPM_1S', 'RPM_2S', 'RPM_3S'] as const;

export type Ds4RpmReferenceIntelligenceV1SequenceGapResolution = {
  sequenceMaxGapSeconds: number | null;
  cadenceTier: string | null;
  temporalCadenceProfile: Ds4RpmHfV1bTemporalCadenceProfile | null;
};

function isKnownCadenceTier(tier: string | null | undefined): tier is (typeof KNOWN_VSI_CADENCE_TIERS)[number] {
  return tier != null && (KNOWN_VSI_CADENCE_TIERS as readonly string[]).includes(tier);
}

/**
 * Resolve continuous-sequence gap limit from authoritative V1B/VSI temporal evidence only.
 */
export function resolveDs4RpmReferenceIntelligenceV1SequenceMaxGap(input: {
  authoritativeV1bTemporal?: Ds4RpmReferenceIntelligenceV1AuthoritativeV1bTemporalV1 | null;
  qualityExposure?: Ds4RpmHfV1bAdmissionQualityExposureV1 | null;
}): Ds4RpmReferenceIntelligenceV1SequenceGapResolution {
  const block = input.authoritativeV1bTemporal ?? null;
  const profileFromEvidence = block?.temporalCadenceProfile ?? null;
  if (profileFromEvidence) {
    return {
      sequenceMaxGapSeconds: profileFromEvidence.sequenceMaxGapSeconds,
      cadenceTier: block?.cadenceTier ?? input.qualityExposure?.cadenceTier ?? null,
      temporalCadenceProfile: profileFromEvidence,
    };
  }

  const tier =
    (isKnownCadenceTier(block?.cadenceTier) ? block.cadenceTier : null) ??
    (isKnownCadenceTier(input.qualityExposure?.cadenceTier)
      ? input.qualityExposure!.cadenceTier
      : null);

  if (tier != null) {
    const profile = resolveTemporalCadenceProfileForTier(tier);
    return {
      sequenceMaxGapSeconds: profile.sequenceMaxGapSeconds,
      cadenceTier: tier,
      temporalCadenceProfile: profile,
    };
  }

  return {
    sequenceMaxGapSeconds: null,
    cadenceTier: block?.cadenceTier ?? input.qualityExposure?.cadenceTier ?? null,
    temporalCadenceProfile: null,
  };
}
