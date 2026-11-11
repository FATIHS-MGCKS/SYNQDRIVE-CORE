import { evaluateVerifiedBaselinePollDue } from './apds-v3-baseline-poll-due.adapter';
import { SnapshotPollingTier } from '../../snapshot-polling-tier.types';
import { DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG } from '../../snapshot-polling-tier.config';

describe('apds-v3-baseline-poll-due.adapter golden parity', () => {
  const t0 = 1_700_000_000_000;
  const interval =
    DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG.intervalMsByTier[
      SnapshotPollingTier.RESTING_STANDBY
    ];

  it('due when never polled', () => {
    expect(
      evaluateVerifiedBaselinePollDue({
        decisionAtMs: t0,
        lastPhysicalPollMs: null,
        effectiveTier: SnapshotPollingTier.RESTING_STANDBY,
      }).due,
    ).toBe(true);
  });

  it('not due inside tier interval', () => {
    expect(
      evaluateVerifiedBaselinePollDue({
        decisionAtMs: t0,
        lastPhysicalPollMs: t0 - interval + 1000,
        effectiveTier: SnapshotPollingTier.RESTING_STANDBY,
      }).due,
    ).toBe(false);
  });

  it('due when interval elapsed', () => {
    expect(
      evaluateVerifiedBaselinePollDue({
        decisionAtMs: t0,
        lastPhysicalPollMs: t0 - interval,
        effectiveTier: SnapshotPollingTier.RESTING_STANDBY,
      }).due,
    ).toBe(true);
  });
});
