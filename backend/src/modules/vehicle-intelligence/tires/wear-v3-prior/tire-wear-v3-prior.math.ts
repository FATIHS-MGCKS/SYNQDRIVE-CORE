import { TireOdometerAnchorStatus } from '@prisma/client';
import {
  TIRE_HEALTH_CONFIG,
  type AiTireSpec,
  type TireArchetype,
  resolveArchetype,
  resolveReplacementThreshold,
} from '../tire-health.config';
import { resolveWheelTreadMm, type WheelPos } from '../tire-evidence-provenance';
import {
  TIRE_WEAR_V3_PRIOR_CONFIG,
  TIRE_WEAR_V3_PRIOR_USE_POSTERIOR_RATE_FUSION,
  type TireWearV3PriorConfig,
} from './tire-wear-v3-prior.config';
import { rateCalibrationBlockedByMeasurementQuality } from './tire-wear-v3-prior.calibration';
import { intervalMmPerKmToDisplayPer1000 } from './tire-wear-v3-prior.display';
import type {
  NumericInterval,
  TireWearV3EvidenceLevel,
  TireWearV3MeasurementPoint,
  TireWearV3RateSource,
  TireWearV3WearRateEstimate,
} from './tire-wear-v3-prior.types';

const WHEEL_POSITIONS: WheelPos[] = ['FL', 'FR', 'RL', 'RR'];

/** ΔD ≥ 3·√2·σ_m / r (r in mm/km). */
export function computeMinOdometerSpanKmFor3Sigma(
  sigmaMeasMm: number,
  rateMmPerKm: number,
): number {
  if (!Number.isFinite(rateMmPerKm) || rateMmPerKm <= 0) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(sigmaMeasMm) || sigmaMeasMm <= 0) return Number.POSITIVE_INFINITY;
  return (3 * Math.SQRT2 * sigmaMeasMm) / rateMmPerKm;
}

export function empiricalRateRelativeUncertainty(
  rateMmPerKm: number | null,
  rateSigmaMmPerKm: number | null,
): number | null {
  if (
    rateMmPerKm == null ||
    rateSigmaMmPerKm == null ||
    rateMmPerKm <= 0 ||
    rateSigmaMmPerKm <= 0
  ) {
    return null;
  }
  return rateSigmaMmPerKm / rateMmPerKm;
}

export function resolvePriorLifeKmInterval(args: {
  spec: AiTireSpec | null;
  archetype: TireArchetype;
  season: string | null;
  setupExpectedLifeKm: number | null;
  axleExpectedLifeKm: number | null;
  widenedBaseline: boolean;
  config?: TireWearV3PriorConfig;
}): { interval: NumericInterval; mid: number; source: TireWearV3RateSource } {
  const cfg = args.config ?? TIRE_WEAR_V3_PRIOR_CONFIG;
  const explicit = args.axleExpectedLifeKm ?? args.setupExpectedLifeKm;
  if (explicit != null && explicit > 0) {
    const span = cfg.explicitLifeKmRelativeSpan;
    const lo = Math.max(1000, Math.round(explicit * (1 - span)));
    const hi = Math.round(explicit * (1 + span));
    return {
      interval: { lo, hi },
      mid: explicit,
      source: 'prior_life_explicit',
    };
  }

  const seasonKey = args.season ?? 'ALL_SEASON';
  const seasonCfg =
    TIRE_HEALTH_CONFIG.expectedLifeKm[seasonKey] ??
    TIRE_HEALTH_CONFIG.expectedLifeKm.ALL_SEASON;
  let lo = seasonCfg.min;
  let hi = seasonCfg.max;

  const arch =
    TIRE_HEALTH_CONFIG.archetypeDefaults[args.archetype] ??
    TIRE_HEALTH_CONFIG.archetypeDefaults.default;
  const archLo = Math.round(arch.expectedLifeKm * 0.85);
  const archHi = Math.round(arch.expectedLifeKm * 1.15);
  lo = Math.max(lo, archLo);
  hi = Math.min(hi, archHi);
  if (lo > hi) {
    lo = seasonCfg.min;
    hi = seasonCfg.max;
  }

  if (args.widenedBaseline) {
    lo = Math.min(lo, cfg.unknownLifeKmSpan.lo);
    hi = Math.max(hi, cfg.unknownLifeKmSpan.hi);
    return {
      interval: { lo, hi },
      mid: (lo + hi) / 2,
      source: 'prior_life_widened',
    };
  }

  return {
    interval: { lo, hi },
    mid: seasonCfg.default,
    source: 'prior_life_table',
  };
}

