import { parseHfRpmValueFloat } from '@modules/clickhouse/hf-rpm-value-parse.util';
import type {
  Ds4PowertrainDemandBindingAbstainReason,
  Ds4MultichannelBucketObservationV1,
} from './ds4-powertrain-demand-research.contract.v1';

export type Ds4CanonicalMultichannelBucketV1 = {
  recordedAtMs: number;
  recordedAtIso: string;
  bucketIndex: number;
  speedKmh: number | null;
  rpm: number | null;
  throttlePct: number | null;
  loadPct: number | null;
  coolantC: number | null;
};

export type Ds4MultichannelCanonicalizeResultV1 = {
  buckets: Ds4CanonicalMultichannelBucketV1[];
  identicalDuplicateCollapsedCount: number;
  conflictingDuplicateBucketCount: number;
  hasConflictingDuplicates: boolean;
  invalidTimestampOrValueCount: number;
  invalidSignalDomainCount: number;
  r1ForbiddenFieldCount: number;
};

const R1_FORBIDDEN_KEYS = ['gear', 'torquePct', 'ignitionOn', 'altitudeM'] as const;

/** OBD throttle / engine load — percent 0..100 inclusive. */
function parsePct0To100(v: unknown): { value: number | null; domainReject: boolean } {
  if (v == null) return { value: null, domainReject: false };
  if (typeof v !== 'number' || !Number.isFinite(v)) return { value: null, domainReject: true };
  if (v < 0 || v > 100) return { value: null, domainReject: true };
  return { value: v, domainReject: false };
}

function parseSpeed(v: unknown): { value: number | null; domainReject: boolean } {
  if (v == null) return { value: null, domainReject: false };
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return { value: null, domainReject: true };
  return { value: v, domainReject: false };
}

/** ECT documented plausible bound for research admission (not OEM legal limit). */
const ECT_MIN_C = -50;
const ECT_MAX_C = 200;

function parseEct(v: unknown): { value: number | null; domainReject: boolean } {
  if (v == null) return { value: null, domainReject: false };
  if (typeof v !== 'number' || !Number.isFinite(v)) return { value: null, domainReject: true };
  if (v < ECT_MIN_C || v > ECT_MAX_C) return { value: null, domainReject: true };
  return { value: v, domainReject: false };
}

export function canonicalizeMultichannelObservations(
  rows: readonly Ds4MultichannelBucketObservationV1[],
): Ds4MultichannelCanonicalizeResultV1 {
  let invalidTimestampOrValueCount = 0;
  let invalidSignalDomainCount = 0;
  let r1ForbiddenFieldCount = 0;
  const valid: Array<{
    recordedAtMs: number;
    recordedAtIso: string;
    speedKmh: number | null;
    rpm: number | null;
    throttlePct: number | null;
    loadPct: number | null;
    coolantC: number | null;
  }> = [];

  for (const row of rows) {
    for (const key of R1_FORBIDDEN_KEYS) {
      const val = row[key as keyof Ds4MultichannelBucketObservationV1];
      if (val != null) {
        r1ForbiddenFieldCount += 1;
      }
    }
    const ms = Date.parse(row.recordedAtIso);
    if (!Number.isFinite(ms)) {
      invalidTimestampOrValueCount += 1;
      continue;
    }
    let domainReject = false;
    const rpm =
      row.rpm == null
        ? null
        : (() => {
            const parsed = parseHfRpmValueFloat(row.rpm);
            if (row.rpm != null && parsed == null) {
              invalidTimestampOrValueCount += 1;
            }
            return parsed;
          })();
    if (row.rpm != null && rpm == null) {
      continue;
    }

    const throttle = parsePct0To100(row.throttlePct);
    const load = parsePct0To100(row.loadPct);
    const speed = parseSpeed(row.speedKmh);
    const coolant = parseEct(row.coolantC);
    domainReject =
      throttle.domainReject || load.domainReject || speed.domainReject || coolant.domainReject;
    if (domainReject) invalidSignalDomainCount += 1;

    valid.push({
      recordedAtMs: ms,
      recordedAtIso: new Date(ms).toISOString(),
      speedKmh: speed.value,
      rpm,
      throttlePct: throttle.value,
      loadPct: load.value,
      coolantC: coolant.value,
    });
  }

  const byEpoch = new Map<
    number,
    {
      speed: number[];
      rpm: number[];
      throttle: number[];
      load: number[];
      coolant: number[];
    }
  >();

  for (const p of valid) {
    const slot = byEpoch.get(p.recordedAtMs) ?? {
      speed: [],
      rpm: [],
      throttle: [],
      load: [],
      coolant: [],
    };
    if (p.speedKmh != null) slot.speed.push(p.speedKmh);
    if (p.rpm != null) slot.rpm.push(p.rpm);
    if (p.throttlePct != null) slot.throttle.push(p.throttlePct);
    if (p.loadPct != null) slot.load.push(p.loadPct);
    if (p.coolantC != null) slot.coolant.push(p.coolantC);
    byEpoch.set(p.recordedAtMs, slot);
  }

  let identicalDuplicateCollapsedCount = 0;
  let conflictingDuplicateBucketCount = 0;
  let hasConflictingDuplicates = false;
  const buckets: Ds4CanonicalMultichannelBucketV1[] = [];
  const epochs = [...byEpoch.keys()].sort((a, b) => a - b);
  let bucketIndex = 0;

  const collapse = (values: number[]): { value: number | null; conflict: boolean; collapsed: number } => {
    if (values.length === 0) return { value: null, conflict: false, collapsed: 0 };
    const unique = [...new Set(values)];
    if (unique.length > 1) return { value: null, conflict: true, collapsed: 0 };
    return { value: unique[0]!, conflict: false, collapsed: Math.max(0, values.length - 1) };
  };

  for (const recordedAtMs of epochs) {
    const slot = byEpoch.get(recordedAtMs)!;
    const speed = collapse(slot.speed);
    const rpm = collapse(slot.rpm);
    const throttle = collapse(slot.throttle);
    const load = collapse(slot.load);
    const coolant = collapse(slot.coolant);
    const conflict = speed.conflict || rpm.conflict || throttle.conflict || load.conflict || coolant.conflict;
    if (conflict) {
      conflictingDuplicateBucketCount += 1;
      hasConflictingDuplicates = true;
      continue;
    }
    identicalDuplicateCollapsedCount +=
      speed.collapsed + rpm.collapsed + throttle.collapsed + load.collapsed + coolant.collapsed;
    buckets.push({
      recordedAtMs,
      recordedAtIso: new Date(recordedAtMs).toISOString(),
      bucketIndex,
      speedKmh: speed.value,
      rpm: rpm.value,
      throttlePct: throttle.value,
      loadPct: load.value,
      coolantC: coolant.value,
    });
    bucketIndex += 1;
  }

  return {
    buckets,
    identicalDuplicateCollapsedCount,
    conflictingDuplicateBucketCount,
    hasConflictingDuplicates,
    invalidTimestampOrValueCount,
    invalidSignalDomainCount,
    r1ForbiddenFieldCount,
  };
}

