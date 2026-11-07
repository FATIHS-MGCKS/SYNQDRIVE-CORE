/**
 * DS4 DBI W0 — F03 D8 selection calibration (research only, B3 τ domain).
 * Exact multinomial-occupancy eligibility under IID Uniform τ on [0,E*) with unequal bin widths.
 * Does not change product D8 status rules (frozen thresholds).
 */

import {
  DS4_DBI_W0_RESEARCH_THRESHOLDS_V1,
} from './ds4-dbi-w0-mbf.types.v1';
import { exposureBinWidthsSecondsV1 } from './ds4-dbi-w0-moving-exposure-clock.v1';

export type Ds4DbiW0F03EstimandClassV1 =
  | 'OBSERVED_TRIP_METRIC'
  | 'UNRESTRICTED_RESEARCH_DIAGNOSTIC'
  | 'NULL_MODEL_REFERENCE'
  | 'CONDITIONAL_NULL_REFERENCE';

export type Ds4DbiW0ExposureBinGeometryV1 = {
  movingExposureSeconds: number;
  windowSeconds: number;
  totalBinCount: number;
  binWidthsSeconds: number[];
  binProbabilities: number[];
};

const MIN_ES = DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.burstWindowSeconds;
const MIN_EVENTS = DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.minEventsD8;
const MIN_NONEMPTY = DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.minNonEmptyWindowsD8;

const UNIFORM_TAU_NULL_ASSUMPTIONS_V1 = [
  'IID Uniform(0,E*) continuous onsets on moving-exposure axis τ',
  'floor(τ/windowSeconds) bin assignment with final bin capped at K−1',
  'D8 KNOWN iff E*≥60, n≥10, nonempty bins ≥10 (frozen F03 gates)',
  'Multinomial(n; p_k) occupancy with p_k = w_k/E* (no equal-bin shortcut)',
] as const;

export function buildExposureBinGeometryV1(
  eStar: number,
  windowS = DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.burstWindowSeconds,
): Ds4DbiW0ExposureBinGeometryV1 {
  const widths = exposureBinWidthsSecondsV1(eStar, windowS);
  const sum = widths.reduce((a, w) => a + w, 0);
  const binProbabilities = widths.map((w) => (sum > 0 ? w / sum : 0));
  return {
    movingExposureSeconds: eStar,
    windowSeconds: windowS,
    totalBinCount: widths.length,
    binWidthsSeconds: widths,
    binProbabilities,
  };
}

/** Independent IOD algebra (matches D8 definition; not imported from gate wrapper). */
export function indexOfDispersionFromBinCountsV1(
  counts: readonly number[],
  totalWindowSlots: number,
  eventCount: number,
): number | null {
  if (totalWindowSlots < 1 || eventCount < 1) {
    return null;
  }
  let sumSq = 0;
  for (const c of counts) {
    sumSq += c * c;
  }
  const mean = eventCount / totalWindowSlots;
  if (mean <= 0) {
    return null;
  }
  const variance =
    totalWindowSlots > 1
      ? (sumSq - (eventCount * eventCount) / totalWindowSlots) / (totalWindowSlots - 1)
      : 0;
  return variance / mean;
}

function binomialPmf(n: number, x: number, p: number): number {
  if (x < 0 || x > n) {
    return 0;
  }
  if (p <= 0) {
    return x === 0 ? 1 : 0;
  }
  if (p >= 1) {
    return x === n ? 1 : 0;
  }
  let coeff = 1;
  for (let i = 0; i < x; i += 1) {
    coeff *= (n - i) / (i + 1);
  }
  return coeff * p ** x * (1 - p) ** (n - x);
}

/**
 * Exact P(D8 status=KNOWN) under UNIFORM_TAU via sequential multinomial decomposition.
 */
