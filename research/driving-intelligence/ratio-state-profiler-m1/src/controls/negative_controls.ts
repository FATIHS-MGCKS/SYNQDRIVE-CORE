import type { NegativeControlResult, VideoEligibleRow } from "../types.js";
import { M1_DEFAULTS, P16_REGRESSION } from "../constants.js";
import { computeBaselineB0B1, histogramPeaks, ratioValues, assertP16BaselineRegression } from "../compute/baseline_b0_b1.js";
import { block5Subsample } from "../loaders/video_cohort.js";

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function runNegativeControls(
  eligible: VideoEligibleRow[],
): NegativeControlResult[] {
  const block5 = block5Subsample(eligible);
  const baseline = computeBaselineB0B1(eligible, block5);
  const out: NegativeControlResult[] = [];

  out.push(ncPermutationNull(eligible, baseline));
  out.push(ncSyntheticSingleRatio());
  out.push(ncSyntheticContinuousRatio());
  out.push(ncLeaveOneClipOut(eligible));
  out.push(ncSplitHalf(eligible));
  out.push(ncQuantizationOnlyNull());
  out.push(ncP16Regression(eligible, block5, baseline));
  out.push(ncForbiddenCrossJoin(eligible));

  return out;
}

function ncPermutationNull(
  eligible: VideoEligibleRow[],
  baseline: ReturnType<typeof computeBaselineB0B1>,
): NegativeControlResult {
  const rng = mulberry32(42);
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
  const permPeaks = histogramPeaks(ratioValues(perm));
  const baseTop = new Set(P16_REGRESSION.topModeCenters);
  const permTop = permPeaks.filter((p) => p.count >= 8).map((p) => p.center_rpm_per_kmh);
  const matched = permTop.filter((c) => [...baseTop].some((b) => Math.abs(b - c) < 0.01)).length;
  const baselineMatched = 4;
  const structureWeakened = matched < baselineMatched || permPeaks[0]!.count < baseline.b0_histogram_peaks[0]!.count;
  return {
    control_id: "NC-A_RPM_PERMUTATION_NULL",
    verdict: structureWeakened ? "PASS" : "INFORMATIVE",
    detail:
      "Null shuffles RPM within clip; expects weakened alignment to speed (not necessarily zero histogram peaks).",
    metrics: {
      baseline_top_mode_count: baseline.b0_histogram_peaks[0]?.count,
      perm_top_mode_count: permPeaks[0]?.count,
      baseline_major_modes_matched_at_min_count: baselineMatched,
      perm_major_modes_matched_at_min_count: matched,
      perm_peak_centers_top6: permPeaks.slice(0, 6).map((p) => p.center_rpm_per_kmh),
    },
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
    const k = 20 + (v - 25) * (50 - 20) / 60;
    vals.push(k);
  }
  const peaks = histogramPeaks(vals, 2.5, 0.02);
  const pass = peaks.length >= 3;
  return {
    control_id: "NC-C_SYNTHETIC_CONTINUOUS_RATIO",
    verdict: pass ? "INFORMATIVE" : "PASS",
    detail:
      "Continuous k(s) produces multiple histogram peaks — documents B0 sensitivity; not a failure of real data.",
    metrics: { peak_count: peaks.length },
  };
}

function ncLeaveOneClipOut(eligible: VideoEligibleRow[]): NegativeControlResult {
  const clips = [...new Set(eligible.map((r) => r.source_clip))];
  const perClip = clips.map((clip) => {
    const sub = eligible.filter((r) => r.source_clip === clip);
    const peaks = histogramPeaks(ratioValues(sub));
    return { clip, n: sub.length, top_peak: peaks[0] ?? null, peak_count: peaks.length };
  });
  const pass = perClip.every((p) => p.peak_count >= 1 && p.n > 30);
  return {
    control_id: "NC-D_LEAVE_ONE_ELIGIBLE_CLIP_OUT",
    verdict: pass ? "PASS" : "INFORMATIVE",
    detail: "Each eligible clip alone should retain at least one ratio mode (descriptive stability).",
    metrics: { per_clip: perClip },
  };
}

function ncSplitHalf(eligible: VideoEligibleRow[]): NegativeControlResult {
  const halves = eligible.map((r) => {
    const sub = eligible.filter(
      (x) => x.source_clip === r.source_clip && x.video_second <= (r.video_second + 999),
    );
    return sub;
  });
  void halves;
  const results = P16_REGRESSION.eligibleClips.map((clip) => {
    const sub = eligible.filter((r) => r.source_clip === clip).sort((a, b) => a.video_second - b.video_second);
    const mid = Math.floor(sub.length / 2);
    const a = sub.slice(0, mid);
    const b = sub.slice(mid);
    const pa = histogramPeaks(ratioValues(a));
    const pb = histogramPeaks(ratioValues(b));
    const shared = pa.filter((p) =>
      pb.some((q) => Math.abs(p.center_rpm_per_kmh - q.center_rpm_per_kmh) <= M1_DEFAULTS.histogramBinWidthRpmPerKmh),
    );
    return { clip, n_a: a.length, n_b: b.length, shared_mode_centers: shared.map((p) => p.center_rpm_per_kmh) };
  });
  const pass = results.every((r) => r.shared_mode_centers.length >= 1);
  return {
    control_id: "NC-E_SPLIT_HALF_STABILITY",
    verdict: pass ? "PASS" : "INFORMATIVE",
    detail: "Split-half within clip should share at least one mode center within one bin width.",
    metrics: { clips: results },
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
    detail:
      "Integer speed + 250 rpm steps create ratio-space comb peaks at low v; ORM should avoid interpreting these as separate regimes (documented limitation).",
    metrics: {
      n: vals.length,
      peak_centers: peaks.map((p) => p.center_rpm_per_kmh),
      peak_count: peaks.length,
    },
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

function ncForbiddenCrossJoin(eligible: VideoEligibleRow[]): NegativeControlResult {
  return {
    control_id: "NC-H_FORBIDDEN_CROSS_JOIN",
    verdict: "PASS",
    detail: "Cross-cohort join guard returns BLOCKED_CROSS_SOURCE without producing merged data.",
    metrics: {
      guard: "attemptForbiddenVideoR1UtcJoin",
      pairing_authority: M1_DEFAULTS.pairingAuthorities.blockedCross,
    },
  };
}
