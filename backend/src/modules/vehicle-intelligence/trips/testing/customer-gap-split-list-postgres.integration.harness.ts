import { randomUUID } from 'crypto';
import { PrismaClient, TripStatus } from '@prisma/client';
import {
  listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList,
} from '../trip-customer-list-reconciled-gap-split-suffix.util';
import { LIVE_FSM_SPLIT_TRIGGER } from '../di-boundary-admission/trip-di-boundary-admission-live-fsm-split.util';

export type CustomerGapSplitPostgresFixture = {
  suffix: string;
  orgId: string;
  vehicleId: string;
  canonicalTripId: string;
  absorbedSuffixId: string;
  independentCancelledId: string;
  ambiguousParentId: string;
  malformedAnchorSuffixId: string;
  dayFrom: Date;
  dayTo: Date;
};

const SPLIT_SECOND_START = new Date('2026-10-31T19:16:54.841Z');

export async function probeCustomerGapSplitPostgresDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createCustomerGapSplitPostgresFixture(
  prisma: PrismaClient,
): Promise<CustomerGapSplitPostgresFixture> {
  const suffix = uniqueSuffix();
  const org = await prisma.organization.create({
    data: {
      companyName: `Gap split customer list PG ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `TIG-${suffix}`.slice(0, 12),
      make: 'VW',
      model: 'Tiguan',
      year: 2024,
      fuelType: 'GASOLINE',
      status: 'AVAILABLE',
    },
    select: { id: true },
  });

  const canonicalTripId = randomUUID();
  const absorbedSuffixId = randomUUID();
  const independentCancelledId = randomUUID();
  const ambiguousParentId = randomUUID();
  const malformedAnchorSuffixId = randomUUID();

  const parentMeta = {
    splitReason: 'live_mid_trip_gap_split',
    splitTriggeredBy: LIVE_FSM_SPLIT_TRIGGER,
    splitGapMs: 340229,
    splitSecondStartAt: SPLIT_SECOND_START.toISOString(),
    boundaryRepair: {
      repairType: 'PARTIAL_TRIP_BOUNDARY_EXTENSION',
      newEndTime: '2026-10-31T19:18:00.000Z',
    },
  };

  await prisma.vehicleTrip.createMany({
    data: [
      {
        id: canonicalTripId,
        vehicleId: vehicle.id,
        tripStatus: TripStatus.COMPLETED,
        startTime: new Date('2026-10-31T18:59:00.000Z'),
        endTime: new Date('2026-10-31T19:18:00.000Z'),
        endDetectionMode: 'MID_TRIP_GAP_SPLIT',
        distanceKm: 5,
        isRepaired: true,
        startLatitude: 52,
        startLongitude: 9,
        rawDetectionMeta: parentMeta,
      },
      {
        id: absorbedSuffixId,
        vehicleId: vehicle.id,
        tripStatus: TripStatus.CANCELLED,
        startTime: SPLIT_SECOND_START,
        endTime: new Date('2026-10-31T19:18:15.281Z'),
        startDetectionMode: 'MID_TRIP_GAP_SPLIT',
        rawDetectionMeta: { discardReason: 'too_short_no_distance' },
      },
      {
        id: independentCancelledId,
        vehicleId: vehicle.id,
        tripStatus: TripStatus.CANCELLED,
        startTime: new Date('2026-10-31T20:30:00.000Z'),
        endTime: new Date('2026-10-31T20:31:00.000Z'),
        rawDetectionMeta: { discardReason: 'too_short_no_distance' },
      },
      {
        id: ambiguousParentId,
        vehicleId: vehicle.id,
        tripStatus: TripStatus.COMPLETED,
        startTime: new Date('2026-10-31T10:00:00.000Z'),
        endTime: new Date('2026-10-31T10:20:00.000Z'),
        endDetectionMode: 'MID_TRIP_GAP_SPLIT',
        isRepaired: true,
        distanceKm: 2,
        startLatitude: 52,
        startLongitude: 9,
        rawDetectionMeta: {
          splitTriggeredBy: LIVE_FSM_SPLIT_TRIGGER,
          splitSecondStartAt: SPLIT_SECOND_START.toISOString(),
        },
      },
      {
        id: malformedAnchorSuffixId,
        vehicleId: vehicle.id,
        tripStatus: TripStatus.CANCELLED,
        startTime: new Date('2026-10-31T21:00:00.000Z'),
        endTime: new Date('2026-10-31T21:01:00.000Z'),
        rawDetectionMeta: { discardReason: 'too_short_no_distance' },
      },
    ],
  });

  await prisma.vehicleTrip.create({
    data: {
      id: randomUUID(),
      vehicleId: vehicle.id,
      tripStatus: TripStatus.COMPLETED,
      startTime: new Date('2026-10-31T22:00:00.000Z'),
      endTime: new Date('2026-10-31T22:30:00.000Z'),
      endDetectionMode: 'MID_TRIP_GAP_SPLIT',
      distanceKm: 8,
      startLatitude: 52,
      startLongitude: 9,
      rawDetectionMeta: {
        splitTriggeredBy: LIVE_FSM_SPLIT_TRIGGER,
        splitSecondStartAt: 'not-a-valid-timestamp',
        boundaryRepair: { repairType: 'PARTIAL_TRIP_BOUNDARY_EXTENSION' },
      },
    },
  });

  await prisma.vehicleTrip.update({
    where: { id: malformedAnchorSuffixId },
    data: {
      rawDetectionMeta: {
        discardReason: 'too_short_no_distance',
        splitFrom: randomUUID(),
      },
    },
  });

  const dayFrom = new Date('2026-10-31T00:00:00.000Z');
  const dayTo = new Date('2026-10-31T23:59:59.999Z');

  return {
    suffix,
    orgId: org.id,
    vehicleId: vehicle.id,
    canonicalTripId,
    absorbedSuffixId,
    independentCancelledId,
    ambiguousParentId,
    malformedAnchorSuffixId,
    dayFrom,
    dayTo,
  };
}

export async function cleanupCustomerGapSplitPostgresFixture(
  prisma: PrismaClient,
  fixture: CustomerGapSplitPostgresFixture,
): Promise<void> {
  await prisma.tripDrivingImpact.deleteMany({ where: { vehicleId: fixture.vehicleId } });
  await prisma.vehicleTrip.deleteMany({ where: { vehicleId: fixture.vehicleId } });
  await prisma.vehicle.delete({ where: { id: fixture.vehicleId } }).catch(() => undefined);
  await prisma.organization.delete({ where: { id: fixture.orgId } }).catch(() => undefined);
}

export async function countCustomerVisibleTripsForVehicleDay(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
  from: Date,
  to: Date,
): Promise<number> {
  const hidden = await listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList(prisma, vehicleId, {
    from,
    to,
  });
  return prisma.vehicleTrip.count({
    where: {
      vehicleId,
      vehicle: { organizationId },
      startTime: { gte: from, lte: to },
      ...(hidden.length > 0 ? { id: { notIn: hidden } } : {}),
    },
  });
}

export async function countAllTripsForVehicleDay(
  prisma: PrismaClient,
  vehicleId: string,
  from: Date,
  to: Date,
): Promise<number> {
  return prisma.vehicleTrip.count({
    where: {
      vehicleId,
      startTime: { gte: from, lte: to },
    },
  });
}
