import { TripStatus } from '@prisma/client';
import { toCoreTripReadV1 } from './core-trip-read.v1.mapper';
import { CORE_TRIP_READ_CONTRACT_VERSION } from './core-trip-read.v1.types';

describe('toCoreTripReadV1', () => {
  it('maps only allowlisted trip fields', () => {
    const start = new Date('2026-06-01T10:00:00.000Z');
    const end = new Date('2026-06-01T11:00:00.000Z');
    const dto = toCoreTripReadV1({
      id: 'trip-1',
      vehicleId: 'veh-1',
      tripStatus: TripStatus.COMPLETED,
      startTime: start,
      endTime: end,
      distanceKm: 12.5,
    });
    expect(dto).toEqual({
      version: CORE_TRIP_READ_CONTRACT_VERSION,
      tripId: 'trip-1',
      vehicleId: 'veh-1',
      tripStatus: TripStatus.COMPLETED,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      distanceKm: 12.5,
    });
    expect(dto).not.toHaveProperty('assignedBookingId');
    expect(dto).not.toHaveProperty('startLatitude');
  });

  it('allows null endTime and distanceKm', () => {
    const dto = toCoreTripReadV1({
      id: 'trip-2',
      vehicleId: 'veh-1',
      tripStatus: TripStatus.ONGOING,
      startTime: new Date('2026-06-02T08:00:00.000Z'),
      endTime: null,
      distanceKm: null,
    });
    expect(dto.endTime).toBeNull();
    expect(dto.distanceKm).toBeNull();
  });

  it('does not leak extra runtime properties', () => {
    const row = {
      id: 'trip-3',
      vehicleId: 'veh-1',
      tripStatus: TripStatus.COMPLETED,
      startTime: new Date('2026-06-03T08:00:00.000Z'),
      endTime: null,
      distanceKm: 1,
      assignedBookingId: 'booking-x',
      bookingCustomerId: 'cust-x',
      startLatitude: 52.5,
    } as Parameters<typeof toCoreTripReadV1>[0] & {
      assignedBookingId: string;
      bookingCustomerId: string;
      startLatitude: number;
    };
    const dto = toCoreTripReadV1(row);
    expect(dto).not.toHaveProperty('assignedBookingId');
    expect(dto).not.toHaveProperty('bookingCustomerId');
    expect(dto).not.toHaveProperty('startLatitude');
  });
});
