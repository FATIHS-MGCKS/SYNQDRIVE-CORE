import type { RatioStableRun, RunBreakClass, VideoEligibleRow } from "../types.js";
import { M1_DEFAULTS } from "../constants.js";

const RPM_POLICY = M1_DEFAULTS.rpmVisualUncertaintyPolicyRpm;

/**
 * Uncertainty-gated segmentation (research foundation only).
 * ±500 rpm is a visual reading policy bound — not calibrated Gaussian/independent uniform noise.
 * k_sigma_policy_exploratory uses uniform half-width/√3 over speed weights — not validated certainty.
 * Run count is not n_eff; small per-step gates can chain across large k drift within one run.
 */
export function segmentRatioStableRuns(rows: VideoEligibleRow[]): {
  runs: RatioStableRun[];
  break_class_counts: Record<RunBreakClass, number>;
  uncertainty_disclaimer: string;
} {
  const sorted = [...rows].sort(
    (a, b) => a.source_clip.localeCompare(b.source_clip) || a.video_second - b.video_second,
  );
  const breakCounts: Record<RunBreakClass, number> = {
    UNCERTAINTY_GATE: 0,
    CLIP_BOUNDARY: 0,
    GAP: 0,
    TRANSITION_CONTEXT: 0,
    DRIFT_WITHIN_RUN: 0,
  };

  type RunAcc = {
    clip: string;
    start: number;
    end: number;
    rows: VideoEligibleRow[];
    break_start?: RunBreakClass;
  };

  const acc: RunAcc[] = [];
  let cur: RunAcc | null = null;

  for (const r of sorted) {
    if (!cur) {
      cur = { clip: r.source_clip, start: r.video_second, end: r.video_second, rows: [r] };
      continue;
    }
    if (r.source_clip !== cur.clip) {
      breakCounts.CLIP_BOUNDARY++;
      acc.push(cur);
      cur = {
        clip: r.source_clip,
        start: r.video_second,
        end: r.video_second,
        rows: [r],
        break_start: "CLIP_BOUNDARY",
      };
      continue;
    }
    const prev: VideoEligibleRow = cur.rows[cur.rows.length - 1]!;
    if (r.video_second !== prev.video_second + 1) {
      breakCounts.GAP++;
      acc.push(cur);
      cur = {
        clip: r.source_clip,
        start: r.video_second,
        end: r.video_second,
        rows: [r],
        break_start: "GAP",
      };
      continue;
    }
    const kPrev = prev.rpm / prev.speed_kmh;
    const kCur = r.rpm / r.speed_kmh;
    const gate = RPM_POLICY * (1 / prev.speed_kmh + 1 / r.speed_kmh);
    if (Math.abs(kCur - kPrev) > gate) {
      breakCounts.UNCERTAINTY_GATE++;
      acc.push(cur);
      cur = {
        clip: r.source_clip,
        start: r.video_second,
        end: r.video_second,
        rows: [r],
        break_start: "UNCERTAINTY_GATE",
      };
      continue;
    }
    cur.rows.push(r);
    cur.end = r.video_second;
  }
  if (cur) acc.push(cur);

  const runs: RatioStableRun[] = acc.map((run) => {
    const kHat = leastSquaresOriginSlope(run.rows);
    const kSpread = withinRunKSpread(run.rows);
    const driftFlag = kSpread > RPM_POLICY / Math.min(...run.rows.map((x) => x.speed_kmh));
    if (driftFlag && run.rows.length >= 3) {
      breakCounts.DRIFT_WITHIN_RUN++;
    }
    return {
      clip: run.clip,
      start_second: run.start,
      end_second: run.end,
      n_seconds: run.rows.length,
      k_hat: kHat,
      k_sigma_policy_exploratory: policyExploratorySigma(run.rows),
      within_run_k_min: kSpread === 0 ? kHat : Math.min(...run.rows.map((r) => r.rpm / r.speed_kmh)),
      within_run_k_max: Math.max(...run.rows.map((r) => r.rpm / r.speed_kmh)),
      drift_within_run_descriptive: driftFlag,
      break_reason_start: run.break_start,
    };
  });

  return {
    runs,
    break_class_counts: breakCounts,
    uncertainty_disclaimer:
      "Runs are uncertainty-gated descriptive segments only; not physical gear persistence. Do not interpret run count as n_eff.",
  };
}

function leastSquaresOriginSlope(rows: VideoEligibleRow[]): number {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    num += r.rpm * r.speed_kmh;
    den += r.speed_kmh * r.speed_kmh;
  }
  return den > 0 ? num / den : 0;
}

function withinRunKSpread(rows: VideoEligibleRow[]): number {
  const ks = rows.map((r) => r.rpm / r.speed_kmh);
  return Math.max(...ks) - Math.min(...ks);
}

function policyExploratorySigma(rows: VideoEligibleRow[]): number {
  const uniformHalfWidth = RPM_POLICY;
  const sigmaRpm = uniformHalfWidth / Math.sqrt(3);
  let den = 0;
  for (const r of rows) den += r.speed_kmh * r.speed_kmh;
  return den > 0 ? sigmaRpm / Math.sqrt(den) : Number.POSITIVE_INFINITY;
}

export function independentRunDiagnostics(runs: RatioStableRun[]): Record<string, unknown> {
  const byClip: Record<string, number> = {};
  for (const r of runs) byClip[r.clip] = (byClip[r.clip] ?? 0) + 1;
  const lens = runs.map((r) => r.n_seconds);
  return {
    run_count_total: runs.length,
    run_count_by_clip: byClip,
    run_length_seconds: {
      min: lens.length ? Math.min(...lens) : 0,
      median: lens.length ? median(lens) : 0,
      max: lens.length ? Math.max(...lens) : 0,
    },
    not_n_eff: true,
  };
}

function median(vals: number[]): number {
  if (vals.length === 0) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}
