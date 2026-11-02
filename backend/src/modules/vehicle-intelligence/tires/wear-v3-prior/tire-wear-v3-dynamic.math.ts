import {
  resolveDs4TemporalTripWeight,
  type TireWearV3Ds4ShadowTemporalDetail,
} from './tire-wear-v3-ds4-payload.util';
import {
  TIRE_WEAR_V3_PRIOR_CONFIG,
  type TireWearV3PriorConfig,
} from './tire-wear-v3-prior.config';
import type { NumericInterval } from './tire-wear-v3-prior.types';

export type TireWearV3Ds4LedgerShadowRow = {
  ledgerId: string;
  distanceKm: number;
  ds4ReadStatus: string;
  temporalCoverage: string | null;
  m3JPerKgPerKm: number | null;
  validDrivingSeconds: number | null;
  tripDurationSeconds: number | null;
  /** Populated from adapter temporalCoverageDetail when present. */
  temporalDetail?: TireWearV3Ds4ShadowTemporalDetail;
  speedAuthority?: string | null;
  temporalTripWeight?: number;
  temporalWeightFlags?: string[];
};

export type TireWearV3DynamicFactorResult = {
  factor: number;
  coverage: number;
  sRel: number | null;
  applied: boolean;
  appliedToRateLo: boolean;
  flags: string[];
};

export function tripTemporalWeight(row: TireWearV3Ds4LedgerShadowRow): number {
  if (row.temporalTripWeight != null && Number.isFinite(row.temporalTripWeight)) {
    return Math.min(1, Math.max(0, row.temporalTripWeight));
  }
  const detail =
    row.temporalDetail ??
    ({
      validDrivingSeconds: row.validDrivingSeconds,
      tripDurationSeconds: row.tripDurationSeconds,
      tripWindowSeconds: null,
      confirmedStationarySeconds: null,
      accountableFraction: null,
      labelledFraction: null,
      verified: null,
    } satisfies TireWearV3Ds4ShadowTemporalDetail);
  return resolveDs4TemporalTripWeight({
    ds4ReadStatus: row.ds4ReadStatus,
    temporalCoverage: row.temporalCoverage,
    m3JPerKgPerKm: row.m3JPerKgPerKm,
    detail,
    speedAuthority: row.speedAuthority,
  }).weight;
}

/**
 * Distance-weighted longitudinal severity relative to a reference M3 sum (J/kg/km).
 * Missing DS4 rows reduce coverage but do not imply zero driving stress (factor stays neutral).
 */
export function computeSetupDs4Severity(
  rows: TireWearV3Ds4LedgerShadowRow[],
  totalLedgerKm: number,
  config: TireWearV3PriorConfig = TIRE_WEAR_V3_PRIOR_CONFIG,
): { sRel: number | null; coverage: number; flags: string[] } {
  const flags: string[] = [];
  if (totalLedgerKm <= 0 || rows.length === 0) {
    return { sRel: null, coverage: 0, flags: ['DS4_SEVERITY_NO_LEDGER_DISTANCE'] };
  }

  let coveredKm = 0;
  let weightedM3Sum = 0;
  let weightedKm = 0;

  for (const row of rows) {
    const w = tripTemporalWeight(row);
    if (row.temporalWeightFlags?.length) {
      for (const f of row.temporalWeightFlags) {
        if (!flags.includes(f)) flags.push(f);
      }
    }
    if (w <= 0 || row.distanceKm <= 0) continue;
    const m3 = row.m3JPerKgPerKm ?? 0;
    coveredKm += row.distanceKm * w;
    weightedM3Sum += m3 * row.distanceKm * w;
    weightedKm += row.distanceKm * w;
  }

  const coverage = Math.min(1, Math.max(0, coveredKm / totalLedgerKm));
  if (coverage <= 0) {
    return { sRel: null, coverage: 0, flags: ['DS4_SEVERITY_NO_COVERED_DISTANCE'] };
  }

  const meanM3 = weightedKm > 0 ? weightedM3Sum / weightedKm : null;
  const ref = config.severityReferenceM3JPerKgPerKm;
  const sRel =
    meanM3 != null && ref > 0 && Number.isFinite(meanM3) ? meanM3 / ref : null;

  if (sRel == null) {
    flags.push('DS4_SEVERITY_REFERENCE_UNAVAILABLE');
  }

  return { sRel, coverage, flags };
}

/**
 * Bounded dynamic wear multiplier. With β=0 (P3A/P3B default) always returns 1 and applied=false.
 */
export function boundedDynamicWearFactor(
  sRel: number | null,
  coverage: number,
  config: TireWearV3PriorConfig = TIRE_WEAR_V3_PRIOR_CONFIG,
): TireWearV3DynamicFactorResult {
  const flags: string[] = [];
  const beta = config.dynamicBeta;
  const { min: fMin, max: fMax } = config.dynamicFactorBounds;

  if (beta <= 0 || sRel == null || !Number.isFinite(sRel)) {
    return {
      factor: 1,
      coverage,
      sRel,
      applied: false,
      appliedToRateLo: false,
      flags: beta <= 0 ? ['DYNAMIC_BETA_ZERO'] : flags,
    };
  }

  let raw = 1 + beta * coverage * (sRel - 1);
  const allowDownward =
    coverage >= config.dynamicDownwardMinCoverage && sRel < 1;
  if (!allowDownward && raw < 1) {
    raw = 1;
    flags.push('DYNAMIC_DOWNWARD_BLOCKED_LOW_COVERAGE');
  }

  const factor = Math.min(fMax, Math.max(fMin, raw));
  const appliedToRateLo = coverage >= config.dynamicDownwardMinCoverage;

  return {
    factor,
    coverage,
    sRel,
    applied: factor !== 1,
    appliedToRateLo,
    flags,
  };
}

/** Apply dynamic factor conservatively to a wear-rate interval (mm/km). */
export function applyDynamicFactorToRateInterval(
  rateMmPerKm: NumericInterval,
  dynamic: TireWearV3DynamicFactorResult,
): NumericInterval {
  if (!dynamic.applied) return rateMmPerKm;
  const hi = rateMmPerKm.hi * dynamic.factor;
  const lo = dynamic.appliedToRateLo
    ? rateMmPerKm.lo * dynamic.factor
    : rateMmPerKm.lo;
  return {
    lo: Math.min(lo, hi),
    hi: Math.max(lo, hi),
  };
}