export function exactUniformTauD8EligibilityProbabilityV1(input: {
  eventCount: number;
  movingExposureSeconds: number;
}): {
  supported: true;
  pKnown: number;
  geometry: Ds4DbiW0ExposureBinGeometryV1;
  method: 'MULTINOMIAL_OCCUPANCY_DP';
  assumptions: readonly string[];
} | {
  supported: false;
  pKnown: null;
  geometry: Ds4DbiW0ExposureBinGeometryV1;
  method: 'UNSUPPORTED';
  reason: string;
  assumptions: readonly string[];
} {
  const geometry = buildExposureBinGeometryV1(input.movingExposureSeconds);
  const n = input.eventCount;
  const eStar = input.movingExposureSeconds;
  const K = geometry.totalBinCount;
  const p = geometry.binProbabilities;

  if (!Number.isFinite(n) || n < 0 || !Number.isFinite(eStar) || eStar <= 0) {
    return {
      supported: false,
      pKnown: null,
      geometry,
      method: 'UNSUPPORTED',
      reason: 'INVALID_N_OR_ESTAR',
      assumptions: UNIFORM_TAU_NULL_ASSUMPTIONS_V1,
    };
  }

  if (n < MIN_EVENTS || eStar < MIN_ES) {
    return {
      supported: true,
      pKnown: 0,
      geometry,
      method: 'MULTINOMIAL_OCCUPANCY_DP',
      assumptions: UNIFORM_TAU_NULL_ASSUMPTIONS_V1,
    };
  }

  if (K < MIN_NONEMPTY) {
    return {
      supported: true,
      pKnown: 0,
      geometry,
      method: 'MULTINOMIAL_OCCUPANCY_DP',
      assumptions: UNIFORM_TAU_NULL_ASSUMPTIONS_V1,
    };
  }

  let dp = new Map<string, number>();
  dp.set(`${n},0`, 1);

  for (let k = 0; k < K; k += 1) {
    let tail = 0;
    for (let j = k; j < K; j += 1) {
      tail += p[j]!;
    }
    if (tail <= 0) {
      return {
        supported: false,
        pKnown: null,
        geometry,
        method: 'UNSUPPORTED',
        reason: 'ZERO_TAIL_PROBABILITY_MASS',
        assumptions: UNIFORM_TAU_NULL_ASSUMPTIONS_V1,
      };
    }
    const pk = p[k]! / tail;
    const next = new Map<string, number>();
    for (const [key, mass] of dp) {
      const [nRemStr, sStr] = key.split(',');
      const nRem = Number(nRemStr);
      const s = Number(sStr);
      for (let x = 0; x <= nRem; x += 1) {
        const add = mass * binomialPmf(nRem, x, pk);
        const n2 = nRem - x;
        const s2 = s + (x > 0 ? 1 : 0);
        const k2 = `${n2},${s2}`;
        next.set(k2, (next.get(k2) ?? 0) + add);
      }
    }
    dp = next;
  }

  let pKnown = 0;
  for (const [key, mass] of dp) {
    const [nRem, s] = key.split(',').map(Number);
    if (nRem === 0 && s >= MIN_NONEMPTY) {
      pKnown += mass;
    }
  }

  return {
    supported: true,
    pKnown,
    geometry,
    method: 'MULTINOMIAL_OCCUPANCY_DP',
    assumptions: UNIFORM_TAU_NULL_ASSUMPTIONS_V1,
  };
}

function multinomialProbability(counts: readonly number[], n: number, p: readonly number[]): number {
  let logCoeff = 0;
  for (let i = 1; i <= n; i += 1) {
    logCoeff += Math.log(i);
  }
  for (const c of counts) {
    for (let i = 1; i <= c; i += 1) {
      logCoeff -= Math.log(i);
    }
  }
  let logP = logCoeff;
  for (let k = 0; k < counts.length; k += 1) {
    const c = counts[k]!;
    if (c > 0 && p[k]! > 0) {
      logP += c * Math.log(p[k]!);
    } else if (c > 0 && p[k]! <= 0) {
      return 0;
    }
  }
  return Math.exp(logP);
}

