import { resolveTemporalCadenceProfileForTier } from '../rpm-hf-v1b/ds4-rpm-hf-v1b-temporal.engine';
import type {
  Ds4RpmShadowCorrelationEffectiveCadenceSource,
  Ds4RpmShadowCorrelationEventTemporalSupportV1,
} from './ds4-rpm-shadow-correlation-v1.contract';
import {
  DS4_RPM_SHADOW_CORRELATION_GAP_DEFICIENCY_ZERO_SEMANTICS,
  DS4_RPM_SHADOW_CORRELATION_MISSING_INTERVAL_ALIAS_SEMANTICS,
} from './ds4-rpm-shadow-correlation-v1.contract';

export const DS4_RPM_SHADOW_CORRELATION_EVENT_WINDOW_HALF_OPEN_NOTE =
  '[startLabelUtcMs, endLabelUtcMsExclusive) where endLabelUtcMsExclusive = parseBucketLabelMs(endLabel) + 1000ms';

export const DS4_RPM_SHADOW_CORRELATION_COVERAGE_MODEL_VERSION =
  'ds4-rpm-shadow-window-relative-gap-v1' as const;

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

function medianSeconds(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function nominalTierCadenceSeconds(tier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | null): number | null {
  if (tier === 'RPM_2S') return 2;
  if (tier === 'RPM_3S') return 3;
  if (tier === 'RPM_1S') return 1;
  return null;
}

/**
 * Trip-level VSI tier remains authoritative; local event spacing may be coarser without
 * inventing finer measurement coverage.
 */
export function localEventCadenceCoarserThanVsiTierNominal(input: {
  authoritativeCadenceTier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S';
  effectiveInterPointCadenceSeconds: number | null;
  effectiveCadenceSource: Ds4RpmShadowCorrelationEffectiveCadenceSource;
}): boolean {
  if (input.effectiveCadenceSource !== 'OBSERVED_MEDIAN_IN_WINDOW') {
    return false;
  }
  if (input.effectiveInterPointCadenceSeconds == null) {
    return false;
  }
  const nominal = nominalTierCadenceSeconds(input.authoritativeCadenceTier);
  if (nominal == null) {
    return false;
  }
  return input.effectiveInterPointCadenceSeconds > nominal + 1e-9;
}

export type WindowRelativeGapMetrics = {
  gapDeficiencySeconds: number;
  leadGapSeconds: number;
  trailGapSeconds: number;
  maxInternalGapSeconds: number;
  effectiveInterPointCadenceSeconds: number | null;
  effectiveCadenceSource: Ds4RpmShadowCorrelationEffectiveCadenceSource;
};

/**
 * Window-relative gap deficiency (translation invariant).
 *
 * Uses observed inter-point cadence when available; otherwise falls back to VSI tier nominal
 * only as an inferred upper-bound hypothesis (not physical measurement support width).
 *
 * With support width UNKNOWN, each observation is treated as an instant at `t_k`.
 */
export function computeWindowRelativeGapMetrics(input: {
  window: ParsedHalfOpenEventWindow;
  sortedPointsMs: readonly number[];
  cadenceTier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | null;
}): WindowRelativeGapMetrics {
  const winStartSec = input.window.startMs / 1000;
  const winEndExclusiveSec = input.window.endExclusiveMs / 1000;
  const eventDurationSeconds = Math.ceil(input.window.durationMs / 1000);

  if (input.sortedPointsMs.length === 0) {
    return {
      gapDeficiencySeconds: eventDurationSeconds,
      leadGapSeconds: eventDurationSeconds,
      trailGapSeconds: eventDurationSeconds,
      maxInternalGapSeconds: 0,
      effectiveInterPointCadenceSeconds: null,
      effectiveCadenceSource: 'UNKNOWN',
    };
  }

  const sorted = [...input.sortedPointsMs].sort((a, b) => a - b);
  const deltasSec: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    deltasSec.push((sorted[i]! - sorted[i - 1]!) / 1000);
  }

  let effectiveInterPointCadenceSeconds: number | null = null;
  let effectiveCadenceSource: Ds4RpmShadowCorrelationEffectiveCadenceSource = 'UNKNOWN';
  if (deltasSec.length > 0) {
    effectiveInterPointCadenceSeconds = medianSeconds(deltasSec);
    effectiveCadenceSource = 'OBSERVED_MEDIAN_IN_WINDOW';
  } else {
    const nominal = nominalTierCadenceSeconds(input.cadenceTier);
    if (nominal != null) {
      effectiveInterPointCadenceSeconds = nominal;
      effectiveCadenceSource = 'INFERRED_FROM_VSI_TIER_NOMINAL';
    }
  }

  const c = effectiveInterPointCadenceSeconds ?? 1;
  const firstSec = sorted[0]! / 1000;
  const lastSec = sorted[sorted.length - 1]! / 1000;
  const leadGapSeconds = Math.max(0, firstSec - winStartSec);
  const trailGapSeconds = Math.max(0, winEndExclusiveSec - lastSec);
  const maxInternalGapSeconds = deltasSec.length > 0 ? Math.max(...deltasSec) : 0;

  let gapDeficiencySeconds =
    Math.max(0, leadGapSeconds - c) +
    Math.max(0, trailGapSeconds - c) +
    deltasSec.reduce((sum, d) => sum + Math.max(0, d - c), 0);

  gapDeficiencySeconds = Math.min(gapDeficiencySeconds, eventDurationSeconds);

  return {
    gapDeficiencySeconds,
    leadGapSeconds,
    trailGapSeconds,
    maxInternalGapSeconds,
    effectiveInterPointCadenceSeconds,
    effectiveCadenceSource,
  };
}

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

