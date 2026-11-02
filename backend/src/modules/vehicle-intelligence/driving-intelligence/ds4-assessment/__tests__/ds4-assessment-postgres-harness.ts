import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  buildTripDiBoundaryAdmissionPatch,
  buildTripDiBoundaryRevisionKey,
} from '../../../trips/di-boundary-admission/trip-di-boundary-admission';
import { DS4_ASSESSMENT_FLEET_VEHICLES_V1 } from '../ds4-assessment-fleet-admission.v1';

/** Same env gate as S4A disposable Postgres CI without importing s4a-foundation. */
export const DS4_POSTGRES_LIVE = process.env.DI_V0_S4A_POSTGRES_INTEGRATION === '1';

export type Ds4PostgresTenant = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  startTime: Date;
  endTime: Date;
  dimoSegmentId: string;
};

/** Integration tests: motion runs must be >= this cutoff to enter assessment discovery. */
export const DS4_ASSESSMENT_TEST_COLLECTION_CUTOFF = new Date('2026-01-01T00:00:00.000Z');

export async function seedDs4PostgresTenant(prisma: PrismaClient, ageSeconds = 3 * 86_400): Promise<Ds4PostgresTenant> {
  const suffix = randomUUID().slice(0, 8);
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const tripId = randomUUID();
  const dimoSegmentId = `seg-${randomUUID()}`;
  const now = Date.now();
  const startTime = new Date(Math.floor((now - ageSeconds * 1000) / 1000) * 1000);
  const endTime = new Date(startTime.getTime() + 20 * 60_000);
  await prisma.$executeRawUnsafe(
    `INSERT INTO organizations (id, company_name, business_type, status, created_at, updated_at)
     VALUES ($1, $2, 'RENTAL', 'ACTIVE', $3, $3)`,
    organizationId,
    `DS4-${suffix}`,
    new Date(now),
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO vehicles (id, organization_id, vin, license_plate, make, model, year, fuel_type, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'Test', 'DS4', 2024, 'GASOLINE', 'AVAILABLE', $5, $5)`,
    vehicleId,
    organizationId,
    `D4${suffix}`.padEnd(17, '0'),
    `DS4-${suffix}`,
    new Date(now),
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO vehicle_trips (id, vehicle_id, trip_status, start_time, end_time, dimo_segment_id, created_at,
       start_latitude, start_longitude, distance_km, max_speed_kmh, avg_speed_kmh, harsh_brake_count, driving_score)
     VALUES ($1, $2, 'COMPLETED', ($3::timestamptz AT TIME ZONE 'UTC'), ($4::timestamptz AT TIME ZONE 'UTC'), $5,
       ($4::timestamptz AT TIME ZONE 'UTC'), 52, 9, 12, 77, 45, 2, 88)`,
    tripId,
    vehicleId,
    startTime.toISOString(),
    endTime.toISOString(),
    dimoSegmentId,
  );
  const tenant: Ds4PostgresTenant = { organizationId, vehicleId, tripId, startTime, endTime, dimoSegmentId };
  await seedDs4TripDiBoundaryAdmission(prisma, tenant);
  return tenant;
}

export async function seedDs4TripDiBoundaryAdmission(prisma: PrismaClient, tenant: Ds4PostgresTenant): Promise<void> {
  const now = new Date();
  await prisma.$executeRawUnsafe(
    `INSERT INTO vehicle_trip_detection_states (id, organization_id, vehicle_id, state, active_trip_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'RESTING', NULL, $4, $4)
     ON CONFLICT (vehicle_id) DO UPDATE SET state = 'RESTING', active_trip_id = NULL, updated_at = $4`,
    randomUUID(),
    tenant.organizationId,
    tenant.vehicleId,
    now,
  );
  const tripRows = await prisma.$queryRaw<
    Array<{
      start_time: Date;
      end_time: Date | null;
      dimo_segment_id: string | null;
      merge_parent_trip_id: string | null;
      raw_detection_meta: unknown;
    }>
  >`
    SELECT start_time AT TIME ZONE 'UTC' AS start_time,
           end_time AT TIME ZONE 'UTC' AS end_time,
           dimo_segment_id, merge_parent_trip_id, raw_detection_meta
    FROM vehicle_trips WHERE id = ${tenant.tripId}`;
  const tripRow = tripRows[0];
  if (!tripRow?.end_time) return;
  const revisionKey = buildTripDiBoundaryRevisionKey({
    organizationId: tenant.organizationId,
    vehicleId: tenant.vehicleId,
    tripId: tenant.tripId,
    tripStatus: 'COMPLETED',
    startTime: tripRow.start_time,
    endTime: tripRow.end_time,
    dimoSegmentId: tripRow.dimo_segment_id ?? tenant.dimoSegmentId,
    mergeParentTripId: tripRow.merge_parent_trip_id,
    rawDetectionMeta: tripRow.raw_detection_meta,
  });
  const patch = buildTripDiBoundaryAdmissionPatch(revisionKey, 'RECONCILIATION', now);
  await prisma.$executeRawUnsafe(
    `UPDATE vehicle_trips
     SET raw_detection_meta = COALESCE(raw_detection_meta, '{}'::jsonb) || $1::jsonb
     WHERE id = $2`,
    JSON.stringify(patch),
    tenant.tripId,
  );
}

export async function bindDs4TenantToFleetVehicle(
  prisma: PrismaClient,
  tenant: Ds4PostgresTenant,
  fleet: (typeof DS4_ASSESSMENT_FLEET_VEHICLES_V1)[number],
): Promise<Ds4PostgresTenant> {
  const vinSuffix = fleet.vehicleId.replace(/-/g, '').slice(0, 13);
  const vin = `DS4${vinSuffix}`.padEnd(17, '0');
  await prisma.$executeRaw`
    INSERT INTO organizations (id, company_name, business_type, status, created_at, updated_at)
    VALUES (${fleet.organizationId}, 'DS4 Fleet Org', 'RENTAL', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING`;
  await prisma.$executeRaw`
    INSERT INTO vehicles (id, organization_id, vin, license_plate, make, model, year, fuel_type, status, created_at, updated_at)
    VALUES (
      ${fleet.vehicleId}, ${fleet.organizationId}, ${vin}, ${`DS4-${fleet.role}`}, 'Test', 'DS4', 2024, 'GASOLINE', 'AVAILABLE', NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id`;
  await prisma.$executeRaw`UPDATE vehicle_trips SET vehicle_id = ${fleet.vehicleId} WHERE id = ${tenant.tripId}`;
  tenant.vehicleId = fleet.vehicleId;
  tenant.organizationId = fleet.organizationId;
  await seedDs4TripDiBoundaryAdmission(prisma, tenant);
  return tenant;
}

export type Ds4PinnedEvidenceStub = {
  snapshotHash: string;
  combinedInputIdentity: string;
};

export function ds4PinnedEvidenceStub(label: string): Ds4PinnedEvidenceStub {
  return {
    snapshotHash: `ds4-pin-${label}`,
    combinedInputIdentity: `ds4-ident-${label}`,
  };
}