type EnumerateLimitsV1 = { maxCompositions: number };

const DEFAULT_ENUM_LIMIT: EnumerateLimitsV1 = { maxCompositions: 2_000_000 };

/**
 * Exact conditional IOD reference under UNIFORM_TAU by enumerating multinomial count vectors.
 */
export function exactUniformTauConditionalIodReferenceV1(input: {
  eventCount: number;
  movingExposureSeconds: number;
  limits?: EnumerateLimitsV1;
}): {
  supported: boolean;
  pKnown: number | null;
  meanIodGivenKnown: number | null;
  quantilesGivenKnown: { p10: number; p50: number; p90: number } | null;
  method: 'MULTINOMIAL_ENUMERATION' | 'UNSUPPORTED';
  enumerationsVisited: number;
  reason?: string;
} {
  const eligibility = exactUniformTauD8EligibilityProbabilityV1(input);
  if (!eligibility.supported) {
    return {
      supported: false,
      pKnown: null,
      meanIodGivenKnown: null,
      quantilesGivenKnown: null,
      method: 'UNSUPPORTED',
      enumerationsVisited: 0,
      reason: 'ELIGIBILITY_EXACT_UNSUPPORTED',
    };
  }

  const pKnown = eligibility.pKnown;
  if (pKnown <= 0) {
    return {
      supported: true,
      pKnown: 0,
      meanIodGivenKnown: null,
      quantilesGivenKnown: null,
      method: 'MULTINOMIAL_ENUMERATION',
      enumerationsVisited: 0,
      reason: 'P_KNOWN_ZERO',
    };
  }

  const { geometry } = eligibility;
  const K = geometry.totalBinCount;
  const n = input.eventCount;
  const p = geometry.binProbabilities;
  const limit = input.limits ?? DEFAULT_ENUM_LIMIT;

  const estimatedCompositions = ((): number => {
    let coeff = 1;
    for (let i = 1; i < K; i += 1) {
      coeff *= (n + i) / i;
    }
    return Math.round(coeff);
  })();

  if (estimatedCompositions > limit.maxCompositions) {
    return {
      supported: false,
      pKnown,
      meanIodGivenKnown: null,
      quantilesGivenKnown: null,
      method: 'UNSUPPORTED',
      enumerationsVisited: 0,
      reason: `ENUMERATION_TOO_LARGE_${estimatedCompositions}`,
    };
  }

  const weights: { iod: number; w: number }[] = [];
  let meanAcc = 0;
  let visited = 0;

  const counts = new Array<number>(K).fill(0);

  function recurse(idx: number, remaining: number) {
    if (idx === K - 1) {
      counts[idx] = remaining;
      visited += 1;
      const prob = multinomialProbability(counts, n, p);
      if (prob <= 0) {
        return;
      }
      const nonempty = counts.filter((c) => c > 0).length;
      if (nonempty < MIN_NONEMPTY) {
        return;
      }
      const iod = indexOfDispersionFromBinCountsV1(counts, K, n);
      if (iod == null || !Number.isFinite(iod)) {
        return;
      }
      meanAcc += prob * iod;
      weights.push({ iod, w: prob });
      return;
    }
    for (let x = 0; x <= remaining; x += 1) {
      counts[idx] = x;
      recurse(idx + 1, remaining - x);
    }
  }

  recurse(0, n);

  const meanIodGivenKnown = meanAcc / pKnown;

  weights.sort((a, b) => a.iod - b.iod);
  const target = (q: number) => {
    const thr = q * pKnown;
    let cum = 0;
    for (const row of weights) {
      cum += row.w;
      if (cum >= thr - 1e-15) {
        return row.iod;
      }
    }
    return weights[weights.length - 1]?.iod ?? null;
  };

  const q10 = target(0.1);
  const q50 = target(0.5);
  const q90 = target(0.9);

  return {
    supported: true,
    pKnown,
    meanIodGivenKnown,
    quantilesGivenKnown:
      q10 != null && q50 != null && q90 != null ? { p10: q10, p50: q50, p90: q90 } : null,
    method: 'MULTINOMIAL_ENUMERATION',
    enumerationsVisited: visited,
  };
}

