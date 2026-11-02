import type { TelemetrySourceFamily } from '../../telemetry-source-family';
import type { Ds4SpeedAuthorityPartitionV1 } from './ds4-trip-assessment-v1.contract';
import type { Ds4TripAssessmentEventSummariesV1 } from './ds4-trip-assessment-v1.engine';
import type { Ds4LongitudinalLoadReasonCodeV1 } from './ds4-longitudinal-load-observables.v1.contract';

/** Promoted from DS4_LONGITUDINAL_EVIDENCE_QUALITY_RESEARCH_V1/20261029 (L3-E). */
export const DS4_LONGITUDINAL_EVIDENCE_QUALITY_CONTRACT_V1 = 'DS4_LONGITUDINAL_EVIDENCE_QUALITY_V1' as const;
export const DS4_LONGITUDINAL_EVIDENCE_QUALITY_CONTRACT_VERSION = '20261029' as const;

export type Ds4LongitudinalEvidenceChannelManifestEntryV1 = {
  channel: string;
  outcome: string;
};

export type Ds4LongitudinalEvidenceQualityContextV1 = {
  sourceFamily: TelemetrySourceFamily | null;
  channelManifest?: readonly Ds4LongitudinalEvidenceChannelManifestEntryV1[];
  /** Sparse R1 channel outcome (same as assessment.evidenceQuality today); never mutated. */
  sparseChannelOutcome?: string | null;
};

export type Ds4LongitudinalEvidenceQualityResolutionV1 = {
  contractId: typeof DS4_LONGITUDINAL_EVIDENCE_QUALITY_CONTRACT_V1;
  contractVersion: typeof DS4_LONGITUDINAL_EVIDENCE_QUALITY_CONTRACT_VERSION;
  /** Value passed to Layer 2 `evidenceQuality` gate (literal PRESENT required to pass). */
  layer2EvidenceQualityInput: string | null;
  sparseChannelOutcomeUnmodified: string | null;
  supplementaryReasonCodes: Ds4LongitudinalLoadReasonCodeV1[];
};

function mapApiSyntheticPredicateToReasonCode(predicate: string): Ds4LongitudinalLoadReasonCodeV1 | null {
  switch (predicate) {
    case 'POSITION_OUTCOME_NOT_PRESENT':
      return 'LONGITUDINAL_EVIDENCE_API_SYNTHETIC_POSITION_NOT_PRESENT';
    case 'SPEED_AUTHORITY_AMBIGUOUS':
      return 'LONGITUDINAL_EVIDENCE_API_SYNTHETIC_SPEED_AUTHORITY_AMBIGUOUS';
    case 'DRIVING_EXPOSURE_NOT_DERIVABLE':
    case 'EXPOSURE_SECONDS_INVALID':
    case 'CANONICAL_SPEED_SERIES_MISSING':
    case 'QUALIFYING_INTERVALS_ABSENT':
    case 'FSM_DIRECT_LABELS_ABSENT':
      return 'LONGITUDINAL_EVIDENCE_API_SYNTHETIC_EXPOSURE_OR_TEMPORAL_FAIL';
    case 'RATED_EVENTS_ABSENT':
      return 'LONGITUDINAL_EVIDENCE_API_SYNTHETIC_RATED_EVENTS_ABSENT';
    default:
      return null;
  }
}

/**
 * Resolves Layer-2 evidence gate input without modifying sparse.channelOutcome on the motion contract.
 * RUPTELA_R1: legacy path — layer2 input equals sparse channel outcome (unchanged).
 */
export function resolveDs4LongitudinalEvidenceQualityForLayer2V1(input: {
  assessmentEvidenceQuality: string | null;
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
  eventSummaries: Ds4TripAssessmentEventSummariesV1;
  context: Ds4LongitudinalEvidenceQualityContextV1 | null | undefined;
}): Ds4LongitudinalEvidenceQualityResolutionV1 {
  const sparseChannelOutcomeUnmodified =
    input.context?.sparseChannelOutcome ?? input.assessmentEvidenceQuality ?? null;

  const base = {
    contractId: DS4_LONGITUDINAL_EVIDENCE_QUALITY_CONTRACT_V1,
    contractVersion: DS4_LONGITUDINAL_EVIDENCE_QUALITY_CONTRACT_VERSION,
    sparseChannelOutcomeUnmodified,
    supplementaryReasonCodes: [] as Ds4LongitudinalLoadReasonCodeV1[],
  };

  const sourceFamily = input.context?.sourceFamily ?? null;
  if (sourceFamily == null || sourceFamily === 'UNKNOWN') {
    return {
      ...base,
      layer2EvidenceQualityInput: input.assessmentEvidenceQuality,
    };
  }

  if (sourceFamily === 'RUPTELA_R1') {
    return {
      ...base,
      layer2EvidenceQualityInput: sparseChannelOutcomeUnmodified,
    };
  }

  if (sourceFamily !== 'API_SYNTHETIC') {
    return {
      ...base,
      layer2EvidenceQualityInput: input.assessmentEvidenceQuality,
    };
  }

  const predicates: string[] = [];
  const channelManifest = input.context?.channelManifest ?? [];
  const position = channelManifest.find((c) => c.channel === 'POSITION');
  if (position?.outcome !== 'PRESENT') {
    predicates.push('POSITION_OUTCOME_NOT_PRESENT');
  }
  if (input.speedAuthority !== 'C4_ONLY' && input.speedAuthority !== 'C5_1_PREFERRED') {
    predicates.push('SPEED_AUTHORITY_AMBIGUOUS');
  }

  const exposure = input.eventSummaries.drivingExposure;
  if (exposure?.derivable !== true) {
    predicates.push('DRIVING_EXPOSURE_NOT_DERIVABLE');
  }
  const eS = exposure?.exposureSeconds;
  if (!(typeof eS === 'number' && Number.isFinite(eS) && eS > 0)) {
    predicates.push('EXPOSURE_SECONDS_INVALID');
  }
  const prov = exposure?.provenance;
  if (prov?.canonicalSpeedSeriesMissing === true) {
    predicates.push('CANONICAL_SPEED_SERIES_MISSING');
  }
  if (!(typeof prov?.qualifyingIntervalCount === 'number' && prov.qualifyingIntervalCount > 0)) {
    predicates.push('QUALIFYING_INTERVALS_ABSENT');
  }
  const directFsm =
    typeof prov?.fsmMovingDirectLabelCount === 'number' ? prov.fsmMovingDirectLabelCount : 0;
  if (directFsm <= 0) {
    predicates.push('FSM_DIRECT_LABELS_ABSENT');
  }
  if (!(typeof input.eventSummaries.ratedEventCount === 'number' && input.eventSummaries.ratedEventCount >= 1)) {
    predicates.push('RATED_EVENTS_ABSENT');
  }

  const supplementaryReasonCodes = [
    ...new Set(
      predicates
        .map(mapApiSyntheticPredicateToReasonCode)
        .filter((c): c is Ds4LongitudinalLoadReasonCodeV1 => c != null),
    ),
  ];

  if (predicates.length === 0) {
    return {
      ...base,
      layer2EvidenceQualityInput: 'PRESENT',
      supplementaryReasonCodes: [],
    };
  }

  return {
    ...base,
    layer2EvidenceQualityInput: sparseChannelOutcomeUnmodified,
    supplementaryReasonCodes,
  };
}
