/**
 * DBI D8 V2 — two-layer event intelligence (research sidecar only).
 * Does not modify frozen D8 V1 gates or W1C metric counting.
 */

import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import { deriveDs4DrivingExposureV1 } from '../ds4-assessment-driving-exposure.v1';
import type { Ds4DbiW0MbfReasonCodeV1, Ds4DbiW0TripKernelResultV1 } from './ds4-dbi-w0-mbf.types.v1';
import type { Ds4DbiW0TripMetaV1 } from './ds4-dbi-w0-mbf-kernel.v1';
import { deriveTripFailClosedFromDiagnosticsV1 } from './ds4-dbi-w1c-trip-assessment-projector.v1';
import {
  buildDs4DbiW0MovingExposureClockEvidenceV1,
  resolveW0SpeedAuthorityPartitionV1,
  type Ds4DbiW0AdmittedEventOnsetV1,
} from './ds4-dbi-w0-moving-exposure-clock.v1';

export const DS4_DBI_D8_V2_CONTRACT_VERSION = 'ds4-dbi-d8-v2-research-v1' as const;

export type Ds4DbiD8V2DescriptiveStatusV1 =
  | 'NO_EVENTS_OBSERVED'
  | 'DESCRIPTIVE_RESULT_AVAILABLE'
  | 'NOT_EVALUABLE';

export type Ds4DbiD8V2InferenceStatusV1 =
  | 'STATISTICAL_RESULT_AVAILABLE'
  | 'INSUFFICIENT_INFORMATION'
  | 'NOT_EVALUABLE';

export type Ds4DbiD8V2CoverageClassV1 = 'FULL' | 'PARTIAL' | 'DEGRADED';

export type Ds4DbiD8V2ReasonCodeV1 =
  | 'D8V2_OK'
  | 'D8V2_FAIL_CLOSED'
  | 'D8V2_EXPOSURE_NOT_DERIVABLE'
  | 'D8V2_COVERAGE_DEGRADED'
  | 'D8V2_INSUFFICIENT_EVENTS'
  | 'D8V2_METADATA_MISMATCH'
  | 'D8V2_NO_STATISTICAL_INFERENCE_AT_SMALL_N';

export const DS4_DBI_D8_V2_INTERPRETATION_LIMITS_V1 = [
  'NO_COMPOSITE_DBI_SCORE',
  'ABSENCE_OF_EVENTS_IS_NOT_SAFETY',
  'DESCRIPTIVE_LAYER_IS_NOT_DRIVING_STYLE_VERDICT',
  'INFERENCE_REQUIRES_PREREGISTERED_NMIN',
  'GREENWOOD_NULL_IS_IID_UNIFORM_TAU_CONDITIONAL',
  'NOT_INDEPENDENT_SCIENTIFIC_VALIDATION',
  'DS4_EVENT_DETECTOR_NOT_DUPLICATED',
] as const;

/**
 * Preregistered n_min from offline power calibration (Fable 2026-11-07).
 * At α=0.05 upper tail, MC seed 20261107, 40k alt draws per scenario:
 * n=8 → ~0.71 against 75% events in 10% E*; n=10 → ~0.94 same alternative.
 */
export const DS4_DBI_D8_V2_RESEARCH_NMIN_V1 = 10;

export const DS4_DBI_D8_V2_NULL_MC_SEED_V1 = 20261107;

export const DS4_DBI_D8_V2_DEFAULT_NULL_DRAWS_V1 = 50_000;

/** Share-of-gaps metric threshold (descriptive only; not used for event-group chaining). */
export const DS4_DBI_D8_V2_SHORT_GAP_TAU_SECONDS_V1 = 30;

/**
 * Maximal descriptive event groups: chain consecutive events while inter-event gap ≤ this value.
 * (Tesla 2026-11-07: gaps 63 s / 69 s form one 3-event span of 132 s; 482 s isolates the fourth.)
 */
export const DS4_DBI_D8_V2_DESCRIPTIVE_GROUP_MAX_INTER_EVENT_GAP_SECONDS_V1 = 120;

export type Ds4DbiD8V2PowerCalibrationRowV1 = {
  n: number;
  nullP95: number;
  powerHalfIn5Pct: number;
  power75In10Pct: number;
  powerAllIn25Pct: number;
};