export function wilsonIntervalV1(
  successes: number,
  trials: number,
  z = 1.96,
): { low: number; high: number; point: number } | null {
  if (trials <= 0) {
    return null;
  }
  const p = successes / trials;
  const denom = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / denom;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials))) / denom;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin), point: p };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function monteCarloUniformTauEligibilityV1(input: {
  eventCount: number;
  movingExposureSeconds: number;
  trials: number;
  seed: number;
}): {
  acceptedCount: number;
  abstainedCount: number;
  empiricalPKnown: number;
  wilson95: ReturnType<typeof wilsonIntervalV1>;
  conditionalIodAcceptedOnly: number | null;
  conditionalIodStdError: number | null;
} {
  const geom = buildExposureBinGeometryV1(input.movingExposureSeconds);
  const K = geom.totalBinCount;
  const n = input.eventCount;
  const eStar = input.movingExposureSeconds;
  const rand = mulberry32(input.seed);

  let accepted = 0;
  const iodSamples: number[] = [];

  for (let t = 0; t < input.trials; t += 1) {
    const counts = new Array<number>(K).fill(0);
    for (let i = 0; i < n; i += 1) {
      const tau = rand() * Math.max(eStar - 1e-12, eStar);
      const w = Math.floor(tau / geom.windowSeconds);
      const wi = Math.min(Math.max(w, 0), K - 1);
      counts[wi]! += 1;
    }
    const nonempty = counts.filter((c) => c > 0).length;
    const known =
      n >= MIN_EVENTS && eStar >= MIN_ES && nonempty >= MIN_NONEMPTY;
    if (known) {
      accepted += 1;
      const iod = indexOfDispersionFromBinCountsV1(counts, K, n);
      if (iod != null && Number.isFinite(iod)) {
        iodSamples.push(iod);
      }
    }
  }

  const wilson = wilsonIntervalV1(accepted, input.trials);
  const meanIod =
    iodSamples.length > 0 ? iodSamples.reduce((a, x) => a + x, 0) / iodSamples.length : null;
  let stderr: number | null = null;
  if (iodSamples.length > 1 && meanIod != null) {
    const v =
      iodSamples.reduce((a, x) => a + (x - meanIod) ** 2, 0) / (iodSamples.length - 1);
    stderr = Math.sqrt(v / iodSamples.length);
  }

  return {
    acceptedCount: accepted,
    abstainedCount: input.trials - accepted,
    empiricalPKnown: input.trials > 0 ? accepted / input.trials : 0,
    wilson95: wilson,
    conditionalIodAcceptedOnly: meanIod,
    conditionalIodStdError: stderr,
  };
}

export function unrestrictedIodResearchDiagnosticV1(input: {
  tauOnsetsSeconds: readonly number[];
  movingExposureSeconds: number;
}): {
  estimand: 'UNRESTRICTED_RESEARCH_DIAGNOSTIC';
  indexOfDispersion: number | null;
  totalBinCount: number;
  nonemptyBinCount: number;
  note: string;
} {
  const geom = buildExposureBinGeometryV1(input.movingExposureSeconds);
  const K = geom.totalBinCount;
  const counts = new Array<number>(K).fill(0);
  let admitted = 0;
  for (const tau of input.tauOnsetsSeconds) {
    if (!Number.isFinite(tau) || tau < 0 || tau >= input.movingExposureSeconds) {
      continue;
    }
    admitted += 1;
    const w = Math.floor(tau / geom.windowSeconds);
    const wi = Math.min(Math.max(w, 0), K - 1);
    counts[wi]! += 1;
  }
  const nonempty = counts.filter((c) => c > 0).length;
  const iod = admitted > 0 ? indexOfDispersionFromBinCountsV1(counts, K, admitted) : null;
  return {
    estimand: 'UNRESTRICTED_RESEARCH_DIAGNOSTIC',
    indexOfDispersion: iod,
    totalBinCount: K,
    nonemptyBinCount: nonempty,
    note:
      'IOD from admitted τ bin counts without D8 support gate; does not change trip d8Burstiness.status.',
  };
}