export function priorWearRateIntervalMmPerKm(
  initialTreadMm: number,
  replacementMm: number,
  lifeKm: NumericInterval,
): NumericInterval {
  const usable = initialTreadMm - replacementMm;
  if (usable <= 0 || lifeKm.hi <= 0) {
    return { lo: 0, hi: 0 };
  }
  return {
    lo: usable / lifeKm.hi,
    hi: usable / lifeKm.lo,
  };
}

export function rateSigmaFromTwoPoints(
  deltaTreadMm: number,
  deltaOdometerKm: number,
  sigmaMeasMm: number,
): number | null {
  if (deltaOdometerKm <= 0) return null;
  const rate = Math.abs(deltaTreadMm) / deltaOdometerKm;
  if (!Number.isFinite(rate)) return null;
  return (Math.SQRT2 * sigmaMeasMm) / deltaOdometerKm;
}

export function fitWearRateFromMeasurements(
  points: TireWearV3MeasurementPoint[],
  sigmaMeasMm: number,
  config: TireWearV3PriorConfig = TIRE_WEAR_V3_PRIOR_CONFIG,
): {
  rateMmPerKm: number | null;
  rateSigmaMmPerKm: number | null;
  spanKm: number | null;
  pointCount: number;
  flags: string[];
} {
  const flags: string[] = [];
  const usable = points
    .filter((p) => p.odometerKm != null && Number.isFinite(p.odometerKm))
    .sort((a, b) => (a.odometerKm! - b.odometerKm!));

  if (usable.length < 2) {
    return {
      rateMmPerKm: null,
      rateSigmaMmPerKm: null,
      spanKm: null,
      pointCount: usable.length,
      flags: ['RATE_INSUFFICIENT_POINTS'],
    };
  }

  const odometers = usable.map((p) => p.odometerKm!);
  const treads = usable.map((p) => p.treadMm);
  const spanKm = odometers[odometers.length - 1]! - odometers[0]!;

  for (let i = 1; i < treads.length; i += 1) {
    const jump = Math.abs(treads[i]! - treads[i - 1]!);
    if (jump > config.maxTreadJumpBetweenMeasurementsMm) {
      flags.push('TREAD_JUMP_SUSPECT');
    }
  }

  const n = odometers.length;
  const meanD = odometers.reduce((s, v) => s + v, 0) / n;
  const meanH = treads.reduce((s, v) => s + v, 0) / n;
  let ssDd = 0;
  let ssDh = 0;
  for (let i = 0; i < n; i += 1) {
    const dDev = odometers[i]! - meanD;
    ssDd += dDev * dDev;
    ssDh += dDev * (treads[i]! - meanH);
  }
  if (ssDd <= 0) {
    return {
      rateMmPerKm: null,
      rateSigmaMmPerKm: null,
      spanKm,
      pointCount: n,
      flags: [...flags, 'RATE_ZERO_ODOMETER_SPREAD'],
    };
  }

  const slope = ssDh / ssDd;
  if (slope > 0) {
    flags.push('RATE_NEGATIVE_WEAR_REJECTED');
    return {
      rateMmPerKm: null,
      rateSigmaMmPerKm: null,
      spanKm,
      pointCount: n,
      flags,
    };
  }

  const rate = -slope;
  const residualVar =
    treads.reduce((s, h, i) => {
      const pred = meanH + slope * (odometers[i]! - meanD);
      return s + (h - pred) ** 2;
    }, 0) / Math.max(1, n - 2);
  const treadSpanMm = Math.abs(treads[0]! - treads[n - 1]!);
  if (n > 2 && residualVar > 0 && treadSpanMm > 0) {
    const rmse = Math.sqrt(residualVar);
    if (rmse / treadSpanMm > config.maxResidualRmseFractionOfTreadSpan) {
      flags.push('RATE_MEASUREMENT_SERIES_CONTRADICTORY');
    }
  }
  const rateSigmaFromOls =
    n > 2 && ssDd > 0
      ? (() => {
          const varFromResidual = residualVar > 0 ? residualVar / ssDd : 0;
          const varFromMeasurementNoise = (sigmaMeasMm * sigmaMeasMm) / ssDd;
          return Math.sqrt(Math.max(varFromMeasurementNoise, varFromResidual));
        })()
      : rateSigmaFromTwoPoints(treads[0]! - treads[n - 1]!, spanKm, sigmaMeasMm);
  const rateSigma = rateSigmaFromOls;

  const ratePer1000 = rate * 1000;
  if (ratePer1000 > config.maxPlausibleWearRateMmPer1000km) {
    flags.push('RATE_IMPLAUSIBLY_HIGH');
  }
  if (ratePer1000 < config.minPlausibleWearRateMmPer1000km) {
    flags.push('RATE_IMPLAUSIBLY_LOW');
  }

  const minSpan3Sigma = computeMinOdometerSpanKmFor3Sigma(sigmaMeasMm, rate);
  if (spanKm < minSpan3Sigma) {
    flags.push('RATE_SPAN_BELOW_3SIGMA_THRESHOLD');
  }

  return {
    rateMmPerKm: rate,
    rateSigmaMmPerKm: rateSigma,
    spanKm,
    pointCount: n,
    flags,
  };
}

