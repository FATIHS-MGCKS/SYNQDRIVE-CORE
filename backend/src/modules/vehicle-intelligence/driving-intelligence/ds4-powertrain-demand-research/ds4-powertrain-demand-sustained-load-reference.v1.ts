import { SUSTAINED_HIGH_LOAD_SHADOW_POLICY } from '../../shadow-detector/detectors/sustained-high-load-shadow.policy';

/**
 * Research gap-aware sustained-load thresholds aligned to P37 reference policy
 * (read-only constants — no P37 cluster/severity import).
 */
export const DS4_SUSTAINED_LOAD_P37_THRESHOLD_REFERENCE = {
  shadowPolicyVersion: SUSTAINED_HIGH_LOAD_SHADOW_POLICY.version,
  highEngineLoadEntryPct: SUSTAINED_HIGH_LOAD_SHADOW_POLICY.highEngineLoadPct,
  highEngineLoadContinuePct: SUSTAINED_HIGH_LOAD_SHADOW_POLICY.highEngineLoadPct - 5,
  minRpm: SUSTAINED_HIGH_LOAD_SHADOW_POLICY.minRpm,
  highThrottlePct: SUSTAINED_HIGH_LOAD_SHADOW_POLICY.highThrottlePct,
  minResearchLabelSpanMs: SUSTAINED_HIGH_LOAD_SHADOW_POLICY.minSustainedDurationMs,
  maxAdjacentLabelGapMs: SUSTAINED_HIGH_LOAD_SHADOW_POLICY.clusterMaxGapMs,
} as const;

/** Research-only admission floor (P2-B3); P37 production uses minClusterSamples=4. */
export const DS4_SUSTAINED_LOAD_RESEARCH_MIN_OBSERVATIONS = 5 as const;

export const DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY = {
  ...DS4_SUSTAINED_LOAD_P37_THRESHOLD_REFERENCE,
  minObservations: DS4_SUSTAINED_LOAD_RESEARCH_MIN_OBSERVATIONS,
} as const;
