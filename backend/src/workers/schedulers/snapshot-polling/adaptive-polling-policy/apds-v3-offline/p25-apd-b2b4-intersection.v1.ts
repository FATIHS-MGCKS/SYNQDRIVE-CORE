import type { P25ApdShadowDecision } from '../p25-apd-shadow-decision.types';
import type { P25ApdShadowDecisionKind } from '../p25-apd-shadow-decision.types';

export const P25_APD_B2B4_INTERSECTION_VERSION = 'P25_APD_B2B4_INTERSECTION_V1' as const;

export type FrozenPolicyBucket =
  | 'WOULD_POLL'
  | 'WOULD_SKIP'
  | 'FORCED_OR_SAFETY'
  | 'UNSUPPORTED';

export type B2B4IntersectionVerdict =
  | { kind: 'JOINT_SKIP_CANDIDATE' }
  | { kind: 'NOT_JOINT_SKIP'; reason: string }
  | { kind: 'NOT_ASSESSABLE'; reason: string };

const FORCED_OR_SAFETY: ReadonlySet<P25ApdShadowDecisionKind> = new Set([
  'FORCED_FALLBACK',
  'FORCED_TRIP_SAFETY',
  'FORCED_PROFILE_INVALID',
  'FORCED_SOURCE_TIMESTAMP_MISSING',
  'FORCED_PROVIDER_GAP',
  'FORCED_RECONNECT',
  'FORCED_INSUFFICIENT_PROFILE',
  'IMMEDIATE_SNAPSHOT_REQUIRED',
]);

export function bucketFrozenPolicyDecision(
  decision: P25ApdShadowDecisionKind,
): FrozenPolicyBucket {
  if (decision === 'WOULD_POLL' || decision === 'WOULD_SKIP') return decision;
  if (FORCED_OR_SAFETY.has(decision)) return 'FORCED_OR_SAFETY';
  if (decision === 'NOT_ELIGIBLE_ACTIVE_TRIP') return 'FORCED_OR_SAFETY';
  return 'UNSUPPORTED';
}

/**
 * Conservative B2∩B4 reference semantics (offline only):
 * - Both WOULD_SKIP → joint-skip candidate
 * - Either WOULD_POLL → not a joint skip
 * - Any forced/safety → not a joint skip (fail open to poll)
 * - Unsupported → NOT_ASSESSABLE
 */
export function evaluateFrozenB2B4Intersection(
  b2: P25ApdShadowDecision,
  b4: P25ApdShadowDecision,
): B2B4IntersectionVerdict {
  const b2b = bucketFrozenPolicyDecision(b2.decision);
  const b4b = bucketFrozenPolicyDecision(b4.decision);

  if (b2b === 'UNSUPPORTED' || b4b === 'UNSUPPORTED') {
    return {
      kind: 'NOT_ASSESSABLE',
      reason: `UNSUPPORTED_DECISION:b2=${b2.decision};b4=${b4.decision}`,
    };
  }

  if (b2b === 'FORCED_OR_SAFETY' || b4b === 'FORCED_OR_SAFETY') {
    return {
      kind: 'NOT_JOINT_SKIP',
      reason: 'FORCED_OR_SAFETY_PRESENT',
    };
  }

  if (b2b === 'WOULD_POLL' || b4b === 'WOULD_POLL') {
    return {
      kind: 'NOT_JOINT_SKIP',
      reason: 'EITHER_POLICY_WOULD_POLL',
    };
  }

  if (b2b === 'WOULD_SKIP' && b4b === 'WOULD_SKIP') {
    return { kind: 'JOINT_SKIP_CANDIDATE' };
  }

  return {
    kind: 'NOT_ASSESSABLE',
    reason: `UNREACHABLE_PAIR:b2=${b2b};b4=${b4b}`,
  };
}
