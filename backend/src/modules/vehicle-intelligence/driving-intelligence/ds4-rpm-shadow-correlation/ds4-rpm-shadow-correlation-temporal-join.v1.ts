import { readPersistedMotionEventIntensityForPayload } from '../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import type { DiV0MotionCoreShadowPayloadV1 } from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type {
  Ds4RpmShadowCorrelationAlignmentDiagnosticV1,
  Ds4RpmShadowCorrelationContextClassification,
  Ds4RpmShadowCorrelationEventResultV1,
  Ds4RpmShadowCorrelationEventTemporalSupportV1,
  Ds4RpmShadowCorrelationInputV1,
  Ds4RpmShadowCorrelationReasonCode,
  Ds4RpmShadowCorrelationSourceTimestampPhase,
} from './ds4-rpm-shadow-correlation-v1.contract';
import { DS4_RPM_SHADOW_CORRELATION_EVENT_WINDOW_HALF_OPEN_NOTE } from './ds4-rpm-shadow-correlation-event-temporal-support.v1';
import {
  classifyEventContextFromTemporalSupport,
  computeEventTemporalSupportV1,
  parseHalfOpenEventWindowMs,
} from './ds4-rpm-shadow-correlation-event-temporal-support.v1';
import { validateDs4RpmShadowCorrelationInput } from './ds4-rpm-shadow-correlation-input-validation.v1';

const SOURCE_TIMESTAMP_PHASE: Ds4RpmShadowCorrelationSourceTimestampPhase = 'UNKNOWN';

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function emptyTemporalSupport(): Ds4RpmShadowCorrelationEventTemporalSupportV1 {
  return {
    eventWindowHalfOpenNote: DS4_RPM_SHADOW_CORRELATION_EVENT_WINDOW_HALF_OPEN_NOTE,
    observedPointCountInWindow: 0,
    admittedPointCountInLongestSequence: 0,
    observedSampleSpanMs: null,
    supportedDurationMs: null,
    continuousSequenceCountInWindow: 0,
    missingIntervalSecondsInWindow: 0,
    sequenceGapRuleSeconds: 2,
  };
}

function resolveCadenceTierForJoin(
  input: Ds4RpmShadowCorrelationInputV1,
): 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | null {
  const raw =
    input.v1b?.summary.admission.qualityExposure.cadenceTier ??
    input.v1b?.summary.tierEvidence?.tier ??
    null;
  if (raw === 'RPM_1S' || raw === 'RPM_2S' || raw === 'RPM_3S') return raw;
  return null;
}

function nominalBucketWidthSeconds(tier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | null): number {
  if (tier === 'RPM_2S') return 2;
  if (tier === 'RPM_3S') return 3;
  return 1;
}

type WindowClassification = {
  classification: Ds4RpmShadowCorrelationContextClassification;
  reasonCodes: Ds4RpmShadowCorrelationReasonCode[];
  authoritativeValues: number[];
  temporalSupport: Ds4RpmShadowCorrelationEventTemporalSupportV1;
  malformedTimestampCount: number;
  hasValueConflicts: boolean;
};

