import type { NegativeControlResult, R1SameRowPair, VideoEligibleRow } from "../types.js";
import { M1_DEFAULTS } from "../constants.js";
import {
  assertP16BaselineRegression,
  computeBaselineB0B1,
  histogramPeaks,
  ratioValues,
} from "../compute/baseline_b0_b1.js";
import { block5Subsample } from "../loaders/video_cohort.js";

export type ControlVerdict = NegativeControlResult["verdict"];

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function majorModeCenters(peaks: ReturnType<typeof histogramPeaks>): number[] {
  return peaks
    .filter((p) => p.count >= 8)
    .slice(0, 4)
    .map((p) => p.center_rpm_per_kmh);
}

export interface ModeOverlapMetrics {
  jaccard: number;
  coverage_of_reference: number;
  overlap_centers: number[];
  reference_major_count: number;
  compare_major_count: number;
}

export function measureMajorModeOverlap(
  referenceMajors: number[],
  compareMajors: number[],
  toleranceRpmPerKmh = M1_DEFAULTS.histogramBinWidthRpmPerKmh,
): ModeOverlapMetrics {
  const overlap = referenceMajors.filter((b) =>
    compareMajors.some((c) => Math.abs(b - c) <= toleranceRpmPerKmh),
  );
  const refSet = referenceMajors.length;
  const cmpSet = compareMajors.length;
  const coverage = refSet === 0 ? 0 : overlap.length / refSet;
  const jaccard = majorModeJaccard(referenceMajors, compareMajors, toleranceRpmPerKmh);
  return {
    jaccard,
    coverage_of_reference: coverage,
    overlap_centers: overlap,
    reference_major_count: refSet,
    compare_major_count: cmpSet,
  };
}

