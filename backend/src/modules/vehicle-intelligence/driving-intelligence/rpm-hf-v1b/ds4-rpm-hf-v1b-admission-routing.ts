import type { Ds4RpmHfV1aTripInputV1 } from '../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import type { Ds4RpmHfV1bShadowProcessingOutcome } from './ds4-rpm-hf-v1b.contract';
import {
  computeDs4RpmHfV1bDeferNextAttemptAt,
  readinessDeadlineMs,
} from './ds4-rpm-hf-v1b-readiness-schedule';

export type Ds4RpmHfV1bAdmissionRouting = {
  outcome: Ds4RpmHfV1bShadowProcessingOutcome;
  deferReasonCode: string | null;
  rejectionReasonCode: string | null;
  shouldPersistAnalysis: boolean;
};

export type Ds4RpmHfV1bAdmissionRoutingOptions = {
  maxDeferAttempts: number;
  nowMs: number;
  /** Wall-clock readiness window after trip end for HF/VSI materialization. */
  postTripReadinessWindowMs: number;
};

/**
 * Maps V1A admission (sole authority) to V1B worker routing.
 * Transient readiness → DEFER_RETRY within post-trip window and attempt budget.
 * READINESS_WINDOW_EXHAUSTED vs *_DEFER_ATTEMPT_BUDGET_EXCEEDED are distinct terminal codes.
 */
export function routeDs4RpmHfV1bFromV1aAdmission(
  tripInput: Ds4RpmHfV1aTripInputV1,
  attemptCount: number,
  options: Ds4RpmHfV1bAdmissionRoutingOptions,
): Ds4RpmHfV1bAdmissionRouting {
  const a = tripInput.admission;
  const ch = tripInput.clickHouseRead;

  if (ch.tenantScopeViolation) {
    return terminal('TERMINAL_FAILED', 'TENANT_SCOPE_VIOLATION', false);
  }

  if (a.processingStatus === 'DISABLED_TENANT_SCOPE') {
    return terminal('TERMINAL_FAILED', 'TENANT_SCOPE_VIOLATION', false);
  }

  if (a.processingStatus === 'DISABLED_TRIP_IDENTITY') {
    return terminal('TERMINAL_INELIGIBLE', a.reasonCode, false);
  }

  if (a.processingStatus === 'DISABLED_NOT_APPLICABLE') {
    return terminal('TERMINAL_INELIGIBLE', a.reasonCode, false);
  }

  if (a.processingStatus === 'DISABLED_PROFILE') {
    return terminal('TERMINAL_INELIGIBLE', a.reasonCode, false);
  }

  if (a.processingStatus === 'DISABLED_INCOMPLETE_HF_READ') {
    return terminal('TERMINAL_INELIGIBLE', 'HF_RPM_READ_INCOMPLETE', false);
  }

  if (a.processingStatus === 'DISABLED_CH_UNAVAILABLE') {
    return defer('CLICKHOUSE_UNAVAILABLE', attemptCount, options, tripInput.tripEndIso);
  }

  if (a.processingStatus === 'DISABLED_NO_HF_DATA') {
    return defer('HF_RPM_DATA_MISSING', attemptCount, options, tripInput.tripEndIso);
  }

  if (a.processingStatus === 'DISABLED_TRIP_NOT_CLASSIFIED') {
    return defer('TRIP_RPM_PROFILE_UNCLASSIFIED', attemptCount, options, tripInput.tripEndIso);
  }

  if (a.processingAllowed && a.processingStatus === 'ENABLED') {
    if (tripInput.dataQuality.completenessLabel !== 'COMPLETE') {
      return terminal('TERMINAL_INELIGIBLE', 'HF_READ_NOT_COMPLETE', false);
    }
    if (tripInput.clickHouseRead.status !== 'SUCCESS') {
      return defer('HF_READ_NOT_SUCCESS', attemptCount, options, tripInput.tripEndIso);
    }
    return {
      outcome: 'SUCCEEDED',
      deferReasonCode: null,
      rejectionReasonCode: null,
      shouldPersistAnalysis: true,
    };
  }

  return terminal('TERMINAL_INELIGIBLE', a.reasonCode || 'V1A_ADMISSION_BLOCKED', false);
}

function defer(
  code: string,
  attemptCount: number,
  options: Ds4RpmHfV1bAdmissionRoutingOptions,
  tripEndIso: string,
): Ds4RpmHfV1bAdmissionRouting {
  const deadline = readinessDeadlineMs(tripEndIso, options.postTripReadinessWindowMs);
  if (deadline != null && options.nowMs >= deadline) {
    return terminal('TERMINAL_INELIGIBLE', `${code}_READINESS_WINDOW_EXHAUSTED`, false);
  }
  if (attemptCount >= options.maxDeferAttempts) {
    return terminal('TERMINAL_INELIGIBLE', `${code}_DEFER_ATTEMPT_BUDGET_EXCEEDED`, false);
  }
  const next = computeDs4RpmHfV1bDeferNextAttemptAt({
    tripEndIso,
    attemptCount,
    nowMs: options.nowMs,
  });
  if (next == null) {
    return terminal('TERMINAL_INELIGIBLE', `${code}_READINESS_WINDOW_EXHAUSTED`, false);
  }
  return {
    outcome: 'DEFER_RETRY',
    deferReasonCode: code,
    rejectionReasonCode: null,
    shouldPersistAnalysis: false,
  };
}

function terminal(
  outcome: 'TERMINAL_INELIGIBLE' | 'TERMINAL_FAILED',
  code: string,
  shouldPersistAnalysis: boolean,
): Ds4RpmHfV1bAdmissionRouting {
  return {
    outcome,
    deferReasonCode: null,
    rejectionReasonCode: code,
    shouldPersistAnalysis,
  };
}
