import type { DiV0MotionCoreShadowPayloadV1 } from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import {
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_UNKNOWN,
  resolveMotionCoreShadowEventRowContract,
} from '../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import type { Ds4TripAssessmentReasonCodeV1 } from './ds4-trip-assessment-v1.contract';

/**
 * Versioned DS4 assessment quality policy (PR-A).
 *
 * Ordinal trip-level RATED status requires explicit owner/Fable approval of boundary thresholds.
 * Until then, intensity may be collected but trip assessment stays at UNRATED_COUNTS_ONLY max.
 */
export const DS4_ASSESSMENT_QUALITY_POLICY_VERSION_V1 = 'DS4_ASSESSMENT_QUALITY_POLICY_V1' as const;

export const DS4_ASSESSMENT_QUALITY_POLICY_VERSION_V2 = 'DS4_ASSESSMENT_QUALITY_POLICY_V2' as const;

export type Ds4AssessmentQualityPolicyV1 = {
  policyVersion:
    | typeof DS4_ASSESSMENT_QUALITY_POLICY_VERSION_V1
    | typeof DS4_ASSESSMENT_QUALITY_POLICY_VERSION_V2;
  /** When false, trip-level RATED is never emitted (calibration gap documented). */
  ordinalTripRatingApproved: boolean;
};

/** PR-A2: intensity eligibility + driving exposure (ordinal trip rating still off). */
export const DS4_ASSESSMENT_QUALITY_POLICY_V2_DEFAULT: Ds4AssessmentQualityPolicyV1 = {
  policyVersion: DS4_ASSESSMENT_QUALITY_POLICY_VERSION_V2,
  ordinalTripRatingApproved: false,
};

/** @deprecated Use DS4_ASSESSMENT_QUALITY_POLICY_V2_DEFAULT — retained for imports/tests. */
export const DS4_ASSESSMENT_QUALITY_POLICY_V1_DEFAULT: Ds4AssessmentQualityPolicyV1 =
  DS4_ASSESSMENT_QUALITY_POLICY_V2_DEFAULT;

export type Ds4AssessmentQualityEvaluationV1 = {
  reasonCodes: Ds4TripAssessmentReasonCodeV1[];
  hasTemporalLabels: boolean;
  eventRowContractResolution: ReturnType<typeof resolveMotionCoreShadowEventRowContract>;
  speedAuthority: 'C4_ONLY' | 'C5_1_PREFERRED' | 'AMBIGUOUS';
  usableFsmDirectLabelCount: number;
  labelCount: number;
};

export function evaluateDs4AssessmentQualityFromMotionPayload(
  payload: DiV0MotionCoreShadowPayloadV1,
): Ds4AssessmentQualityEvaluationV1 {
  const reasonCodes: Ds4TripAssessmentReasonCodeV1[] = [];
  const contract = resolveMotionCoreShadowEventRowContract(payload);
  if (contract === DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_UNKNOWN) {
    reasonCodes.push('EVENT_ROW_CONTRACT_UNKNOWN');
  }

  const rawAuthority = payload.contract?.speedAuthority;
  let speedAuthority: Ds4AssessmentQualityEvaluationV1['speedAuthority'];
  if (rawAuthority === 'C4_ONLY' || rawAuthority === 'C5_1_PREFERRED') {
    speedAuthority = rawAuthority;
  } else {
    speedAuthority = 'AMBIGUOUS';
    reasonCodes.push('SPEED_AUTHORITY_AMBIGUOUS');
  }

  const labelCount = payload.summary?.labelCount ?? payload.fsmLabels?.length ?? 0;
  const hasTemporalLabels = labelCount > 0;
  if (!hasTemporalLabels) {
    reasonCodes.push('INSUFFICIENT_TEMPORAL_LABELS');
  }

  const usableFsmDirectLabelCount = payload.fsmLabels?.filter((l) => l.evidenceQuality === 'DIRECT').length ?? 0;

  return {
    reasonCodes,
    hasTemporalLabels,
    eventRowContractResolution: contract,
    speedAuthority,
    usableFsmDirectLabelCount,
    labelCount,
  };
}
