import { BookingStatus } from '@prisma/client';
import { CanonicalTripHydrationBatchLoader } from './trip-canonical-hydration.batch';
import { CANONICAL_HYDRATION_TRIP_ID_BATCH } from './trip-canonical-hydration.types';

function makePrisma() {
  return {
    tripDrivingImpact: { findMany: jest.fn() },
    driverAttribution: { findMany: jest.fn() },
  } as any;
}

function makeBookingOverlap() {
  return {
    findFirstOverlapForTrip: jest.fn(),
    findOverlapsForVehicleWindow: jest.fn(),
    loadDriverPoolsForBookings: jest.fn(),
  };
}

function makeTrips(count: number, vehicleId = 'veh-1') {
  return Array.from({ length: count }, (_, index) => ({
    id: `trip-${index + 1}`,
    vehicleId,
    startTime: new Date(`2026-03-0${(index % 9) + 1}T08:00:00Z`),
    endTime: new Date(`2026-03-0${(index % 9) + 1}T09:00:00Z`),
    driverName: null,
    assignmentStatus: null,
    assignmentSubjectType: null,
    assignmentSubjectId: null,
    assignedBookingId: null,
    bookingLinkSource: null,
    bookingCustomerId: null,
    assignedDriverId: null,
    actualDriverId: null,
    isPrivateTrip: false,
  }));
}

describe('CanonicalTripHydrationBatchLoader', () => {
  it('uses a bounded number of queries for large same-vehicle trip lists', async () => {
    const prisma = makePrisma();
    prisma.tripDrivingImpact.findMany.mockResolvedValue([]);
    const overlap = makeBookingOverlap();
    overlap.findOverlapsForVehicleWindow.mockResolvedValue([]);
    overlap.loadDriverPoolsForBookings.mockResolvedValue(new Map());
    prisma.driverAttribution.findMany.mockResolvedValue([]);

    const loader = new CanonicalTripHydrationBatchLoader(prisma, overlap as any);
    const trips = makeTrips(120, 'veh-1');
    const prefetch = await loader.prefetch('org-1', trips);

    const impactChunks = Math.ceil(trips.length / CANONICAL_HYDRATION_TRIP_ID_BATCH);
    const decisionChunks = Math.ceil(trips.length / CANONICAL_HYDRATION_TRIP_ID_BATCH);
    const expectedQueries = impactChunks + 1 + 0 + decisionChunks;

    expect(prefetch.queryCount).toBe(expectedQueries);
    expect(prisma.tripDrivingImpact.findMany).toHaveBeenCalledTimes(impactChunks);
    expect(overlap.findOverlapsForVehicleWindow).toHaveBeenCalledTimes(1);
    expect(prisma.driverAttribution.findMany).toHaveBeenCalledTimes(decisionChunks);
    expect(prefetch.bookingsByVehicle.get('veh-1')).toEqual([]);
  });

  it('batch-loads driver pools for assigned bookings in one query', async () => {
    const prisma = makePrisma();
    prisma.tripDrivingImpact.findMany.mockResolvedValue([]);
    prisma.driverAttribution.findMany.mockResolvedValue([]);
    const overlap = makeBookingOverlap();
    overlap.findOverlapsForVehicleWindow.mockResolvedValue([]);
    overlap.loadDriverPoolsForBookings.mockResolvedValue(
      new Map([
        [
          'book-1',
          { allowedDriverIds: ['driver-1', 'driver-2'], primaryDriverId: 'driver-1' },
        ],
      ]),
    );

    const loader = new CanonicalTripHydrationBatchLoader(prisma, overlap as any);
    const prefetch = await loader.prefetch('org-1', [
      {
        id: 'trip-1',
        vehicleId: 'veh-1',
        startTime: new Date('2026-03-01T08:00:00Z'),
        endTime: new Date('2026-03-01T09:00:00Z'),
        assignedBookingId: 'book-1',
        bookingLinkSource: 'EXPLICIT',
        bookingCustomerId: null,
        assignedDriverId: null,
        actualDriverId: null,
        assignmentStatus: null,
        assignmentSubjectType: null,
        assignmentSubjectId: null,
        isPrivateTrip: false,
      },
    ]);

    expect(overlap.loadDriverPoolsForBookings).toHaveBeenCalledWith({
      organizationId: 'org-1',
      bookingIds: ['book-1'],
    });
    expect(prefetch.driverPoolByBookingId.get('book-1')?.allowedDriverIds).toEqual(
      expect.arrayContaining(['driver-1', 'driver-2']),
    );
  });

  it('scopes booking overlap prefetch by organization and vehicle window', async () => {
    const prisma = makePrisma();
    prisma.tripDrivingImpact.findMany.mockResolvedValue([]);
    prisma.driverAttribution.findMany.mockResolvedValue([]);
    const overlap = makeBookingOverlap();
    overlap.findOverlapsForVehicleWindow.mockResolvedValue([]);
    overlap.loadDriverPoolsForBookings.mockResolvedValue(new Map());

    const loader = new CanonicalTripHydrationBatchLoader(prisma, overlap as any);
    await loader.prefetch('org-secure', makeTrips(2, 'veh-secure'));

    expect(overlap.findOverlapsForVehicleWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-secure',
        vehicleId: 'veh-secure',
      }),
    );
  });
});
