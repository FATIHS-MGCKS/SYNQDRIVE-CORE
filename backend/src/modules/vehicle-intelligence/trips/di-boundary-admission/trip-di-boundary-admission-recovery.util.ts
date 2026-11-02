import type { PrismaService } from '@shared/database/prisma.service';
import {
  buildTripDiBoundaryRevisionKey,
  canReleaseTripDiBoundaryAdmission,
  readTripDiBoundaryAdmissionV1,
  type TripDiBoundaryAdmissionBlockCode,
  type TripDiBoundaryAdmissionScope,
} from './trip-di-boundary-admission';
import type { TripDiBoundaryAdmissionRecoveryScanCursor } from './trip-di-boundary-admission-recovery.cursor';

/** Minimum keyset scan slots reserved so guarded missing-admission rows cannot starve stale-revision recovery. */
export const RECOVERY_MIN_KEYSET_SCAN_SLOTS = 8;

export function computeMissingAdmissionScanCap(scanLimit: number): number {
  if (scanLimit <= 0) return 0;
  const reservedKeyset = Math.min(RECOVERY_MIN_KEYSET_SCAN_SLOTS, scanLimit);
  return Math.max(0, scanLimit - reservedKeyset);
}

export type TripDiBoundaryAdmissionRecoveryCandidateOutcome =
  | { kind: 'NEEDS_RELEASE'; tripId: string }
  | { kind: 'ALREADY_CURRENT'; tripId: string }
  | { kind: 'GUARDED'; tripId: string; code: TripDiBoundaryAdmissionBlockCode };

export function classifyTripDiBoundaryAdmissionRecoveryCandidate(
  scope: TripDiBoundaryAdmissionScope,
): TripDiBoundaryAdmissionRecoveryCandidateOutcome {
  const block = canReleaseTripDiBoundaryAdmission(scope);
  if (block != null) {
    return { kind: 'GUARDED', tripId: scope.tripId, code: block };
  }
  const revisionKey = buildTripDiBoundaryRevisionKey({
    organizationId: scope.organizationId,
    vehicleId: scope.vehicleId,
    tripId: scope.tripId,
    tripStatus: scope.tripStatus,
    startTime: scope.startTime,
    endTime: scope.endTime,
    dimoSegmentId: scope.dimoSegmentId,
    mergeParentTripId: scope.mergeParentTripId,
    rawDetectionMeta: scope.rawDetectionMeta,
  });
  const existing = readTripDiBoundaryAdmissionV1(scope.rawDetectionMeta);
  if (existing?.revisionKey === revisionKey) {
    return { kind: 'ALREADY_CURRENT', tripId: scope.tripId };
  }
  return { kind: 'NEEDS_RELEASE', tripId: scope.tripId };
}

/** Shared FSM eligibility: RESTING required when a detection row exists; missing row is an explicit legacy fallback. */
export async function listMissingAdmissionRecoveryCandidateTripIds(
  prisma: Pick<PrismaService, '$queryRaw'>,
  params: {
    vehicleId: string;
    eligibleFrom: Date;
    now: Date;
    limit: number;
  },
): Promise<string[]> {
  if (params.limit <= 0) return [];
  const rows = await prisma.$queryRaw<Array<{ trip_id: string }>>`
    SELECT t.id AS trip_id
    FROM vehicle_trips t
    LEFT JOIN vehicle_trip_detection_states d ON d.vehicle_id = t.vehicle_id
    WHERE t.vehicle_id = ${params.vehicleId}
      AND t.trip_status::text = 'COMPLETED'
      AND t.start_time IS NOT NULL
      AND t.end_time IS NOT NULL
      AND t.end_time >= ${params.eligibleFrom}
      AND t.end_time <= ${params.now}
      AND (t.raw_detection_meta->'diV0BoundaryAdmissionV1'->>'revisionKey') IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM trip_repairs r
        WHERE r.trip_id = t.id AND r.status = 'PROPOSED'
      )
      AND (
        d.state IS NULL OR d.state::text = 'RESTING'
      )
      AND (
        d.active_trip_id IS NULL OR d.active_trip_id::text <> t.id::text
      )
      AND NOT (
        d.state IS NOT NULL AND d.state::text <> 'RESTING'
      )
    ORDER BY t.end_time ASC, t.id ASC
    LIMIT ${params.limit}`;
  return rows.map((r) => r.trip_id);
}

