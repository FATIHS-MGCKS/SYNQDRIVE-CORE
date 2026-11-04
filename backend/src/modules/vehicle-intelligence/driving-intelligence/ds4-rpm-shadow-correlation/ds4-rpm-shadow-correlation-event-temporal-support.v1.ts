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
  const winStart = input.window.startMs;
  const winEnd = input.window.endExclusiveMs;
  const firstBucket = Math.floor(winStart / bucketWidthMs);
  const lastBucket = Math.floor((winEnd - 1) / bucketWidthMs);
  if (lastBucket < firstBucket) return 0;

  let missingMs = 0;
  for (let b = firstBucket; b <= lastBucket; b += 1) {
    const bucketStart = b * bucketWidthMs;
    const bucketEnd = bucketStart + bucketWidthMs;
    const overlapStart = Math.max(winStart, bucketStart);
    const overlapEnd = Math.min(winEnd, bucketEnd);
    if (overlapEnd <= overlapStart) continue;

    let hasPoint = false;
    for (const p of input.points) {
      if (p.ms >= overlapStart && p.ms < overlapEnd) {
        hasPoint = true;
        break;
      }
    }
    if (!hasPoint) {
      missingMs += overlapEnd - overlapStart;
    }
  }

  const eventDurationSeconds = Math.ceil(input.window.durationMs / 1000);
  const missingSeconds = missingMs / 1000;
  return Math.min(missingSeconds, eventDurationSeconds);
}

export function computeEventTemporalSupportV1(input: {
  window: ParsedHalfOpenEventWindow;
  pointsInHalfOpenWindow: WindowPoint[];
  cadenceTier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | null;
}): Ds4RpmShadowCorrelationEventTemporalSupportV1 {
  const eventWindowDurationSeconds = Math.ceil(input.window.durationMs / 1000);
  const authoritativeCadenceTierForCoverage = input.cadenceTier;

  if (authoritativeCadenceTierForCoverage == null) {
    return {
      eventWindowHalfOpenNote: DS4_RPM_SHADOW_CORRELATION_EVENT_WINDOW_HALF_OPEN_NOTE,
      eventWindowDurationSeconds,
      observedPointCountInWindow: input.pointsInHalfOpenWindow.length,
      admittedPointCountInLongestSequence: 0,
      observedSampleSpanMs:
        input.pointsInHalfOpenWindow.length >= 2
          ? Math.max(...input.pointsInHalfOpenWindow.map((p) => p.ms)) -
            Math.min(...input.pointsInHalfOpenWindow.map((p) => p.ms))
          : input.pointsInHalfOpenWindow.length === 1
            ? 0
            : null,
      supportedDurationMs: null,
      continuousSequenceCountInWindow: 0,
      missingIntervalSecondsInWindow: eventWindowDurationSeconds,
      sequenceGapRuleSeconds: null,
      candidateSequenceFromObservedSamples: true,
      v1bAdmittedEventSpanVerified: false,
      authoritativeCadenceTierForCoverage: null,
    };
  }

  const profile = resolveTemporalCadenceProfileForTier(authoritativeCadenceTierForCoverage);
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
    eventWindowDurationSeconds,
    observedPointCountInWindow: input.pointsInHalfOpenWindow.length,
    admittedPointCountInLongestSequence: longest.seq?.pointCount ?? 0,
    observedSampleSpanMs: spanMs,
    supportedDurationMs,
    continuousSequenceCountInWindow: sequences.length,
    missingIntervalSecondsInWindow: missingIntervalSeconds,
    sequenceGapRuleSeconds: profile.sequenceMaxGapSeconds,
    candidateSequenceFromObservedSamples: true,
    v1bAdmittedEventSpanVerified: false,
    authoritativeCadenceTierForCoverage,
  };
}

export function classifyEventContextFromTemporalSupport(input: {
  hasValueConflicts: boolean;
  hasDuplicateTimestamps: boolean;
  temporalSupport: Ds4RpmShadowCorrelationEventTemporalSupportV1;
  eventDurationMs: number;
  defensibleCadenceAllowed: boolean;
}): 'AVAILABLE' | 'PARTIAL' | 'AMBIGUOUS' | 'UNAVAILABLE' {
  if (input.hasValueConflicts) {
    return 'AMBIGUOUS';
  }
  if (input.temporalSupport.observedPointCountInWindow === 0) {
    return 'UNAVAILABLE';
  }
  if (!input.defensibleCadenceAllowed) {
    return input.temporalSupport.observedPointCountInWindow > 0 ? 'PARTIAL' : 'UNAVAILABLE';
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

export function resolveAuthoritativeCadenceTierForCoverage(
  cadenceTierRaw: string | null | undefined,
): 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | null {
  if (cadenceTierRaw === 'RPM_1S' || cadenceTierRaw === 'RPM_2S' || cadenceTierRaw === 'RPM_3S') {
    return cadenceTierRaw;
  }
  return null;
}

export function isDefensibleCadenceContext(input: {
  authoritativeTier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | null;
  analysisReadiness: string | null | undefined;
  tierAnalyticsReady: boolean | null | undefined;
  processingAllowed: boolean | null | undefined;
}): boolean {
  if (!input.authoritativeTier) return false;
  if (input.processingAllowed === false) return false;
  if (input.tierAnalyticsReady === false) return false;
  if (input.analysisReadiness != null && input.analysisReadiness !== 'TIER_ANALYTICS_OK') {
    return false;
  }
  return true;
}
