import { readPersistedMotionEventIntensityForPayload } from '../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import type { DiV0MotionCoreShadowPayloadV1 } from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import {
  buildAlignmentOffsetSecondsProbes,
  buildDs4RpmShadowCorrelationAlignmentEnvelopeSemantics,
  computeAlignmentClassificationStability,
  computeTheilSenDirectionSign,
} from './ds4-rpm-shadow-correlation-alignment-envelope.v1';
import {
  isIceRpmEventContextBlocked,
  resolveIceRpmEventApplicability,
} from './ds4-rpm-shadow-correlation-ice-applicability.v1';
import type {
  Ds4RpmShadowCorrelationAlignmentEnvelopeV1,
  Ds4RpmShadowCorrelationContextClassification,
  Ds4RpmShadowCorrelationDescriptiveRpmStatsV1,
  Ds4RpmShadowCorrelationEventResultV1,
  Ds4RpmShadowCorrelationEventTemporalSupportV1,
  Ds4RpmShadowCorrelationInputV1,
  Ds4RpmShadowCorrelationReasonCode,
  Ds4RpmShadowCorrelationSourceTimestampPhase,
} from './ds4-rpm-shadow-correlation-v1.contract';
import {
  DS4_RPM_SHADOW_CORRELATION_EVENT_WINDOW_HALF_OPEN_NOTE,
  DS4_RPM_SHADOW_CORRELATION_COVERAGE_MODEL_VERSION,
} from './ds4-rpm-shadow-correlation-event-temporal-support.v1';
import {
  classifyEventContextFromTemporalSupport,
  computeEventTemporalSupportV1,
  isDefensibleCadenceContext,
  localEventCadenceCoarserThanVsiTierNominal,
  parseHalfOpenEventWindowMs,
  resolveAuthoritativeCadenceTierForCoverage,
} from './ds4-rpm-shadow-correlation-event-temporal-support.v1';
import type { Ds4RpmShadowCorrelationProvenanceGateV1 } from './ds4-rpm-shadow-correlation-provenance-gate.v1';
import { validateDs4RpmShadowCorrelationProvenanceGate } from './ds4-rpm-shadow-correlation-provenance-gate.v1';
import { DS4_RPM_SHADOW_CORRELATION_RPM_ORDER_STATISTICS_SEMANTICS } from './ds4-rpm-shadow-correlation-v1.contract';
import {
  DS4_RPM_SHADOW_CORRELATION_DIRECTION_ESTIMATE_METHOD,
  DS4_RPM_SHADOW_CORRELATION_DIRECTION_ESTIMATE_VALIDATION,
  DS4_RPM_SHADOW_CORRELATION_GAP_DEFICIENCY_ZERO_SEMANTICS,
  DS4_RPM_SHADOW_CORRELATION_MISSING_INTERVAL_ALIAS_SEMANTICS,
} from './ds4-rpm-shadow-correlation-v1.contract';

const SOURCE_TIMESTAMP_PHASE: Ds4RpmShadowCorrelationSourceTimestampPhase = 'UNKNOWN';

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function emptyTemporalSupport(): Ds4RpmShadowCorrelationEventTemporalSupportV1 {
  return {
    coverageModelVersion: DS4_RPM_SHADOW_CORRELATION_COVERAGE_MODEL_VERSION,
    eventWindowHalfOpenNote: DS4_RPM_SHADOW_CORRELATION_EVENT_WINDOW_HALF_OPEN_NOTE,
    eventWindowDurationSeconds: 0,
    observedPointCountInWindow: 0,
    admittedPointCountInLongestSequence: 0,
    observedSampleSpanMs: null,
    supportedDurationMs: null,
    continuousSequenceCountInWindow: 0,
    gapDeficiencySeconds: 0,
    gapDeficiencyZeroSemantics: DS4_RPM_SHADOW_CORRELATION_GAP_DEFICIENCY_ZERO_SEMANTICS,
    missingIntervalSecondsInWindowAliasSemantics:
      DS4_RPM_SHADOW_CORRELATION_MISSING_INTERVAL_ALIAS_SEMANTICS,
    leadGapSeconds: 0,
    trailGapSeconds: 0,
    maxInternalGapSeconds: 0,
    effectiveInterPointCadenceSeconds: null,
    effectiveCadenceSource: 'UNKNOWN',
    rpmObservationSupportWidthSeconds: 'UNKNOWN',
    missingIntervalSecondsInWindow: 0,
    sequenceGapRuleSeconds: null,
    candidateSequenceFromObservedSamples: true,
    v1bAdmittedEventSpanVerified: false,
    authoritativeCadenceTierForCoverage: null,
    translationInvariantCoverage: true,
  };
}

