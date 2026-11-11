import {
  evaluateP25ApdB2V1Core,
  evaluateP25ApdB4V1Core,
} from '../p25-apd-policy-engine';
import type { P25ApdShadowPrePollInput } from '../p25-apd-shadow-decision.types';
import {
  APDS_V3_OFFLINE_POLICY_VERSION,
  type ApdsV3OfflinePolicyDecision,
  type ApdsV3OfflinePolicyInput,
} from './apds-v3-offline.types';
import { estimateVsiInformationGain } from './vsi-information-gain.v1';
import { evaluateFrozenB2B4Intersection } from './p25-apd-b2b4-intersection.v1';
import { evaluateConsumerDemandGate } from './consumer-demand-gate.v1';
import { validateCausalEvidenceAtDecision } from './apds-v3-causal-evidence.v1';
import {
  evaluateOfflineBaselineEligibility,
  mapActivityTierLabelToSnapshotTier,
  type OfflineBaselineEligibility,
} from './apds-v3-baseline-poll-due.adapter';

const BACKOFF_SKIP_GAIN_THRESHOLD = 0.15;
const HYSTERESIS_MIN_POLL_GAP_MS = 60_000;

export function buildP25ShadowInputFromOffline(
  input: ApdsV3OfflinePolicyInput,
): P25ApdShadowPrePollInput {
  return {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    decisionAtMs: input.decisionAtMs,
    reconciliation: input.reconciliation,
    lastAllowedReconciliationPollMs: input.lastPhysicalPollMs ?? 0,
    lastTrustworthyLvSourceMs: input.lastLvProviderSourceMs,
    lastProviderFetchedAtMs: input.lastProviderFetchedAtMs,
    profileClass: input.profileClass,
    profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
    medianIntervalMs: input.medianIntervalMs,
    tripFsmActive: input.tripFsmState === 'ACTIVE',
    providerGapOpen: input.providerGapOpen,
    r9WakePending: input.providerWakeOrReconnect,
  };
}

/**
 * Pure offline V3 policy — no side effects; does not call BullMQ or schedulers.
 */
