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
  SNAPSHOT_EXTRACTOR_NOT_RUN: 'SNAPSHOT_EXTRACTOR_NOT_RUN',
  HF_MIRROR_UNAVAILABLE: 'HF_MIRROR_UNAVAILABLE',
  HF_READ_FAILED: 'HF_READ_FAILED',
  LINK_ATTRIBUTION_AMBIGUOUS: 'LINK_ATTRIBUTION_AMBIGUOUS',
  INGESTION_BOUNDED: 'INGESTION_BOUNDED',
} as const;

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
