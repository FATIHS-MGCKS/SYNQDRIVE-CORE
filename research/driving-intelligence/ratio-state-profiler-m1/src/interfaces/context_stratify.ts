import type { DrivingContextLabel, VideoEligibleRow } from "../types.js";
import type { ModeCandidate } from "../types.js";
import { histogramPeaks, ratioValues } from "../compute/baseline_b0_b1.js";

export interface ContextStratumReport {
  context: DrivingContextLabel;
  n: number;
  peaks: ModeCandidate[];
  not_available: boolean;
}

export interface ContextStratifyInput {
  eligible: VideoEligibleRow[];
  labels: Map<string, DrivingContextLabel>;
  min_n: number;
}

export interface ContextStratifyResult {
  status: "DESCRIPTIVE_ONLY_P18A";
  strata: ContextStratumReport[];
}

export function stratifyByDrivingContext(input: ContextStratifyInput): ContextStratifyResult {
  const byContext = new Map<DrivingContextLabel, VideoEligibleRow[]>();
  for (const r of input.eligible) {
    const k = `${r.source_clip}|${r.video_second}`;
    const ctx = input.labels.get(k) ?? "UNKNOWN";
    const list = byContext.get(ctx) ?? [];
    list.push(r);
    byContext.set(ctx, list);
  }
  const strata: ContextStratumReport[] = [];
  for (const [context, rows] of byContext) {
    const n = rows.length;
    strata.push({
      context,
      n,
      peaks: n >= input.min_n ? histogramPeaks(ratioValues(rows)) : [],
      not_available: n < input.min_n,
    });
  }
  strata.sort((a, b) => a.context.localeCompare(b.context));
  return { status: "DESCRIPTIVE_ONLY_P18A", strata };
}
