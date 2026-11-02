import {
  splitIntervalsIntoActiveMeasurementSequences,
  VSI_ACTIVE_RPM_ACTIVE_SEQUENCE_GAP_BREAK_SECONDS,
  VSI_ACTIVE_RPM_MIN_SEQUENCE_INTERVALS,
} from './vsi-active-rpm-sequence-cadence.util';
import {
  VSI_RPM_CADENCE_TIER_CONTRACT_VERSION,
  type VsiRpmAnalysisReadiness,
  type VsiRpmCadenceConfidenceLevel,
  type VsiRpmCadenceTierDecisionCode,
  type VsiRpmCadenceTierLabel,
  type VsiRpmCadenceTierV1,
  type VsiRpmTripCoverageBand,
} from './vsi-rpm-cadence-tier.types';

export {
  VSI_RPM_CADENCE_TIER_CONTRACT_VERSION,
  type VsiRpmCadenceTierV1,
  type VsiRpmCadenceTierLabel,
} from './vsi-rpm-cadence-tier.types';

/** Active measurement intervals are those at most this many seconds (FABLE R0–R4). */
export const VSI_RPM_CADENCE_TIER_ACTIVE_INTERVAL_MAX_SECONDS =
  VSI_ACTIVE_RPM_ACTIVE_SEQUENCE_GAP_BREAK_SECONDS;

export const VSI_RPM_CADENCE_TIER_MIN_RPM_POINTS = 10;
export const VSI_RPM_CADENCE_TIER_MIN_ACTIVE_INTERVALS = 3;
/** Target observed active time floor: ceil(QUORUM_SECONDS / c) intervals. */
export const VSI_RPM_CADENCE_TIER_QUORUM_OBSERVED_SECONDS = 40;

export const VSI_RPM_CADENCE_TIER_PURITY_HIGH_MIN = 0.8;
export const VSI_RPM_CADENCE_TIER_PURITY_MEDIUM_MIN = 0.7;
export const VSI_RPM_CADENCE_TIER_P90_HIGH_MAX_OFFSET_SECONDS = 2;
export const VSI_RPM_CADENCE_TIER_P90_MEDIUM_MAX_OFFSET_SECONDS = 3;
export const VSI_RPM_CADENCE_TIER_LONGEST_SEQUENCE_HIGH_MIN = 9;
/** Effective tier upper bounds on active P50 (seconds between samples). */
export const VSI_RPM_CADENCE_TIER_P50_MAX_SECONDS_TIER_1 = 1;
export const VSI_RPM_CADENCE_TIER_P50_MAX_SECONDS_TIER_2 = 2;
export const VSI_RPM_CADENCE_TIER_P50_MAX_SECONDS_TIER_3 = 3;

/** P75 spread gate: active P75 must be <= tier + this offset or SPARSE. */
export const VSI_RPM_CADENCE_TIER_P75_SPREAD_MAX_OFFSET_SECONDS = 1;

export const VSI_RPM_CADENCE_TIER_COVERAGE_MINIMAL_SPAN_MAX = 0.15;
export const VSI_RPM_CADENCE_TIER_COVERAGE_PARTIAL_SPAN_MAX = 0.4;

export type VsiRpmCadenceTierTuning = {
  quorumObservedSeconds: number;
  purityHighMin: number;
  purityMediumMin: number;
  p75SpreadMaxOffsetSeconds: number;
  p90HighMaxOffsetSeconds: number;
  p90MediumMaxOffsetSeconds: number;
  longestSequenceHighMin: number;
};

export const VSI_RPM_CADENCE_TIER_DEFAULT_TUNING: VsiRpmCadenceTierTuning = {
  quorumObservedSeconds: VSI_RPM_CADENCE_TIER_QUORUM_OBSERVED_SECONDS,
  purityHighMin: VSI_RPM_CADENCE_TIER_PURITY_HIGH_MIN,
  purityMediumMin: VSI_RPM_CADENCE_TIER_PURITY_MEDIUM_MIN,
  p75SpreadMaxOffsetSeconds: VSI_RPM_CADENCE_TIER_P75_SPREAD_MAX_OFFSET_SECONDS,
  p90HighMaxOffsetSeconds: VSI_RPM_CADENCE_TIER_P90_HIGH_MAX_OFFSET_SECONDS,
  p90MediumMaxOffsetSeconds: VSI_RPM_CADENCE_TIER_P90_MEDIUM_MAX_OFFSET_SECONDS,
  longestSequenceHighMin: VSI_RPM_CADENCE_TIER_LONGEST_SEQUENCE_HIGH_MIN,
};

