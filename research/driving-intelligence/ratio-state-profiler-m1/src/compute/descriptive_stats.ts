import type { R1SameRowPair, VideoEligibleRow } from "../types.js";
import { M1_DEFAULTS, P16_REGRESSION } from "../constants.js";

export interface SpeedBandSpec {
  band_id: string;
  v_kmh_min_exclusive: number;
  v_kmh_max_inclusive: number | null;
}

/** Video cohort: speeds > vMin (20). Bands partition (20, ∞). */
export const VIDEO_SPEED_BANDS: SpeedBandSpec[] = [
  { band_id: "SPD_GT20_LE40", v_kmh_min_exclusive: 20, v_kmh_max_inclusive: 40 },
  { band_id: "SPD_GT40_LE60", v_kmh_min_exclusive: 40, v_kmh_max_inclusive: 60 },
  { band_id: "SPD_GT60_LE80", v_kmh_min_exclusive: 60, v_kmh_max_inclusive: 80 },
  { band_id: "SPD_GT80", v_kmh_min_exclusive: 80, v_kmh_max_inclusive: null },
];

/** R1 cohort: same partition for speeds > vMin. */
export const R1_SPEED_BANDS: SpeedBandSpec[] = VIDEO_SPEED_BANDS;

export function speedBandFor(v: number, bands: SpeedBandSpec[]): SpeedBandSpec | null {
  for (const b of bands) {
    if (v <= b.v_kmh_min_exclusive) continue;
    if (b.v_kmh_max_inclusive != null && v > b.v_kmh_max_inclusive) continue;
    return b;
  }
  return null;
}

export interface NumericDistributionAvailable {
  status: "AVAILABLE";
  n_observations: number;
  median: number;
  p05: number;
  p25: number;
  p75: number;
  p95: number;
  min: number;
  max: number;
}

export interface NumericDistributionUnavailable {
  status: "NOT_AVAILABLE";
  reason_code: "N_LT_5" | "EMPTY_BAND";
  n_observations: number;
}

export type NumericDistributionResult = NumericDistributionAvailable | NumericDistributionUnavailable;

const VIDEO_RPM_SOURCE_QUALITY = {
  evidence_stream: "VIDEO_P5_POSITIVE_VISUAL_CANDIDATE",
  rpm_quantization_step_rpm: 250,
  speed_display: "integer_kmh_display",
  reading_uncertainty_policy_rpm: M1_DEFAULTS.rpmVisualUncertaintyPolicyRpm,
  note:
    "Video tachometer overlay: 250 min⁻¹ steps; ±500 min⁻¹ is the frozen P16 reading policy bound, not a calibrated probability interval.",
} as const;

const R1_RPM_SOURCE_QUALITY = {
  evidence_stream: "R1_SAME_EVIDENCE_ROW_INTERVAL_ONLY",
  rpm_field: "powertrainCombustionEngineSpeed",
  speed_field: "speed",
  rpm_quantization_step_rpm: "UNKNOWN",
  reading_uncertainty_video_policy_rpm: "NOT_APPLICABLE",
  sampling_interval_seconds: "UNKNOWN",
  sampling_accuracy: "UNKNOWN",
  note:
    "OBD values on the same DIMO evidence row as speed (interval authority). Video optical ±500 policy and 250 min⁻¹ display quantization do not apply.",
} as const;

function statisticalPresentationBlock(
  dist: NumericDistributionAvailable,
  opts: { cohort: string; temporal_dependence: boolean },
): Record<string, unknown> {
  return {
    cohort: opts.cohort,
    status: dist.status,
    n_observations: dist.n_observations,
    statistical_presentation: {
      median_and_count: "OBSERVED",
      p05_p95: "EXPLORATORY_NOT_CALIBRATED_PRECISION",
      p25_p75: "EXPLORATORY_NOT_CALIBRATED_PRECISION",
      caveat:
        "Order statistics on 1 s buckets that are not assumed independent; tails are descriptive only, not sampling precision intervals.",
      temporal_dependence: opts.temporal_dependence,
      small_sample_tail_warning: dist.n_observations < 30,
    },
  };
}

export function attachStatisticalPresentation(
  dist: NumericDistributionResult,
  opts: { cohort: string; temporal_dependence: boolean },
): Record<string, unknown> {
  if (dist.status !== "AVAILABLE") return { ...dist, cohort: opts.cohort };
  return {
    ...statisticalPresentationBlock(dist, opts),
    median: dist.median,
    p05: dist.p05,
    p25: dist.p25,
    p75: dist.p75,
    p95: dist.p95,
    min: dist.min,
    max: dist.max,
  };
}

export function numericDistribution(values: number[]): NumericDistributionResult {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) {
    return { status: "NOT_AVAILABLE", reason_code: "EMPTY_BAND", n_observations: 0 };
  }
  if (n < 5) {
    return { status: "NOT_AVAILABLE", reason_code: "N_LT_5", n_observations: n };
  }
  return {
    status: "AVAILABLE",
    n_observations: n,
    median: quantileSorted(sorted, 0.5),
    p05: quantileSorted(sorted, 0.05),
    p25: quantileSorted(sorted, 0.25),
    p75: quantileSorted(sorted, 0.75),
    p95: quantileSorted(sorted, 0.95),
    min: sorted[0]!,
    max: sorted[n - 1]!,
  };
}