function emptyDescriptiveStats(): Ds4RpmShadowCorrelationDescriptiveRpmStatsV1 {
  return {
    orderStatisticsSemantics: DS4_RPM_SHADOW_CORRELATION_RPM_ORDER_STATISTICS_SEMANTICS,
    directionEstimateMethod: DS4_RPM_SHADOW_CORRELATION_DIRECTION_ESTIMATE_METHOD,
    directionEstimateValidation: DS4_RPM_SHADOW_CORRELATION_DIRECTION_ESTIMATE_VALIDATION,
    rpmFirstObserved: null,
    rpmLastObserved: null,
    rpmEndpointDelta: null,
    robustDirectionSign: 'ABSTAIN_INSUFFICIENT_SUPPORT',
    directionAbstainReason: 'INSUFFICIENT_OBSERVATIONS_FOR_DIRECTION',
  };
}

function emptyAlignmentEnvelope(): Ds4RpmShadowCorrelationAlignmentEnvelopeV1 {
  const semantics = buildDs4RpmShadowCorrelationAlignmentEnvelopeSemantics();
  return {
    ds4LabelUncertaintySeconds: semantics.ds4LabelUncertaintySeconds,
    ds4KernelHalfSupportSeconds: semantics.ds4KernelHalfSupportSeconds,
    rpmAggregationSupportWidthSeconds: 'UNKNOWN',
    providerTimestampPhase: 'UNKNOWN',
    ds4SideAlignmentBoundSeconds: semantics.ds4SideAlignmentBoundSeconds,
    offsetSecondsProbed: [],
    offsetDerivationNote: semantics.offsetDerivationNote,
    classificationStableAcrossEnvelope: false,
    directionSignStableAcrossEnvelope: false,
    directionSignEnvelopeStability: 'NOT_ASSESSABLE',
  };
}

function buildDescriptiveStats(input: {
  timeOrderedSeries: ReadonlyArray<{ tMs: number; valueRpm: number }>;
  hasValueConflicts: boolean;
}): Ds4RpmShadowCorrelationDescriptiveRpmStatsV1 {
  const direction = computeTheilSenDirectionSign({
    series: input.timeOrderedSeries,
    hasValueConflicts: input.hasValueConflicts,
  });
  if (input.timeOrderedSeries.length === 0) {
    return {
      orderStatisticsSemantics: DS4_RPM_SHADOW_CORRELATION_RPM_ORDER_STATISTICS_SEMANTICS,
      directionEstimateMethod: DS4_RPM_SHADOW_CORRELATION_DIRECTION_ESTIMATE_METHOD,
      directionEstimateValidation: DS4_RPM_SHADOW_CORRELATION_DIRECTION_ESTIMATE_VALIDATION,
      rpmFirstObserved: null,
      rpmLastObserved: null,
      rpmEndpointDelta: null,
      robustDirectionSign: direction.robustDirectionSign,
      directionAbstainReason: direction.directionAbstainReason,
    };
  }
  const sorted = [...input.timeOrderedSeries].sort((a, b) => a.tMs - b.tMs);
  const first = sorted[0]!.valueRpm;
  const last = sorted[sorted.length - 1]!.valueRpm;
  return {
    orderStatisticsSemantics: DS4_RPM_SHADOW_CORRELATION_RPM_ORDER_STATISTICS_SEMANTICS,
    directionEstimateMethod: DS4_RPM_SHADOW_CORRELATION_DIRECTION_ESTIMATE_METHOD,
    directionEstimateValidation: DS4_RPM_SHADOW_CORRELATION_DIRECTION_ESTIMATE_VALIDATION,
    rpmFirstObserved: first,
    rpmLastObserved: last,
    rpmEndpointDelta: last - first,
    robustDirectionSign: direction.robustDirectionSign,
    directionAbstainReason: direction.directionAbstainReason,
  };
}

function resolveCadenceTierLabel(input: Ds4RpmShadowCorrelationInputV1): string | null {
  return (
    input.v1b?.summary.admission.qualityExposure.cadenceTier ??
    input.v1b?.summary.tierEvidence?.tier ??
    null
  );
}

