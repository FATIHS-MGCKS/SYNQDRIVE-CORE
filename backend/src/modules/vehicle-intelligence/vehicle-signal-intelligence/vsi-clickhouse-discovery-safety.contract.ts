/**
 * ClickHouse query safety bounds for VSI discovery (P0 contract).
 *
 * All discovery loaders (P1+) must satisfy these predicates before querying.
 */

export const VSI_DISCOVERY_CH_MAX_FINALIZED_TRIPS = 20;
export const VSI_DISCOVERY_CH_HISTORY_DAYS = 14;
export const VSI_DISCOVERY_CH_MAX_POINTS_PER_SIGNAL = 12000;
export const VSI_DISCOVERY_CH_MAX_INVENTORY_SIGNALS = 32;
export const VSI_DISCOVERY_CH_MAX_EXECUTION_TIME_SEC = 15;

export type VsiClickHouseDiscoveryQueryScopeV1 = {
  organizationId: string;
  vehicleId: string;
  /** Required for trip-scoped reads (P1-f alignment). */
  tripId?: string;
  signalName?: string;
  windowStart: Date;
  windowEnd: Date;
  limit: number;
  maxExecutionTimeSec?: number;
};

export type VsiClickHouseDiscoveryScopeValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateClickHouseDiscoveryQueryScope(
  scope: VsiClickHouseDiscoveryQueryScopeV1,
): VsiClickHouseDiscoveryScopeValidationResult {
  if (!scope.organizationId?.trim()) {
    return { ok: false, reason: 'organizationId required in CH discovery query' };
  }
  if (!scope.vehicleId?.trim()) {
    return { ok: false, reason: 'vehicle_id required in CH discovery query' };
  }
  if (!Number.isFinite(scope.windowStart.getTime()) || !Number.isFinite(scope.windowEnd.getTime())) {
    return { ok: false, reason: 'invalid time window' };
  }
  if (scope.windowEnd.getTime() < scope.windowStart.getTime()) {
    return { ok: false, reason: 'windowEnd before windowStart' };
  }
  const windowMs = scope.windowEnd.getTime() - scope.windowStart.getTime();
  const maxWindowMs = VSI_DISCOVERY_CH_HISTORY_DAYS * 24 * 3600 * 1000;
  if (windowMs > maxWindowMs) {
    return { ok: false, reason: 'time window exceeds VSI_DISCOVERY_CH_HISTORY_DAYS' };
  }
  if (scope.limit <= 0 || scope.limit > VSI_DISCOVERY_CH_MAX_POINTS_PER_SIGNAL) {
    return { ok: false, reason: 'limit out of bounds' };
  }
  const maxExec = scope.maxExecutionTimeSec ?? VSI_DISCOVERY_CH_MAX_EXECUTION_TIME_SEC;
  if (maxExec <= 0 || maxExec > VSI_DISCOVERY_CH_MAX_EXECUTION_TIME_SEC) {
    return { ok: false, reason: 'max_execution_time out of bounds' };
  }
  return { ok: true };
}

export type VsiLinkAttributionForHistoricalClaimV1 = {
  linkActive: boolean;
  linkIntervalStartMs: number;
  linkIntervalEndMs: number | null;
  tripStartMs: number;
  tripEndMs: number;
  attributionLimitations: readonly string[];
};

/**
 * Positive historical observation requires trip window clipped to link bounds without ambiguity limitations.
 */
export function linkAttributionAllowsPositiveHistoricalClaim(
  input: VsiLinkAttributionForHistoricalClaimV1,
): boolean {
  if (!input.linkActive) return false;
  if (input.attributionLimitations.length > 0) return false;
  const linkEnd = input.linkIntervalEndMs ?? Number.POSITIVE_INFINITY;
  if (input.tripEndMs < input.linkIntervalStartMs) return false;
  if (input.tripStartMs > linkEnd) return false;
  return true;
}

/** SQL contract: org_id and vehicle_id must appear in WHERE for discovery inventory queries. */
export const VSI_DISCOVERY_CH_REQUIRED_WHERE_PREDICATES = [
  'org_id',
  'vehicle_id',
] as const;

export function assertClickHouseDiscoverySqlContainsTenantPredicates(sql: string): void {
  const normalized = sql.toLowerCase();
  for (const pred of VSI_DISCOVERY_CH_REQUIRED_WHERE_PREDICATES) {
    if (!normalized.includes(pred)) {
      throw new Error(`CH discovery SQL missing required predicate: ${pred}`);
    }
  }
}
