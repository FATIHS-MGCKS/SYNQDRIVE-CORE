import { evaluateP25ApdB2V1Core, evaluateP25ApdB4V1Core } from '../p25-apd-policy-engine';
import {
  evaluateApdsV3OfflinePolicy,
  buildP25ShadowInputFromOffline,
  evaluateOfflineBaselineEligibilityFromPolicyInput,
} from './apds-v3-offline-policy.evaluator';
import type { ApdsV3OfflinePolicyInput } from './apds-v3-offline.types';
import {
  classifyV3ReplayPhysicalAccounting,
  physicalRequestDedupKey,
  firstPhysicalOccurrence,
  type PhysicalRequestOutcomeClass,
} from './apds-v3-replay-accounting.v1';
import { evaluateFrozenB2B4Intersection } from './p25-apd-b2b4-intersection.v1';
import { APDS_V3_BASELINE_AUTHORITY } from './apds-v3-baseline-poll-due.adapter';
import { validateCausalEvidenceAtDecision } from './apds-v3-causal-evidence.v1';

export type ApdsV3ReplayEpochPoint = {
  decisionAtMs: number;
  organizationId: string;
  vehicleId: string;
  tierIntervalMs: number;
  physicalRequestId?: string | null;
  input: ApdsV3OfflinePolicyInput;
};

export type ReplayCountPrecision =
  | 'CONFIRMED_PHYSICAL_ID'
  | 'MIXED_PHYSICAL_ID_INCOMPLETE'
  | 'NOT_ASSESSABLE_TICK_ONLY';

export type ApdsV3ReplayAggregatorReport = {
  windowStartMs: number;
  windowEndMs: number;
  vehicleCount: number;
  decisionTickCount: number;
  canonicalEligibilityTicksAssessable: number;
  canonicalEligibilityTicksNotAssessable: number;
  baselineEligiblePhysicalOpportunities: number;
  dedupedBaselinePhysicalOpportunities: number;
  dedupedV3ProjectedPhysicalPolls: number;
  counterfactualHypotheticalSkipSavings: number;
  hypotheticalResearchCandidateSkips: number;
  v3HypotheticalPollsWhenBaselineNotDue: number;
  v3AdditionalPollsVsBaseline: number;
  b2WouldSkip: number;
  b4WouldSkip: number;
  b2b4JointSkipCandidate: number;
  v3WouldSkip: number;
  forcedSafetyPoll: number;
  insufficientEvidence: number;
  notAssessable: number;
  hindsightLvSourceAdvanceMissObserved: number;
  p2cTopLevelAdvancesAtRisk: number;
  tripSafetyViolations: number;
  consumerFreshnessViolations: number;
  ksMx2024ProviderErrorTicks: number;
  staleP50Ms: number | null;
  staleP95Ms: number | null;
  staleP99Ms: number | null;
  physicalCountPrecision: ReplayCountPrecision;
  baselineAuthority: typeof APDS_V3_BASELINE_AUTHORITY;
  outcomeClassCounts: Partial<Record<PhysicalRequestOutcomeClass, number>>;
  disclaimer: string;
};

function hasValidPhysicalRequestId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.trim().length > 0;
}

/** Every replay point with a physical-eligibility role must carry an id for CONFIRMED precision. */
export function resolveReplayPhysicalCountPrecision(
  points: ApdsV3ReplayEpochPoint[],
): ReplayCountPrecision {
  if (points.length === 0) return 'NOT_ASSESSABLE_TICK_ONLY';
  const withId = points.filter((p) => hasValidPhysicalRequestId(p.physicalRequestId));
  if (withId.length === 0) return 'NOT_ASSESSABLE_TICK_ONLY';
  if (withId.length === points.length) return 'CONFIRMED_PHYSICAL_ID';
  return 'MIXED_PHYSICAL_ID_INCOMPLETE';
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx] ?? null;
}

