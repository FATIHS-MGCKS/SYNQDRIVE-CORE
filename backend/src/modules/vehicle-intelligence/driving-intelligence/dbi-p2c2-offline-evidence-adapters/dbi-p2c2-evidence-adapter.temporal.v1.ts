import type { DbiP2c2AdapterDiagnosticCodeV1 } from './dbi-p2c2-evidence-adapter.contract.v1';

/** Canonical UTC bucket label: `YYYY-MM-DDTHH:mm:ss.sssZ` */
const CANONICAL_UTC_ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isCanonicalProviderBucketLabelIso(label: string): boolean {
  if (!label || typeof label !== 'string') return false;
  if (!CANONICAL_UTC_ISO_MS.test(label)) return false;
  const ms = Date.parse(label);
  return Number.isFinite(ms);
}

export function parseCanonicalBucketLabelMs(label: string): number | null {
  if (!isCanonicalProviderBucketLabelIso(label)) return null;
  const ms = Date.parse(label);
  return Number.isFinite(ms) ? ms : null;
}

export type DbiP2c2TemporalIntervalV1 = {
  startIso: string;
  endIso: string;
  startBucketIndex?: number;
  endBucketIndex?: number;
};

export function collectTemporalViolations(
  intervals: readonly DbiP2c2TemporalIntervalV1[],
): DbiP2c2AdapterDiagnosticCodeV1[] {
  const codes = new Set<DbiP2c2AdapterDiagnosticCodeV1>();

  for (const interval of intervals) {
    if (!isCanonicalProviderBucketLabelIso(interval.startIso) || !isCanonicalProviderBucketLabelIso(interval.endIso)) {
      codes.add('INVALID_PROVIDER_BUCKET_LABEL');
      continue;
    }
    const startMs = parseCanonicalBucketLabelMs(interval.startIso)!;
    const endMs = parseCanonicalBucketLabelMs(interval.endIso)!;
    if (endMs < startMs) {
      codes.add('INVALID_TEMPORAL_INTERVAL_ORDER');
    }
    if (
      interval.startBucketIndex !== undefined &&
      interval.endBucketIndex !== undefined &&
      interval.startBucketIndex > interval.endBucketIndex
    ) {
      codes.add('INVALID_BUCKET_INDEX_ORDER');
    }
  }

  return [...codes];
}