function bayesianRateFusion(
  prior: NumericInterval,
  observedRate: number,
  observedSigma: number,
): {
  posteriorMid: number;
  postSigma: number;
  measurementUncertainty: NumericInterval;
} {
  const priorMid = (prior.lo + prior.hi) / 2;
  const priorHalf = (prior.hi - prior.lo) / 2;
  const priorSigma = priorHalf > 0 ? priorHalf / 1.645 : priorMid * 0.15;
  const wPrior = 1 / (priorSigma * priorSigma);
  const wObs = 1 / (observedSigma * observedSigma);
  const posteriorMid = (wPrior * priorMid + wObs * observedRate) / (wPrior + wObs);
  const postSigma = Math.sqrt(1 / (wPrior + wObs));
  const z = 1.645;
  return {
    posteriorMid,
    postSigma,
    measurementUncertainty: {
      lo: Math.max(0, observedRate - z * observedSigma),
      hi: observedRate + z * observedSigma,
    },
  };
}

/** Legacy P3A: union of prior and posterior (measurements can only widen the interval). */
export function fuseRateWithPrior(
  prior: NumericInterval,
  observedRate: number,
  observedSigma: number | null,
): {
  interval: NumericInterval;
  posteriorMid: number;
  measurementUncertainty: NumericInterval | null;
} {
  const priorMid = (prior.lo + prior.hi) / 2;

  if (observedSigma == null || observedSigma <= 0) {
    return {
      interval: prior,
      posteriorMid: priorMid,
      measurementUncertainty: null,
    };
  }

  const { posteriorMid, postSigma, measurementUncertainty } = bayesianRateFusion(
    prior,
    observedRate,
    observedSigma,
  );
  const postLo = posteriorMid - 1.645 * postSigma;
  const postHi = posteriorMid + 1.645 * postSigma;
  const interval = {
    lo: Math.min(prior.lo, Math.max(0, postLo)),
    hi: Math.max(prior.hi, postHi),
  };
  return {
    interval,
    posteriorMid,
    measurementUncertainty,
  };
}

/** P3B+: posterior 90 % interval clipped to plausible rate bounds (can narrow vs prior). */
export function fuseRateWithPriorPosterior(
  prior: NumericInterval,
  observedRate: number,
  observedSigma: number | null,
  config: TireWearV3PriorConfig = TIRE_WEAR_V3_PRIOR_CONFIG,
): {
  interval: NumericInterval;
  posteriorMid: number;
  measurementUncertainty: NumericInterval | null;
} {
  const priorMid = (prior.lo + prior.hi) / 2;
  const minRate = config.minPlausibleWearRateMmPer1000km / 1000;
  const maxRate = config.maxPlausibleWearRateMmPer1000km / 1000;

  if (observedSigma == null || observedSigma <= 0) {
    return {
      interval: prior,
      posteriorMid: priorMid,
      measurementUncertainty: null,
    };
  }

  const { posteriorMid, postSigma, measurementUncertainty } = bayesianRateFusion(
    prior,
    observedRate,
    observedSigma,
  );
  const z = 1.645;
  const postLo = Math.max(minRate, posteriorMid - z * postSigma);
  const postHi = Math.min(maxRate, posteriorMid + z * postSigma);
  return {
    interval: {
      lo: Math.min(postLo, postHi),
      hi: Math.max(postLo, postHi),
    },
    posteriorMid,
    measurementUncertainty: {
      lo: Math.max(minRate, measurementUncertainty.lo),
      hi: Math.min(maxRate, measurementUncertainty.hi),
    },
  };
}

