import { resolveTemporalCadenceProfileForTier } from '../rpm-hf-v1b/ds4-rpm-hf-v1b-temporal.engine';
import type { Ds4RpmShadowCorrelationEventTemporalSupportV1 } from './ds4-rpm-shadow-correlation-v1.contract';

export const DS4_RPM_SHADOW_CORRELATION_EVENT_WINDOW_HALF_OPEN_NOTE =
  '[startLabelUtcMs, endLabelUtcMsExclusive) where endLabelUtcMsExclusive = parseBucketLabelMs(endLabel) + 1000ms';

export type ParsedHalfOpenEventWindow = {
  startMs: number;
  endExclusiveMs: number;
  durationMs: number;
};

export function parseHalfOpenEventWindowMs(
  startLabel: string,
  endLabel: string,
): ParsedHalfOpenEventWindow | null {
  try {
    const startMs = Date.parse(startLabel);
    const endBucketMs = Date.parse(endLabel);
    if (!Number.isFinite(startMs) || !Number.isFinite(endBucketMs)) {
      return null;
    }
    const endExclusiveMs = endBucketMs + 1000;
    if (endExclusiveMs <= startMs) {
      return null;
    }
    return { startMs, endExclusiveMs, durationMs: endExclusiveMs - startMs };
  } catch {
    return null;
  }
}

type WindowPoint = { ms: number; value: number };

function buildAdmittedSequences(
  points: WindowPoint[],
  sequenceMaxGapSeconds: number,
): Array<{ startMs: number; endMs: number; pointCount: number }> {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.ms - b.ms);
  const sequences: Array<{ startMs: number; endMs: number; pointCount: number }> = [];
  let seqStart = sorted[0]!.ms;
  let seqPrev = sorted[0]!.ms;
  let seqCount = 1;

  const close = (): void => {
    sequences.push({ startMs: seqStart, endMs: seqPrev, pointCount: seqCount });
  };

  for (let i = 1; i < sorted.length; i += 1) {
    const curr = sorted[i]!;
    const gapSec = (curr.ms - seqPrev) / 1000;
    if (gapSec > sequenceMaxGapSeconds) {
      close();
      seqStart = curr.ms;
      seqCount = 1;
    } else {
      seqCount += 1;
    }
    seqPrev = curr.ms;
  }
  close();
  return sequences;
}

function missingIntervalSecondsInWindow(input: {
  window: ParsedHalfOpenEventWindow;
  points: WindowPoint[];
  bucketWidthSeconds: number;
}): number {
  const bucketWidthMs = input.bucketWidthSeconds * 1000;
  const firstBucket = Math.floor(input.window.startMs / bucketWidthMs);
  const lastBucket = Math.floor((input.window.endExclusiveMs - 1) / bucketWidthMs);
  if (lastBucket < firstBucket) return 0;

  const observedBuckets = new Set<number>();
  for (const p of input.points) {
    if (p.ms >= input.window.startMs && p.ms < input.window.endExclusiveMs) {
      observedBuckets.add(Math.floor(p.ms / bucketWidthMs));
    }
  }

  let missingSeconds = 0;
  for (let b = firstBucket; b <= lastBucket; b += 1) {
    if (!observedBuckets.has(b)) {
      missingSeconds += input.bucketWidthSeconds;
    }
  }
  return missingSeconds;
}

export function computeEventTemporalSupportV1(input: {
  window: ParsedHalfOpenEventWindow;
  pointsInHalfOpenWindow: WindowPoint[];
  cadenceTier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | null;
}): Ds4RpmShadowCorrelationEventTemporalSupportV1 {
  const tier = input.cadenceTier ?? 'RPM_1S';
  const profile = resolveTemporalCadenceProfileForTier(tier);
  const sequences = buildAdmittedSequences(input.pointsInHalfOpenWindow, profile.sequenceMaxGapSeconds);
  const longest = sequences.reduce(
    (best, seq) => {
      const spanMs = seq.endMs - seq.startMs;
      if (seq.pointCount > best.pointCount || (seq.pointCount === best.pointCount && spanMs > best.spanMs)) {
        return { pointCount: seq.pointCount, spanMs, seq };
      }
      return best;
    },
    { pointCount: 0, spanMs: 0, seq: null as (typeof sequences)[number] | null },
  );

  const spanMs =
    input.pointsInHalfOpenWindow.length >= 2
      ? Math.max(...input.pointsInHalfOpenWindow.map((p) => p.ms)) -
        Math.min(...input.pointsInHalfOpenWindow.map((p) => p.ms))
      : input.pointsInHalfOpenWindow.length === 1
        ? 0
        : null;

  const supportedDurationMs = longest.seq != null ? longest.spanMs : null;
  const missingIntervalSeconds = missingIntervalSecondsInWindow({
    window: input.window,
    points: input.pointsInHalfOpenWindow,
    bucketWidthSeconds: profile.bucketWidthSeconds,
  });

  return {
    eventWindowHalfOpenNote: DS4_RPM_SHADOW_CORRELATION_EVENT_WINDOW_HALF_OPEN_NOTE,
    observedPointCountInWindow: input.pointsInHalfOpenWindow.length,
    admittedPointCountInLongestSequence: longest.seq?.pointCount ?? 0,
    observedSampleSpanMs: spanMs,
    supportedDurationMs,
    continuousSequenceCountInWindow: sequences.length,
    missingIntervalSecondsInWindow: missingIntervalSeconds,
    sequenceGapRuleSeconds: profile.sequenceMaxGapSeconds,
  };
}

export function classifyEventContextFromTemporalSupport(input: {
  hasValueConflicts: boolean;
  hasDuplicateTimestamps: boolean;
  temporalSupport: Ds4RpmShadowCorrelationEventTemporalSupportV1;
  eventDurationMs: number;
}): 'AVAILABLE' | 'PARTIAL' | 'AMBIGUOUS' | 'UNAVAILABLE' {
  if (input.hasValueConflicts) {
    return 'AMBIGUOUS';
  }
  if (input.temporalSupport.observedPointCountInWindow === 0) {
    return 'UNAVAILABLE';
  }
  if (input.temporalSupport.observedPointCountInWindow === 1) {
    return 'PARTIAL';
  }
  if (input.temporalSupport.continuousSequenceCountInWindow > 1) {
    return 'PARTIAL';
  }
  if (input.temporalSupport.missingIntervalSecondsInWindow > 0) {
    return 'PARTIAL';
  }
  if (input.temporalSupport.admittedPointCountInLongestSequence < 2) {
    return 'PARTIAL';
  }
  const supported = input.temporalSupport.supportedDurationMs ?? 0;
  if (supported <= 0 && input.eventDurationMs > 0) {
    return 'PARTIAL';
  }
  return 'AVAILABLE';
}