export function splitMultichannelSequences(
  buckets: readonly Ds4CanonicalMultichannelBucketV1[],
  sequenceMaxGapSeconds: number,
): Ds4CanonicalMultichannelBucketV1[][] {
  if (buckets.length === 0) return [];
  const maxGapMs = sequenceMaxGapSeconds * 1000;
  const sequences: Ds4CanonicalMultichannelBucketV1[][] = [];
  let current: Ds4CanonicalMultichannelBucketV1[] = [buckets[0]!];
  for (let i = 1; i < buckets.length; i += 1) {
    const gap = buckets[i]!.recordedAtMs - buckets[i - 1]!.recordedAtMs;
    if (gap > maxGapMs) {
      sequences.push(current);
      current = [buckets[i]!];
    } else {
      current.push(buckets[i]!);
    }
  }
  sequences.push(current);
  return sequences;
}

export type Ds4MultichannelRpmParityVerdictV1 =
  | { ok: true }
  | {
      ok: false;
      reason: Extract<
        Ds4PowertrainDemandBindingAbstainReason,
        | 'V1A_RPM_DUPLICATE_CONFLICT'
        | 'RPM_V1A_UNMATCHED_LABEL'
        | 'RPM_V1A_EXTRA_MULTICHANNEL_LABEL'
        | 'RPM_V1A_VALUE_MISMATCH'
      >;
      mismatchCount: number;
    };

export function verifyMultichannelRpmParityWithV1a(input: {
  buckets: readonly Ds4CanonicalMultichannelBucketV1[];
  rpmPoints: ReadonlyArray<{ recordedAtIso: string; valueRpm: number }>;
}): Ds4MultichannelRpmParityVerdictV1 {
  const rpmByEpoch = new Map<number, number>();
  for (const p of input.rpmPoints) {
    const ms = Date.parse(p.recordedAtIso);
    if (!Number.isFinite(ms)) continue;
    const rpm = parseHfRpmValueFloat(p.valueRpm);
    if (rpm == null) continue;
    const prev = rpmByEpoch.get(ms);
    if (prev != null && Math.abs(prev - rpm) > 0.01) {
      return { ok: false, reason: 'V1A_RPM_DUPLICATE_CONFLICT', mismatchCount: 1 };
    }
    rpmByEpoch.set(ms, rpm);
  }

  let mismatchCount = 0;
  for (const b of input.buckets) {
    if (b.rpm == null) continue;
    const expected = rpmByEpoch.get(b.recordedAtMs);
    if (expected == null) {
      return { ok: false, reason: 'RPM_V1A_EXTRA_MULTICHANNEL_LABEL', mismatchCount: 1 };
    }
    if (Math.abs(expected - b.rpm) > 0.01) {
      mismatchCount += 1;
    }
  }
  if (mismatchCount > 0) {
    return { ok: false, reason: 'RPM_V1A_VALUE_MISMATCH', mismatchCount };
  }
  return { ok: true };
}
