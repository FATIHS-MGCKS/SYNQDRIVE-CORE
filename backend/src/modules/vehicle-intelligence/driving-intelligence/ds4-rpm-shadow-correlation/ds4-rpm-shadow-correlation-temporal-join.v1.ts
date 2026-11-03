import { parseBucketLabelMs } from '../core/kinematics/motion-core-grid';
import { readPersistedMotionEventIntensityForPayload } from '../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import type { DiV0MotionCoreShadowPayloadV1 } from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type {
  Ds4RpmShadowCorrelationAlignmentDiagnosticV1,
  Ds4RpmShadowCorrelationContextClassification,
  Ds4RpmShadowCorrelationEventResultV1,
  Ds4RpmShadowCorrelationInputV1,
  Ds4RpmShadowCorrelationReasonCode,
} from './ds4-rpm-shadow-correlation-v1.contract';
import { validateDs4RpmShadowCorrelationInput } from './ds4-rpm-shadow-correlation-input-validation.v1';

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function eventWindowMs(startLabel: string, endLabel: string): { startMs: number; endMs: number } | null {
  try {
    const startMs = parseBucketLabelMs(startLabel);
    const endMs = parseBucketLabelMs(endLabel) + 1000;
    if (endMs < startMs) return null;
    return { startMs, endMs };
  } catch {
    return null;
  }
}

function classifyPointsInWindow(input: {
  points: ReadonlyArray<{ recordedAtIso: string; valueRpm: number }>;
  startMs: number;
  endMs: number;
  offsetSeconds: number;
}): {
  classification: Ds4RpmShadowCorrelationContextClassification;
  reasonCodes: Ds4RpmShadowCorrelationReasonCode[];
  values: number[];
  alignmentUncertaintyMs: number | null;
} {
  const shiftMs = input.offsetSeconds * 1000;
  const winStart = input.startMs + shiftMs;
  const winEnd = input.endMs + shiftMs;
  const inWindow: Array<{ ms: number; value: number }> = [];
  for (const p of input.points) {
    const ms = Date.parse(p.recordedAtIso);
    if (Number.isNaN(ms)) continue;
    if (ms >= winStart && ms <= winEnd) {
      inWindow.push({ ms, value: p.valueRpm });
    }
  }
  if (inWindow.length === 0) {
    return {
      classification: 'UNAVAILABLE',
      reasonCodes: ['NO_TEMPORAL_OVERLAP'],
      values: [],
      alignmentUncertaintyMs: null,
    };
  }
  const byTs = new Map<number, number[]>();
  for (const row of inWindow) {
    const list = byTs.get(row.ms) ?? [];
    list.push(row.value);
    byTs.set(row.ms, list);
  }
  const reasonCodes: Ds4RpmShadowCorrelationReasonCode[] = ['OK'];
  let ambiguous = false;
  const values: number[] = [];
  for (const [, vals] of byTs) {
    const uniq = [...new Set(vals)];
    if (uniq.length > 1) {
      ambiguous = true;
      reasonCodes.push('CONFLICTING_RPM_VALUES_IN_WINDOW');
    }
    if (vals.length > 1) {
      reasonCodes.push('DUPLICATE_RPM_TIMESTAMPS_IN_WINDOW');
    }
    values.push(uniq[0]!);
  }
  if (ambiguous) {
    return {
      classification: 'AMBIGUOUS',
      reasonCodes: [...new Set(reasonCodes)],
      values,
      alignmentUncertaintyMs: Math.max(...inWindow.map((r) => r.ms)) - Math.min(...inWindow.map((r) => r.ms)),
    };
  }
  return {
    classification: 'AVAILABLE',
    reasonCodes: [...new Set(reasonCodes)],
    values,
    alignmentUncertaintyMs: Math.max(...inWindow.map((r) => r.ms)) - Math.min(...inWindow.map((r) => r.ms)),
  };
}

function nominalBucketWidthSeconds(tier: string | null): number {
  if (tier === 'RPM_2S') return 2;
  if (tier === 'RPM_3S') return 3;
  return 1;
}

function buildAlignmentSensitivity(input: {
  points: ReadonlyArray<{ recordedAtIso: string; valueRpm: number }>;
  startMs: number;
  endMs: number;
  bucketWidthSec: number;
}): Ds4RpmShadowCorrelationAlignmentDiagnosticV1[] {
  const offsets = [-input.bucketWidthSec, 0, input.bucketWidthSec];
  return offsets.map((offsetSeconds) => {
    const r = classifyPointsInWindow({
      points: input.points,
      startMs: input.startMs,
      endMs: input.endMs,
      offsetSeconds,
    });
    return {
      offsetSeconds,
      observedPointCount: r.values.length,
      classification: r.classification,
    };
  });
}