export async function listKeysetRecoveryCandidateTripIds(
  prisma: Pick<PrismaService, '$queryRaw'>,
  params: {
    vehicleId: string;
    eligibleFrom: Date;
    now: Date;
    cursor: TripDiBoundaryAdmissionRecoveryScanCursor | null;
    limit: number;
  },
): Promise<string[]> {
  if (params.limit <= 0) return [];
  const cursor = params.cursor;
  if (cursor == null) {
    const rows = await prisma.$queryRaw<Array<{ trip_id: string }>>`
      SELECT t.id AS trip_id
      FROM vehicle_trips t
      LEFT JOIN vehicle_trip_detection_states d ON d.vehicle_id = t.vehicle_id
      WHERE t.vehicle_id = ${params.vehicleId}
        AND t.trip_status::text = 'COMPLETED'
        AND t.start_time IS NOT NULL
        AND t.end_time IS NOT NULL
        AND t.end_time >= ${params.eligibleFrom}
        AND t.end_time <= ${params.now}
        AND NOT EXISTS (
          SELECT 1 FROM trip_repairs r
          WHERE r.trip_id = t.id AND r.status = 'PROPOSED'
        )
        AND (
          d.state IS NULL OR d.state::text = 'RESTING'
        )
        AND (
          d.active_trip_id IS NULL OR d.active_trip_id::text <> t.id::text
        )
        AND NOT (
          d.state IS NOT NULL AND d.state::text <> 'RESTING'
        )
      ORDER BY t.end_time ASC, t.id ASC
      LIMIT ${params.limit}`;
    return rows.map((r) => r.trip_id);
  }
  const cursorEnd = new Date(cursor.endTimeUtc);
  const rows = await prisma.$queryRaw<Array<{ trip_id: string }>>`
    SELECT t.id AS trip_id
    FROM vehicle_trips t
    LEFT JOIN vehicle_trip_detection_states d ON d.vehicle_id = t.vehicle_id
    WHERE t.vehicle_id = ${params.vehicleId}
      AND t.trip_status::text = 'COMPLETED'
      AND t.start_time IS NOT NULL
      AND t.end_time IS NOT NULL
      AND t.end_time >= ${params.eligibleFrom}
      AND t.end_time <= ${params.now}
      AND (
        t.end_time > ${cursorEnd}
        OR (t.end_time = ${cursorEnd} AND t.id::text > ${cursor.tripId})
      )
      AND NOT EXISTS (
        SELECT 1 FROM trip_repairs r
        WHERE r.trip_id = t.id AND r.status = 'PROPOSED'
      )
      AND (
        d.state IS NULL OR d.state::text = 'RESTING'
      )
      AND (
        d.active_trip_id IS NULL OR d.active_trip_id::text <> t.id::text
      )
      AND NOT (
        d.state IS NOT NULL AND d.state::text <> 'RESTING'
      )
    ORDER BY t.end_time ASC, t.id ASC
    LIMIT ${params.limit}`;
  return rows.map((r) => r.trip_id);
}

/** @deprecated Use listMissingAdmissionRecoveryCandidateTripIds + listKeysetRecoveryCandidateTripIds */
export async function listTripDiBoundaryAdmissionRecoveryCandidateTripIds(
  prisma: Pick<PrismaService, '$queryRaw'>,
  params: {
    vehicleId: string;
    eligibleFrom: Date;
    now: Date;
    limit: number;
  },
): Promise<string[]> {
  const missingCap = computeMissingAdmissionScanCap(params.limit);
  const missing = await listMissingAdmissionRecoveryCandidateTripIds(prisma, {
    ...params,
    limit: missingCap,
  });
  if (missing.length >= params.limit) return missing.slice(0, params.limit);
  const rest = await listKeysetRecoveryCandidateTripIds(prisma, {
    ...params,
    cursor: null,
    limit: params.limit - missing.length,
  });
  return [...missing, ...rest.filter((id) => !missing.includes(id))];
}