function classifyPointsInHalfOpenWindow(input: {
  points: ReadonlyArray<{ recordedAtIso: string; valueRpm: number }>;
  window: { startMs: number; endExclusiveMs: number; durationMs: number };
  cadenceTier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | null;
  offsetSeconds: number;
}): WindowClassification {
  const shiftMs = input.offsetSeconds * 1000;
  const winStart = input.window.startMs + shiftMs;
  const winEndExclusive = input.window.endExclusiveMs + shiftMs;
  const shiftedWindow = {
    startMs: winStart,
    endExclusiveMs: winEndExclusive,
    durationMs: winEndExclusive - winStart,
  };

  const inWindow: Array<{ ms: number; value: number }> = [];
  let malformedTimestampCount = 0;
  for (const p of input.points) {
    const ms = Date.parse(p.recordedAtIso);
    if (Number.isNaN(ms)) {
      malformedTimestampCount += 1;
      continue;
    }
    if (ms >= winStart && ms < winEndExclusive) {
      inWindow.push({ ms, value: p.valueRpm });
    }
  }

  const temporalSupport = computeEventTemporalSupportV1({
    window: shiftedWindow,
    pointsInHalfOpenWindow: inWindow,
    cadenceTier: input.cadenceTier,
  });

  if (inWindow.length === 0) {
    const reasonCodes: Ds4RpmShadowCorrelationReasonCode[] = ['NO_TEMPORAL_OVERLAP'];
    if (malformedTimestampCount > 0) {
      reasonCodes.push('TIMESTAMP_MALFORMED_IN_WINDOW');
    }
    return {
      classification: 'UNAVAILABLE',
      reasonCodes,
      authoritativeValues: [],
      temporalSupport,
      malformedTimestampCount,
      hasValueConflicts: false,
    };
  }

  const byTs = new Map<number, number[]>();
  for (const row of inWindow) {
    const list = byTs.get(row.ms) ?? [];
    list.push(row.value);
    byTs.set(row.ms, list);
  }

  const reasonCodes: Ds4RpmShadowCorrelationReasonCode[] = ['OK'];
  let hasValueConflicts = false;
  let hasDuplicateTimestamps = false;
  for (const [, vals] of byTs) {
    const uniq = [...new Set(vals)];
    if (uniq.length > 1) {
      hasValueConflicts = true;
      reasonCodes.push('CONFLICTING_RPM_VALUES_IN_WINDOW');
    }
    if (vals.length > 1) {
      hasDuplicateTimestamps = true;
      reasonCodes.push('DUPLICATE_RPM_TIMESTAMPS_IN_WINDOW');
    }
  }

  if (malformedTimestampCount > 0) {
    reasonCodes.push('TIMESTAMP_MALFORMED_IN_WINDOW');
  }

  if (hasValueConflicts) {
    return {
      classification: 'AMBIGUOUS',
      reasonCodes: [...new Set(reasonCodes)],
      authoritativeValues: [],
      temporalSupport,
      malformedTimestampCount,
      hasValueConflicts: true,
    };
  }

  const authoritativeValues: number[] = [];
  for (const [, vals] of byTs) {
    authoritativeValues.push(vals[0]!);
  }

  let classification = classifyEventContextFromTemporalSupport({
    hasValueConflicts: false,
    hasDuplicateTimestamps,
    temporalSupport,
    eventDurationMs: shiftedWindow.durationMs,
  });

  if (classification === 'PARTIAL') {
    reasonCodes.push('INSUFFICIENT_ADMITTED_TEMPORAL_SUPPORT');
  }

  return {
    classification,
    reasonCodes: [...new Set(reasonCodes)],
    authoritativeValues,
    temporalSupport,
    malformedTimestampCount,
    hasValueConflicts: false,
  };
}

function buildAlignmentSensitivity(input: {
  points: ReadonlyArray<{ recordedAtIso: string; valueRpm: number }>;
  window: { startMs: number; endExclusiveMs: number; durationMs: number };
  bucketWidthSec: number;
  cadenceTier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | null;
}): Ds4RpmShadowCorrelationAlignmentDiagnosticV1[] {
  const offsets = [-input.bucketWidthSec, 0, input.bucketWidthSec];
  return offsets.map((offsetSeconds) => {
    const r = classifyPointsInHalfOpenWindow({
      points: input.points,
      window: input.window,
      cadenceTier: input.cadenceTier,
      offsetSeconds,
    });
    return {
      offsetSeconds,
      observedPointCount: r.temporalSupport.observedPointCountInWindow,
      classification: r.classification,
      researchDiagnosticOnly: true as const,
    };
  });
}

function buildUnavailableEvent(input: {
  eventIndex: number;
  event: Ds4RpmShadowCorrelationInputV1['events'][number];
  reasonCodes: Ds4RpmShadowCorrelationReasonCode[];
  tier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | null;
  intensity: { meanAccelMps2: number | null; durationS: number | null } | null;
  coverageNote: string;
}): Ds4RpmShadowCorrelationEventResultV1 {
  const eventId = `motion-ev-${input.eventIndex}-${input.event.startLabel}`;
  return {
    eventIndex: input.eventIndex,
    eventId,
    kind: input.event.kind,
    startLabelUtc: input.event.startLabel,
    endLabelUtc: input.event.endLabel,
    ds4EventQuality: input.event.quality,
    ds4MeanAccelMps2: input.intensity?.meanAccelMps2 ?? null,
    ds4DurationS: input.intensity?.durationS ?? null,
    contextClassification: 'UNAVAILABLE',
    reasonCodes: input.reasonCodes,
    cadenceTier: input.tier,
    cadenceConfidence: null,
    analysisReadiness: null,
    qualityExposureContractVersion: null,
    observedRpmPointCountInWindow: 0,
    eventTemporalSupport: emptyTemporalSupport(),
    admittedWindowCoverageNote: input.coverageNote,
    rpmMin: null,
    rpmMedian: null,
    rpmMax: null,
    observedSampleSpanMs: null,
    sourceTimestampPhase: SOURCE_TIMESTAMP_PHASE,
    alignmentSensitivity: [],
    speedOnlyBaselineNote: 'DS4_SPEED_INTENSITY_ONLY_NO_RPM_CLAIM',
  };
}

