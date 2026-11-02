import type { Ds4RpmHfV1aTripInputV1 } from '../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import type { Ds4RpmHfV1bShadowProcessingOutcome } from './ds4-rpm-hf-v1b.contract';
import {
  computeDs4RpmHfV1bDeferNextAttemptAt,
  readinessDeadlineMs,
} from './ds4-rpm-hf-v1b-readiness-schedule';
import {
  resolveTierAwareAnalysisMode,
  tierEvidenceDeferReasonCode,
  type Ds4RpmHfV1bResolvedTierEvidence,
} from './ds4-rpm-hf-v1b-tier-evidence.util';

export type Ds4RpmHfV1bTierAdmissionRouting = {
  outcome: Ds4RpmHfV1bShadowProcessingOutcome;
  deferReasonCode: string | null;
  rejectionReasonCode: string | null;
  shouldPersistAnalysis: boolean;
  analysisMode: ReturnType<typeof resolveTierAwareAnalysisMode>;
  tierEvidence: Ds4RpmHfV1bResolvedTierEvidence;
};

export type Ds4RpmHfV1bTierAdmissionRoutingOptions = {
  maxDeferAttempts: number;
  nowMs: number;
  postTripReadinessWindowMs: number;
};

export function routeDs4RpmHfV1bTierAwareAdmission(
  tripInput: Ds4RpmHfV1aTripInputV1,
  tierEvidence: Ds4RpmHfV1bResolvedTierEvidence,
  attemptCount: number,
  options: Ds4RpmHfV1bTierAdmissionRoutingOptions,
): Ds4RpmHfV1bTierAdmissionRouting {
  if (tripInput.clickHouseRead.tenantScopeViolation) {
    return tierTerminal(tierEvidence, 'TERMINAL_FAILED', 'TENANT_SCOPE_VIOLATION', false, null);
  }

  if (tierEvidence.status !== 'AVAILABLE' || !tierEvidence.tripClassification) {
    return tierDeferOrNotAvailable(tripInput, tierEvidence, attemptCount, options);
  }

  const row = tierEvidence.tripClassification;
  const analysisMode = resolveTierAwareAnalysisMode({
    tier: row.tier,
    cadenceConfidence: row.cadenceConfidence,
    tripCoverageBand: row.tripCoverageBand,
    analysisReadiness: row.analysisReadiness,
  });

  if (analysisMode == null) {
    return tierTerminal(
      tierEvidence,
      'TERMINAL_INELIGIBLE',
      `TIER_${row.tier}_NOT_ADMITTED`,
      true,
      null,
    );
  }

  if (tripInput.dataQuality.completenessLabel !== 'COMPLETE') {
    return tierDeferOrNotAvailable(tripInput, tierEvidence, attemptCount, options, 'HF_READ_NOT_COMPLETE');
  }
  if (tripInput.clickHouseRead.status !== 'SUCCESS') {
    return tierDefer(
      'HF_READ_NOT_SUCCESS',
      tierEvidence,
      attemptCount,
      options,
      tripInput.tripEndIso,
      null,
    );
  }

  return {
    outcome: 'SUCCEEDED',
    deferReasonCode: null,
    rejectionReasonCode: null,
    shouldPersistAnalysis: true,
    analysisMode,
    tierEvidence,
  };
}

function tierDeferOrNotAvailable(
  tripInput: Ds4RpmHfV1aTripInputV1,
  tierEvidence: Ds4RpmHfV1bResolvedTierEvidence,
  attemptCount: number,
  options: Ds4RpmHfV1bTierAdmissionRoutingOptions,
  overrideCode?: string,
): Ds4RpmHfV1bTierAdmissionRouting {
  const code = overrideCode ?? tierEvidenceDeferReasonCode(tierEvidence.status);
  const defer = tierDefer(code, tierEvidence, attemptCount, options, tripInput.tripEndIso, null);
  if (defer.outcome === 'DEFER_RETRY') {
    return defer;
  }
  return tierTerminal(
    tierEvidence,
    'TERMINAL_INELIGIBLE',
    'TIER_EVIDENCE_NOT_AVAILABLE',
    true,
    null,
  );
}

function tierDefer(
  code: string,
  tierEvidence: Ds4RpmHfV1bResolvedTierEvidence,
  attemptCount: number,
  options: Ds4RpmHfV1bTierAdmissionRoutingOptions,
  tripEndIso: string,
  analysisMode: Ds4RpmHfV1bTierAdmissionRouting['analysisMode'],
): Ds4RpmHfV1bTierAdmissionRouting {
  const deadline = readinessDeadlineMs(tripEndIso, options.postTripReadinessWindowMs);
  if (deadline != null && options.nowMs >= deadline) {
    return tierTerminal(tierEvidence, 'TERMINAL_INELIGIBLE', `${code}_READINESS_WINDOW_EXHAUSTED`, true, analysisMode);
  }
  if (attemptCount >= options.maxDeferAttempts) {
    return tierTerminal(
      tierEvidence,
      'TERMINAL_INELIGIBLE',
      'TIER_EVIDENCE_NOT_AVAILABLE',
      true,
      analysisMode,
    );
  }
  const next = computeDs4RpmHfV1bDeferNextAttemptAt({
    tripEndIso,
    attemptCount,
    nowMs: options.nowMs,
  });
  if (next == null) {
    return tierTerminal(tierEvidence, 'TERMINAL_INELIGIBLE', 'TIER_EVIDENCE_NOT_AVAILABLE', true, analysisMode);
  }
  return {
    outcome: 'DEFER_RETRY',
    deferReasonCode: code,
    rejectionReasonCode: null,
    shouldPersistAnalysis: false,
    analysisMode,
    tierEvidence,
  };
}

function tierTerminal(
  tierEvidence: Ds4RpmHfV1bResolvedTierEvidence,
  outcome: 'TERMINAL_INELIGIBLE' | 'TERMINAL_FAILED',
  code: string,
  shouldPersistAnalysis: boolean,
  analysisMode: Ds4RpmHfV1bTierAdmissionRouting['analysisMode'],
): Ds4RpmHfV1bTierAdmissionRouting {
  return {
    outcome,
    deferReasonCode: null,
    rejectionReasonCode: code,
    shouldPersistAnalysis,
    analysisMode,
    tierEvidence,
  };
}