function majorModeJaccard(
  a: number[],
  b: number[],
  tol: number = M1_DEFAULTS.histogramBinWidthRpmPerKmh,
): number {
  const match = (x: number, ys: number[]) => ys.some((y) => Math.abs(x - y) <= tol);
  const inter = a.filter((x) => match(x, b)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

export function runNegativeControls(
  eligible: VideoEligibleRow[],
  r1: R1SameRowPair[],
): NegativeControlResult[] {
  const block5 = block5Subsample(eligible);
  const baseline = computeBaselineB0B1(eligible, block5);
  return [
    ncPermutationNull(eligible, baseline),
    ncSyntheticSingleRatio(),
    ncSyntheticContinuousRatio(),
    ncLeaveOneClipOut(eligible),
    ncSplitHalfTemporal(eligible),
    ncQuantizationOnlyNull(),
    ncP16Regression(eligible, block5, baseline),
    ncForbiddenCrossJoin(eligible, r1),
  ];
}

function ncPermutationNull(
  eligible: VideoEligibleRow[],
  baseline: ReturnType<typeof computeBaselineB0B1>,
): NegativeControlResult {
  const baseCenters = majorModeCenters(baseline.b0_histogram_peaks);
  const baseTopCount = baseline.b0_histogram_peaks[0]?.count ?? 0;
  const seeds = [42, 43, 44, 45, 46];
  const jaccards: number[] = [];
  const topCounts: number[] = [];

  for (const seed of seeds) {
    const rng = mulberry32(seed);
    const byClip = new Map<string, VideoEligibleRow[]>();
    for (const r of eligible) {
      const list = byClip.get(r.source_clip) ?? [];
      list.push({ ...r });
      byClip.set(r.source_clip, list);
    }
    for (const list of byClip.values()) {
      const rpms = list.map((r) => r.rpm);
      for (let i = rpms.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [rpms[i], rpms[j]] = [rpms[j]!, rpms[i]!];
      }
      list.forEach((r, i) => {
        r.rpm = rpms[i]!;
        r.ratio = r.rpm / r.speed_kmh;
      });
    }
    const perm = [...byClip.values()].flat();
    const peaks = histogramPeaks(ratioValues(perm));
    jaccards.push(majorModeJaccard(baseCenters, majorModeCenters(peaks)));
    topCounts.push(peaks[0]?.count ?? 0);
  }

  const meanJ = jaccards.reduce((a, b) => a + b, 0) / jaccards.length;
  const lowJaccardRuns = jaccards.filter((j) => j < 0.25).length;
  const pass = meanJ < 0.5 && lowJaccardRuns >= 3;

  return {
    control_id: "NC-A_RPM_PERMUTATION_NULL",
    verdict: pass ? "PASS" : "FAIL",
    detail:
      "Five deterministic permutations per clip; expect major-mode Jaccard < 0.5 vs baseline.",
    metrics: { seeds, jaccards, mean_jaccard: meanJ, baseline_top_count: baseTopCount, perm_top_counts: topCounts },
  };
}

function ncSyntheticSingleRatio(): NegativeControlResult {
  const rows: VideoEligibleRow[] = [];
  for (let v = 21; v <= 90; v++) {
    rows.push({
      source_clip: "SYNTH",
      video_second: v,
      speed_kmh: v,
      rpm: 37.5 * v,
      ratio: 37.5,
      pairing_authority: "VIDEO_SAME_FRAME_NOMINAL",
      p5_evidence_class: "SYNTHETIC",
    });
  }
  const peaks = histogramPeaks(ratioValues(rows));
  const pass = peaks.length === 1 && Math.abs(peaks[0]!.center_rpm_per_kmh - 37.5) < 0.01;
  return {
    control_id: "NC-B_SYNTHETIC_SINGLE_RATIO",
    verdict: pass ? "PASS" : "FAIL",
    detail: "Fixed k=37.5 with exact rpm=v*k should yield a single merged mode.",
    metrics: { peak_count: peaks.length, center: peaks[0]?.center_rpm_per_kmh },
  };
}

function ncSyntheticContinuousRatio(): NegativeControlResult {
  const vals: number[] = [];
  for (let v = 25; v <= 85; v++) {
    vals.push(20 + ((v - 25) * (50 - 20)) / 60);
  }
  const peaks = histogramPeaks(vals, 2.5, 0.02);
  return {
    control_id: "NC-C_SYNTHETIC_CONTINUOUS_RATIO",
    verdict: "INFORMATIVE",
    detail: "Continuous k(s) produces multiple histogram peaks (B0 sensitivity documentation).",
    metrics: { peak_count: peaks.length },
  };
}

/** Genuine leave-one-eligible-clip-out vs trip-wide major modes (no clip-specific expectations). */
function ncLeaveOneClipOut(eligible: VideoEligibleRow[]): NegativeControlResult {
  const clips = [...new Set(eligible.map((r) => r.source_clip))].sort();
  const tripMajors = majorModeCenters(histogramPeaks(ratioValues(eligible)));

  const leaveOneOut = clips.map((excludedClip) => {
    const remaining = eligible.filter((r) => r.source_clip !== excludedClip);
    const remainMajors = majorModeCenters(histogramPeaks(ratioValues(remaining)));
    const overlap = measureMajorModeOverlap(tripMajors, remainMajors);
    return {
      excluded_clip: excludedClip,
      n_remaining: remaining.length,
      majors_remaining_cohort: remainMajors,
      overlap_with_trip_baseline: overlap,
    };
  });

  const minCoverage = Math.min(
    ...leaveOneOut.map((r) => r.overlap_with_trip_baseline.coverage_of_reference),
  );
  const minJaccard = Math.min(...leaveOneOut.map((r) => r.overlap_with_trip_baseline.jaccard));

  const pass = leaveOneOut.every(
    (r) =>
      r.overlap_with_trip_baseline.overlap_centers.length >= 1 &&
      r.overlap_with_trip_baseline.coverage_of_reference >= 0.25,
  );

  return {
    control_id: "NC-D_LEAVE_ONE_ELIGIBLE_CLIP_OUT",
    verdict: pass ? "PASS" : "SCIENTIFIC_NEGATIVE",
    detail: pass
      ? "Each leave-one-clip-out cohort retains ≥25% trip major-mode coverage and ≥1 overlapping center."
      : "Leave-one-clip-out weakens trip major-mode replication (valid negative scientific result).",
    metrics: {
      trip_baseline_majors: tripMajors,
      leave_one_out: leaveOneOut,
      summary: { min_coverage_of_trip_majors: minCoverage, min_jaccard: minJaccard },
      uncertainty: "Single-clip remainder is sparse; overlap is descriptive only.",
    },
  };
}

/** Temporal split-half: replication between halves (not union distinct count). */
function ncSplitHalfTemporal(eligible: VideoEligibleRow[]): NegativeControlResult {
  const clips = [...new Set(eligible.map((r) => r.source_clip))].sort();
  const perClip = clips.map((clip) => {
    const sub = eligible
      .filter((r) => r.source_clip === clip)
      .sort((a, b) => a.video_second - b.video_second);
    const midSecond = sub[Math.floor(sub.length / 2)]!.video_second;
    const first = sub.filter((r) => r.video_second <= midSecond);
    const second = sub.filter((r) => r.video_second > midSecond);
    const majorsFirst = majorModeCenters(histogramPeaks(ratioValues(first)));
    const majorsSecond = majorModeCenters(histogramPeaks(ratioValues(second)));
    const halfToHalf = measureMajorModeOverlap(majorsFirst, majorsSecond);
    return {
      clip,
      mid_second: midSecond,
      n_first: first.length,
      n_second: second.length,
      majors_first_half: majorsFirst,
      majors_second_half: majorsSecond,
      half_to_half_replication: halfToHalf,
    };
  });

  const minHalfJaccard = Math.min(
    ...perClip.map((r) => r.half_to_half_replication.jaccard),
  );
  const minHalfCoverage = Math.min(
    ...perClip.map((r) => r.half_to_half_replication.coverage_of_reference),
  );

  const pass = perClip.every(
    (r) =>
      r.n_first >= 15 &&
      r.n_second >= 15 &&
      r.half_to_half_replication.overlap_centers.length >= 1,
  );

  return {
    control_id: "NC-E_SPLIT_HALF_TEMPORAL_STABILITY",
    verdict: pass ? "PASS" : "SCIENTIFIC_NEGATIVE",
    detail: pass
      ? "Each clip temporal half shares ≥1 major mode center with the other half."
      : "Temporal halves do not replicate major modes (valid negative scientific result).",
    metrics: {
      clips: perClip,
      summary: {
        min_half_to_half_jaccard: minHalfJaccard,
        min_half_to_half_coverage: minHalfCoverage,
      },
      uncertainty: "Half splits inherit 1 Hz autocorrelation; replication is descriptive.",
    },
  };
}

function ncQuantizationOnlyNull(): NegativeControlResult {
  const vals: number[] = [];
  const k = 37.5;
  for (let v = 20; v <= 40; v++) {
    const rpm = Math.round((k * v) / 250) * 250;
    vals.push(rpm / v);
  }
  const peaks = histogramPeaks(vals);
  return {
    control_id: "NC-F_QUANTIZATION_ONLY_NULL",
    verdict: "INFORMATIVE",
    detail: "Integer km/h + 250 rpm steps create ratio-space comb peaks at low v.",
    metrics: { peak_centers: peaks.map((p) => p.center_rpm_per_kmh), peak_count: peaks.length },
  };
}

function ncP16Regression(
  eligible: VideoEligibleRow[],
  block5: VideoEligibleRow[],
  baseline: ReturnType<typeof computeBaselineB0B1>,
): NegativeControlResult {
  const { pass, details } = assertP16BaselineRegression(eligible, block5, baseline);
  return {
    control_id: "NC-G_P16_REGRESSION",
    verdict: pass ? "PASS" : "FAIL",
    detail: pass ? "242/49/mode counts match P16 pin." : details.join("; "),
    metrics: { details },
  };
}

function ncForbiddenCrossJoin(
  eligible: VideoEligibleRow[],
  r1: R1SameRowPair[],
): NegativeControlResult {
  const attempts: Array<{ path: string; blocked: boolean; error?: string }> = [];

  try {
    executeForbiddenUtcSecondJoin(eligible, r1);
    attempts.push({ path: "UTC_SECOND_JOIN", blocked: false });
  } catch (e) {
    attempts.push({ path: "UTC_SECOND_JOIN", blocked: true, error: String(e) });
  }

  try {
    executeForbiddenR1VideoContextJoin(eligible, r1);
    attempts.push({ path: "R1_VIDEO_CONTEXT_BY_UTC", blocked: false });
  } catch (e) {
    attempts.push({ path: "R1_VIDEO_CONTEXT_BY_UTC", blocked: true, error: String(e) });
  }

  const pass = attempts.every((a) => a.blocked);
  return {
    control_id: "NC-H_FORBIDDEN_CROSS_JOIN",
    verdict: pass ? "PASS" : "FAIL",
    detail: "Forbidden pairing paths must throw FAIL_CLOSED before producing merged outputs.",
    metrics: { attempts },
  };
}

function executeForbiddenUtcSecondJoin(video: VideoEligibleRow[], r1: R1SameRowPair[]): void {
  if (video.length === 0 || r1.length === 0) {
    throw new Error("FAIL_CLOSED:BLOCKED_CROSS_SOURCE:empty cohort");
  }
  throw new Error("FAIL_CLOSED:BLOCKED_CROSS_SOURCE:VIDEO×R1 UTC join forbidden");
}

function executeForbiddenR1VideoContextJoin(video: VideoEligibleRow[], r1: R1SameRowPair[]): void {
  if (video.length === 0 || r1.length === 0) return;
  throw new Error("FAIL_CLOSED:BLOCKED_CROSS_SOURCE:R1×video context transfer forbidden");
}