export type Ds4DbiW0D8SelectionCalibrationResearchV1 = {
  contractVersion: 'ds4-dbi-w0-f03-selection-calibration-v1';
  scientificAuthority: 'NOT_EVALUATED';
  eventCount: number;
  movingExposureSeconds: number;
  observedTripMetric: {
    estimand: 'OBSERVED_TRIP_METRIC';
    d8EligibilityStatus: 'KNOWN' | 'ABSTAIN';
    totalBinCount: number | null;
    nonemptyBinCount: number | null;
    selectionCensoringReasonCodes: string[];
  };
  nullModelReference: {
    estimand: 'NULL_MODEL_REFERENCE';
    nullProcess: 'UNIFORM_TAU_ON_MOVING_EXPOSURE';
    pD8KnownExact: number | null;
    exactMethod: string;
    exactSupported: boolean;
    geometry: Ds4DbiW0ExposureBinGeometryV1;
    assumptions: readonly string[];
    unsupportedReason?: string;
  };
  conditionalNullReference: {
    estimand: 'CONDITIONAL_NULL_REFERENCE';
    meanIodGivenKnownExact: number | null;
    quantilesGivenKnown: { p10: number; p50: number; p90: number } | null;
    method: string;
    supported: boolean;
    unsupportedReason?: string;
  };
  monteCarloCrossCheck: {
    trials: number;
    seed: number;
    acceptedCount: number;
    abstainedCount: number;
    empiricalPKnown: number;
    wilson95: ReturnType<typeof wilsonIntervalV1>;
    meanIodAcceptedOnly: number | null;
    conditionalIodStdError: number | null;
    note: 'Monte Carlo estimation error only; exact DP is primary oracle when supported.';
  } | null;
  unrestrictedResearchDiagnostic: ReturnType<typeof unrestrictedIodResearchDiagnosticV1>;
};

