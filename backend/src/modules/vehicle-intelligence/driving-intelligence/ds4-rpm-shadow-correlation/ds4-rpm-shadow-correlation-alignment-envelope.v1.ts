import type { Ds4RpmShadowCorrelationAlignmentDiagnosticV1 } from './ds4-rpm-shadow-correlation-v1.contract';
import type {
  Ds4RpmShadowCorrelationDirectionSignEnvelopeStability,
  Ds4RpmShadowCorrelationRobustDirectionSign,
} from './ds4-rpm-shadow-correlation-v1.contract';

/** Matches motion-event-detector UNCERTAINTY_LABEL (±1 s label; clock offset unvalidated). */
export const DS4_RPM_SHADOW_CORRELATION_DS4_LABEL_UNCERTAINTY_SECONDS = 1;

/**
 * C4 adaptive L3 uses a 3-label support span (2 s) centred on each 1 Hz label.
 * Half-support used as a conservative DS4-side temporal footprint bound (not validated absolute timing).
 */
export const DS4_RPM_SHADOW_CORRELATION_DS4_KERNEL_HALF_SUPPORT_SECONDS = 1;

/**
 * DIMO HF query uses interval:"1s" with agg:AVG per signal — bucket label is query-grid start;
 * physical aggregation support width inside the bucket is not proven here.
 */
export const DS4_RPM_SHADOW_CORRELATION_RPM_AGGREGATION_SUPPORT_WIDTH = 'UNKNOWN' as const;

export type Ds4RpmShadowCorrelationAlignmentEnvelopeSemanticsV1 = {
  ds4LabelUncertaintySeconds: number;
  ds4KernelHalfSupportSeconds: number;
  rpmAggregationSupportWidthSeconds: typeof DS4_RPM_SHADOW_CORRELATION_RPM_AGGREGATION_SUPPORT_WIDTH;
  providerTimestampPhase: 'UNKNOWN';
  /** Derived bound for DS4-side alignment diagnostics only — not a universal physical calibration. */
  ds4SideAlignmentBoundSeconds: number;
  offsetDerivationNote: string;
};

export function buildDs4RpmShadowCorrelationAlignmentEnvelopeSemantics(): Ds4RpmShadowCorrelationAlignmentEnvelopeSemanticsV1 {
  const ds4LabelUncertaintySeconds = DS4_RPM_SHADOW_CORRELATION_DS4_LABEL_UNCERTAINTY_SECONDS;
  const ds4KernelHalfSupportSeconds = DS4_RPM_SHADOW_CORRELATION_DS4_KERNEL_HALF_SUPPORT_SECONDS;
  const ds4SideAlignmentBoundSeconds = ds4LabelUncertaintySeconds + ds4KernelHalfSupportSeconds;
  return {
    ds4LabelUncertaintySeconds,
    ds4KernelHalfSupportSeconds,
    rpmAggregationSupportWidthSeconds: DS4_RPM_SHADOW_CORRELATION_RPM_AGGREGATION_SUPPORT_WIDTH,
    providerTimestampPhase: 'UNKNOWN',
    ds4SideAlignmentBoundSeconds,
    offsetDerivationNote:
      'Offsets combine DS4 label uncertainty + centred L3 half-support, nominal effective inter-point cadence, and tier nominal step for research diagnostics; no automatic timestamp correction.',
  };
}

export function buildAlignmentOffsetSecondsProbes(input: {
  cadenceTier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | null;
  effectiveInterPointCadenceSeconds: number | null;
}): number[] {
  const semantics = buildDs4RpmShadowCorrelationAlignmentEnvelopeSemantics();
  const tierNominalStepSeconds =
    input.cadenceTier === 'RPM_2S' ? 2 : input.cadenceTier === 'RPM_3S' ? 3 : 1;
  const cadenceStep =
    input.effectiveInterPointCadenceSeconds != null && input.effectiveInterPointCadenceSeconds > 0
      ? input.effectiveInterPointCadenceSeconds
      : tierNominalStepSeconds;

  const offsets = new Set<number>([0]);
  for (
    let o = -semantics.ds4SideAlignmentBoundSeconds;
    o <= semantics.ds4SideAlignmentBoundSeconds;
    o += 1
  ) {
    offsets.add(o);
  }
  offsets.add(-cadenceStep);
  offsets.add(cadenceStep);
  if (input.cadenceTier != null) {
    offsets.add(-tierNominalStepSeconds);
    offsets.add(tierNominalStepSeconds);
  }
  return [...offsets].sort((a, b) => a - b);
}