/** Documented power table (research); not used for per-trip tuning. */
export const DS4_DBI_D8_V2_PREREGISTERED_POWER_TABLE_V1: readonly Ds4DbiD8V2PowerCalibrationRowV1[] = [
  { n: 4, nullP95: 0.509, powerHalfIn5Pct: 0.12, power75In10Pct: 0.26, powerAllIn25Pct: 0.32 },
  { n: 6, nullP95: 0.374, powerHalfIn5Pct: 0.21, power75In10Pct: 0.67, powerAllIn25Pct: 0.73 },
  { n: 8, nullP95: 0.294, powerHalfIn5Pct: 0.3, power75In10Pct: 0.71, powerAllIn25Pct: 1.0 },
  { n: 10, nullP95: 0.241, powerHalfIn5Pct: 0.39, power75In10Pct: 0.94, powerAllIn25Pct: 1.0 },
  { n: 12, nullP95: 0.203, powerHalfIn5Pct: 0.48, power75In10Pct: 0.94, powerAllIn25Pct: 1.0 },
  { n: 15, nullP95: 0.164, powerHalfIn5Pct: 0.68, power75In10Pct: 0.98, powerAllIn25Pct: 1.0 },
];

export type Ds4DbiD8V2EventClusterV1 = {
  startTauSeconds: number;
  endTauSeconds: number;
  eventCount: number;
};

export type Ds4DbiD8V2EventRefV1 = {
  kind: string;
  startLabel: string;
  endLabel: string;
  tauSeconds: number;
};

export type Ds4DbiD8V2DescriptiveV1 = {
  status: Ds4DbiD8V2DescriptiveStatusV1;
  totalEventCount: number;
  admittedEventCount: number;
  excludedEventCount: number;
  excludedReasonCodes: string[];
  accelerationCount: number;
  brakingCount: number;
  otherKindCount: number;
  movingExposureSeconds: number | null;
  detectionOpportunitySeconds: number | null;
  coverageClass: Ds4DbiD8V2CoverageClassV1;
  coverageLimitations: string[];
  ratePerMovingMinute: number | null;
  rateCi95: { lo: number | null; hi: number | null; method: 'GARWOOD_EXACT' } | null;
  interEventGapsTauSeconds: number[];
  minGapTauSeconds: number | null;
  medianGapTauSeconds: number | null;
  shareGapsWithin30s: number | null;
  clusters: Ds4DbiD8V2EventClusterV1[];
  eventRefs: Ds4DbiD8V2EventRefV1[];
  reasonCodes: Ds4DbiD8V2ReasonCodeV1[];
};

export type Ds4DbiD8V2InferenceV1 = {
  status: Ds4DbiD8V2InferenceStatusV1;
  statistic: 'GREENWOOD_NORMALIZED_SPACINGS';
  observedGreenwoodG: number | null;
  nullExpectation: number | null;
  nullQuantiles: { p05: number; p50: number; p95: number } | null;
  percentile: number | null;
  pValueUpper: number | null;
  nullMethod: 'CONDITIONAL_MC_FIXED_SEED';
  nullDraws: number;
  seed: number;
  nMinInference: number;
  eventsNeededForInference: number | null;
  normalizedSpacings: number[] | null;
  reasonCodes: Ds4DbiD8V2ReasonCodeV1[];
  assumptions: readonly string[];
};

export type Ds4DbiD8V2V1ReferenceV1 = {
  status: string;
  indexOfDispersion: number | null;
  nonEmptyWindowCount: number | null;
  totalWindowSlots: number | null;
  eventCount: number | null;
  reasonCodes: readonly string[];
};

export type Ds4DbiD8V2ResultV1 = {
  contractVersion: typeof DS4_DBI_D8_V2_CONTRACT_VERSION;
  w0TripFailClosed: boolean;
  w0TripFailClosedReasonCodes: readonly Ds4DbiW0MbfReasonCodeV1[];
  descriptive: Ds4DbiD8V2DescriptiveV1;
  inference: Ds4DbiD8V2InferenceV1;
  v1Reference: Ds4DbiD8V2V1ReferenceV1;
  interpretationLimits: readonly string[];
};