function buildTemporalSupportBase(input: {
  window: ParsedHalfOpenEventWindow;
  pointsInHalfOpenWindow: WindowPoint[];
  cadenceTier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | null;
  gapMetrics: WindowRelativeGapMetrics;
  sequenceGapRuleSeconds: number | null;
  sequences: Array<{ startMs: number; endMs: number; pointCount: number }>;
  longest: {
    pointCount: number;
    spanMs: number;
    seq: { startMs: number; endMs: number; pointCount: number } | null;
  };
  spanMs: number | null;
}): Ds4RpmShadowCorrelationEventTemporalSupportV1 {
  const eventWindowDurationSeconds = Math.ceil(input.window.durationMs / 1000);
  return {
    coverageModelVersion: DS4_RPM_SHADOW_CORRELATION_COVERAGE_MODEL_VERSION,
    eventWindowHalfOpenNote: DS4_RPM_SHADOW_CORRELATION_EVENT_WINDOW_HALF_OPEN_NOTE,
    eventWindowDurationSeconds,
    observedPointCountInWindow: input.pointsInHalfOpenWindow.length,
    admittedPointCountInLongestSequence: input.longest.seq?.pointCount ?? 0,
    observedSampleSpanMs: input.spanMs,
    supportedDurationMs: input.longest.seq != null ? input.longest.spanMs : null,
    continuousSequenceCountInWindow: input.sequences.length,
    gapDeficiencySeconds: input.gapMetrics.gapDeficiencySeconds,
    gapDeficiencyZeroSemantics: DS4_RPM_SHADOW_CORRELATION_GAP_DEFICIENCY_ZERO_SEMANTICS,
    missingIntervalSecondsInWindowAliasSemantics:
      DS4_RPM_SHADOW_CORRELATION_MISSING_INTERVAL_ALIAS_SEMANTICS,
    leadGapSeconds: input.gapMetrics.leadGapSeconds,
    trailGapSeconds: input.gapMetrics.trailGapSeconds,
    maxInternalGapSeconds: input.gapMetrics.maxInternalGapSeconds,
    effectiveInterPointCadenceSeconds: input.gapMetrics.effectiveInterPointCadenceSeconds,
    effectiveCadenceSource: input.gapMetrics.effectiveCadenceSource,
    rpmObservationSupportWidthSeconds: 'UNKNOWN',
    missingIntervalSecondsInWindow: input.gapMetrics.gapDeficiencySeconds,
    sequenceGapRuleSeconds: input.sequenceGapRuleSeconds,
    candidateSequenceFromObservedSamples: true,
    v1bAdmittedEventSpanVerified: false,
    authoritativeCadenceTierForCoverage: input.cadenceTier,
    translationInvariantCoverage: true,
  };
}

