import {
  isSnapshotPollDue,
  type SnapshotPollDueInput,
} from '../../derive-snapshot-polling-tier';
import { DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG } from '../../snapshot-polling-tier.config';
import { SnapshotPollingTier } from '../../snapshot-polling-tier.types';

export const APDS_V3_BASELINE_AUTHORITY = 'BASELINE_PARTIAL_PARITY' as const;

export type OfflineBaselinePollDueInput = {
  decisionAtMs: number;
  lastPhysicalPollMs: number | null;
  effectiveTier: SnapshotPollingTier;
  rawTier?: SnapshotPollingTier;
  previousEffectiveTier?: SnapshotPollingTier | null;
  lastProviderFetchedAtMs?: number | null;
};

export type OfflineBaselineEligibility =
  | { assessable: true; canonicalDue: boolean; authority: typeof APDS_V3_BASELINE_AUTHORITY }
  | { assessable: false; reason: string };

/**
 * Partial adapter to production `isSnapshotPollDue`.
 * Missing promotion/hysteresis/coalescing context — not certified full scheduler parity.
 */
export function evaluateOfflineBaselineEligibility(
  input: OfflineBaselinePollDueInput,
  config = DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG,
): OfflineBaselineEligibility {
  const pollDueInput: SnapshotPollDueInput = {
    effectiveTier: input.effectiveTier,
    rawTier: input.rawTier ?? input.effectiveTier,
    previousEffectiveTier: input.previousEffectiveTier ?? null,
    lastPolledAt:
      input.lastPhysicalPollMs != null
        ? new Date(input.lastPhysicalPollMs)
        : null,
    nowMs: input.decisionAtMs,
    config,
    tierInput: {
      connectionStatus: 'CONNECTED',
      tokenId: 1,
      tripDetectionState: null,
      observationAt:
        input.lastProviderFetchedAtMs != null
          ? new Date(input.lastProviderFetchedAtMs)
          : null,
      lastActivityAt: null,
      speedKmh: null,
      isIgnitionOn: null,
      nowMs: input.decisionAtMs,
    },
  };
  return {
    assessable: true,
    canonicalDue: isSnapshotPollDue(pollDueInput),
    authority: APDS_V3_BASELINE_AUTHORITY,
  };
}

/** Legacy alias */
export function evaluateVerifiedBaselinePollDue(
  input: OfflineBaselinePollDueInput,
  config = DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG,
): { due: boolean; authority: typeof APDS_V3_BASELINE_AUTHORITY } {
  const r = evaluateOfflineBaselineEligibility(input, config);
  if (!r.assessable) {
    return { due: false, authority: APDS_V3_BASELINE_AUTHORITY };
  }
  return { due: r.canonicalDue, authority: r.authority };
}

export function mapActivityTierLabelToSnapshotTier(
  label: string,
): SnapshotPollingTier | null {
  const normalized = label.trim().toUpperCase();
  if (normalized.includes('ACTIVE_DRIVING')) {
    return SnapshotPollingTier.ACTIVE_DRIVING;
  }
  if (normalized.includes('RECENTLY_ACTIVE')) {
    return SnapshotPollingTier.RECENTLY_ACTIVE;
  }
  if (normalized.includes('LONG_IDLE')) return SnapshotPollingTier.LONG_IDLE;
  if (normalized.includes('OFFLINE')) return SnapshotPollingTier.OFFLINE;
  if (normalized.includes('RESTING') || normalized.includes('STANDBY')) {
    return SnapshotPollingTier.RESTING_STANDBY;
  }
  return null;
}
