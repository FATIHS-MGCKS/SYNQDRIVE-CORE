import { Prisma } from '@prisma/client';
import { LIVE_FSM_SPLIT_TRIGGER } from './di-boundary-admission/trip-di-boundary-admission-live-fsm-split.util';

const DISCARD_TOO_SHORT_NO_DISTANCE = 'too_short_no_distance';
const BOUNDARY_EXTENSION = 'PARTIAL_TRIP_BOUNDARY_EXTENSION';

/** Strict UTC instant strings from `Date.prototype.toISOString()` (optional fractional seconds). */
export const SPLIT_SECOND_START_AT_ISO_Z_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export const SPLIT_SECOND_START_AT_ISO_Z_PG_REGEX =
  '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,3})?Z$';

export function readTripDiscardReason(rawDetectionMeta: unknown): string | null {
  if (rawDetectionMeta == null || typeof rawDetectionMeta !== 'object' || Array.isArray(rawDetectionMeta)) {
    return null;
  }
  const reason = (rawDetectionMeta as Record<string, unknown>).discardReason;
  return typeof reason === 'string' ? reason : null;
}

export function readSplitFromTripId(rawDetectionMeta: unknown): string | null {
  if (rawDetectionMeta == null || typeof rawDetectionMeta !== 'object' || Array.isArray(rawDetectionMeta)) {
    return null;
  }
  const splitFrom = (rawDetectionMeta as Record<string, unknown>).splitFrom;
  return typeof splitFrom === 'string' && splitFrom.length > 0 ? splitFrom : null;
}

/**
 * Fail-closed: generic `isRepaired` alone is not sufficient — require explicit
 * PARTIAL_TRIP_BOUNDARY_EXTENSION on boundaryRepair or boundaryRepairHistory.
 */
export function hasExplicitPartialTripBoundaryExtensionEvidence(rawDetectionMeta: unknown): boolean {
  if (rawDetectionMeta == null || typeof rawDetectionMeta !== 'object' || Array.isArray(rawDetectionMeta)) {
    return false;
  }
  const meta = rawDetectionMeta as Record<string, unknown>;
  const repair = meta.boundaryRepair;
  if (repair != null && typeof repair === 'object' && !Array.isArray(repair)) {
    if ((repair as Record<string, unknown>).repairType === BOUNDARY_EXTENSION) return true;
  }
  const history = meta.boundaryRepairHistory;
  if (Array.isArray(history)) {
    for (const entry of history) {
      if (entry != null && typeof entry === 'object' && !Array.isArray(entry)) {
        if ((entry as Record<string, unknown>).repairType === BOUNDARY_EXTENSION) return true;
      }
    }
  }
  return false;
}