export type VsiRpmCadenceTierInput = {
  /** Distinct intra-trip interval seconds (positive). */
  intervalsSec: readonly number[];
  rpmPointCount: number;
  tripDurationSeconds: number;
  tuning?: VsiRpmCadenceTierTuning;
};

function shareLe(active: number[], threshold: number): number | null {
  if (active.length === 0) return null;
  return active.filter((s) => s <= threshold).length / active.length;
}

/** Matches FABLE offline replay percentile indexing (frozen cohort evidence). */
export function fablePercentileSeconds(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))] ?? null;
}

function resolveTierCandidateSeconds(p50: number | null): 1 | 2 | 3 | null {
  if (p50 == null) return null;
  if (p50 <= VSI_RPM_CADENCE_TIER_P50_MAX_SECONDS_TIER_1) return 1;
  if (p50 <= VSI_RPM_CADENCE_TIER_P50_MAX_SECONDS_TIER_2) return 2;
  if (p50 <= VSI_RPM_CADENCE_TIER_P50_MAX_SECONDS_TIER_3) return 3;
  return null;
}

function resolveTripCoverageBand(activeSpanRatio: number | null): VsiRpmTripCoverageBand | null {
  if (activeSpanRatio == null) return null;
  if (activeSpanRatio < VSI_RPM_CADENCE_TIER_COVERAGE_MINIMAL_SPAN_MAX) {
    return 'MINIMAL_SPAN';
  }
  if (activeSpanRatio < VSI_RPM_CADENCE_TIER_COVERAGE_PARTIAL_SPAN_MAX) {
    return 'PARTIAL_SPAN';
  }
  return 'FULL_SPAN';
}

function resolveAnalysisReadiness(input: {
  tier: VsiRpmCadenceTierLabel;
  cadenceConfidence: VsiRpmCadenceConfidenceLevel | null;
  tripCoverageBand: VsiRpmTripCoverageBand | null;
}): VsiRpmAnalysisReadiness {
  if (input.tier === 'UNKNOWN' || input.tier === 'SPARSE') {
    return 'NOT_READY';
  }
  if (input.tripCoverageBand === 'MINIMAL_SPAN') {
    return 'ACTIVE_SPAN_ONLY';
  }
  if (input.tripCoverageBand === 'PARTIAL_SPAN') {
    return 'LIMITED_TRIP';
  }
  if (input.cadenceConfidence === 'LOW') {
    return 'LIMITED_TRIP';
  }
  return 'TIER_ANALYTICS_OK';
}