export function joinDs4EventsWithRpmEvidenceV1(
  input: Ds4RpmShadowCorrelationInputV1,
  options?: { payloadForIntensity?: DiV0MotionCoreShadowPayloadV1 | null },
): Ds4RpmShadowCorrelationEventResultV1[] {
  const validation = validateDs4RpmShadowCorrelationInput(input);
  const globalFail = !validation.ok ? validation.reasonCodes : null;

  const tier =
    input.v1b?.summary.admission.qualityExposure.cadenceTier ??
    input.v1b?.summary.tierEvidence?.tier ??
    null;
  const bucketWidth = nominalBucketWidthSeconds(tier);
  const points = input.rpmSamples?.points ?? [];

  return input.events.map((event, eventIndex) => {
    const eventId = `motion-ev-${eventIndex}-${event.startLabel}`;
    const intensity =
      options?.payloadForIntensity != null
        ? readPersistedMotionEventIntensityForPayload(options.payloadForIntensity, event)
        : event.intensity ?? null;

    if (globalFail) {
      return {
        eventIndex,
        eventId,
        kind: event.kind,
        startLabelUtc: event.startLabel,
        endLabelUtc: event.endLabel,
        ds4EventQuality: event.quality,
        ds4MeanAccelMps2: intensity?.meanAccelMps2 ?? null,
        ds4DurationS: intensity?.durationS ?? null,
        contextClassification: 'UNAVAILABLE',
        reasonCodes: globalFail,
        cadenceTier: tier,
        cadenceConfidence: input.v1b?.summary.admission.qualityExposure.cadenceConfidence ?? null,
        analysisReadiness: input.v1b?.summary.admission.qualityExposure.analysisReadiness ?? null,
        qualityExposureContractVersion:
          input.v1b?.summary.admission.qualityExposure.contractVersion ?? null,
        observedRpmPointCountInWindow: 0,
        admittedWindowCoverageNote: input.v1b?.summary.temporalCoverage.bucketSemanticsNote
          ? `${input.v1b.summary.temporalCoverage.bucketSemanticsNote}; ${input.v1b.summary.temporalCoverage.gapInterpretationPolicy}`
          : 'V1B_QUALITY_UNKNOWN',
        rpmMin: null,
        rpmMedian: null,
        rpmMax: null,
        alignmentUncertaintyMs: null,
        referenceOperatingBand: null,
        referenceProvenanceSummary: null,
        alignmentSensitivity: [],
        speedOnlyBaselineNote: 'DS4_SPEED_INTENSITY_ONLY_NO_RPM_CLAIM',
      };
    }

    const window = eventWindowMs(event.startLabel, event.endLabel);
    if (!window) {
      return {
        eventIndex,
        eventId,
        kind: event.kind,
        startLabelUtc: event.startLabel,
        endLabelUtc: event.endLabel,
        ds4EventQuality: event.quality,
        ds4MeanAccelMps2: intensity?.meanAccelMps2 ?? null,
        ds4DurationS: intensity?.durationS ?? null,
        contextClassification: 'UNAVAILABLE',
        reasonCodes: ['EVENT_WINDOW_INVALID'],
        cadenceTier: tier,
        cadenceConfidence: input.v1b!.summary.admission.qualityExposure.cadenceConfidence ?? null,
        analysisReadiness: input.v1b!.summary.admission.qualityExposure.analysisReadiness ?? null,
        qualityExposureContractVersion:
          input.v1b!.summary.admission.qualityExposure.contractVersion ?? null,
        observedRpmPointCountInWindow: 0,
        admittedWindowCoverageNote: input.v1b!.summary.temporalCoverage.bucketSemanticsNote,
        rpmMin: null,
        rpmMedian: null,
        rpmMax: null,
        alignmentUncertaintyMs: null,
        referenceOperatingBand: null,
        referenceProvenanceSummary: null,
        alignmentSensitivity: [],
        speedOnlyBaselineNote: 'DS4_SPEED_INTENSITY_ONLY_NO_RPM_CLAIM',
      };
    }

    const primary = classifyPointsInWindow({
      points,
      startMs: window.startMs,
      endMs: window.endMs,
      offsetSeconds: 0,
    });
    const sensitivity = buildAlignmentSensitivity({
      points,
      startMs: window.startMs,
      endMs: window.endMs,
      bucketWidthSec: bucketWidth,
    });

    let classification = primary.classification;
    let reasonCodes = primary.reasonCodes;
    if (primary.classification === 'UNAVAILABLE' && (input.v1b?.summary.rpmValues.validPointCount ?? 0) > 0) {
      classification = 'PARTIAL';
      reasonCodes = ['NO_TEMPORAL_OVERLAP', 'AGGREGATE_ONLY_NO_POINT_RECONSTRUCTION'];
    }

    const ref = input.v1b?.rpmReferenceIntelligenceV1;
    const bandShares = ref?.payload.metrics?.operatingBands?.timeShareByBand;
    let refBand: string | null = null;
    if (bandShares) {
      const ranked = Object.entries(bandShares).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
      refBand = ranked[0]?.[0] ?? null;
    }
    const refProv =
      ref != null
        ? `${ref.referenceSnapshotUsed.idleRpmProvenance}/${ref.referenceSnapshotUsed.maxRpmProvenance}`
        : null;

    return {
      eventIndex,
      eventId,
      kind: event.kind,
      startLabelUtc: event.startLabel,
      endLabelUtc: event.endLabel,
      ds4EventQuality: event.quality,
      ds4MeanAccelMps2: intensity?.meanAccelMps2 ?? null,
      ds4DurationS: intensity?.durationS ?? null,
      contextClassification: classification,
      reasonCodes,
      cadenceTier: tier,
      cadenceConfidence: input.v1b!.summary.admission.qualityExposure.cadenceConfidence ?? null,
      analysisReadiness: input.v1b!.summary.admission.qualityExposure.analysisReadiness ?? null,
      qualityExposureContractVersion:
        input.v1b!.summary.admission.qualityExposure.contractVersion ?? null,
      observedRpmPointCountInWindow: primary.values.length,
      admittedWindowCoverageNote: `${input.v1b!.summary.temporalCoverage.bucketSemanticsNote}; impliesFullTripCoverage=false`,
      rpmMin: primary.values.length ? Math.min(...primary.values) : null,
      rpmMedian: median(primary.values),
      rpmMax: primary.values.length ? Math.max(...primary.values) : null,
      alignmentUncertaintyMs: primary.alignmentUncertaintyMs,
      referenceOperatingBand: refBand,
      referenceProvenanceSummary: refProv,
      alignmentSensitivity: sensitivity,
      speedOnlyBaselineNote: 'DS4_SPEED_INTENSITY_ONLY_NO_RPM_CLAIM',
    };
  });
}
