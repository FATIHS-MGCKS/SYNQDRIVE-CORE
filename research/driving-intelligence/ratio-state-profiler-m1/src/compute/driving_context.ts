import { readFileSync } from "node:fs";
import type { DrivingContextLabel, VideoEligibleRow } from "../types.js";
import { M1_DEFAULTS, P17_1_CONTEXT } from "../constants.js";

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
  return out;
}

export function labelDrivingContextV1(
  eligible: VideoEligibleRow[],
  windows: ManoeuvreWindow[],
): Map<string, DrivingContextLabel> {
  const key = (r: VideoEligibleRow) => `${r.source_clip}|${r.video_second}`;
  const byClip = new Map<string, VideoEligibleRow[]>();
  for (const r of eligible) {
    const list = byClip.get(r.source_clip) ?? [];
    list.push(r);
    byClip.set(r.source_clip, list);
  }
  for (const list of byClip.values()) list.sort((a, b) => a.video_second - b.video_second);

  const labels = new Map<string, DrivingContextLabel>();

  for (const [clip, rows] of byClip) {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const k = key(r);
      if (isBoundarySecond(r.video_second)) {
        labels.set(k, "TRANSITION");
        continue;
      }
      const prev = i > 0 ? rows[i - 1]! : null;
      if (!prev || prev.video_second !== r.video_second - 1) {
        labels.set(k, "UNKNOWN");
        continue;
      }
      const deltaV = r.speed_kmh - prev.speed_kmh;
      let layer1: DrivingContextLabel;
      if (deltaV >= 1) layer1 = "ACCELERATING";
      else if (deltaV <= -1) layer1 = "DECELERATING";
      else if (Math.abs(deltaV) <= 0) {
        layer1 = rollingSteady(rows, i) ? "STEADY" : "STEADY";
      } else layer1 = "STEADY";

      const prevDelta =
        i >= 2 && rows[i - 1]!.video_second === prev.video_second
          ? prev.speed_kmh - rows[i - 2]!.speed_kmh
          : null;
      if (prevDelta != null && Math.sign(prevDelta) !== 0 && Math.sign(deltaV) !== 0 && Math.sign(prevDelta) !== Math.sign(deltaV)) {
        labels.set(k, "TRANSITION");
        continue;
      }

      if (Math.abs(deltaV) <= 1) {
        const w = windowAt(windows, clip, r.video_second);
        if (w?.type === "SPEED_INCREASE" && layer1 === "STEADY") layer1 = "ACCELERATING";
        if (w?.type === "SPEED_DECREASE" && layer1 === "STEADY") layer1 = "DECELERATING";
      }

      labels.set(k, layer1);
    }
  }
  return labels;
}

function isBoundarySecond(s: number): boolean {
  return (M1_DEFAULTS.videoBoundaryExcludeSeconds as readonly number[]).includes(s) ||
    s <= 1 ||
    s >= 178;
}

function rollingSteady(rows: VideoEligibleRow[], i: number): boolean {
  const start = Math.max(0, i - 2);
  const slice = rows.slice(start, i + 1);
  if (slice.length < 2) return true;
  const speeds = slice.map((r) => r.speed_kmh);
  const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  const variance = speeds.reduce((a, b) => a + (b - mean) ** 2, 0) / speeds.length;
  return Math.sqrt(variance) <= 1.0;
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
  let n = 0;
  for (const r of eligible) {
    if (windowAt(windows, r.source_clip, r.video_second)) n++;
  }
  return n;
}

export function assertP171Parity(
  eligible: VideoEligibleRow[],
  windows: ManoeuvreWindow[],
  labels: Map<string, DrivingContextLabel>,
): { pass: boolean; details: string[] } {
  const details: string[] = [];
  let pass = true;
  const inside = countEligibleInsideWindows(eligible, windows);
  if (inside !== P17_1_CONTEXT.windowEligibleOverlapCount) {
    pass = false;
    details.push(`window overlap ${inside} != ${P17_1_CONTEXT.windowEligibleOverlapCount}`);
  }
  for (const r of eligible) {
    const k = `${r.source_clip}|${r.video_second}`;
    if (!labels.has(k)) {
      pass = false;
      details.push(`missing label ${k}`);
    }
  }
  return { pass, details };
}