export function rpmDistributionVideo(rows: Array<{ rpm: number }>): Record<string, unknown> {
  const dist = numericDistribution(rows.map((r) => r.rpm));
  if (dist.status !== "AVAILABLE") return { ...dist, source_quality: VIDEO_RPM_SOURCE_QUALITY };
  return {
    ...statisticalPresentationBlock(dist, { cohort: "VIDEO_P16_ELIGIBLE", temporal_dependence: true }),
    rpm_median: dist.median,
    rpm_p05: dist.p05,
    rpm_p25: dist.p25,
    rpm_p75: dist.p75,
    rpm_p95: dist.p95,
    rpm_min: dist.min,
    rpm_max: dist.max,
    source_quality: VIDEO_RPM_SOURCE_QUALITY,
  };
}

export function rpmDistributionR1(rows: Array<{ rpm: number }>): Record<string, unknown> {
  const dist = numericDistribution(rows.map((r) => r.rpm));
  if (dist.status !== "AVAILABLE") return { ...dist, source_quality: R1_RPM_SOURCE_QUALITY };
  return {
    ...statisticalPresentationBlock(dist, { cohort: "R1_SAME_ROW_VMIN20", temporal_dependence: true }),
    rpm_median: dist.median,
    rpm_p05: dist.p05,
    rpm_p25: dist.p25,
    rpm_p75: dist.p75,
    rpm_p95: dist.p95,
    rpm_min: dist.min,
    rpm_max: dist.max,
    source_quality: R1_RPM_SOURCE_QUALITY,
  };
}

/** Linear interpolation quantile on sorted array (inclusive). */
function quantileSorted(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 1) return sorted[0]!;
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const w = idx - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

export function rpmBySpeedBandVideo(rows: VideoEligibleRow[]): Array<Record<string, unknown>> {
  return VIDEO_SPEED_BANDS.map((spec) => {
    const inBand = rows.filter((r) => {
      const b = speedBandFor(r.speed_kmh, VIDEO_SPEED_BANDS);
      return b?.band_id === spec.band_id;
    });
    const dist = rpmDistributionVideo(inBand);
    return {
      band_id: spec.band_id,
      v_kmh_min_exclusive: spec.v_kmh_min_exclusive,
      v_kmh_max_inclusive: spec.v_kmh_max_inclusive,
      ...dist,
    };
  });
}

export function rpmBySpeedBandR1(rows: R1SameRowPair[]): Array<Record<string, unknown>> {
  return R1_SPEED_BANDS.map((spec) => {
    const inBand = rows.filter((r) => {
      const b = speedBandFor(r.speed_kmh, R1_SPEED_BANDS);
      return b?.band_id === spec.band_id;
    });
    const dist = rpmDistributionR1(inBand);
    return {
      band_id: spec.band_id,
      v_kmh_min_exclusive: spec.v_kmh_min_exclusive,
      v_kmh_max_inclusive: spec.v_kmh_max_inclusive,
      ...dist,
    };
  });
}

export function ratioBySpeedBandR1(rows: R1SameRowPair[]): Array<Record<string, unknown>> {
  return R1_SPEED_BANDS.map((spec) => {
    const inBand = rows.filter((r) => {
      const b = speedBandFor(r.speed_kmh, R1_SPEED_BANDS);
      return b?.band_id === spec.band_id;
    });
    const dist = numericDistribution(inBand.map((r) => r.ratio));
    const r1RatioSourceQuality = {
      derived_from: "rpm_div_speed_same_r1_row",
      obd_value_precision: "UNKNOWN",
      note: "Ratio is a derived quantity from OBD fields on the same row; video optical policies do not apply.",
    } as const;
    if (dist.status === "AVAILABLE") {
      return {
        band_id: spec.band_id,
        quantity: "ratio_rpm_per_kmh",
        v_kmh_min_exclusive: spec.v_kmh_min_exclusive,
        v_kmh_max_inclusive: spec.v_kmh_max_inclusive,
        ...statisticalPresentationBlock(dist, { cohort: "R1_RATIO_SAME_ROW", temporal_dependence: true }),
        ratio_median: dist.median,
        ratio_p05: dist.p05,
        ratio_p25: dist.p25,
        ratio_p75: dist.p75,
        ratio_p95: dist.p95,
        ratio_min: dist.min,
        ratio_max: dist.max,
        source_quality: r1RatioSourceQuality,
      };
    }
    return {
      band_id: spec.band_id,
      quantity: "ratio_rpm_per_kmh",
      v_kmh_min_exclusive: spec.v_kmh_min_exclusive,
      v_kmh_max_inclusive: spec.v_kmh_max_inclusive,
      status: dist.status,
      reason_code: dist.reason_code,
      n_observations: dist.n_observations,
      source_quality: r1RatioSourceQuality,
    };
  });
}

export function assertP16RegressionDescriptive(
  eligible: VideoEligibleRow[],
  block5: VideoEligibleRow[],
  median: number,
): { pass: boolean; details: string[] } {
  const details: string[] = [];
  let pass = true;
  if (eligible.length !== P16_REGRESSION.videoPairCount) {
    pass = false;
    details.push(`video n ${eligible.length} != ${P16_REGRESSION.videoPairCount}`);
  }
  if (block5.length !== P16_REGRESSION.block5Count) {
    pass = false;
    details.push(`block5 n ${block5.length} != ${P16_REGRESSION.block5Count}`);
  }
  if (Math.abs(median - P16_REGRESSION.ratioMedianVMin20) > 0.02) {
    pass = false;
    details.push(`median ${median} != ${P16_REGRESSION.ratioMedianVMin20}`);
  }
  return { pass, details };
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