export function parseSplitSecondStartAtEpochMs(value: unknown): number | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (!SPLIT_SECOND_START_AT_ISO_Z_REGEX.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function splitSecondStartAtMatchesSuffixStart(
  splitSecondStartAt: unknown,
  suffixStartTime: Date,
): boolean {
  const anchorMs = parseSplitSecondStartAtEpochMs(splitSecondStartAt);
  if (anchorMs == null) return false;
  return suffixStartTime.getTime() === anchorMs;
}

type TripListRow = {
  id: string;
  tripStatus: string;
  startTime: Date;
  rawDetectionMeta: unknown;
  endDetectionMode?: string | null;
};

/**
 * In-memory filter when parent row is already loaded (tests / batch hydration).
 * Does not hide independent CANCELLED trips or suffixes without proven reconciliation.
 */
export function shouldHideReconciledGapSplitSuffixFromCustomerList(
  suffix: TripListRow,
  parent: TripListRow,
): boolean {
  if (suffix.tripStatus !== 'CANCELLED') return false;
  if (readTripDiscardReason(suffix.rawDetectionMeta) !== DISCARD_TOO_SHORT_NO_DISTANCE) return false;
  if (parent.tripStatus !== 'COMPLETED') return false;
  if (parent.endDetectionMode !== 'MID_TRIP_GAP_SPLIT') return false;
  if (!hasExplicitPartialTripBoundaryExtensionEvidence(parent.rawDetectionMeta)) {
    return false;
  }
  if (parent.rawDetectionMeta == null || typeof parent.rawDetectionMeta !== 'object' || Array.isArray(parent.rawDetectionMeta)) {
    return false;
  }
  const parentMeta = parent.rawDetectionMeta as Record<string, unknown>;
  if (parentMeta.splitTriggeredBy !== LIVE_FSM_SPLIT_TRIGGER) return false;

  const splitFrom = readSplitFromTripId(suffix.rawDetectionMeta);
  if (splitFrom != null) {
    return splitFrom === parent.id;
  }

  return splitSecondStartAtMatchesSuffixStart(parentMeta.splitSecondStartAt, suffix.startTime);
}

type SqlCandidateRow = {
  suffix_id: string;
  parent_id: string;
  suffix_start: Date;
  split_from: string | null;
  split_second_start_at: string | null;
};

function sqlCandidateMatchesLineage(row: SqlCandidateRow): boolean {
  if (row.split_from != null && row.split_from.length > 0) {
    return row.split_from === row.parent_id;
  }
  return splitSecondStartAtMatchesSuffixStart(row.split_second_start_at, row.suffix_start);
}

/**
 * Trip ids that are CANCELLED LIVE_FSM gap-split suffixes absorbed into a reconciled canonical parent.
 * Used for customer-facing list/stats (DB rows and Master Admin reads stay unchanged).
 */
export async function listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList(
  prisma: { $queryRaw: Prisma.TransactionClient['$queryRaw'] },
  vehicleId: string,
  options?: { from?: Date; to?: Date },
): Promise<string[]> {
  const rows = await prisma.$queryRaw<SqlCandidateRow[]>`
    SELECT suffix.id::text AS suffix_id,
           parent.id::text AS parent_id,
           suffix.start_time AS suffix_start,
           suffix.raw_detection_meta->>'splitFrom' AS split_from,
           parent.raw_detection_meta->>'splitSecondStartAt' AS split_second_start_at
    FROM vehicle_trips suffix
    INNER JOIN vehicle_trips parent ON parent.vehicle_id = suffix.vehicle_id
      AND parent.id <> suffix.id
    WHERE suffix.vehicle_id = ${vehicleId}
      AND suffix.trip_status::text = 'CANCELLED'
      AND suffix.raw_detection_meta->>'discardReason' = ${DISCARD_TOO_SHORT_NO_DISTANCE}
      AND parent.trip_status::text = 'COMPLETED'
      AND parent.end_detection_mode::text = 'MID_TRIP_GAP_SPLIT'
      AND (parent.raw_detection_meta->>'splitTriggeredBy') = ${LIVE_FSM_SPLIT_TRIGGER}
      AND (
        parent.raw_detection_meta->'boundaryRepair'->>'repairType' = ${BOUNDARY_EXTENSION}
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(parent.raw_detection_meta->'boundaryRepairHistory') = 'array'
              THEN parent.raw_detection_meta->'boundaryRepairHistory'
              ELSE '[]'::jsonb
            END
          ) elem
          WHERE elem->>'repairType' = ${BOUNDARY_EXTENSION}
        )
      )
      AND (
        (suffix.raw_detection_meta->>'splitFrom') = parent.id::text
        OR (
          (parent.raw_detection_meta->>'splitSecondStartAt') IS NOT NULL
          AND (parent.raw_detection_meta->>'splitSecondStartAt') ~ ${SPLIT_SECOND_START_AT_ISO_Z_PG_REGEX}
        )
      )
      ${options?.from ? Prisma.sql`AND suffix.start_time >= ${options.from}` : Prisma.empty}
      ${options?.to ? Prisma.sql`AND suffix.start_time <= ${options.to}` : Prisma.empty}`;

  const hidden = new Set<string>();
  for (const row of rows) {
    if (sqlCandidateMatchesLineage(row)) {
      hidden.add(row.suffix_id);
    }
  }
  return [...hidden];
}

export function applyHiddenCustomerSuffixTripExclusion<T extends Record<string, unknown>>(
  where: T,
  hiddenSuffixIds: readonly string[],
): T & { id?: { notIn: string[] } } {
  if (hiddenSuffixIds.length === 0) return where;
  const priorId = (where.id as Record<string, unknown> | undefined) ?? {};
  return {
    ...where,
    id: { ...priorId, notIn: [...hiddenSuffixIds] },
  };
}

export function filterCustomerVisibleTrips<T extends { id: string }>(
  trips: T[],
  hiddenSuffixIds: ReadonlySet<string>,
): T[] {
  if (hiddenSuffixIds.size === 0) return trips;
  return trips.filter((trip) => !hiddenSuffixIds.has(trip.id));
}
