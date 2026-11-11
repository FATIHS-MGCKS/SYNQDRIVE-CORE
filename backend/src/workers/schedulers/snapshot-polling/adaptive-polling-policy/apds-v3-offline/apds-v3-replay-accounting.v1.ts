import type { ApdsV3OfflinePolicyDecision } from './apds-v3-offline.types';
import { evaluateFrozenB2B4Intersection } from './p25-apd-b2b4-intersection.v1';
import type { P25ApdShadowDecision } from '../p25-apd-shadow-decision.types';

export type PhysicalRequestOutcomeClass =
  | 'BASELINE_ELIGIBLE_PHYSICAL_OPPORTUNITY'
  | 'BASELINE_NOT_DUE_DECISION_TICK'
  | 'BASELINE_CANONICAL_NOT_ASSESSABLE'
  | 'V3_PROJECTED_PHYSICAL_POLL'
  | 'V3_PROJECTED_AUTHORITATIVE_SAFE_SKIP'
  | 'V3_PROJECTED_HEURISTIC_SKIP'
  | 'HYPOTHETICAL_RESEARCH_CANDIDATE_SKIP'
  | 'V3_PRESERVE_BASELINE_INSUFFICIENT_EVIDENCE'
  | 'V3_PRESERVE_BASELINE_NOT_ASSESSABLE'
  | 'HYPOTHETICAL_INCREMENTAL_SKIP_VS_BASELINE'
  | 'V3_HYPOTHETICAL_POLL_BASELINE_NOT_DUE';

export type ReplayPhysicalAccounting = {
  baselineDue: boolean;
  baselineAssessable: boolean;
  outcomeClass: PhysicalRequestOutcomeClass;
  v3ProjectsPhysicalPoll: boolean;
  countsTowardHypotheticalSkipSavings: boolean;
  countsAsHypotheticalResearchCandidate: boolean;
  countsAsV3PollWhenBaselineNotDue: boolean;
};

export function classifyV3ReplayPhysicalAccounting(input: {
  baselineDue: boolean;
  baselineAssessable: boolean;
  excludeFromOptimizationCalibration?: boolean;
  v3: ApdsV3OfflinePolicyDecision;
  b2: P25ApdShadowDecision;
  b4: P25ApdShadowDecision;
}): ReplayPhysicalAccounting {
  const joint = evaluateFrozenB2B4Intersection(input.b2, input.b4);
  const exclude = input.excludeFromOptimizationCalibration === true;

  if (!input.baselineAssessable) {
    return {
      baselineDue: false,
      baselineAssessable: false,
      outcomeClass: 'BASELINE_CANONICAL_NOT_ASSESSABLE',
      v3ProjectsPhysicalPoll:
        input.v3.decision === 'WOULD_POLL' ||
        input.v3.decision === 'FORCED_SAFETY_POLL' ||
        input.v3.decision === 'INSUFFICIENT_EVIDENCE' ||
        input.v3.decision === 'NOT_ASSESSABLE',
      countsTowardHypotheticalSkipSavings: false,
      countsAsHypotheticalResearchCandidate: false,
      countsAsV3PollWhenBaselineNotDue: false,
    };
  }

  if (!input.baselineDue) {
    const v3Poll =
      input.v3.decision === 'WOULD_POLL' || input.v3.decision === 'FORCED_SAFETY_POLL';
    return {
      baselineDue: false,
      baselineAssessable: true,
      outcomeClass: v3Poll
        ? 'V3_HYPOTHETICAL_POLL_BASELINE_NOT_DUE'
        : 'BASELINE_NOT_DUE_DECISION_TICK',
      v3ProjectsPhysicalPoll: v3Poll,
      countsTowardHypotheticalSkipSavings: false,
      countsAsHypotheticalResearchCandidate:
        !exclude &&
        input.v3.decision === 'WOULD_SKIP' &&
        (input.v3.reason.includes('LOW_HEURISTIC') ||
          input.v3.reason.includes('HYSTERESIS')),
      countsAsV3PollWhenBaselineNotDue: v3Poll,
    };
  }

  let outcomeClass: PhysicalRequestOutcomeClass = 'BASELINE_ELIGIBLE_PHYSICAL_OPPORTUNITY';
  let v3ProjectsPhysicalPoll = false;
  let countsTowardHypotheticalSkipSavings = false;
  let countsAsHypotheticalResearchCandidate = false;

  switch (input.v3.decision) {
    case 'WOULD_POLL':
    case 'FORCED_SAFETY_POLL':
      outcomeClass = 'V3_PROJECTED_PHYSICAL_POLL';
      v3ProjectsPhysicalPoll = true;
      break;
    case 'INSUFFICIENT_EVIDENCE':
      outcomeClass = 'V3_PRESERVE_BASELINE_INSUFFICIENT_EVIDENCE';
      v3ProjectsPhysicalPoll = true;
      break;
    case 'NOT_ASSESSABLE':
      outcomeClass = 'V3_PRESERVE_BASELINE_NOT_ASSESSABLE';
      v3ProjectsPhysicalPoll = true;
      break;
    case 'WOULD_SKIP': {
      const heuristic =
        input.v3.reason.includes('LOW_HEURISTIC') ||
        input.v3.reason.includes('HYSTERESIS');
      if (heuristic) {
        outcomeClass = 'HYPOTHETICAL_RESEARCH_CANDIDATE_SKIP';
        countsAsHypotheticalResearchCandidate = !exclude;
      } else {
        outcomeClass = 'V3_PROJECTED_AUTHORITATIVE_SAFE_SKIP';
      }
      if (!exclude && joint.kind === 'JOINT_SKIP_CANDIDATE' && heuristic) {
        countsTowardHypotheticalSkipSavings = true;
        outcomeClass = 'HYPOTHETICAL_INCREMENTAL_SKIP_VS_BASELINE';
      }
      break;
    }
    default:
      outcomeClass = 'V3_PRESERVE_BASELINE_NOT_ASSESSABLE';
      v3ProjectsPhysicalPoll = true;
  }

  return {
    baselineDue: true,
    baselineAssessable: true,
    outcomeClass,
    v3ProjectsPhysicalPoll,
    countsTowardHypotheticalSkipSavings,
    countsAsHypotheticalResearchCandidate,
    countsAsV3PollWhenBaselineNotDue: false,
  };
}

/** Dedupe key for physical request identity when evidence supplies one. */
export function physicalRequestDedupKey(parts: {
  organizationId: string;
  vehicleId: string;
  physicalRequestId?: string | null;
  decisionAtMs: number;
}): string {
  if (parts.physicalRequestId) {
    return `phys:${parts.organizationId}:${parts.vehicleId}:${parts.physicalRequestId}`;
  }
  return `tick:${parts.organizationId}:${parts.vehicleId}:${parts.decisionAtMs}`;
}

export function firstPhysicalOccurrence(
  key: string,
  seen: Set<string>,
): boolean {
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}
