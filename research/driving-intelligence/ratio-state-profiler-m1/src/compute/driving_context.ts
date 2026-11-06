import { readFileSync } from "node:fs";
import type { DrivingContextLabel, VideoEligibleRow } from "../types.js";
import { M1_DEFAULTS, P17_1_CONTEXT, P17_1_WINDOW_OVERLAP } from "../constants.js";
import type { Video1HzRow } from "../loaders/video_1hz.js";
import { clipSpeedSeries } from "../loaders/video_1hz.js";

export interface ManoeuvreWindow {
  id: string;
  type: "SPEED_INCREASE" | "SPEED_DECREASE";
  source_clip: string;
  start_video_s: number;
  end_video_s: number;
}

export function loadManoeuvreWindows(csvPath: string): ManoeuvreWindow[] {
  const text = readFileSync(csvPath, "utf8");
  const lines = text.trim().split("\n");
  const header = lines[0]!.split(",");
  const idx = (n: string) => header.indexOf(n);
  const out: ManoeuvreWindow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(",");
    out.push({
      id: `W${String(i).padStart(2, "0")}`,
      type: (cols[idx("type")] ?? "SPEED_INCREASE") as ManoeuvreWindow["type"],
      source_clip: cols[idx("source_clip")] ?? "",
      start_video_s: parseFloat(cols[idx("start_video_s")] ?? "0"),
      end_video_s: parseFloat(cols[idx("end_video_s")] ?? "0"),
    });
  }
  return out.filter((w) =>
    (P16_ELIGIBLE_CLIPS as readonly string[]).includes(w.source_clip),
  );
}

const P16_ELIGIBLE_CLIPS = ["TC_00080.MOV", "TC_00084.MOV"] as const;

const rowKey = (clip: string, second: number) => `${clip}|${second}`;

/**
 * Derive VIDEO_DRIVING_CONTEXT_V1 on the complete sealed 1 Hz display-speed series per clip.
 * Does not expand P16 eligibility — labels are attached only to admissible rows afterward.
 */
export function buildDrivingContextGridFrom1Hz(
  rows1Hz: Video1HzRow[],
  windows: ManoeuvreWindow[],
): Map<string, DrivingContextLabel> {
  const grid = new Map<string, DrivingContextLabel>();

  for (const clip of P16_ELIGIBLE_CLIPS) {
    const series = clipSpeedSeries(rows1Hz, clip);
    if (series.length === 0) continue;

    let prevRow: Video1HzRow | null = null;
    let prevDelta: number | null = null;

    for (const row of series) {
      const k = rowKey(clip, row.video_second);

      if (isClipBoundarySecond(row.video_second)) {
        grid.set(k, "TRANSITION");
        prevRow = row;
        prevDelta = null;
        continue;
      }

      if (row.speed_kmh == null) {
        grid.set(k, "UNKNOWN");
        prevRow = row;
        prevDelta = null;
        continue;
      }

      if (!prevRow || prevRow.speed_kmh == null) {
        grid.set(k, "UNKNOWN");
        prevRow = row;
        prevDelta = null;
        continue;
      }

      if (row.video_second !== prevRow.video_second + 1) {
        grid.set(k, "TRANSITION");
        prevRow = row;
        prevDelta = null;
        continue;
      }

      const deltaV = row.speed_kmh - prevRow.speed_kmh;
      let label = layer1FromDelta(deltaV, series, row.video_second);

      if (
        prevDelta != null &&
        Math.sign(prevDelta) !== 0 &&
        Math.sign(deltaV) !== 0 &&
        Math.sign(prevDelta) !== Math.sign(deltaV)
      ) {
        label = "TRANSITION";
      } else if (Math.abs(deltaV) <= 1) {
        label = applyWindowTieBreak(windows, clip, row.video_second, label);
      }

      grid.set(k, label);
      prevDelta = deltaV;
      prevRow = row;
    }
  }

  return grid;
}

export function attachContextToEligibleRows(
  eligible: VideoEligibleRow[],
  contextGrid: Map<string, DrivingContextLabel>,
): Map<string, DrivingContextLabel> {
  const labels = new Map<string, DrivingContextLabel>();
  for (const r of eligible) {
    const k = rowKey(r.source_clip, r.video_second);
    labels.set(k, contextGrid.get(k) ?? "UNKNOWN");
  }
  return labels;
}

function layer1FromDelta(deltaV: number, series: Video1HzRow[], second: number): DrivingContextLabel {
  if (deltaV >= 1) return "ACCELERATING";
  if (deltaV <= -1) return "DECELERATING";
  if (Math.abs(deltaV) <= 0) {
    return rollingDisplaySteady(series, second) ? "STEADY" : "STEADY";
  }
  return "STEADY";
}

function rollingDisplaySteady(series: Video1HzRow[], second: number): boolean {
  const idx = series.findIndex((r) => r.video_second === second);
  if (idx < 0) return false;
  const start = Math.max(0, idx - 2);
  const slice = series.slice(start, idx + 1).filter((r) => r.speed_kmh != null);
  if (slice.length < 2) return true;
  const speeds = slice.map((r) => r.speed_kmh!);
  const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  const variance = speeds.reduce((a, b) => a + (b - mean) ** 2, 0) / speeds.length;
  return Math.sqrt(variance) <= 1.0;
}

function applyWindowTieBreak(
  windows: ManoeuvreWindow[],
  clip: string,
  second: number,
  layer1: DrivingContextLabel,
): DrivingContextLabel {
  const w = windowAt(windows, clip, second);
  if (!w || layer1 !== "STEADY") return layer1;
  if (w.type === "SPEED_INCREASE") return "ACCELERATING";
  if (w.type === "SPEED_DECREASE") return "DECELERATING";
  return layer1;
}

function isClipBoundarySecond(s: number): boolean {
  return (
    (M1_DEFAULTS.videoBoundaryExcludeSeconds as readonly number[]).includes(s as 0 | 179) ||
    s <= 1 ||
    s >= 178
  );
}

function windowAt(windows: ManoeuvreWindow[], clip: string, s: number): ManoeuvreWindow | null {
  for (const w of windows) {
    if (w.source_clip !== clip) continue;
    if (s >= w.start_video_s && s <= w.end_video_s) return w;
  }
  return null;
}

export function countEligibleInsideWindows(
  eligible: VideoEligibleRow[],
  windows: ManoeuvreWindow[],
): number {
  const keys = new Set<string>();
  for (const r of eligible) {
    if (windowAt(windows, r.source_clip, r.video_second)) {
      keys.add(rowKey(r.source_clip, r.video_second));
    }
  }
  return keys.size;
}

export function assertP171Parity(
  eligible: VideoEligibleRow[],
  windows: ManoeuvreWindow[],
  labels: Map<string, DrivingContextLabel>,
): { pass: boolean; details: string[]; unique_window_overlap: number } {
  const details: string[] = [];
  let pass = true;
  const inside = countEligibleInsideWindows(eligible, windows);
  if (inside !== P17_1_CONTEXT.windowEligibleOverlapUniqueCount) {
    pass = false;
    details.push(
      `unique window overlap ${inside} != ${P17_1_CONTEXT.windowEligibleOverlapUniqueCount}`,
    );
  }
  for (const r of eligible) {
    const k = rowKey(r.source_clip, r.video_second);
    if (!labels.has(k)) {
      pass = false;
      details.push(`missing label ${k}`);
    }
  }
  return { pass, details, unique_window_overlap: inside };
}

export function windowOverlapRootCauseReport(): typeof P17_1_WINDOW_OVERLAP {
  return P17_1_WINDOW_OVERLAP;
}