function resolveCadenceConfidence(input: {
  tierSeconds: 1 | 2 | 3;
  purity: number;
  p90: number | null;
  longestSequenceIntervals: number;
  tuning: VsiRpmCadenceTierTuning;
}): VsiRpmCadenceConfidenceLevel {
  const { tierSeconds, purity, p90, longestSequenceIntervals, tuning } = input;
  if (
    purity >= tuning.purityHighMin &&
    p90 != null &&
    p90 <= tierSeconds + tuning.p90HighMaxOffsetSeconds &&
    longestSequenceIntervals >= tuning.longestSequenceHighMin
  ) {
    return 'HIGH';
  }
  if (
    purity >= tuning.purityMediumMin &&
    p90 != null &&
    p90 <= tierSeconds + tuning.p90MediumMaxOffsetSeconds
  ) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function emptyMetrics(tripDurationSeconds: number): Pick<
  VsiRpmCadenceTierV1,
  | 'activeIntervalCount'
  | 'qualifyingSequenceCount'
  | 'longestSequenceIntervals'
  | 'p50ActiveSeconds'
  | 'p75ActiveSeconds'
  | 'p90ActiveSeconds'
  | 'shareLe1s'
  | 'shareLe2s'
  | 'shareLe3s'
  | 'tierPuritySharePlusOne'
  | 'activeSpanSeconds'
  | 'activeSpanRatio'
  | 'activeDensityVsTier'
> {
  return {
    activeIntervalCount: 0,
    qualifyingSequenceCount: 0,
    longestSequenceIntervals: 0,
    p50ActiveSeconds: null,
    p75ActiveSeconds: null,
    p90ActiveSeconds: null,
    shareLe1s: null,
    shareLe2s: null,
    shareLe3s: null,
    tierPuritySharePlusOne: null,
    activeSpanSeconds: 0,
    activeSpanRatio: tripDurationSeconds > 0 ? 0 : null,
    activeDensityVsTier: null,
  };
}

/**
 * Deterministic FABLE multi-cadence tier classifier (R0–R4).
 * Does not mutate legacy RPM_1HZ / RPM_STANDARD labels.
 */
export function classifyVsiRpmCadenceTierV1(input: VsiRpmCadenceTierInput): VsiRpmCadenceTierV1 {
  const tuning = input.tuning ?? VSI_RPM_CADENCE_TIER_DEFAULT_TUNING;
  const semantics = {
    tierNote: 'EFFECTIVE_RESOLUTION_TIER_NOT_DEVICE_CADENCE' as const,
    bucketNote: 'DIMO_1S_AVG_BUCKETS_NOT_OEM_CAN_HZ' as const,
    gapPolicy: 'MISSING_DATA_NOT_ENGINE_OFF' as const,
    densityNote: 'ACTIVE_SPAN_LOCAL_DENSITY_NOT_GLOBAL_COMPLETENESS' as const,
  };

  const active = input.intervalsSec.filter(
    (s) => s > 0 && s <= VSI_RPM_CADENCE_TIER_ACTIVE_INTERVAL_MAX_SECONDS,
  );
  const sortedActive = [...active].sort((a, b) => a - b);
  const rawSequences = splitIntervalsIntoActiveMeasurementSequences(input.intervalsSec);
  const qualifyingSequences = rawSequences.filter(
    (seq) => seq.length >= VSI_ACTIVE_RPM_MIN_SEQUENCE_INTERVALS,
  );
  const longestSequenceIntervals = qualifyingSequences.reduce(
    (max, seq) => Math.max(max, seq.length),
    0,
  );

  /** Active P50 for R1 uses FABLE replay ceil-index percentile (not arithmetic median when n is even). */
  const p50 = fablePercentileSeconds(sortedActive, 50);
  const p75 = fablePercentileSeconds(sortedActive, 75);
  const p90 = fablePercentileSeconds(sortedActive, 90);
  const share1 = shareLe(active, 1);
  const share2 = shareLe(active, 2);
  const share3 = shareLe(active, 3);
  const activeSpanSeconds = active.reduce((sum, s) => sum + s, 0);
  const activeSpanRatio =
    input.tripDurationSeconds > 0 ? activeSpanSeconds / input.tripDurationSeconds : null;
  const tripCoverageBand = resolveTripCoverageBand(activeSpanRatio);

  const baseMetrics = {
    activeIntervalCount: active.length,
    qualifyingSequenceCount: qualifyingSequences.length,
    longestSequenceIntervals,
    p50ActiveSeconds: p50,
    p75ActiveSeconds: p75,
    p90ActiveSeconds: p90,
    shareLe1s: share1,
    shareLe2s: share2,
    shareLe3s: share3,
    tierPuritySharePlusOne: null as number | null,
    activeSpanSeconds,
    activeSpanRatio,
    activeDensityVsTier: null as number | null,
  };

  if (
    input.rpmPointCount < VSI_RPM_CADENCE_TIER_MIN_RPM_POINTS ||
    active.length < VSI_RPM_CADENCE_TIER_MIN_ACTIVE_INTERVALS
  ) {
    return {
      contractVersion: VSI_RPM_CADENCE_TIER_CONTRACT_VERSION,
      tier: 'UNKNOWN',
      cadenceConfidence: null,
      decisionCode: 'EVIDENCE_THIN',
      decisionSummary: 'Insufficient RPM points or active intervals for tier classification.',
      tierCandidateSeconds: resolveTierCandidateSeconds(p50),
      ...baseMetrics,
      tripCoverageBand,
      analysisReadiness: 'NOT_READY',
      semantics,
    };
  }

  const tierSeconds = resolveTierCandidateSeconds(p50);
  if (tierSeconds == null) {
    return {
      contractVersion: VSI_RPM_CADENCE_TIER_CONTRACT_VERSION,
      tier: 'SPARSE',
      cadenceConfidence: null,
      decisionCode: 'P50_GT_3S',
      decisionSummary: 'Active interval P50 exceeds 3s — no RPM_1S/2S/3S tier.',
      tierCandidateSeconds: null,
      ...baseMetrics,
      tripCoverageBand,
      analysisReadiness: 'NOT_READY',
      semantics,
    };
  }

  const quorumIntervals = Math.ceil(tuning.quorumObservedSeconds / tierSeconds);
  if (active.length < quorumIntervals) {
    return {
      contractVersion: VSI_RPM_CADENCE_TIER_CONTRACT_VERSION,
      tier: 'UNKNOWN',
      cadenceConfidence: null,
      decisionCode: 'QUORUM',
      decisionSummary: `Active interval count ${active.length} below quorum ${quorumIntervals} for tier ${tierSeconds}s.`,
      tierCandidateSeconds: tierSeconds,
      ...baseMetrics,
      tripCoverageBand,
      analysisReadiness: 'NOT_READY',
      semantics,
    };
  }

  if (p75 != null && p75 > tierSeconds + tuning.p75SpreadMaxOffsetSeconds) {
    return {
      contractVersion: VSI_RPM_CADENCE_TIER_CONTRACT_VERSION,
      tier: 'SPARSE',
      cadenceConfidence: null,
      decisionCode: 'IRREGULAR_SPREAD',
      decisionSummary: `Active P75 ${p75}s exceeds tier ${tierSeconds}s spread gate.`,
      tierCandidateSeconds: tierSeconds,
      ...baseMetrics,
      tripCoverageBand,
      analysisReadiness: 'NOT_READY',
      semantics,
    };
  }

  const purity = shareLe(active, tierSeconds + 1) ?? 0;
  const activeDensityVsTier =
    activeSpanSeconds > 0 ? (tierSeconds * active.length) / activeSpanSeconds : null;
  const cadenceConfidence = resolveCadenceConfidence({
    tierSeconds,
    purity,
    p90,
    longestSequenceIntervals,
    tuning,
  });
  const tierLabel: VsiRpmCadenceTierLabel = `RPM_${tierSeconds}S` as VsiRpmCadenceTierLabel;
  const decisionCode: VsiRpmCadenceTierDecisionCode = 'TIER_ASSIGNED';

  return {
    contractVersion: VSI_RPM_CADENCE_TIER_CONTRACT_VERSION,
    tier: tierLabel,
    cadenceConfidence,
    decisionCode,
    decisionSummary: `Tier ${tierLabel} from active P50=${p50}s P75=${p75}s purity=${purity.toFixed(3)}.`,
    tierCandidateSeconds: tierSeconds,
    ...baseMetrics,
    tierPuritySharePlusOne: purity,
    activeDensityVsTier,
    tripCoverageBand,
    analysisReadiness: resolveAnalysisReadiness({
      tier: tierLabel,
      cadenceConfidence,
      tripCoverageBand,
    }),
    semantics,
  };
}

/** @internal Exported for frozen replay sensitivity matrix only. */
export function classifyVsiRpmCadenceTierV1WithTuning(
  input: Omit<VsiRpmCadenceTierInput, 'tuning'>,
  tuning: VsiRpmCadenceTierTuning,
): VsiRpmCadenceTierV1 {
  return classifyVsiRpmCadenceTierV1({ ...input, tuning });
}