export function buildD8SelectionCalibrationResearchV1(input: {
  movingExposureSeconds: number;
  tauOnsetsSeconds: readonly number[];
  observedD8Status: 'KNOWN' | 'ABSTAIN';
  observedTotalBins: number | null;
  observedNonemptyBins: number | null;
  observedD8ReasonCodes: readonly string[];
  /** When omitted or 0, Monte Carlo cross-check is skipped (trip kernel default). */
  mcTrials?: number;
  mcSeed?: number;
  /** Full conditional-IOD enumeration is research-harness only (trip default: false). */
  includeConditionalNullExact?: boolean;
}): Ds4DbiW0D8SelectionCalibrationResearchV1 {
  const n = input.tauOnsetsSeconds.filter(
    (t) => Number.isFinite(t) && t >= 0 && t < input.movingExposureSeconds,
  ).length;

  const exactP = exactUniformTauD8EligibilityProbabilityV1({
    eventCount: n,
    movingExposureSeconds: input.movingExposureSeconds,
  });
  const exactCond = input.includeConditionalNullExact
    ? exactUniformTauConditionalIodReferenceV1({
        eventCount: n,
        movingExposureSeconds: input.movingExposureSeconds,
      })
    : {
        supported: false as const,
        pKnown: exactP.supported ? exactP.pKnown : null,
        meanIodGivenKnown: null,
        quantilesGivenKnown: null,
        method: 'UNSUPPORTED' as const,
        enumerationsVisited: 0,
        reason: 'SKIPPED_TRIP_SUMMARY_CONDITIONAL_EXACT',
      };

  const mcTrials = input.mcTrials ?? 0;
  const mcSeed = input.mcSeed ?? 0xf03_c41b;
  const mc =
    mcTrials > 0
      ? monteCarloUniformTauEligibilityV1({
          eventCount: n,
          movingExposureSeconds: input.movingExposureSeconds,
          trials: mcTrials,
          seed: mcSeed,
        })
      : null;

  const censoring: string[] = [];
  if (input.observedD8Status === 'ABSTAIN') {
    censoring.push('OBSERVED_D8_ABSTAIN_UNDER_FROZEN_GATE');
    for (const r of input.observedD8ReasonCodes) {
      censoring.push(String(r));
    }
  }

  return {
    contractVersion: 'ds4-dbi-w0-f03-selection-calibration-v1',
    scientificAuthority: 'NOT_EVALUATED',
    eventCount: n,
    movingExposureSeconds: input.movingExposureSeconds,
    observedTripMetric: {
      estimand: 'OBSERVED_TRIP_METRIC',
      d8EligibilityStatus: input.observedD8Status,
      totalBinCount: input.observedTotalBins,
      nonemptyBinCount: input.observedNonemptyBins,
      selectionCensoringReasonCodes: censoring,
    },
    nullModelReference: {
      estimand: 'NULL_MODEL_REFERENCE',
      nullProcess: 'UNIFORM_TAU_ON_MOVING_EXPOSURE',
      pD8KnownExact: exactP.supported ? exactP.pKnown : null,
      exactMethod: exactP.supported ? exactP.method : exactP.method,
      exactSupported: exactP.supported,
      geometry: exactP.geometry,
      assumptions: exactP.assumptions,
      unsupportedReason: exactP.supported ? undefined : exactP.reason,
    },
    conditionalNullReference: {
      estimand: 'CONDITIONAL_NULL_REFERENCE',
      meanIodGivenKnownExact: exactCond.meanIodGivenKnown,
      quantilesGivenKnown: exactCond.quantilesGivenKnown,
      method: exactCond.method,
      supported: exactCond.supported,
      unsupportedReason: exactCond.reason,
    },
    monteCarloCrossCheck: mc
      ? {
          trials: mcTrials,
          seed: mcSeed,
          acceptedCount: mc.acceptedCount,
          abstainedCount: mc.abstainedCount,
          empiricalPKnown: mc.empiricalPKnown,
          wilson95: mc.wilson95,
          meanIodAcceptedOnly: mc.conditionalIodAcceptedOnly,
          conditionalIodStdError: mc.conditionalIodStdError,
          note: 'Monte Carlo estimation error only; exact DP is primary oracle when supported.',
        }
      : null,
    unrestrictedResearchDiagnostic: unrestrictedIodResearchDiagnosticV1({
      tauOnsetsSeconds: input.tauOnsetsSeconds,
      movingExposureSeconds: input.movingExposureSeconds,
    }),
  };
}

export const F03_SENSITIVITY_MATRIX_N_V1 = [10, 12, 20, 40] as const;
export const F03_SENSITIVITY_MATRIX_ESTAR_V1 = [
  599, 600, 660, 665, 719, 900, 1200, 1800,
] as const;

export type F03SensitivityMatrixRowV1 = {
  eventCount: number;
  movingExposureSeconds: number;
  exactPKnown: number | null;
  exactEIodGivenKnown: number | null;
  mcEmpiricalPKnown: number;
  mcWilson95: ReturnType<typeof wilsonIntervalV1>;
  finalBinWidthSeconds: number;
};

