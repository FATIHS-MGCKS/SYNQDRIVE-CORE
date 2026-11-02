import {
  classifyTelemetryFreshness,
  TELEMETRY_FRESH_THRESHOLD_MS,
} from '../../vehicles/vehicle-state-interpreter';

const FUTURE_PROVIDER_FETCH_TOLERANCE_MS = 60_000;

export const VSI_LIMITATION_PROVIDER_LAST_SUCCESSFUL_FETCH_WALL_CLOCK_NOT_PHYSICAL_SIGNAL =
  'PROVIDER_LAST_SUCCESSFUL_FETCH_WALL_CLOCK_NOT_PHYSICAL_SIGNAL';

export const VSI_LIMITATION_PROVIDER_FETCH_RECENCY_RULE =
  `PROVIDER_FETCH_RECENCY_RULE=classifyTelemetryFreshness;LIVE_THRESHOLD_MS=${TELEMETRY_FRESH_THRESHOLD_MS}`;

/**
 * Maps VLS `providerFetchedAt` (wall clock of last persisted provider acquisition on the
 * attributed link) to profile freshness. This is fetch-recency metadata, not physical
 * sensor quality. Does not prove strict source advance (see PROVIDER_FETCH_TIME_NOT_SOURCE_ADVANCE_PROOF).
 */
export function resolveProviderLastSuccessfulFetchFreshness(input: {
  providerFetchedAt: Date | null;
  projectionAsOfMs: number;
}): {
  freshnessClassification: 'FRESH' | 'STALE' | 'UNKNOWN';
  limitations: string[];
} {
  const { providerFetchedAt, projectionAsOfMs } = input;
  if (!providerFetchedAt) {
    return { freshnessClassification: 'UNKNOWN', limitations: [] };
  }
  if (providerFetchedAt.getTime() > projectionAsOfMs + FUTURE_PROVIDER_FETCH_TOLERANCE_MS) {
    return {
      freshnessClassification: 'UNKNOWN',
      limitations: ['FUTURE_PROVIDER_FETCH_TIMESTAMP_REJECTED'],
    };
  }
  const bucket = classifyTelemetryFreshness(providerFetchedAt, projectionAsOfMs);
  if (bucket === 'live' || bucket === 'standby') {
    return { freshnessClassification: 'FRESH', limitations: [VSI_LIMITATION_PROVIDER_FETCH_RECENCY_RULE] };
  }
  if (bucket === 'signal_delayed' || bucket === 'offline') {
    return { freshnessClassification: 'STALE', limitations: [VSI_LIMITATION_PROVIDER_FETCH_RECENCY_RULE] };
  }
  return {
    freshnessClassification: 'UNKNOWN',
    limitations: [VSI_LIMITATION_PROVIDER_FETCH_RECENCY_RULE],
  };
}
