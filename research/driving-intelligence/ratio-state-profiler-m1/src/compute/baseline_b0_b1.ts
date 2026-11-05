import type { BaselineB0B1, ModeCandidate, VideoEligibleRow } from "../types.js";
import { M1_DEFAULTS, P16_REGRESSION } from "../constants.js";

export function ratioValues(rows: VideoEligibleRow[]): number[] {
  return rows.map((r) => r.ratio);
}

export function histogramPeaks(
  vals: number[],
  binW = M1_DEFAULTS.histogramBinWidthRpmPerKmh,
  minFrac = M1_DEFAULTS.peakMinFraction,
): ModeCandidate[] {
  if (vals.length === 0) return [];
  const bins = new Map<number, number>();
  for (const v of vals) {
    const b = Math.round(v / binW) * binW;
    bins.set(b, (bins.get(b) ?? 0) + 1);
  }
  const n = vals.length;
  const items = [...bins.entries()].sort((a, b) => a[0] - b[0]);
  const peaks: ModeCandidate[] = [];
  for (let i = 0; i < items.length; i++) {
    const [b, c] = items[i]!;
    const left = i > 0 ? items[i - 1]![1] : 0;
    const right = i + 1 < items.length ? items[i + 1]![1] : 0;
    if (c >= Math.max(left, right) && c / n >= minFrac) {
      peaks.push({
        id: "",
        center_rpm_per_kmh: b,
        count: c,
        fraction: Math.round((c / n) * 1000) / 1000,
      });
    }
  }
  peaks.sort((a, b) => b.count - a.count);
  return mergeOverlappingPeaks(peaks);
}

export function mergeOverlappingPeaks(peaks: ModeCandidate[]): ModeCandidate[] {
  if (peaks.length === 0) return peaks;
  const sorted = [...peaks].sort((a, b) => a.center_rpm_per_kmh - b.center_rpm_per_kmh);
  const merged: ModeCandidate[] = [];
  let cur = { ...sorted[0]! };
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i]!;
    if (p.center_rpm_per_kmh - cur.center_rpm_per_kmh < M1_DEFAULTS.modeMergeMaxCenterDeltaRpmPerKmh) {
      const total = cur.count + p.count;
      cur = {
        id: "",
        center_rpm_per_kmh: (cur.center_rpm_per_kmh * cur.count + p.center_rpm_per_kmh * p.count) / total,
        count: total,
        fraction: cur.fraction + p.fraction,
      };
    } else {
      merged.push(cur);
      cur = { ...p };
    }
  }
  merged.push(cur);
  merged.sort((a, b) => b.count - a.count);
  return merged.map((p, i) => ({ ...p, id: `RATIO_MODE_CANDIDATE_${i + 1}` }));
}

export function computeBaselineB0B1(rows: VideoEligibleRow[], block5: VideoEligibleRow[]): BaselineB0B1 {
  const b0 = histogramPeaks(ratioValues(rows));
  const b0Top = b0.slice(0, 4).map((p) => p.center_rpm_per_kmh);
  return {
    b0_histogram_peaks: b0,
    b0_top_four_centers: b0Top,
    block5_n: block5.length,
    block5_peaks: histogramPeaks(ratioValues(block5)),
  };
}

export function assertP16BaselineRegression(
  rows: VideoEligibleRow[],
  block5: VideoEligibleRow[],
  b0: BaselineB0B1,
): { pass: boolean; details: string[] } {
  const details: string[] = [];
  let pass = true;
  if (rows.length !== P16_REGRESSION.videoPairCount) {
    pass = false;
    details.push(`video n ${rows.length} != ${P16_REGRESSION.videoPairCount}`);
  }
  if (block5.length !== P16_REGRESSION.block5Count) {
    pass = false;
    details.push(`block5 n ${block5.length} != ${P16_REGRESSION.block5Count}`);
  }
  const clips = new Set(rows.map((r) => r.source_clip));
  for (const c of P16_REGRESSION.eligibleClips) {
    if (!clips.has(c)) {
      pass = false;
      details.push(`missing clip ${c}`);
    }
  }
  for (const center of P16_REGRESSION.topModeCenters) {
    const peak = b0.b0_histogram_peaks.find((p) => Math.abs(p.center_rpm_per_kmh - center) < 0.01);
    const exp = P16_REGRESSION.topModeCounts[center as keyof typeof P16_REGRESSION.topModeCounts];
    if (!peak || peak.count !== exp) {
      pass = false;
      details.push(`mode ${center} count ${peak?.count ?? "missing"} != ${exp}`);
    }
  }
  const med = median(ratioValues(rows));
  if (Math.abs(med - P16_REGRESSION.ratioMedianVMin20) > 0.01) {
    pass = false;
    details.push(`median ${med} != ${P16_REGRESSION.ratioMedianVMin20}`);
  }
  return { pass, details };
}

function median(vals: number[]): number {
  if (vals.length === 0) return NaN;
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function fableBandCounts(vals: number[]): Record<string, number> {
  return {
    "20-25": vals.filter((x) => x >= 20 && x < 27.5).length,
    "40-45": vals.filter((x) => x >= 37.5 && x < 47.5).length,
    "55-60": vals.filter((x) => x >= 52.5 && x < 62.5).length,
  };
}

export function reportHasForbiddenGearFields(obj: unknown, path = ""): string[] {
  const hits: string[] = [];
  if (obj && typeof obj === "object") {
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => hits.push(...reportHasForbiddenGearFields(v, `${path}[${i}]`)));
    } else {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const p = path ? `${path}.${k}` : k;
        if (/gear_number|gear_index|shift_confirmed|confirmed_shift/i.test(k)) {
          hits.push(p);
        }
        hits.push(...reportHasForbiddenGearFields(v, p));
      }
    }
  }
  return hits;
}
