import type { TripStatus } from '@prisma/client';
import {
  CORE_TRIP_READ_CONTRACT_VERSION,
  type CoreTripReadV1,
} from './core-trip-read.v1.types';

type CoreTripReadRow = {
  id: string;
  vehicleId: string;
  tripStatus: TripStatus;
  startTime: Date;
  endTime: Date | null;
  distanceKm: number | null;
};

export function toCoreTripReadV1(row: CoreTripReadRow): CoreTripReadV1 {
  return {
    version: CORE_TRIP_READ_CONTRACT_VERSION,
    tripId: row.id,
    vehicleId: row.vehicleId,
    tripStatus: row.tripStatus,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime ? row.endTime.toISOString() : null,
    distanceKm: row.distanceKm,
  };
}
