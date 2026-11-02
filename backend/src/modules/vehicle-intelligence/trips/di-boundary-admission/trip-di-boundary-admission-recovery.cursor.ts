import type { PrismaService } from '@shared/database/prisma.service';

export const TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_CURSOR_CARRIER_KEY =
  'diV0BoundaryAdmissionRecoveryCursorCarrierV1';

export const TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_SCAN_CURSOR_KEY = 'scanCursor';

export interface TripDiBoundaryAdmissionRecoveryScanCursor {
  endTimeUtc: string;
  tripId: string;
}

export function parseRecoveryScanCursor(raw: unknown): TripDiBoundaryAdmissionRecoveryScanCursor | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const endTimeUtc = typeof r.endTimeUtc === 'string' ? r.endTimeUtc : '';
  const tripId = typeof r.tripId === 'string' ? r.tripId : '';
  if (!endTimeUtc || !tripId) return null;
  const parsedEnd = new Date(endTimeUtc);
  if (!Number.isFinite(parsedEnd.getTime())) return null;
  return { endTimeUtc: parsedEnd.toISOString(), tripId };
}

export async function readTripDiBoundaryAdmissionRecoveryScanCursor(
  prisma: Pick<PrismaService, '$queryRaw'>,
  vehicleId: string,
): Promise<TripDiBoundaryAdmissionRecoveryScanCursor | null> {
  const rows = await prisma.$queryRaw<Array<{ cursor: unknown }>>`
    SELECT t.raw_detection_meta->${TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_SCAN_CURSOR_KEY} AS cursor
    FROM vehicle_trips t
    WHERE t.vehicle_id = ${vehicleId}
      AND (t.raw_detection_meta->>${TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_CURSOR_CARRIER_KEY}) = 'true'
    LIMIT 1`;
  return parseRecoveryScanCursor(rows[0]?.cursor);
}

/**
 * Persists per-vehicle keyset scan progress as operational metadata on one carrier trip row
 * (`raw_detection_meta.scanCursor`). Does not mutate boundary revision fingerprints or admission payloads.
 */
export async function writeTripDiBoundaryAdmissionRecoveryScanCursor(
  prisma: Pick<PrismaService, '$queryRaw' | '$transaction'>,
  vehicleId: string,
  cursor: TripDiBoundaryAdmissionRecoveryScanCursor | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const carrierRows = await tx.$queryRaw<Array<{ trip_id: string }>>`
      SELECT t.id AS trip_id
      FROM vehicle_trips t
      WHERE t.vehicle_id = ${vehicleId}
        AND (t.raw_detection_meta->>${TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_CURSOR_CARRIER_KEY}) = 'true'
      ORDER BY t.end_time DESC NULLS LAST, t.id DESC
      FOR UPDATE`;
    let carrierTripId = carrierRows[0]?.trip_id;
    if (carrierRows.length > 1) {
      const extraIds = carrierRows.slice(1).map((r) => r.trip_id);
      for (const extraId of extraIds) {
        await tx.$queryRaw`
          UPDATE vehicle_trips t
          SET raw_detection_meta = COALESCE(t.raw_detection_meta, '{}'::jsonb)
            - ${TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_CURSOR_CARRIER_KEY}
            - ${TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_SCAN_CURSOR_KEY}
          WHERE t.id = ${extraId}`;
      }
    }
    if (!carrierTripId) {
      const pick = await tx.$queryRaw<Array<{ trip_id: string }>>`
        SELECT t.id AS trip_id
        FROM vehicle_trips t
        WHERE t.vehicle_id = ${vehicleId}
          AND t.trip_status::text = 'COMPLETED'
          AND t.end_time IS NOT NULL
        ORDER BY t.end_time DESC, t.id DESC
        LIMIT 1
        FOR UPDATE`;
      carrierTripId = pick[0]?.trip_id;
      if (!carrierTripId) return;
      await tx.$queryRaw`
        UPDATE vehicle_trips t
        SET raw_detection_meta = COALESCE(t.raw_detection_meta, '{}'::jsonb)
          || jsonb_build_object(${TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_CURSOR_CARRIER_KEY}, true)
        WHERE t.id = ${carrierTripId}`;
    }
    if (cursor == null) {
      await tx.$queryRaw`
        UPDATE vehicle_trips t
        SET raw_detection_meta = COALESCE(t.raw_detection_meta, '{}'::jsonb) - ${TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_SCAN_CURSOR_KEY}
        WHERE t.id = ${carrierTripId}`;
      return;
    }
    await tx.$queryRaw`
      UPDATE vehicle_trips t
      SET raw_detection_meta = COALESCE(t.raw_detection_meta, '{}'::jsonb)
        || jsonb_build_object(
          ${TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_SCAN_CURSOR_KEY},
          ${JSON.stringify(cursor)}::jsonb
        )
      WHERE t.id = ${carrierTripId}`;
  });
}