export type TimeOrderedRpmSample = { tMs: number; valueRpm: number };

function isAbstainDirectionSign(sign: Ds4RpmShadowCorrelationRobustDirectionSign): boolean {
  return sign.startsWith('ABSTAIN');
}

/**
 * Theil–Sen sign estimator: median of pairwise slopes (Δrpm / Δt) over time-ordered samples.
 * No calibrated thresholds — sign of median slope only.
 */
export function computeTheilSenDirectionSign(input: {
  series: readonly TimeOrderedRpmSample[];
  hasValueConflicts: boolean;
}): {
  robustDirectionSign: Ds4RpmShadowCorrelationRobustDirectionSign;
  directionAbstainReason: string | null;
} {
  if (input.hasValueConflicts) {
    return {
      robustDirectionSign: 'ABSTAIN_CONFLICTING',
      directionAbstainReason: 'CONFLICTING_RPM_VALUES_IN_WINDOW',
    };
  }
  const sorted = [...input.series].sort((a, b) => a.tMs - b.tMs);
  if (sorted.length < 2) {
    return {
      robustDirectionSign: 'ABSTAIN_INSUFFICIENT_SUPPORT',
      directionAbstainReason: 'INSUFFICIENT_OBSERVATIONS_FOR_DIRECTION',
    };
  }

  const slopes: number[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const dtSec = (sorted[j]!.tMs - sorted[i]!.tMs) / 1000;
      if (dtSec <= 0) continue;
      slopes.push((sorted[j]!.valueRpm - sorted[i]!.valueRpm) / dtSec);
    }
  }
  if (slopes.length === 0) {
    return {
      robustDirectionSign: 'ABSTAIN_INSUFFICIENT_SUPPORT',
      directionAbstainReason: 'INSUFFICIENT_OBSERVATIONS_FOR_DIRECTION',
    };
  }
  slopes.sort((a, b) => a - b);
  const mid = Math.floor(slopes.length / 2);
  const medianSlope =
    slopes.length % 2 === 0 ? (slopes[mid - 1]! + slopes[mid]!) / 2 : slopes[mid]!;
  if (medianSlope > 0) {
    return { robustDirectionSign: 'INCREASING', directionAbstainReason: null };
  }
  if (medianSlope < 0) {
    return { robustDirectionSign: 'DECREASING', directionAbstainReason: null };
  }
  return { robustDirectionSign: 'FLAT', directionAbstainReason: null };
}

/** @deprecated alias — use computeTheilSenDirectionSign */
export const computeRobustDirectionSign = computeTheilSenDirectionSign;

export function computeAlignmentClassificationStability(input: {
  diagnostics: ReadonlyArray<
    Pick<
      Ds4RpmShadowCorrelationAlignmentDiagnosticV1,
      'offsetSeconds' | 'classification' | 'robustDirectionSign'
    >
  >;
}): {
  classificationStableAcrossEnvelope: boolean;
  directionSignStableAcrossEnvelope: boolean;
  directionSignEnvelopeStability: Ds4RpmShadowCorrelationDirectionSignEnvelopeStability;
} {
  if (input.diagnostics.length === 0) {
    return {
      classificationStableAcrossEnvelope: false,
      directionSignStableAcrossEnvelope: false,
      directionSignEnvelopeStability: 'NOT_ASSESSABLE',
    };
  }
  const classifications = new Set(input.diagnostics.map((d) => d.classification));
  const assessable = input.diagnostics.filter((d) => !isAbstainDirectionSign(d.robustDirectionSign));
  if (assessable.length === 0) {
    return {
      classificationStableAcrossEnvelope: classifications.size === 1,
      directionSignStableAcrossEnvelope: false,
      directionSignEnvelopeStability: 'NOT_ASSESSABLE',
    };
  }
  const directions = new Set(assessable.map((d) => d.robustDirectionSign));
  const directionStable = directions.size === 1;
  return {
    classificationStableAcrossEnvelope: classifications.size === 1,
    directionSignStableAcrossEnvelope: directionStable,
    directionSignEnvelopeStability: directionStable ? 'STABLE_ASSESSED' : 'UNSTABLE_ASSESSED',
  };
}