export function deriveEvidenceLevel(args: {
  anchorStatus: TireOdometerAnchorStatus | null;
  measurementCount: number;
  ratePointCount: number;
  empiricalRateMmPerKm: number | null;
  empiricalRateSigmaMmPerKm: number | null;
  measurementSpanKm: number | null;
  meets3SigmaSpacing: boolean;
  rateRejected: boolean;
  priorOnlyForRate: boolean;
  config?: TireWearV3PriorConfig;
}): TireWearV3EvidenceLevel {
  const cfg = args.config ?? TIRE_WEAR_V3_PRIOR_CONFIG;
  if (args.anchorStatus !== TireOdometerAnchorStatus.ANCHORED) {
    return 'L0';
  }
  if (args.measurementCount < 1) {
    return 'L0';
  }
  if (args.priorOnlyForRate || args.rateRejected) {
    return 'L1';
  }
  if (args.ratePointCount < cfg.minMeasurementsForRateL2) {
    return 'L1';
  }

  const span = args.measurementSpanKm ?? 0;
  const rel = empiricalRateRelativeUncertainty(
    args.empiricalRateMmPerKm,
    args.empiricalRateSigmaMmPerKm,
  );

  if (!args.meets3SigmaSpacing || rel == null) {
    return 'L1';
  }

  if (
    args.ratePointCount >= cfg.minMeasurementsForRateL4 &&
    span >= cfg.minMeasurementSpanKmForRateL4 &&
    rel <= cfg.rateRelativeUncertaintyL3
  ) {
    return 'L4';
  }
  if (
    args.ratePointCount >= cfg.minMeasurementsForRateL3 &&
    span >= cfg.minMeasurementSpanKmForRateL3 &&
    rel <= cfg.rateRelativeUncertaintyL3
  ) {
    return 'L3';
  }
  if (
    span >= cfg.minMeasurementSpanKmForRateL2 &&
    rel <= cfg.rateRelativeUncertaintyL2
  ) {
    return 'L2';
  }
  return 'L1';
}

export function projectTreadMm(args: {
  anchorTreadMm: number;
  anchorOdometerKm: number;
  currentOdometerKm: number;
  rateMmPerKm: NumericInterval;
  /**
   * 1σ uncertainty on anchor tread (mm). Widens the projection envelope (90 % uses 1.645σ in display layer).
   * Use only for trusted measurement anchors to avoid double-counting with MEASURED display bands.
   */
  anchorUncertaintyMm?: number;
}): NumericInterval {
  const delta = Math.max(0, args.currentOdometerKm - args.anchorOdometerKm);
  const u = args.anchorUncertaintyMm ?? 0;
  const z = 1.645;
  const anchorLo = args.anchorTreadMm - z * u;
  const anchorHi = args.anchorTreadMm + z * u;
  return {
    lo: anchorLo - args.rateMmPerKm.hi * delta,
    hi: anchorHi - args.rateMmPerKm.lo * delta,
  };
}

export function remainingKmInterval(
  treadMm: NumericInterval,
  replacementMm: number,
  rateMmPerKm: NumericInterval,
): NumericInterval {
  const usableLo = treadMm.lo - replacementMm;
  const usableHi = treadMm.hi - replacementMm;
  if (usableLo <= 0 && usableHi <= 0) {
    return { lo: 0, hi: 0 };
  }
  const lo =
    usableLo > 0 && rateMmPerKm.hi > 0 ? Math.floor(usableLo / rateMmPerKm.hi) : 0;
  const hi =
    usableHi > 0 && rateMmPerKm.lo > 0 ? Math.ceil(usableHi / rateMmPerKm.lo) : 0;
  return { lo: Math.max(0, lo), hi: Math.max(0, hi) };
}

export function resolveWheelInitialTread(
  position: WheelPos,
  setup: {
    initialTreadFrontMm: number | null;
    initialTreadRearMm: number | null;
    initialTreadDepthMm: number | null;
  },
  spec: AiTireSpec | null,
  archetype: TireArchetype,
  season: string | null,
): { treadMm: number; usedDefaultFallback: boolean } {
  const wheel = resolveWheelTreadMm(position, {
    setupInitialTreadFrontMm: setup.initialTreadFrontMm,
    setupInitialTreadRearMm: setup.initialTreadRearMm,
    setupInitialTreadDepthMm: setup.initialTreadDepthMm,
  });
  if (!wheel.usedDefaultFallback) {
    return wheel;
  }
  if (spec?.newTreadDepthMm != null && spec.newTreadDepthMm > 4) {
    return { treadMm: spec.newTreadDepthMm, usedDefaultFallback: false };
  }
  const arch =
    TIRE_HEALTH_CONFIG.archetypeDefaults[archetype] ??
    TIRE_HEALTH_CONFIG.archetypeDefaults.default;
  if (archetype !== 'default') {
    return { treadMm: arch.newTreadMm, usedDefaultFallback: false };
  }
  return wheel;
}

