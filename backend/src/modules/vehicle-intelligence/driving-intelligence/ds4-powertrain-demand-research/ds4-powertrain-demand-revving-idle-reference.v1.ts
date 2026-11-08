import { EXCESSIVE_IDLING_SHADOW_POLICY } from '../../shadow-detector/detectors/excessive-idling-shadow.policy';
import { HIGH_RPM_STATIONARY_SHADOW_POLICY } from '../../shadow-detector/detectors/high-rpm-stationary-shadow.policy';

/**
 * P39 threshold pins (read-only constants — no P39 HF sync or cluster detector import).
 */

export const DS4_REV_HIGH_RPM_P39_THRESHOLD_REFERENCE = {
  shadowPolicyVersion: HIGH_RPM_STATIONARY_SHADOW_POLICY.version,
  stationarySpeedMaxKmh: HIGH_RPM_STATIONARY_SHADOW_POLICY.stationarySpeedMaxKmh,
  defaultIdleRpm: HIGH_RPM_STATIONARY_SHADOW_POLICY.defaultIdleRpm,
  rpmEntryThreshold:
    HIGH_RPM_STATIONARY_SHADOW_POLICY.defaultIdleRpm *
    HIGH_RPM_STATIONARY_SHADOW_POLICY.highRpmIdleMultiplier,
  rpmContinueThreshold:
    HIGH_RPM_STATIONARY_SHADOW_POLICY.defaultIdleRpm *
    HIGH_RPM_STATIONARY_SHADOW_POLICY.continuationRpmMultiplier,
  minObservations: HIGH_RPM_STATIONARY_SHADOW_POLICY.minSynchronizedSamples,
  minResearchLabelSpanMs: HIGH_RPM_STATIONARY_SHADOW_POLICY.minClusterDurationMs,
  maxAdjacentLabelGapMs: HIGH_RPM_STATIONARY_SHADOW_POLICY.clusterMaxGapMs,
} as const;

/**
 * Research Facet B uses a stricter idle-band continuation (upper bound enforced on every label).
 * P39 HF continuation only requires rpm > idleRpmMinMultiplier × defaultIdleRpm (no upper cap).
 */
export const DS4_REV_EXCESSIVE_STATIONARY_P39_THRESHOLD_REFERENCE = {
  shadowPolicyVersion: EXCESSIVE_IDLING_SHADOW_POLICY.version,
  stationarySpeedMaxKmh: EXCESSIVE_IDLING_SHADOW_POLICY.stationarySpeedMaxKmh,
  defaultIdleRpm: EXCESSIVE_IDLING_SHADOW_POLICY.defaultIdleRpm,
  idleRpmBandMinExclusive:
    EXCESSIVE_IDLING_SHADOW_POLICY.defaultIdleRpm *
    EXCESSIVE_IDLING_SHADOW_POLICY.idleRpmMinMultiplier,
  idleRpmBandMaxExclusive:
    EXCESSIVE_IDLING_SHADOW_POLICY.defaultIdleRpm *
    EXCESSIVE_IDLING_SHADOW_POLICY.idleRpmMaxMultiplier,
  minObservations: EXCESSIVE_IDLING_SHADOW_POLICY.minClusterSamples,
  minResearchLabelSpanMs: EXCESSIVE_IDLING_SHADOW_POLICY.minExcessiveIdleDurationMs,
  shortIdleMaxResearchLabelSpanMs: EXCESSIVE_IDLING_SHADOW_POLICY.shortIdleMaxDurationMs,
  maxAdjacentLabelGapMs: EXCESSIVE_IDLING_SHADOW_POLICY.clusterMaxGapMs,
  researchContinuationEnforcesIdleBandUpperBound: true,
} as const;

export const DS4_REVIVING_IDLE_DUAL_FACET_POLICY = {
  facetA: DS4_REV_HIGH_RPM_P39_THRESHOLD_REFERENCE,
  facetB: DS4_REV_EXCESSIVE_STATIONARY_P39_THRESHOLD_REFERENCE,
} as const;