export function computeEventTemporalSupportV1(input: {
  window: ParsedHalfOpenEventWindow;
  pointsInHalfOpenWindow: WindowPoint[];
  cadenceTier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | null;
}): Ds4RpmShadowCorrelationEventTemporalSupportV1 {
  const gapMetrics = computeWindowRelativeGapMetrics({
    window: input.window,
    sortedPointsMs: input.pointsInHalfOpenWindow.map((p) => p.ms),
    cadenceTier: input.cadenceTier,
  });

  const spanMs =
    input.pointsInHalfOpenWindow.length >= 2
      ? Math.max(...input.pointsInHalfOpenWindow.map((p) => p.ms)) -
        Math.min(...input.pointsInHalfOpenWindow.map((p) => p.ms))
      : input.pointsInHalfOpenWindow.length === 1
        ? 0
        : null;

  if (input.cadenceTier == null) {
    return buildTemporalSupportBase({
      window: input.window,
      pointsInHalfOpenWindow: input.pointsInHalfOpenWindow,
      cadenceTier: null,
      gapMetrics,
      sequenceGapRuleSeconds: null,
      sequences: [],
      longest: { pointCount: 0, spanMs: 0, seq: null },
      spanMs,
    });
  }

  const profile = resolveTemporalCadenceProfileForTier(input.cadenceTier);
  const sequences = buildAdmittedSequences(
    input.pointsInHalfOpenWindow,
    profile.sequenceMaxGapSeconds,
  );
  const longest = sequences.reduce(
    (best, seq) => {
      const spanMsInner = seq.endMs - seq.startMs;
      if (
        seq.pointCount > best.pointCount ||
        (seq.pointCount === best.pointCount && spanMsInner > best.spanMs)
      ) {
        return { pointCount: seq.pointCount, spanMs: spanMsInner, seq };
      }
      return best;
    },
    { pointCount: 0, spanMs: 0, seq: null as (typeof sequences)[number] | null },
  );

  return buildTemporalSupportBase({
    window: input.window,
    pointsInHalfOpenWindow: input.pointsInHalfOpenWindow,
    cadenceTier: input.cadenceTier,
    gapMetrics,
    sequenceGapRuleSeconds: profile.sequenceMaxGapSeconds,
    sequences,
    longest,
    spanMs,
  });
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
  if (input.temporalSupport.gapDeficiencySeconds > 0) {
    return 'PARTIAL';
  }
  if (input.temporalSupport.admittedPointCountInLongestSequence < 2) {
    return 'PARTIAL';
  }
  const supported = input.temporalSupport.supportedDurationMs ?? 0;
  if (supported <= 0 && input.eventDurationMs > 0) {
    return 'PARTIAL';
  }
  if (
    input.temporalSupport.effectiveCadenceSource === 'UNKNOWN' &&
    input.temporalSupport.observedPointCountInWindow >= 2
  ) {
    return 'PARTIAL';
  }
  if (
    input.temporalSupport.authoritativeCadenceTierForCoverage != null &&
    localEventCadenceCoarserThanVsiTierNominal({
      authoritativeCadenceTier: input.temporalSupport.authoritativeCadenceTierForCoverage,
      effectiveInterPointCadenceSeconds: input.temporalSupport.effectiveInterPointCadenceSeconds,
      effectiveCadenceSource: input.temporalSupport.effectiveCadenceSource,
    })
  ) {
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

/** Joint translation of window and observations — classification must be invariant. */
export function translateHalfOpenWindowAndPoints(input: {
  window: ParsedHalfOpenEventWindow;
  points: WindowPoint[];
  deltaMs: number;
}): { window: ParsedHalfOpenEventWindow; points: WindowPoint[] } {
  return {
    window: {
      startMs: input.window.startMs + input.deltaMs,
      endExclusiveMs: input.window.endExclusiveMs + input.deltaMs,
      durationMs: input.window.durationMs,
    },
    points: input.points.map((p) => ({ ms: p.ms + input.deltaMs, value: p.value })),
  };
}