export function axleForWheel(position: WheelPos): 'front' | 'rear' {
  return position.startsWith('F') ? 'front' : 'rear';
}

export function listWheelPositions(): WheelPos[] {
  return [...WHEEL_POSITIONS];
}

export function buildWearRateEstimate(args: {
  initialTreadMm: number;
  replacementMm: number;
  spec: AiTireSpec | null;
  archetype: TireArchetype;
  season: string | null;
  setupExpectedLifeKm: number | null;
  expectedLifeKmFront: number | null;
  expectedLifeKmRear: number | null;
  position: WheelPos;
  widenedBaseline: boolean;
  measurements: TireWearV3MeasurementPoint[];
  sigmaMeasMm: number;
  config?: TireWearV3PriorConfig;
}): TireWearV3WearRateEstimate {
  const cfg = args.config ?? TIRE_WEAR_V3_PRIOR_CONFIG;
  const axle = axleForWheel(args.position);
  const life = resolvePriorLifeKmInterval({
    spec: args.spec,
    archetype: args.archetype,
    season: args.season,
    setupExpectedLifeKm: args.setupExpectedLifeKm,
    axleExpectedLifeKm:
      axle === 'front' ? args.expectedLifeKmFront : args.expectedLifeKmRear,
    widenedBaseline: args.widenedBaseline,
    config: cfg,
  });
  const priorRate = priorWearRateIntervalMmPerKm(
    args.initialTreadMm,
    args.replacementMm,
    life.interval,
  );

  const fit = fitWearRateFromMeasurements(args.measurements, args.sigmaMeasMm, cfg);
  const rateRejected =
    fit.rateMmPerKm == null ||
    fit.flags.includes('RATE_NEGATIVE_WEAR_REJECTED') ||
    fit.flags.includes('RATE_IMPLAUSIBLY_HIGH');

  const meets3Sigma = !fit.flags.includes('RATE_SPAN_BELOW_3SIGMA_THRESHOLD');
  const qualityBlocked = rateCalibrationBlockedByMeasurementQuality(fit.flags);

  let source: TireWearV3RateSource = life.source;
  let interval = priorRate;
  let measurementUncertainty: NumericInterval | null = null;
  const outFlags = [...fit.flags];

  if (qualityBlocked) {
    outFlags.push('RATE_CALIBRATION_PRIOR_ONLY');
  }

  if (
    fit.rateMmPerKm != null &&
    !rateRejected &&
    !qualityBlocked &&
    fit.pointCount >= cfg.minMeasurementsForRateL2 &&
    meets3Sigma
  ) {
    const fused = TIRE_WEAR_V3_PRIOR_USE_POSTERIOR_RATE_FUSION
      ? fuseRateWithPriorPosterior(
          priorRate,
          fit.rateMmPerKm,
          fit.rateSigmaMmPerKm,
          cfg,
        )
      : fuseRateWithPrior(priorRate, fit.rateMmPerKm, fit.rateSigmaMmPerKm);
    interval = fused.interval;
    measurementUncertainty = fused.measurementUncertainty;
    source = 'measurement_fused';
  }

  return {
    mmPerKm: interval,
    mmPer1000km: intervalMmPerKmToDisplayPer1000(interval),
    source,
    modelUncertaintyMmPerKm: priorRate,
    measurementUncertaintyMmPerKm: measurementUncertainty,
    flags: outFlags,
  };
}

export function resolveArchetypeAndSeason(
  spec: AiTireSpec | null,
  tireSeason: string | null,
): { archetype: TireArchetype; season: string | null } {
  return {
    archetype: resolveArchetype(spec, tireSeason),
    season: tireSeason,
  };
}

export function resolveReplacementMm(
  spec: AiTireSpec | null,
  archetype: TireArchetype,
  season: string | null,
): number {
  return resolveReplacementThreshold(spec, archetype, season).mm;
}
