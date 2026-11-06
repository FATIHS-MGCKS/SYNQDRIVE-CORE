import { readFileSync } from "node:fs";

export interface Video1HzRow {
  source_clip: string;
  video_second: number;
  speed_kmh: number | null;
  speed_quality: string;
}

export function parseVideo1HzCsv(csvPath: string): Video1HzRow[] {
  const text = readFileSync(csvPath, "utf8");
  const lines = text.trim().split("\n");
  const header = lines[0]!.split(",");
  const idx = (name: string) => header.indexOf(name);
  const out: Video1HzRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(",");
    const speedRaw = cols[idx("speed_display_kmh")];
    const parsed =
      speedRaw === "" || speedRaw == null ? null : parseInt(speedRaw, 10);
    out.push({
      source_clip: cols[idx("source_clip")] ?? "",
      video_second: parseInt(String(parseFloat(cols[idx("video_second")] ?? "nan")), 10),
      speed_kmh: Number.isFinite(parsed) ? parsed : null,
      speed_quality: cols[idx("speed_quality")] ?? "",
    });
  }
  return out;
}

/** Complete 1 Hz speed series for one clip, sorted by video_second. */
export function clipSpeedSeries(rows1Hz: Video1HzRow[], clip: string): Video1HzRow[] {
  return rows1Hz
    .filter((r) => r.source_clip === clip)
    .sort((a, b) => a.video_second - b.video_second);
}

export function eligibleClipsFromRows(rows1Hz: Video1HzRow[]): string[] {
  return [...new Set(rows1Hz.map((r) => r.source_clip))].sort();
}
