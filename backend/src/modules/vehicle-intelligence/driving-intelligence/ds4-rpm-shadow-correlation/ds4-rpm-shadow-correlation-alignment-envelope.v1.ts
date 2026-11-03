import type { Ds4RpmShadowCorrelationAlignmentDiagnosticV1 } from './ds4-rpm-shadow-correlation-v1.contract';
import type { Ds4RpmShadowCorrelationRobustDirectionSign } from './ds4-rpm-shadow-correlation-v1.contract';

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

export function computeRobustDirectionSign(input: {
  values: readonly number[];
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
  if (input.values.length < 2) {
    return {
      robustDirectionSign: 'ABSTAIN_INSUFFICIENT_SUPPORT',
      directionAbstainReason: 'INSUFFICIENT_OBSERVATIONS_FOR_DIRECTION',
    };
  }
  const first = input.values[0]!;
  const last = input.values[input.values.length - 1]!;
  const delta = last - first;
  if (delta > 0) {
    return { robustDirectionSign: 'INCREASING', directionAbstainReason: null };
  }
  if (delta < 0) {
    return { robustDirectionSign: 'DECREASING', directionAbstainReason: null };
  }
  return { robustDirectionSign: 'FLAT', directionAbstainReason: null };
}

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
} {
  if (input.diagnostics.length === 0) {
    return { classificationStableAcrossEnvelope: false, directionSignStableAcrossEnvelope: false };
  }
  const classifications = new Set(input.diagnostics.map((d) => d.classification));
  const directions = new Set(
    input.diagnostics
      .map((d) => d.robustDirectionSign)
      .filter((s) => !s.startsWith('ABSTAIN')),
  );
  return {
    classificationStableAcrossEnvelope: classifications.size === 1,
    directionSignStableAcrossEnvelope: directions.size <= 1,
  };
}