function resolveAuthoritativeCadenceTierForJoin(
  input: Ds4RpmShadowCorrelationInputV1,
): 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | null {
  return resolveAuthoritativeCadenceTierForCoverage(resolveCadenceTierLabel(input));
}

type WindowClassification = {
  classification: Ds4RpmShadowCorrelationContextClassification;
  reasonCodes: Ds4RpmShadowCorrelationReasonCode[];
  authoritativeValues: number[];
  temporalSupport: Ds4RpmShadowCorrelationEventTemporalSupportV1;
  malformedTimestampCount: number;
  hasValueConflicts: boolean;
  descriptiveRpmStats: Ds4RpmShadowCorrelationDescriptiveRpmStatsV1;
};

function classifyPointsInHalfOpenWindow(input: {
  points: ReadonlyArray<{ recordedAtIso: string; valueRpm: number }>;
  window: { startMs: number; endExclusiveMs: number; durationMs: number };
  cadenceTier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | null;
  offsetSeconds: number;
  defensibleCadenceAllowed: boolean;
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
      descriptiveRpmStats: emptyDescriptiveStats(),
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

  const zeroWhileMovingSuspect =
    inWindow.some((p) => p.value === 0) && inWindow.length >= 2;
  if (zeroWhileMovingSuspect) {
    reasonCodes.push('ZERO_RPM_OBSERVED_NOT_ENGINE_OFF_INFERENCE');
  }

  if (hasValueConflicts) {
    return {
      classification: 'AMBIGUOUS',
      reasonCodes: [...new Set(reasonCodes)],
      authoritativeValues: [],
      temporalSupport,
      malformedTimestampCount,
      hasValueConflicts: true,
      descriptiveRpmStats: buildDescriptiveStats({ timeOrderedSeries: [], hasValueConflicts: true }),
    };
  }

  const sortedMs = [...byTs.keys()].sort((a, b) => a - b);
  const authoritativeValues: number[] = [];
  const timeOrderedSeries: Array<{ tMs: number; valueRpm: number }> = [];
  for (const ms of sortedMs) {
    const valueRpm = byTs.get(ms)![0]!;
    authoritativeValues.push(valueRpm);
    timeOrderedSeries.push({ tMs: ms, valueRpm });
  }

  let classification = classifyEventContextFromTemporalSupport({
    hasValueConflicts: false,
    hasDuplicateTimestamps,
    temporalSupport,
    eventDurationMs: shiftedWindow.durationMs,
    defensibleCadenceAllowed: input.defensibleCadenceAllowed,
  });

  if (!input.defensibleCadenceAllowed && classification === 'AVAILABLE') {
    classification = 'PARTIAL';
  }

  if (!input.defensibleCadenceAllowed && temporalSupport.observedPointCountInWindow > 0) {
    reasonCodes.push('V1B_CADENCE_TIER_NOT_AUTHORITATIVE');
  }

  if (classification === 'PARTIAL') {
    if (
      temporalSupport.authoritativeCadenceTierForCoverage != null &&
      localEventCadenceCoarserThanVsiTierNominal({
        authoritativeCadenceTier: temporalSupport.authoritativeCadenceTierForCoverage,
        effectiveInterPointCadenceSeconds: temporalSupport.effectiveInterPointCadenceSeconds,
        effectiveCadenceSource: temporalSupport.effectiveCadenceSource,
      })
    ) {
      reasonCodes.push('LOCAL_EVENT_CADENCE_COARSER_THAN_VSI_TIER');
    } else {
      reasonCodes.push('INSUFFICIENT_ADMITTED_TEMPORAL_SUPPORT');
    }
  }

  return {
    classification,
    reasonCodes: [...new Set(reasonCodes)],
    authoritativeValues,
    temporalSupport,
    malformedTimestampCount,
    hasValueConflicts: false,
    descriptiveRpmStats: buildDescriptiveStats({ timeOrderedSeries, hasValueConflicts: false }),
  };
}

function buildAlignmentSensitivity(input: {
  points: ReadonlyArray<{ recordedAtIso: string; valueRpm: number }>;
  window: { startMs: number; endExclusiveMs: number; durationMs: number };
  cadenceTier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | null;
  defensibleCadenceAllowed: boolean;
  effectiveInterPointCadenceSeconds: number | null;
}): {
  diagnostics: Ds4RpmShadowCorrelationEventResultV1['alignmentSensitivity'];
  envelope: Ds4RpmShadowCorrelationAlignmentEnvelopeV1;
} {
  const semantics = buildDs4RpmShadowCorrelationAlignmentEnvelopeSemantics();
  const offsets = buildAlignmentOffsetSecondsProbes({
    cadenceTier: input.cadenceTier,
    effectiveInterPointCadenceSeconds: input.effectiveInterPointCadenceSeconds,
  });

  if (input.cadenceTier == null) {
    return {
      diagnostics: [],
      envelope: {
        ...emptyAlignmentEnvelope(),
        offsetDerivationNote: semantics.offsetDerivationNote,
      },
    };
  }

  const diagnostics = offsets.map((offsetSeconds) => {
    const r = classifyPointsInHalfOpenWindow({
      points: input.points,
      window: input.window,
      cadenceTier: input.cadenceTier,
      offsetSeconds,
      defensibleCadenceAllowed: input.defensibleCadenceAllowed,
    });
    return {
      offsetSeconds,
      observedPointCount: r.temporalSupport.observedPointCountInWindow,
      classification: r.classification,
      gapDeficiencySeconds: r.temporalSupport.gapDeficiencySeconds,
      robustDirectionSign: r.descriptiveRpmStats.robustDirectionSign,
      researchDiagnosticOnly: true as const,
    };
  });

  const stability = computeAlignmentClassificationStability({ diagnostics });

  return {
    diagnostics,
    envelope: {
      ds4LabelUncertaintySeconds: semantics.ds4LabelUncertaintySeconds,
      ds4KernelHalfSupportSeconds: semantics.ds4KernelHalfSupportSeconds,
      rpmAggregationSupportWidthSeconds: 'UNKNOWN',
      providerTimestampPhase: 'UNKNOWN',
      ds4SideAlignmentBoundSeconds: semantics.ds4SideAlignmentBoundSeconds,
      offsetSecondsProbed: offsets,
      offsetDerivationNote: semantics.offsetDerivationNote,
      classificationStableAcrossEnvelope: stability.classificationStableAcrossEnvelope,
      directionSignStableAcrossEnvelope: stability.directionSignStableAcrossEnvelope,
      directionSignEnvelopeStability: stability.directionSignEnvelopeStability,
    },
  };
}

function buildUnavailableEvent(input: {
  eventIndex: number;
  event: Ds4RpmShadowCorrelationInputV1['events'][number];
  reasonCodes: Ds4RpmShadowCorrelationReasonCode[];
  tierLabel: string | null;
  authoritativeTier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | null;
  intensity: { meanAccelMps2: number | null; durationS: number | null } | null;
  coverageNote: string;
  iceRpmEventApplicability: Ds4RpmShadowCorrelationEventResultV1['iceRpmEventApplicability'];
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
    iceRpmEventApplicability: input.iceRpmEventApplicability,
    reasonCodes: input.reasonCodes,
    cadenceTier: input.tierLabel,
    cadenceConfidence: null,
    analysisReadiness: null,
    qualityExposureContractVersion: null,
    observedRpmPointCountInWindow: 0,
    eventTemporalSupport: emptyTemporalSupport(),
    admittedWindowCoverageNote: input.coverageNote,
    rpmMin: null,
    rpmMedian: null,
    rpmMax: null,
    descriptiveRpmStats: emptyDescriptiveStats(),
    observedSampleSpanMs: null,
    sourceTimestampPhase: SOURCE_TIMESTAMP_PHASE,
    alignmentEnvelope: emptyAlignmentEnvelope(),
    alignmentSensitivity: [],
    speedOnlyBaselineNote: 'DS4_SPEED_INTENSITY_ONLY_NO_RPM_CLAIM',
  };
}

export type Ds4RpmShadowCorrelationJoinOptionsV1 = {
  payloadForIntensity?: DiV0MotionCoreShadowPayloadV1 | null;
  provenanceGate: Ds4RpmShadowCorrelationProvenanceGateV1;
};

export function joinDs4EventsWithRpmEvidenceV1(
  input: Ds4RpmShadowCorrelationInputV1,
  options: Ds4RpmShadowCorrelationJoinOptionsV1,
): Ds4RpmShadowCorrelationEventResultV1[] {
  const validation = validateDs4RpmShadowCorrelationProvenanceGate(input, options.provenanceGate);
  const globalFail = !validation.ok ? validation.reasonCodes : null;

  const tierLabel = resolveCadenceTierLabel(input);
  const authoritativeTier = resolveAuthoritativeCadenceTierForJoin(input);
  const iceRpmEventApplicability = resolveIceRpmEventApplicability(input);
  const defensibleCadenceAllowed = isDefensibleCadenceContext({
    authoritativeTier,
    analysisReadiness: input.v1b?.summary.admission.qualityExposure.analysisReadiness,
    tierAnalyticsReady: input.v1b?.summary.admission.qualityExposure.tierAnalyticsReady,
    processingAllowed: input.v1b?.summary.admission.processingAllowed,
  });
  const points = input.rpmSamples?.points ?? [];
  const v1bCoverageNote = input.v1b?.summary.temporalCoverage.bucketSemanticsNote
    ? `${input.v1b.summary.temporalCoverage.bucketSemanticsNote}; ${input.v1b.summary.temporalCoverage.gapInterpretationPolicy}; impliesFullTripCoverage=false; v1bAdmittedEventSpanVerified=false; sourceTimestampPhase=UNKNOWN; coverageModel=${DS4_RPM_SHADOW_CORRELATION_COVERAGE_MODEL_VERSION}`
    : 'V1B_QUALITY_UNKNOWN';

  if (input.events.length === 0) {
    return [];
  }

  return input.events.map((event, eventIndex) => {
    const intensity =
      options?.payloadForIntensity != null
        ? readPersistedMotionEventIntensityForPayload(options.payloadForIntensity, event)
        : event.intensity ?? null;

    if (isIceRpmEventContextBlocked(iceRpmEventApplicability)) {
      return buildUnavailableEvent({
        eventIndex,
        event,
        reasonCodes: ['ICE_RPM_NOT_APPLICABLE'],
        tierLabel,
        authoritativeTier,
        intensity,
        coverageNote: v1bCoverageNote,
        iceRpmEventApplicability,
      });
    }

    if (globalFail) {
      const reasonCodes = [...globalFail];
      if (iceRpmEventApplicability === 'UNKNOWN') {
        reasonCodes.push('ICE_RPM_EVENT_APPLICABILITY_UNKNOWN');
      }
      return buildUnavailableEvent({
        eventIndex,
        event,
        reasonCodes,
        tierLabel,
        authoritativeTier,
        intensity,
        coverageNote: v1bCoverageNote,
        iceRpmEventApplicability,
      });
    }

    if (iceRpmEventApplicability === 'UNKNOWN') {
      return buildUnavailableEvent({
        eventIndex,
        event,
        reasonCodes: ['ICE_RPM_EVENT_APPLICABILITY_UNKNOWN'],
        tierLabel,
        authoritativeTier,
        intensity,
        coverageNote: v1bCoverageNote,
        iceRpmEventApplicability,
      });
    }

    const window = parseHalfOpenEventWindowMs(event.startLabel, event.endLabel);
    if (!window) {
      return buildUnavailableEvent({
        eventIndex,
        event,
        reasonCodes: ['EVENT_WINDOW_INVALID'],
        tierLabel,
        authoritativeTier,
        intensity,
        coverageNote: input.v1b!.summary.temporalCoverage.bucketSemanticsNote,
        iceRpmEventApplicability,
      });
    }

    const primary = classifyPointsInHalfOpenWindow({
      points,
      window,
      cadenceTier: authoritativeTier,
      offsetSeconds: 0,
      defensibleCadenceAllowed,
    });
    const { diagnostics, envelope } = buildAlignmentSensitivity({
      points,
      window,
      cadenceTier: authoritativeTier,
      defensibleCadenceAllowed,
      effectiveInterPointCadenceSeconds:
        primary.temporalSupport.effectiveInterPointCadenceSeconds,
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
      iceRpmEventApplicability,
      reasonCodes: primary.reasonCodes,
      cadenceTier: tierLabel,
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
      descriptiveRpmStats: primary.descriptiveRpmStats,
      observedSampleSpanMs: primary.temporalSupport.observedSampleSpanMs,
      sourceTimestampPhase: SOURCE_TIMESTAMP_PHASE,
      alignmentEnvelope: envelope,
      alignmentSensitivity: diagnostics,
      speedOnlyBaselineNote: 'DS4_SPEED_INTENSITY_ONLY_NO_RPM_CLAIM',
    };
  });
}
