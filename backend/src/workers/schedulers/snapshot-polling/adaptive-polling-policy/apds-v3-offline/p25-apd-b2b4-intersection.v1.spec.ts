import {
  bucketFrozenPolicyDecision,
  evaluateFrozenB2B4Intersection,
} from './p25-apd-b2b4-intersection.v1';
import type { P25ApdShadowDecision } from '../p25-apd-shadow-decision.types';

function d(
  decision: P25ApdShadowDecision['decision'],
  policyVersion: 'P25_APD_B2_V1' | 'P25_APD_B4_V1',
): P25ApdShadowDecision {
  return {
    policyVersion,
    decision,
    reason: 'PHASE_WINDOW_INSIDE_MIN_INTERVAL',
    expectedWindowStartMs: null,
    expectedWindowEndMs: null,
  };
}

describe('p25-apd-b2b4-intersection.v1 exhaustive pairs', () => {
  const pollSkip = ['WOULD_POLL', 'WOULD_SKIP'] as const;
  const forced = [
    'FORCED_TRIP_SAFETY',
    'FORCED_SOURCE_TIMESTAMP_MISSING',
    'IMMEDIATE_SNAPSHOT_REQUIRED',
  ] as const;

  it.each(pollSkip.flatMap((b2) => pollSkip.map((b4) => [b2, b4] as const)))(
    'poll/skip matrix %s + %s',
    (b2d, b4d) => {
      const verdict = evaluateFrozenB2B4Intersection(
        d(b2d, 'P25_APD_B2_V1'),
        d(b4d, 'P25_APD_B4_V1'),
      );
      if (b2d === 'WOULD_SKIP' && b4d === 'WOULD_SKIP') {
        expect(verdict.kind).toBe('JOINT_SKIP_CANDIDATE');
      } else if (b2d === 'WOULD_POLL' || b4d === 'WOULD_POLL') {
        expect(verdict.kind).toBe('NOT_JOINT_SKIP');
        expect(verdict).toMatchObject({ reason: 'EITHER_POLICY_WOULD_POLL' });
      }
    },
  );

  it.each(forced)('forced %s prevents joint skip', (fd) => {
    const verdict = evaluateFrozenB2B4Intersection(
      d(fd, 'P25_APD_B2_V1'),
      d('WOULD_SKIP', 'P25_APD_B4_V1'),
    );
    expect(verdict.kind).toBe('NOT_JOINT_SKIP');
    expect(verdict).toMatchObject({ reason: 'FORCED_OR_SAFETY_PRESENT' });
  });

  it('unsupported decision is NOT_ASSESSABLE', () => {
    expect(bucketFrozenPolicyDecision('SHADOW_NOT_EVALUATED' as never)).toBe(
      'UNSUPPORTED',
    );
    const verdict = evaluateFrozenB2B4Intersection(
      d('WOULD_SKIP', 'P25_APD_B2_V1'),
      {
        ...d('WOULD_SKIP', 'P25_APD_B4_V1'),
        decision: 'SHADOW_NOT_EVALUATED' as P25ApdShadowDecision['decision'],
      },
    );
    expect(verdict.kind).toBe('NOT_ASSESSABLE');
  });
});