function p2cAdvanceCausallyBound(input: ApdsV3OfflinePolicyInput): boolean {
  if (!input.p2cTopLevelAdvanceKnown) return false;
  return validateCausalEvidenceAtDecision({
    ...input,
    p2cTopLevelAdvanceKnown: true,
  }).ok;
}

/** Deterministic offline replay — no counterfactual DIMO responses. */
export function aggregateApdsV3ReplayPoints(
  points: ApdsV3ReplayEpochPoint[],
  window: { startMs: number; endMs: number },
): ApdsV3ReplayAggregatorReport {
  const inWindow = points.filter(
    (p) => p.decisionAtMs >= window.startMs && p.decisionAtMs <= window.endMs,
  );
  const vehicleIds = new Set(inWindow.map((p) => `${p.organizationId}:${p.vehicleId}`));

  const seenBaselinePhysical = new Set<string>();
  const seenV3ProjectedPhysical = new Set<string>();
  const seenV3AdditionalBaselineNotDue = new Set<string>();
  const seenHypotheticalSavings = new Set<string>();

  let canonicalAssessable = 0;
  let canonicalNotAssessable = 0;
  let baselineEligible = 0;
  let dedupedBaseline = 0;
  let dedupedV3Projected = 0;
  let hypotheticalSkip = 0;
  let researchCandidates = 0;
  let v3HypotheticalNotDue = 0;
  let v3Additional = 0;
  let b2WouldSkip = 0;
  let b4WouldSkip = 0;
  let b2b4Joint = 0;
  let v3WouldSkip = 0;
  let forced = 0;
  let insuf = 0;
  let na = 0;
  let lvMissObserved = 0;
  let p2cRisk = 0;
  let tripViol = 0;
  let freshViol = 0;
  let ksMx = 0;
  const staleness: number[] = [];
  const outcomeClassCounts: Partial<Record<PhysicalRequestOutcomeClass, number>> = {};

  const physicalCountPrecision = resolveReplayPhysicalCountPrecision(inWindow);

  for (const p of inWindow) {
    const dedupeKey = physicalRequestDedupKey({
      organizationId: p.organizationId,
      vehicleId: p.vehicleId,
      physicalRequestId: p.physicalRequestId,
      decisionAtMs: p.decisionAtMs,
    });

    const baselineElig = evaluateOfflineBaselineEligibilityFromPolicyInput(p.input);
    if (baselineElig.assessable) {
      canonicalAssessable += 1;
    } else {
      canonicalNotAssessable += 1;
    }

    const baselineDue = baselineElig.assessable && baselineElig.canonicalDue;
    const baselineAssessable = baselineElig.assessable;

    if (baselineDue) {
      baselineEligible += 1;
      if (firstPhysicalOccurrence(dedupeKey, seenBaselinePhysical)) {
        dedupedBaseline += 1;
      }
    }

    const v3 = evaluateApdsV3OfflinePolicy(p.input);
    const shadow = buildP25ShadowInputFromOffline(p.input);
    const b2 = evaluateP25ApdB2V1Core(shadow);
    const b4 = evaluateP25ApdB4V1Core(shadow);
    const joint = evaluateFrozenB2B4Intersection(b2, b4);

    const accounting = classifyV3ReplayPhysicalAccounting({
      baselineDue,
      baselineAssessable,
      excludeFromOptimizationCalibration: p.input.excludeFromOptimizationCalibration,
      v3,
      b2,
      b4,
    });
    outcomeClassCounts[accounting.outcomeClass] =
      (outcomeClassCounts[accounting.outcomeClass] ?? 0) + 1;

    if (accounting.countsAsV3PollWhenBaselineNotDue) {
      if (accounting.v3ProjectsPhysicalPoll) {
        if (firstPhysicalOccurrence(dedupeKey, seenV3ProjectedPhysical)) {
          dedupedV3Projected += 1;
        }
        if (firstPhysicalOccurrence(dedupeKey, seenV3AdditionalBaselineNotDue)) {
          v3HypotheticalNotDue += 1;
          v3Additional += 1;
        }
      }
    } else if (accounting.v3ProjectsPhysicalPoll) {
      if (firstPhysicalOccurrence(dedupeKey, seenV3ProjectedPhysical)) {
        dedupedV3Projected += 1;
      }
    }

    if (accounting.countsTowardHypotheticalSkipSavings) {
      if (firstPhysicalOccurrence(dedupeKey, seenHypotheticalSavings)) {
        hypotheticalSkip += 1;
      }
    }

    if (accounting.countsAsHypotheticalResearchCandidate) {
      researchCandidates += 1;
    }

    if (b2.decision === 'WOULD_SKIP') b2WouldSkip += 1;
    if (b4.decision === 'WOULD_SKIP') b4WouldSkip += 1;
    if (joint.kind === 'JOINT_SKIP_CANDIDATE') b2b4Joint += 1;

    if (v3.decision === 'WOULD_SKIP') v3WouldSkip += 1;
    if (v3.decision === 'FORCED_SAFETY_POLL') forced += 1;
    if (v3.decision === 'INSUFFICIENT_EVIDENCE') insuf += 1;
    if (v3.decision === 'NOT_ASSESSABLE') na += 1;

    if (
      v3.decision === 'WOULD_SKIP' &&
      p.input.lvStrictSourceAdvanceObservedAtMs != null &&
      p.input.lvStrictSourceAdvanceObservedAtMs <= p.decisionAtMs
    ) {
      lvMissObserved += 1;
    }

    if (v3.decision === 'WOULD_SKIP' && p2cAdvanceCausallyBound(p.input)) {
      p2cRisk += 1;
    }
    if (p.input.tripFsmState === 'ACTIVE' && v3.decision === 'WOULD_SKIP') {
      tripViol += 1;
    }
    if (v3.decision === 'WOULD_SKIP' && v3.hardSafetyTriggered) {
      freshViol += 1;
    }

    if (p.input.lastLvProviderSourceMs != null) {
      staleness.push(Math.max(0, p.decisionAtMs - p.input.lastLvProviderSourceMs));
    }
    if (p.input.excludeFromOptimizationCalibration && p.input.providerErrorRecent) {
      ksMx += 1;
    }
  }

  staleness.sort((a, b) => a - b);
  return {
    windowStartMs: window.startMs,
    windowEndMs: window.endMs,
    vehicleCount: vehicleIds.size,
    decisionTickCount: inWindow.length,
    canonicalEligibilityTicksAssessable: canonicalAssessable,
    canonicalEligibilityTicksNotAssessable: canonicalNotAssessable,
    baselineEligiblePhysicalOpportunities: baselineEligible,
    dedupedBaselinePhysicalOpportunities: dedupedBaseline,
    dedupedV3ProjectedPhysicalPolls: dedupedV3Projected,
    counterfactualHypotheticalSkipSavings: hypotheticalSkip,
    hypotheticalResearchCandidateSkips: researchCandidates,
    v3HypotheticalPollsWhenBaselineNotDue: v3HypotheticalNotDue,
    v3AdditionalPollsVsBaseline: v3Additional,
    b2WouldSkip,
    b4WouldSkip,
    b2b4JointSkipCandidate: b2b4Joint,
    v3WouldSkip,
    forcedSafetyPoll: forced,
    insufficientEvidence: insuf,
    notAssessable: na,
    hindsightLvSourceAdvanceMissObserved: lvMissObserved,
    p2cTopLevelAdvancesAtRisk: p2cRisk,
    tripSafetyViolations: tripViol,
    consumerFreshnessViolations: freshViol,
    ksMx2024ProviderErrorTicks: ksMx,
    staleP50Ms: percentile(staleness, 0.5),
    staleP95Ms: percentile(staleness, 0.95),
    staleP99Ms: percentile(staleness, 0.99),
    physicalCountPrecision,
    baselineAuthority: APDS_V3_BASELINE_AUTHORITY,
    outcomeClassCounts,
    disclaimer:
      'OBSERVATIONAL_HYPOTHETICAL_AND_COUNTERFACTUAL_METRICS_NOT_REALIZED_SAVINGS',
  };
}
