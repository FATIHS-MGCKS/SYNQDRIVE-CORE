import { normalizeTireSizeForCompare } from './ai-tire-spec-job-binding.util';

export interface ParsedMetricTireSize {
  widthMm: number;
  aspectRatio: number;
  rimDiameterInch: number;
}

const METRIC_SIZE_RE = /^(\d{2,3})\/(\d{2,3})R(\d{2})$/i;

export function parseMetricTireSizeRaw(raw: string | null | undefined): ParsedMetricTireSize | null {
  if (!raw?.trim()) return null;
  const normalized = normalizeTireSizeForCompare(raw);
  const m = METRIC_SIZE_RE.exec(normalized);
  if (!m) return null;
  const widthMm = Number(m[1]);
  const aspectRatio = Number(m[2]);
  const rimDiameterInch = Number(m[3]);
  if (!Number.isFinite(widthMm) || !Number.isFinite(aspectRatio) || !Number.isFinite(rimDiameterInch)) {
    return null;
  }
  return { widthMm, aspectRatio, rimDiameterInch };
}

export function formatMetricTireSize(parsed: ParsedMetricTireSize): string {
  return `${parsed.widthMm}/${parsed.aspectRatio}R${parsed.rimDiameterInch}`;
}

export function tireSizeRawMatchesTriple(
  tireSizeRaw: string | null | undefined,
  widthMm: number | null | undefined,
  aspectRatio: number | null | undefined,
  rimDiameterInch: number | null | undefined,
): boolean {
  const fromRaw = parseMetricTireSizeRaw(tireSizeRaw ?? null);
  if (!fromRaw) return false;
  if (widthMm == null || aspectRatio == null || rimDiameterInch == null) return false;
  return (
    fromRaw.widthMm === widthMm &&
    fromRaw.aspectRatio === aspectRatio &&
    fromRaw.rimDiameterInch === rimDiameterInch
  );
}