export function joinDs4EventsWithRpmEvidenceV1(
  input: Ds4RpmShadowCorrelationInputV1,
  options?: { payloadForIntensity?: DiV0MotionCoreShadowPayloadV1 | null },
): Ds4RpmShadowCorrelationEventResultV1[] {
  const validation = validateDs4RpmShadowCorrelationInput(input);
  const globalFail = !validation.ok ? validation.reasonCodes : null;

  const tier = resolveCadenceTierForJoin(input);
  const bucketWidth = nominalBucketWidthSeconds(tier);
  const points = input.rpmSamples?.points ?? [];
  const v1bCoverageNote = input.v1b?.summary.temporalCoverage.bucketSemanticsNote
    ? `${input.v1b.summary.temporalCoverage.bucketSemanticsNote}; ${input.v1b.summary.temporalCoverage.gapInterpretationPolicy}; impliesFullTripCoverage=false`
    : 'V1B_QUALITY_UNKNOWN';

  return input.events.map((event, eventIndex) => {
    const intensity =
      options?.payloadForIntensity != null
        ? readPersistedMotionEventIntensityForPayload(options.payloadForIntensity, event)
        : event.intensity ?? null;

    if (globalFail) {
      return buildUnavailableEvent({
        eventIndex,
        event,
        reasonCodes: globalFail,
        tier,
        intensity,
        coverageNote: v1bCoverageNote,
      });
    }

    const window = parseHalfOpenEventWindowMs(event.startLabel, event.endLabel);
    if (!window) {
      return buildUnavailableEvent({
        eventIndex,
        event,
        reasonCodes: ['EVENT_WINDOW_INVALID'],
        tier,
        intensity,
        coverageNote: input.v1b!.summary.temporalCoverage.bucketSemanticsNote,
      });
    }

    const primary = classifyPointsInHalfOpenWindow({
      points,
      window,
      cadenceTier: tier,
      offsetSeconds: 0,
    });
    const sensitivity = buildAlignmentSensitivity({
      points,
      window,
      bucketWidthSec: bucketWidth,
      cadenceTier: tier,
    });

    const eventId = `motion-ev-${eventIndex}-${event.startLabel}`;
    const statsValues =
      primary.classification === 'AMBIGUOUS' ? [] : primary.authoritativeValues;

    return {
      eventIndex,
      eventId,
      kind: event.kind,
      startLabelUtc: event.startLabel,
      endLabelUtc: event.endLabel,
      ds4EventQuality: event.quality,
      ds4MeanAccelMps2: intensity?.meanAccelMps2 ?? null,
      ds4DurationS: intensity?.durationS ?? null,
      contextClassification: primary.classification,
      reasonCodes: primary.reasonCodes,
      cadenceTier: tier,
      cadenceConfidence: input.v1b!.summary.admission.qualityExposure.cadenceConfidence ?? null,
      analysisReadiness: input.v1b!.summary.admission.qualityExposure.analysisReadiness ?? null,
      qualityExposureContractVersion:
        input.v1b!.summary.admission.qualityExposure.contractVersion ?? null,
      observedRpmPointCountInWindow: primary.temporalSupport.observedPointCountInWindow,
      eventTemporalSupport: primary.temporalSupport,
      admittedWindowCoverageNote: v1bCoverageNote,
      rpmMin: statsValues.length ? Math.min(...statsValues) : null,
      rpmMedian: median(statsValues),
      rpmMax: statsValues.length ? Math.max(...statsValues) : null,
      observedSampleSpanMs: primary.temporalSupport.observedSampleSpanMs,
      sourceTimestampPhase: SOURCE_TIMESTAMP_PHASE,
      alignmentSensitivity: sensitivity,
      speedOnlyBaselineNote: 'DS4_SPEED_INTENSITY_ONLY_NO_RPM_CLAIM',
    };
  });
}
