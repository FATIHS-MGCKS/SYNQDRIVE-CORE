/**
 * Per-axis evaluation state for VSI universal discovery (P0 contract).
 *
 * Distinct from {@link VsiEmpiricalObservationStatus}: absence of a profile row
 * must not be conflated with NOT_EVALUATED vs EVALUATED_NOT_OBSERVED.
 */

export const VsiEvidenceAxisEvaluationState = {
  EVALUATED_OBSERVED: 'EVALUATED_OBSERVED',
  EVALUATED_NOT_OBSERVED: 'EVALUATED_NOT_OBSERVED',
  NOT_EVALUATED: 'NOT_EVALUATED',
} as const;

export type VsiEvidenceAxisEvaluationState =
  (typeof VsiEvidenceAxisEvaluationState)[keyof typeof VsiEvidenceAxisEvaluationState];

/** Reason token when state is NOT_EVALUATED (machine-readable, stable). */
export const VsiEvidenceAxisNotEvaluatedReason = {
  DISCOVERY_FEATURE_DISABLED: 'DISCOVERY_FEATURE_DISABLED',
  INVENTORY_NOT_REFRESHED: 'INVENTORY_NOT_REFRESHED',
  SOURCE_LINK_BINDING_MISMATCH: 'SOURCE_LINK_BINDING_MISMATCH',
  OUT_OF_ORDER_SOURCE_SKIPPED: 'OUT_OF_ORDER_SOURCE_SKIPPED',
  /** Snapshot axis only — never use on the historical axis (P1 HF semantics). */
  SNAPSHOT_EXTRACTOR_NOT_RUN: 'SNAPSHOT_EXTRACTOR_NOT_RUN',
  /** Historical axis: snapshot materialization ran; HF historical pass not attempted on this row. */
  HF_HISTORICAL_NOT_ATTEMPTED: 'HF_HISTORICAL_NOT_ATTEMPTED',
  HF_NO_ATTRIBUTABLE_TRIPS: 'HF_NO_ATTRIBUTABLE_TRIPS',
  HF_MIRROR_UNAVAILABLE: 'HF_MIRROR_UNAVAILABLE',
  HF_MIRROR_INCOMPLETE: 'HF_MIRROR_INCOMPLETE',
  HF_READ_FAILED: 'HF_READ_FAILED',
  HF_QUERY_TIMEOUT: 'HF_QUERY_TIMEOUT',
  HF_SIGNAL_NOT_MIRRORED: 'HF_SIGNAL_NOT_MIRRORED',
  HF_UNION_SIGNAL_CAP_OMITTED: 'HF_UNION_SIGNAL_CAP_OMITTED',
  LINK_ATTRIBUTION_AMBIGUOUS: 'LINK_ATTRIBUTION_AMBIGUOUS',
  INGESTION_BOUNDED: 'INGESTION_BOUNDED',
} as const;

/** Historical-axis placeholders that a successful HF merge must replace. */
export const VSI_HISTORICAL_HF_REPLACEABLE_NOT_EVALUATED_REASONS = new Set<string>([
  VsiEvidenceAxisNotEvaluatedReason.HF_HISTORICAL_NOT_ATTEMPTED,
  VsiEvidenceAxisNotEvaluatedReason.SNAPSHOT_EXTRACTOR_NOT_RUN,
  VsiEvidenceAxisNotEvaluatedReason.INVENTORY_NOT_REFRESHED,
  VsiEvidenceAxisNotEvaluatedReason.DISCOVERY_FEATURE_DISABLED,
]);

export function isHistoricalHfReplaceablePlaceholder(
  evaluation: VsiEvidenceAxisEvaluationV1,
): boolean {
  return (
    evaluation.state === VsiEvidenceAxisEvaluationState.NOT_EVALUATED &&
    VSI_HISTORICAL_HF_REPLACEABLE_NOT_EVALUATED_REASONS.has(
      evaluation.notEvaluatedReason ?? '',
    )
  );
}

export type VsiEvidenceAxisNotEvaluatedReason =
  (typeof VsiEvidenceAxisNotEvaluatedReason)[keyof typeof VsiEvidenceAxisNotEvaluatedReason];

export type VsiEvidenceAxisEvaluationV1 = {
  state: VsiEvidenceAxisEvaluationState;
  /** Required when state === NOT_EVALUATED */
  notEvaluatedReason?: VsiEvidenceAxisNotEvaluatedReason | string;
};

export function assertTriStateEvaluationShape(
  evaluation: VsiEvidenceAxisEvaluationV1,
): void {
  if (evaluation.state === VsiEvidenceAxisEvaluationState.NOT_EVALUATED) {
    const reason = evaluation.notEvaluatedReason?.trim();
    if (!reason) {
      throw new Error('NOT_EVALUATED requires notEvaluatedReason');
    }
  } else if (evaluation.notEvaluatedReason != null && evaluation.notEvaluatedReason !== '') {
    throw new Error('notEvaluatedReason must be omitted unless state is NOT_EVALUATED');
  }
}

/**
 * Positive observation claims require EVALUATED_OBSERVED on that axis.
 * Never maps absence to unsupported / NOT_LISTED.
 */
export function axisAllowsPositiveObservationClaim(
  evaluation: VsiEvidenceAxisEvaluationV1,
): boolean {
  return evaluation.state === VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED;
}