export function evaluateApdsV3OfflinePolicy(
  input: ApdsV3OfflinePolicyInput,
): ApdsV3OfflinePolicyDecision {
  if (input.excludeFromOptimizationCalibration) {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'NOT_ASSESSABLE',
      reason: 'KS_MX_2024_EXCLUDED_FROM_CALIBRATION',
      expectedInformationGain: null,
      heuristic: false,
      hardSafetyTriggered: false,
    };
  }

  if (!input.reconciliation || input.tripFsmState === 'ACTIVE') {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'FORCED_SAFETY_POLL',
      reason: 'TRIP_ACTIVE_OR_RECONCILIATION_OFF',
      expectedInformationGain: null,
      heuristic: false,
      hardSafetyTriggered: true,
    };
  }

  if (input.providerWakeOrReconnect || input.providerGapOpen) {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'FORCED_SAFETY_POLL',
      reason: input.providerWakeOrReconnect
        ? 'WAKE_OR_RECONNECT_OVERRIDE'
        : 'PROVIDER_GAP_OVERRIDE',
      expectedInformationGain: null,
      heuristic: false,
      hardSafetyTriggered: true,
    };
  }

  if (input.sourceLinkInvalidated) {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'FORCED_SAFETY_POLL',
      reason: 'SOURCE_LINK_INVALIDATION',
      expectedInformationGain: null,
      heuristic: false,
      hardSafetyTriggered: true,
    };
  }

  const causal = validateCausalEvidenceAtDecision(input);
  if (!causal.ok) {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: causal.kind,
      reason: causal.reason,
      expectedInformationGain: null,
      heuristic: false,
      hardSafetyTriggered: false,
    };
  }

  if (input.tripFsmState === 'UNKNOWN') {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'INSUFFICIENT_EVIDENCE',
      reason: 'TRIP_FSM_UNKNOWN',
      expectedInformationGain: null,
      heuristic: false,
      hardSafetyTriggered: false,
    };
  }

  const demandGate = evaluateConsumerDemandGate(input.consumerDemandRevision, {
    decisionAtMs: input.decisionAtMs,
    strictLvProviderSourceMs: input.lastLvProviderSourceMs,
    topLevelProviderSourceMs: input.lastTopLevelProviderSourceMs,
    tripFsmState: input.tripFsmState,
  });

  const gainInput = {
    decisionAtMs: input.decisionAtMs,
    lastLvProviderSourceMs: input.lastLvProviderSourceMs,
    lastTopLevelProviderSourceMs: input.lastTopLevelProviderSourceMs,
    lastPhysicalPollMs: input.lastPhysicalPollMs,
    medianIntervalMs: input.medianIntervalMs,
    profileStability:
      input.profileClass === 'STABLE_PERIODIC'
        ? ('STABLE_PERIODIC' as const)
        : input.profileClass === 'PROVIDER_OBSERVABILITY_GAP'
          ? ('UNKNOWN' as const)
          : ('UNSTABLE' as const),
    observationQuality: causal.observationQuality,
    p2cTopLevelAdvanceKnown: input.p2cTopLevelAdvanceKnown,
  };
  const gain = estimateVsiInformationGain(gainInput);

  if (gain.contradictoryEvidence) {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'INSUFFICIENT_EVIDENCE',
      reason: 'CONTRADICTORY_VSI_EVIDENCE',
      expectedInformationGain: gain.expectedGain,
      heuristic: true,
      hardSafetyTriggered: false,
    };
  }

  if (input.providerErrorRecent) {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'FORCED_SAFETY_POLL',
      reason: 'PROVIDER_ERROR_RECOVERY',
      expectedInformationGain: gain.expectedGain,
      heuristic: true,
      hardSafetyTriggered: true,
    };
  }

  const shadow = buildP25ShadowInputFromOffline(input);
  const b2 = evaluateP25ApdB2V1Core(shadow);
  const b4 = evaluateP25ApdB4V1Core(shadow);
  const joint = evaluateFrozenB2B4Intersection(b2, b4);

  if (joint.kind === 'NOT_ASSESSABLE') {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'NOT_ASSESSABLE',
      reason: joint.reason,
      expectedInformationGain: gain.expectedGain,
      heuristic: false,
      hardSafetyTriggered: false,
    };
  }

  if (joint.kind === 'NOT_JOINT_SKIP') {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'WOULD_POLL',
      reason: `B2B4_REFERENCE_POLL:${joint.reason}`,
      expectedInformationGain: gain.expectedGain,
      heuristic: false,
      hardSafetyTriggered: joint.reason === 'FORCED_OR_SAFETY_PRESENT',
    };
  }

  if (demandGate.blocksAuthoritativeSafeSkip) {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'INSUFFICIENT_EVIDENCE',
      reason: `CONSUMER_FAIL_CLOSED:${demandGate.reasons.join(',')}`,
      expectedInformationGain: gain.expectedGain,
      heuristic: false,
      hardSafetyTriggered: false,
    };
  }

  if (
    input.lastPhysicalPollMs != null &&
    input.decisionAtMs - input.lastPhysicalPollMs < HYSTERESIS_MIN_POLL_GAP_MS
  ) {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'WOULD_SKIP',
      reason: 'HYSTERESIS_MIN_GAP',
      expectedInformationGain: gain.expectedGain,
      heuristic: true,
      hardSafetyTriggered: false,
    };
  }

  if (gain.expectedGain < BACKOFF_SKIP_GAIN_THRESHOLD) {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'WOULD_SKIP',
      reason: 'LOW_HEURISTIC_INFORMATION_GAIN',
      expectedInformationGain: gain.expectedGain,
      heuristic: true,
      hardSafetyTriggered: false,
    };
  }

  return {
    policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
    decision: 'WOULD_POLL',
    reason: 'JOINT_SKIP_CANDIDATE_INFORMATION_GAIN_SUFFICIENT',
    expectedInformationGain: gain.expectedGain,
    heuristic: true,
    hardSafetyTriggered: false,
  };
}

/** @deprecated Use evaluateVerifiedBaselinePollDue — tier-interval-only helper */
export function evaluateCanonicalBaselineSchedulerWouldPoll(input: {
  decisionAtMs: number;
  lastPhysicalPollMs: number | null;
  tierIntervalMs: number;
}): boolean {
  if (input.lastPhysicalPollMs == null) return true;
  return input.decisionAtMs - input.lastPhysicalPollMs >= input.tierIntervalMs;
}

export function evaluateOfflineBaselineEligibilityFromPolicyInput(
  input: ApdsV3OfflinePolicyInput,
): OfflineBaselineEligibility {
  const tier = mapActivityTierLabelToSnapshotTier(input.activityTier);
  if (tier == null) {
    return { assessable: false, reason: `UNKNOWN_ACTIVITY_TIER:${input.activityTier}` };
  }
  return evaluateOfflineBaselineEligibility({
    decisionAtMs: input.decisionAtMs,
    lastPhysicalPollMs: input.lastPhysicalPollMs,
    effectiveTier: tier,
    lastProviderFetchedAtMs: input.lastProviderFetchedAtMs,
  });
}

/** @deprecated Use evaluateOfflineBaselineEligibilityFromPolicyInput */
export function evaluateOfflineBaselinePollDueFromPolicyInput(
  input: ApdsV3OfflinePolicyInput,
  _tierIntervalMs: number,
): boolean {
  const r = evaluateOfflineBaselineEligibilityFromPolicyInput(input);
  return r.assessable && r.canonicalDue;
}
