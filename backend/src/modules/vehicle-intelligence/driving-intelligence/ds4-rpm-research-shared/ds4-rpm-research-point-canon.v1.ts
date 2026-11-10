import { parseHfRpmValueFloat } from '@modules/clickhouse/hf-rpm-value-parse.util';

/** Canonical RPM label point (shared A1 episode + A2 dynamics kernels). */
export type Ds4RpmResearchCanonPointV1 = {
  recordedAtIso: string;
  recordedAtMs: number;
  valueRpm: number;
  globalIdx: number;
};

export type Ds4RpmResearchCanonizationResultV1 = {
  points: Ds4RpmResearchCanonPointV1[];
  identicalDuplicateCollapsedCount: number;
  conflictingDuplicateLabelCount: number;
  invalidTimestampOrRpmCount: number;
  negativeOrNonFiniteRpmExcludedCount: number;
  hasConflictingDuplicates: boolean;
};

/**
 * Deterministic label collapse — exact parity with legacy A1 `canonicalizePoints`.
 * Does not interpolate missing RPM or bridge sequence gaps.
 */
export function canonicalizeDs4RpmResearchPoints(
  raw: ReadonlyArray<{ recordedAtIso: string; valueRpm: number }>,
): Ds4RpmResearchCanonizationResultV1 {
  let invalidTimestampOrRpmCount = 0;
  let negativeOrNonFiniteRpmExcludedCount = 0;
  const valid: { valueRpm: number; recordedAtMs: number }[] = [];
  for (const p of raw) {
    const ms = Date.parse(p.recordedAtIso);
    if (!Number.isFinite(ms)) {
      invalidTimestampOrRpmCount += 1;
      continue;
    }
    const rpm = parseHfRpmValueFloat(p.valueRpm);
    if (rpm == null) {
      if (typeof p.valueRpm === 'number' && p.valueRpm < 0) {
        negativeOrNonFiniteRpmExcludedCount += 1;
      } else {
        invalidTimestampOrRpmCount += 1;
      }
      continue;
    }
    valid.push({ valueRpm: rpm, recordedAtMs: ms });
  }

  valid.sort((a, b) => {
    if (a.recordedAtMs !== b.recordedAtMs) return a.recordedAtMs - b.recordedAtMs;
    return a.valueRpm - b.valueRpm;
  });

  const byEpoch = new Map<number, number[]>();
  for (const p of valid) {
    const arr = byEpoch.get(p.recordedAtMs) ?? [];
    arr.push(p.valueRpm);
    byEpoch.set(p.recordedAtMs, arr);
  }

  let identicalDuplicateCollapsedCount = 0;
  let conflictingDuplicateLabelCount = 0;
  let hasConflictingDuplicates = false;
  const points: Ds4RpmResearchCanonPointV1[] = [];
  let globalIdx = 0;
  const epochs = [...byEpoch.keys()].sort((a, b) => a - b);
  for (const recordedAtMs of epochs) {
    const values = byEpoch.get(recordedAtMs)!;
    const unique = [...new Set(values)];
    if (unique.length > 1) {
      conflictingDuplicateLabelCount += 1;
      hasConflictingDuplicates = true;
      continue;
    }
    if (values.length > 1) {
      identicalDuplicateCollapsedCount += values.length - 1;
    }
    const rpm = unique[0]!;
    points.push({
      recordedAtIso: new Date(recordedAtMs).toISOString(),
      recordedAtMs,
      valueRpm: rpm,
      globalIdx: globalIdx++,
    });
  }

  return {
    points,
    identicalDuplicateCollapsedCount,
    conflictingDuplicateLabelCount,
    invalidTimestampOrRpmCount,
    negativeOrNonFiniteRpmExcludedCount,
    hasConflictingDuplicates,
  };
}

/** Split by v1b-admitted sequence max gap (strict `>` rule). No gap bridging. */
export function splitDs4RpmResearchSequences(
  points: readonly Ds4RpmResearchCanonPointV1[],
  sequenceMaxGapSeconds: number,
): Ds4RpmResearchCanonPointV1[][] {
  if (points.length === 0) return [];
  const sequences: Ds4RpmResearchCanonPointV1[][] = [];
  let current: Ds4RpmResearchCanonPointV1[] = [points[0]!];
  for (let i = 1; i < points.length; i += 1) {
    const gap = (points[i]!.recordedAtMs - points[i - 1]!.recordedAtMs) / 1000;
    if (gap > sequenceMaxGapSeconds) {
      sequences.push(current);
      current = [points[i]!];
    } else {
      current.push(points[i]!);
    }
  }
  sequences.push(current);
  return sequences;
}
