import type { PrismaService } from '@shared/database/prisma.service';

export type Ds4RpmHfV1aCanonicalTrip = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  startTime: Date;
  endTime: Date;
};

export type Ds4RpmHfV1aTripIdentityFailure = {
  ok: false;
  reasonCode:
    | 'TRIP_NOT_FOUND'
    | 'TRIP_NOT_COMPLETED'
    | 'TRIP_END_TIME_MISSING'
    | 'TRIP_TIME_INVALID';
  reasonSummary: string;
};

export type Ds4RpmHfV1aTripIdentityResult =
  | { ok: true; trip: Ds4RpmHfV1aCanonicalTrip }
  | Ds4RpmHfV1aTripIdentityFailure;

/**
 * Canonical org/vehicle/trip chain from Postgres — caller-supplied times are not trusted.
 */
export async function resolveCanonicalTripForRpmHfV1a(
  prisma: PrismaService,
  input: { organizationId: string; vehicleId: string; tripId: string },
): Promise<Ds4RpmHfV1aTripIdentityResult> {
  const row = await prisma.vehicleTrip.findFirst({
    where: {
      id: input.tripId,
      vehicleId: input.vehicleId,
      vehicle: {
        id: input.vehicleId,
        organizationId: input.organizationId,
      },
    },
    select: {
      id: true,
      vehicleId: true,
      tripStatus: true,
      startTime: true,
      endTime: true,
      vehicle: { select: { organizationId: true } },
    },
  });

  if (!row) {
    return {
      ok: false,
      reasonCode: 'TRIP_NOT_FOUND',
      reasonSummary: 'Trip not found for organization and vehicle.',
    };
  }

  if (row.tripStatus !== 'COMPLETED') {
    return {
      ok: false,
      reasonCode: 'TRIP_NOT_COMPLETED',
      reasonSummary: 'Trip is not COMPLETED — RPM HF V1A requires a finished trip.',
    };
  }

  if (!row.endTime) {
    return {
      ok: false,
      reasonCode: 'TRIP_END_TIME_MISSING',
      reasonSummary: 'Completed trip lacks canonical end time.',
    };
  }

  const startMs = row.startTime.getTime();
  const endMs = row.endTime.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
    return {
      ok: false,
      reasonCode: 'TRIP_TIME_INVALID',
      reasonSummary: 'Trip start/end times are invalid.',
    };
  }

  return {
    ok: true,
    trip: {
      organizationId: row.vehicle.organizationId,
      vehicleId: row.vehicleId,
      tripId: row.id,
      startTime: row.startTime,
      endTime: row.endTime,
    },
  };
}
