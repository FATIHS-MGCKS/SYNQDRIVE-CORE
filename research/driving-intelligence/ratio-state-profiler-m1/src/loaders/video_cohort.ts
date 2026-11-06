import { readFileSync } from "node:fs";
import type { R1SameRowPair, VideoEligibleRow } from "../types.js";
import { M1_DEFAULTS } from "../constants.js";

export interface QcRow {
  source_clip: string;
  video_second: number;
  speed_kmh: number | null;
  rpm: number | null;
  p5_evidence_class: string;
  raw: Record<string, string>;
}

export function parseP5QcCsv(csvPath: string): QcRow[] {
  const text = readFileSync(csvPath, "utf8");
  const lines = text.trim().split("\n");
  const header = lines[0]!.split(",");
  const idx = (name: string) => header.indexOf(name);
  const rows: QcRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]!);
    const clip = cols[idx("source_clip")] ?? "";
    const s = parseInt(String(parseFloat(cols[idx("video_second")] ?? "nan")), 10);
    const vRaw = cols[idx("source_speed_display_kmh")];
    const rpmRaw = cols[idx("p5_candidate_rpm")];
    rows.push({
      source_clip: clip,
      video_second: s,
      speed_kmh: vRaw ? parseInt(vRaw, 10) : null,
      rpm: rpmRaw ? parseInt(rpmRaw, 10) : null,
      p5_evidence_class: cols[idx("p5_evidence_class")] ?? "",
      raw: Object.fromEntries(header.map((h, j) => [h, cols[j] ?? ""])),
    });
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

export function eligibleVideoRows(
  qc: QcRow[],
  vMin = M1_DEFAULTS.vMinKmh,
): VideoEligibleRow[] {
  const exclude = new Set(M1_DEFAULTS.videoBoundaryExcludeSeconds);
  const out: VideoEligibleRow[] = [];
  for (const r of qc) {
    if (r.p5_evidence_class !== "POSITIVE_RPM_VISUAL_CANDIDATE") continue;
    if (r.speed_kmh == null || r.rpm == null) continue;
    if (r.speed_kmh <= vMin) continue;
    if (exclude.has(r.video_second as 0 | 179)) continue;
    out.push({
      source_clip: r.source_clip,
      video_second: r.video_second,
      speed_kmh: r.speed_kmh,
      rpm: r.rpm,
      ratio: r.rpm / r.speed_kmh,
      pairing_authority: "VIDEO_SAME_FRAME_NOMINAL",
      p5_evidence_class: r.p5_evidence_class,
    });
  }
  return out.sort(
    (a, b) =>
      a.source_clip.localeCompare(b.source_clip) || a.video_second - b.video_second,
  );
}

export function block5Subsample(rows: VideoEligibleRow[]): VideoEligibleRow[] {
  const byClip = new Map<string, VideoEligibleRow[]>();
  for (const r of rows) {
    const list = byClip.get(r.source_clip) ?? [];
    list.push(r);
    byClip.set(r.source_clip, list);
  }
  const out: VideoEligibleRow[] = [];
  for (const [, rs] of byClip) {
    const sorted = [...rs].sort((a, b) => a.video_second - b.video_second);
    for (let i = 0; i < sorted.length; i += M1_DEFAULTS.blockSubsampleStrideSeconds) {
      out.push(sorted[i]!);
    }
  }
  return out;
}

export function parseR1SameRowPairs(s4Path: string, vMin = M1_DEFAULTS.vMinKmh): R1SameRowPair[] {
  const lines = readFileSync(s4Path, "utf8").split("\n");
  const pairs: R1SameRowPair[] = [];
  for (const ln of lines) {
    if (!ln.startsWith('["b",')) continue;
    let arr: unknown;
    try {
      arr = JSON.parse(ln);
    } catch {
      continue;
    }
    if (!Array.isArray(arr) || arr[2] !== "ROW_PRESENT") continue;
    const fields = (arr[4] as unknown[]) ?? [];
    const m = new Map<string, unknown[]>();
    for (const s of fields) {
      if (Array.isArray(s) && s.length >= 3) m.set(String(s[0]), s as unknown[]);
    }
    const sp = m.get("speed");
    const rp = m.get("powertrainCombustionEngineSpeed");
    if (!sp || !rp) continue;
    const v = sp[2];
    const rpm = rp[2];
    if (v == null || rpm == null) continue;
    const speed = Number(v);
    const rpmN = Number(rpm);
    if (speed <= vMin) continue;
    pairs.push({
      bucket_utc: String(arr[1]),
      speed_kmh: speed,
      rpm: rpmN,
      ratio: rpmN / speed,
      pairing_authority: "SAME_EVIDENCE_ROW_INTERVAL_ONLY",
    });
  }
  return pairs;
}

export function assertPairingAuthority(row: { pairing_authority?: string }): void {
  if (!row.pairing_authority) {
    throw new Error("FAIL_CLOSED: missing pairing_authority");
  }
}

/** Synthetic cross-join attempt — must fail closed (no merged table). */
export function attemptForbiddenVideoR1UtcJoin(
  video: VideoEligibleRow[],
  r1: R1SameRowPair[],
): { verdict: "BLOCKED_CROSS_SOURCE"; reason: string } {
  if (video.length > 0 && r1.length > 0) {
    return {
      verdict: "BLOCKED_CROSS_SOURCE",
      reason: "Cross-cohort UTC/timestamp join is forbidden by P16/P17 pairing authority",
    };
  }
  return {
    verdict: "BLOCKED_CROSS_SOURCE",
    reason: "Join function is a guard only — no join output produced",
  };
}