export function deriveDs4DbiD8V2W0TripFailClosedV1(kernel: Ds4DbiW0TripKernelResultV1): {
  tripFailClosed: boolean;
  typedReasons: readonly Ds4DbiW0MbfReasonCodeV1[];
  bindingRejected: boolean;
} {
  const derived = deriveTripFailClosedFromDiagnosticsV1(kernel);
  return {
    tripFailClosed: derived.tripFailClosed || derived.projectionFailures.length > 0,
    typedReasons: derived.typedReasons,
    bindingRejected: derived.projectionFailures.length > 0,
  };
}

/** Deterministic PRNG (LCG-style) for conditional null MC. */
export function mulberry32D8V2(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Greenwood on normalized event times in [0,1] (includes boundary spacings). */
export function greenwoodNormalizedSpacingsV1(normalizedOnsets: readonly number[]): number {
  const s = [...normalizedOnsets].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (s.length === 0) {
    return 1;
  }
  let prev = 0;
  let g = 0;
  for (const x of s) {
    const d = x - prev;
    g += d * d;
    prev = x;
  }
  const tail = 1 - prev;
  g += tail * tail;
  return g;
}

/** Exact conditional expectation under IID Uniform order statistics on [0,1]. */
export function greenwoodNullExpectationV1(eventCount: number): number {
  if (eventCount < 0) {
    return Number.NaN;
  }
  return 2 / (eventCount + 2);
}

/** One conditional-null draw: n uniform points on [0,1]. */
export function sampleGreenwoodNullDrawV1(eventCount: number, rand: () => number): number {
  const pts: number[] = [];
  for (let i = 0; i < eventCount; i += 1) {
    pts.push(rand());
  }
  return greenwoodNormalizedSpacingsV1(pts);
}

export type Ds4DbiD8V2GreenwoodNullReferenceV1 = {
  eventCount: number;
  nullExpectation: number;
  nullQuantiles: { p05: number; p50: number; p95: number };
  nullDraws: number;
  seed: number;
  samples: readonly number[];
};

export function buildGreenwoodConditionalNullReferenceV1(input: {
  eventCount: number;
  nullDraws?: number;
  seed?: number;
}): Ds4DbiD8V2GreenwoodNullReferenceV1 {
  const n = input.eventCount;
  const draws = input.nullDraws ?? DS4_DBI_D8_V2_DEFAULT_NULL_DRAWS_V1;
  const seed = input.seed ?? DS4_DBI_D8_V2_NULL_MC_SEED_V1;
  const rand = mulberry32D8V2(seed);
  const samples = new Float64Array(draws);
  for (let i = 0; i < draws; i += 1) {
    samples[i] = sampleGreenwoodNullDrawV1(n, rand);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
  return {
    eventCount: n,
    nullExpectation: greenwoodNullExpectationV1(n),
    nullQuantiles: { p05: q(0.05), p50: q(0.5), p95: q(0.95) },
    nullDraws: draws,
    seed,
    samples: [...sorted],
  };
}

export function greenwoodUpperTailPValueV1(
  observed: number,
  nullSamples: readonly number[],
): { pValueUpper: number; percentile: number } {
  if (nullSamples.length === 0) {
    return { pValueUpper: 1, percentile: 0.5 };
  }
  let ge = 0;
  for (const v of nullSamples) {
    if (v >= observed) {
      ge += 1;
    }
  }
  const p = ge / nullSamples.length;
  return { pValueUpper: p, percentile: 1 - p };
}

function gammaFn(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
  }
  z -= 1;
  let x = c[0]!;
  for (let i = 1; i < g + 2; i += 1) {
    x += c[i]! / (z + i);
  }
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * t ** (z + 0.5) * Math.exp(-t) * x;
}

function gammaLowerIncomplete(s: number, x: number): number {
  let sum = 1 / s;
  let term = 1 / s;
  for (let k = 1; k < 500; k += 1) {
    term *= x / (s + k);
    sum += term;
    if (Math.abs(term) < 1e-15) {
      break;
    }
  }
  return Math.exp(-x + s * Math.log(Math.max(x, 1e-300))) * sum / gammaFn(s);
}

function poissonCdf(k: number, lam: number): number {
  return 1 - gammaLowerIncomplete(k + 1, lam);
}

function solveBinary(f: (x: number) => number, lo: number, hi: number): number {
  for (let i = 0; i < 80; i += 1) {
    const m = (lo + hi) / 2;
    if (f(m) > 0) {
      lo = m;
    } else {
      hi = m;
    }
  }
  return (lo + hi) / 2;
}

/** Exact Garwood (gamma/Poisson) 95 % CI for event rate per moving minute. */
export function garwoodPoissonRatePerMinuteCiV1(input: {
  admittedEventCount: number;
  movingExposureSeconds: number;
  alpha?: number;
}): { lo: number | null; hi: number | null; method: 'GARWOOD_EXACT' } {
  const n = input.admittedEventCount;
  const eStar = input.movingExposureSeconds;
  const alpha = input.alpha ?? 0.05;
  if (!Number.isFinite(eStar) || eStar <= 0) {
    return { lo: null, hi: null, method: 'GARWOOD_EXACT' };
  }
  const minutes = eStar / 60;
  if (n === 0) {
    const lamHi = solveBinary((l) => poissonCdf(n, l) - alpha / 2, 0, 1e6);
    return { lo: null, hi: lamHi / minutes, method: 'GARWOOD_EXACT' };
  }
  const lamLo = solveBinary((l) => 1 - poissonCdf(n - 1, l) - alpha / 2, 0, 1e6);
  const lamHi = solveBinary((l) => poissonCdf(n, l) - alpha / 2, 0, 1e6);
  return { lo: lamLo / minutes, hi: lamHi / minutes, method: 'GARWOOD_EXACT' };
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) {
    return null;
  }
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function buildEventClustersV1(
  sortedTau: readonly number[],
  maxGapS: number,
): Ds4DbiD8V2EventClusterV1[] {
  if (sortedTau.length === 0) {
    return [];
  }
  const clusters: Ds4DbiD8V2EventClusterV1[] = [];
  let start = sortedTau[0]!;
  let prev = sortedTau[0]!;
  let count = 1;
  for (let i = 1; i < sortedTau.length; i += 1) {
    const t = sortedTau[i]!;
    if (t - prev <= maxGapS) {
      count += 1;
      prev = t;
    } else {
      clusters.push({ startTauSeconds: start, endTauSeconds: prev, eventCount: count });
      start = t;
      prev = t;
      count = 1;
    }
  }
  clusters.push({ startTauSeconds: start, endTauSeconds: prev, eventCount: count });
  return clusters;
}

export function resolveD8V2CoverageClassV1(input: {
  derivable: boolean;
  payload: DiV0MotionCoreShadowPayloadV1;
  speedAuthority: ReturnType<typeof resolveW0SpeedAuthorityPartitionV1>;
  metadataMismatch: boolean;
}): { coverageClass: Ds4DbiD8V2CoverageClassV1; limitations: string[] } {
  const limitations: string[] = [];
  if (!input.derivable) {
    return { coverageClass: 'DEGRADED', limitations: ['EXPOSURE_NOT_DERIVABLE'] };
  }
  const sparse = input.payload.contract.sparse;
  if (sparse?.comparable === false) {
    limitations.push('SPARSE_NOT_COMPARABLE');
  }
  if (input.metadataMismatch) {
    limitations.push('MOVING_EXPOSURE_METADATA_MISMATCH');
  }
  if (Array.isArray(sparse?.limitations)) {
    for (const lim of sparse.limitations) {
      if (typeof lim === 'string' && lim.length > 0) {
        limitations.push(lim);
      }
    }
  }
  const exposure = deriveDs4DrivingExposureV1({
    payload: input.payload,
    speedAuthority: input.speedAuthority,
  });
  const prov = exposure.provenance;
  const okCount = input.payload.speeds.filter((r) => r.quality === 'OK').length;
  const noPos = input.payload.speeds.filter((r) => r.quality === 'NO_POSITION').length;
  const totalSpeed = input.payload.speeds.length;
  const okShare = totalSpeed > 0 ? okCount / totalSpeed : 0;
  if (prov.canonicalSpeedSeriesMissing) {
    limitations.push('CANONICAL_SPEED_SERIES_MISSING');
    return { coverageClass: 'DEGRADED', limitations };
  }
  if (okShare < 0.5) {
    limitations.push('LOW_OK_SPEED_SHARE');
    return { coverageClass: 'DEGRADED', limitations };
  }
  if (prov.excludedGapIntervalCount > 0) {
    limitations.push(`EXCLUDED_GAP_INTERVALS_${prov.excludedGapIntervalCount}`);
  }
  if (limitations.length >= 2 || okShare < 0.65 || noPos / Math.max(totalSpeed, 1) > 0.15) {
    return { coverageClass: 'PARTIAL', limitations };
  }
  if (limitations.length > 0) {
    return { coverageClass: 'PARTIAL', limitations };
  }
  return { coverageClass: 'FULL', limitations };
}

function eventKindCounts(
  payload: DiV0MotionCoreShadowPayloadV1,
  admitted: readonly Ds4DbiW0AdmittedEventOnsetV1[],
): { acceleration: number; braking: number; other: number; refs: Ds4DbiD8V2EventRefV1[] } {
  const byLabel = new Map(payload.events.map((e) => [e.startLabel, e]));
  let acceleration = 0;
  let braking = 0;
  let other = 0;
  const refs: Ds4DbiD8V2EventRefV1[] = [];
  for (const a of admitted) {
    const ev = byLabel.get(a.startLabel);
    const kind = ev?.kind ?? 'UNKNOWN';
    if (kind === 'ACCELERATION') {
      acceleration += 1;
    } else if (kind === 'DECELERATION') {
      braking += 1;
    } else {
      other += 1;
    }
    refs.push({
      kind,
      startLabel: a.startLabel,
      endLabel: ev?.endLabel ?? a.startLabel,
      tauSeconds: a.tauSeconds,
    });
  }
  return { acceleration, braking, other, refs };
}

export function computeDs4DbiD8V2EventIntelligenceV1(input: {
  payload: DiV0MotionCoreShadowPayloadV1;
  clock: ReturnType<typeof buildDs4DbiW0MovingExposureClockEvidenceV1>;
  v1D8: Ds4DbiW0TripKernelResultV1['d8Burstiness'];
  w0TripFailClosed: boolean;
  w0TripFailClosedReasonCodes: readonly Ds4DbiW0MbfReasonCodeV1[];
  nullDraws?: number;
  seed?: number;
}): Ds4DbiD8V2ResultV1 {
  const failClosed = input.w0TripFailClosed;
  const speedAuthority = resolveW0SpeedAuthorityPartitionV1(input.payload);
  const { coverageClass, limitations: coverageLimitations } = resolveD8V2CoverageClassV1({
    derivable: input.clock.derivable,
    payload: input.payload,
    speedAuthority,
    metadataMismatch: input.clock.metadataMismatch,
  });

  const dual = input.clock.dualTime;
  const eStar = input.clock.derivable ? input.clock.movingExposureSeconds : null;
  const admitted = input.clock.admitted;
  const sortedTau = admitted.map((a) => a.tauSeconds).sort((a, b) => a - b);
  const gaps =
    sortedTau.length >= 2 ? sortedTau.slice(1).map((t, i) => t - sortedTau[i]!) : [];
  const kinds = eventKindCounts(input.payload, admitted);

  const descReasons: Ds4DbiD8V2ReasonCodeV1[] = [];
  let descStatus: Ds4DbiD8V2DescriptiveStatusV1 = 'NOT_EVALUABLE';

  if (failClosed) {
    descReasons.push('D8V2_FAIL_CLOSED');
    descStatus = 'NOT_EVALUABLE';
  } else if (!input.clock.derivable || eStar == null || eStar <= 0) {
    descReasons.push('D8V2_EXPOSURE_NOT_DERIVABLE');
  } else if (coverageClass === 'DEGRADED') {
    descReasons.push('D8V2_COVERAGE_DEGRADED');
    descStatus = 'NOT_EVALUABLE';
  } else if (admitted.length === 0) {
    descStatus = 'NO_EVENTS_OBSERVED';
    descReasons.push('D8V2_OK');
  } else {
    descStatus = 'DESCRIPTIVE_RESULT_AVAILABLE';
    descReasons.push('D8V2_OK');
  }

  const rate =
    !failClosed && eStar != null && eStar > 0 && descStatus !== 'NOT_EVALUABLE'
      ? admitted.length / (eStar / 60)
      : null;
  const rateCi =
    !failClosed && eStar != null && descStatus !== 'NOT_EVALUABLE'
      ? garwoodPoissonRatePerMinuteCiV1({ admittedEventCount: admitted.length, movingExposureSeconds: eStar })
      : null;

  const within30 =
    !failClosed && gaps.length > 0
      ? gaps.filter((g) => g <= DS4_DBI_D8_V2_SHORT_GAP_TAU_SECONDS_V1).length / gaps.length
      : null;

  const descriptive: Ds4DbiD8V2DescriptiveV1 = failClosed
    ? {
        status: 'NOT_EVALUABLE',
        totalEventCount: input.payload.events.length,
        admittedEventCount: 0,
        excludedEventCount: 0,
        excludedReasonCodes: [],
        accelerationCount: 0,
        brakingCount: 0,
        otherKindCount: 0,
        movingExposureSeconds: null,
        detectionOpportunitySeconds: null,
        coverageClass,
        coverageLimitations: [...coverageLimitations, 'W0_TRIP_FAIL_CLOSED'],
        ratePerMovingMinute: null,
        rateCi95: null,
        interEventGapsTauSeconds: [],
        minGapTauSeconds: null,
        medianGapTauSeconds: null,
        shareGapsWithin30s: null,
        clusters: [],
        eventRefs: [],
        reasonCodes: descReasons,
      }
    : {
        status: descStatus,
        totalEventCount: input.payload.events.length,
        admittedEventCount: admitted.length,
        excludedEventCount: dual.excludedEventCount,
        excludedReasonCodes: [...dual.eventMappingReasonCodes],
        accelerationCount: kinds.acceleration,
        brakingCount: kinds.braking,
        otherKindCount: kinds.other,
        movingExposureSeconds: eStar,
        detectionOpportunitySeconds: dual.movingExposureSeconds,
        coverageClass,
        coverageLimitations,
        ratePerMovingMinute: rate,
        rateCi95: rateCi,
        interEventGapsTauSeconds: gaps,
        minGapTauSeconds: gaps.length ? Math.min(...gaps) : null,
        medianGapTauSeconds: median([...gaps]),
        shareGapsWithin30s: within30,
        clusters: buildEventClustersV1(
          sortedTau,
          DS4_DBI_D8_V2_DESCRIPTIVE_GROUP_MAX_INTER_EVENT_GAP_SECONDS_V1,
        ),
        eventRefs: kinds.refs,
        reasonCodes: descReasons,
      };

  const inferReasons: Ds4DbiD8V2ReasonCodeV1[] = [];
  let inferStatus: Ds4DbiD8V2InferenceStatusV1 = 'NOT_EVALUABLE';
  const nMin = DS4_DBI_D8_V2_RESEARCH_NMIN_V1;
  const assumptions = [
    'IID Uniform conditional onsets on [0,E*) mapped to normalized spacings',
    'Greenwood upper-tail clustering test (one-sided)',
    `nMin=${nMin} from preregistered power table (not trip-specific)`,
  ] as const;

  let observed: number | null = null;
  let nullRef: Ds4DbiD8V2GreenwoodNullReferenceV1 | null = null;
  let pValue: number | null = null;
  let percentile: number | null = null;
  let spacings: number[] | null = null;

  if (failClosed) {
    inferReasons.push('D8V2_FAIL_CLOSED');
    inferStatus = 'NOT_EVALUABLE';
  } else if (!input.clock.derivable || eStar == null || eStar <= 0) {
    inferReasons.push('D8V2_EXPOSURE_NOT_DERIVABLE');
  } else if (coverageClass === 'DEGRADED') {
    inferReasons.push('D8V2_COVERAGE_DEGRADED');
  } else if (input.clock.metadataMismatch) {
    inferReasons.push('D8V2_METADATA_MISMATCH');
  } else if (admitted.length === 0) {
    inferStatus = 'INSUFFICIENT_INFORMATION';
    inferReasons.push('D8V2_INSUFFICIENT_EVENTS', 'D8V2_NO_STATISTICAL_INFERENCE_AT_SMALL_N');
  } else if (admitted.length < nMin) {
    inferStatus = 'INSUFFICIENT_INFORMATION';
    inferReasons.push('D8V2_INSUFFICIENT_EVENTS', 'D8V2_NO_STATISTICAL_INFERENCE_AT_SMALL_N');
    if (admitted.length > 0 && eStar > 0) {
      observed = greenwoodNormalizedSpacingsV1(sortedTau.map((t) => t / eStar));
      nullRef = buildGreenwoodConditionalNullReferenceV1({
        eventCount: admitted.length,
        nullDraws: input.nullDraws,
        seed: input.seed,
      });
      const tail = greenwoodUpperTailPValueV1(observed, nullRef.samples);
      pValue = tail.pValueUpper;
      percentile = tail.percentile;
    }
  } else {
    const normalized = sortedTau.map((t) => t / eStar);
    observed = greenwoodNormalizedSpacingsV1(normalized);
    nullRef = buildGreenwoodConditionalNullReferenceV1({
      eventCount: admitted.length,
      nullDraws: input.nullDraws,
      seed: input.seed,
    });
    const tail = greenwoodUpperTailPValueV1(observed, nullRef.samples);
    pValue = tail.pValueUpper;
    percentile = tail.percentile;
    inferStatus = 'STATISTICAL_RESULT_AVAILABLE';
    inferReasons.push('D8V2_OK');
    let prev = 0;
    const norm = [...normalized].sort((a, b) => a - b);
    spacings = [];
    for (const x of norm) {
      spacings.push(x - prev);
      prev = x;
    }
    spacings.push(1 - prev);
  }

  const inference: Ds4DbiD8V2InferenceV1 = {
    status: inferStatus,
    statistic: 'GREENWOOD_NORMALIZED_SPACINGS',
    observedGreenwoodG: observed,
    nullExpectation: admitted.length > 0 ? greenwoodNullExpectationV1(admitted.length) : null,
    nullQuantiles: nullRef?.nullQuantiles ?? null,
    percentile,
    pValueUpper: pValue,
    nullMethod: 'CONDITIONAL_MC_FIXED_SEED',
    nullDraws: nullRef?.nullDraws ?? input.nullDraws ?? DS4_DBI_D8_V2_DEFAULT_NULL_DRAWS_V1,
    seed: nullRef?.seed ?? input.seed ?? DS4_DBI_D8_V2_NULL_MC_SEED_V1,
    nMinInference: nMin,
    eventsNeededForInference:
      admitted.length < nMin && admitted.length > 0 ? nMin - admitted.length : admitted.length < nMin ? nMin : null,
    normalizedSpacings: spacings,
    reasonCodes: inferReasons,
    assumptions,
  };

  const v1Reference: Ds4DbiD8V2V1ReferenceV1 = {
    status: input.v1D8.status,
    indexOfDispersion: input.v1D8.indexOfDispersion,
    nonEmptyWindowCount: input.v1D8.nonEmptyWindowCount,
    totalWindowSlots: input.v1D8.totalWindowSlots,
    eventCount: input.v1D8.eventCount,
    reasonCodes: input.v1D8.reasonCodes,
  };

  return {
    contractVersion: DS4_DBI_D8_V2_CONTRACT_VERSION,
    w0TripFailClosed: failClosed,
    w0TripFailClosedReasonCodes: [...input.w0TripFailClosedReasonCodes],
    descriptive,
    inference,
    v1Reference,
    interpretationLimits: DS4_DBI_D8_V2_INTERPRETATION_LIMITS_V1,
  };
}

export function computeDs4DbiD8V2FromW0ContextV1(input: {
  kernel: Ds4DbiW0TripKernelResultV1;
  payload: DiV0MotionCoreShadowPayloadV1;
  tripMeta: Ds4DbiW0TripMetaV1 | null;
  researchSpeedAuthorityPartitionOverride?: Parameters<
    typeof buildDs4DbiW0MovingExposureClockEvidenceV1
  >[0]['researchSpeedAuthorityPartitionOverride'];
  nullDraws?: number;
  seed?: number;
}): Ds4DbiD8V2ResultV1 {
  const failBinding = deriveDs4DbiD8V2W0TripFailClosedV1(input.kernel);
  const clock = buildDs4DbiW0MovingExposureClockEvidenceV1({
    payload: input.payload,
    suppliedExposureSecondsEs: input.tripMeta?.exposureSecondsEs ?? null,
    researchSpeedAuthorityPartitionOverride: failBinding.tripFailClosed
      ? undefined
      : input.researchSpeedAuthorityPartitionOverride,
  });
  return computeDs4DbiD8V2EventIntelligenceV1({
    payload: input.payload,
    clock,
    v1D8: input.kernel.d8Burstiness,
    w0TripFailClosed: failBinding.tripFailClosed,
    w0TripFailClosedReasonCodes: failBinding.typedReasons,
    nullDraws: input.nullDraws,
    seed: input.seed,
  });
}