export function buildF03SensitivityMatrixV1(input?: {
  mcTrials?: number;
  mcSeed?: number;
}): F03SensitivityMatrixRowV1[] {
  const trials = input?.mcTrials ?? 15_000;
  const baseSeed = input?.mcSeed ?? 0xf03_5e41;
  const rows: F03SensitivityMatrixRowV1[] = [];
  for (const n of F03_SENSITIVITY_MATRIX_N_V1) {
    for (const eStar of F03_SENSITIVITY_MATRIX_ESTAR_V1) {
      const exactP = exactUniformTauD8EligibilityProbabilityV1({ eventCount: n, movingExposureSeconds: eStar });
      const exactCond = exactUniformTauConditionalIodReferenceV1({ eventCount: n, movingExposureSeconds: eStar });
      const mc = monteCarloUniformTauEligibilityV1({
        eventCount: n,
        movingExposureSeconds: eStar,
        trials,
        seed: baseSeed + n * 10007 + eStar,
      });
      const widths = exactP.geometry.binWidthsSeconds;
      rows.push({
        eventCount: n,
        movingExposureSeconds: eStar,
        exactPKnown: exactP.supported ? exactP.pKnown : null,
        exactEIodGivenKnown: exactCond.meanIodGivenKnown,
        mcEmpiricalPKnown: mc.empiricalPKnown,
        mcWilson95: mc.wilson95,
        finalBinWidthSeconds: widths[widths.length - 1] ?? 0,
      });
    }
  }
  return rows;
}

export type F03PatternSensitivityRowV1 = {
  pattern: 'REGULAR_SPACING' | 'CLUSTERED_TIMING';
  eventCount: number;
  movingExposureSeconds: number;
  d8StatusFromIndependentCore: 'KNOWN' | 'ABSTAIN';
  nonemptyBins: number;
  indexOfDispersion: number | null;
  note: string;
};

/** Pattern stress — not IID uniform null; separate from nullModelReference. */
export function buildF03PatternSensitivityV1(): F03PatternSensitivityRowV1[] {
  const scenarios: { n: number; eStar: number }[] = [
    { n: 12, eStar: 660 },
    { n: 12, eStar: 665 },
    { n: 20, eStar: 719 },
  ];
  const out: F03PatternSensitivityRowV1[] = [];
  for (const { n, eStar } of scenarios) {
    const regular = Array.from({ length: n }, (_, i) => ((i + 1) * eStar) / (n + 1));
    const clustered: number[] = [];
    let placed = 0;
    for (let w = 0; w < 10 && placed < n; w += 1) {
      const base = w * 60 + 5;
      const per = Math.min(3, n - placed);
      for (let j = 0; j < per; j += 1) {
        clustered.push(base + j * 2);
      }
      placed += per;
    }
    while (placed < n) {
      clustered.push((placed * 7.3) % (eStar - 1));
      placed += 1;
    }
    for (const [pattern, tau] of [
      ['REGULAR_SPACING', regular],
      ['CLUSTERED_TIMING', clustered],
    ] as const) {
      const diag = unrestrictedIodResearchDiagnosticV1({ tauOnsetsSeconds: tau, movingExposureSeconds: eStar });
      const geom = buildExposureBinGeometryV1(eStar);
      const K = geom.totalBinCount;
      const counts = new Array<number>(K).fill(0);
      let adm = 0;
      for (const t of tau) {
        if (t < 0 || t >= eStar) {
          continue;
        }
        adm += 1;
        const wi = Math.min(Math.max(Math.floor(t / geom.windowSeconds), 0), K - 1);
        counts[wi]! += 1;
      }
      const nonempty = counts.filter((c) => c > 0).length;
      const status =
        adm >= MIN_EVENTS && eStar >= MIN_ES && nonempty >= MIN_NONEMPTY ? 'KNOWN' : 'ABSTAIN';
      const iod = indexOfDispersionFromBinCountsV1(counts, K, adm);
      out.push({
        pattern,
        eventCount: n,
        movingExposureSeconds: eStar,
        d8StatusFromIndependentCore: status,
        nonemptyBins: nonempty,
        indexOfDispersion: iod,
        note:
          pattern === 'CLUSTERED_TIMING'
            ? 'Deterministic clustered τ — not UNIFORM_TAU null.'
            : 'Deterministic regular spacing — not UNIFORM_TAU null.',
      });
    }
  }
  return out;
}
