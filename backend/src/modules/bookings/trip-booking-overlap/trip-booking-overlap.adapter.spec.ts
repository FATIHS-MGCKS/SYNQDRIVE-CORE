import { BookingStatus } from '@prisma/client';
import { TripBookingOverlapPrismaAdapter } from './trip-booking-overlap.adapter';

describe('TripBookingOverlapPrismaAdapter', () => {
  const prisma = {
    booking: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
  let adapter: TripBookingOverlapPrismaAdapter;

  beforeEach(() => {
    jest.resetAllMocks();
    adapter = new TripBookingOverlapPrismaAdapter(prisma as any);
  });

  it('findFirstOverlapForTrip preserves ACTIVE/COMPLETED window semantics and desc startDate', async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    const tripStart = new Date('2026-03-01T08:00:00Z');
    const tripEnd = new Date('2026-03-01T09:00:00Z');
    await adapter.findFirstOverlapForTrip({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripStart,
      tripEnd,
    });

    expect(prisma.booking.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        status: { in: [BookingStatus.ACTIVE, BookingStatus.COMPLETED] },
        startDate: { lte: tripEnd },
        endDate: { gte: tripStart },
      },
      orderBy: { startDate: 'desc' },
      select: expect.any(Object),
    });
  });

  it('findOverlapsForVehicleWindow scopes by organization and vehicle', async () => {
    prisma.booking.findMany.mockResolvedValue([]);
    const windowStart = new Date('2026-03-01T08:00:00Z');
    const windowEnd = new Date('2026-03-01T18:00:00Z');
    await adapter.findOverlapsForVehicleWindow({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      windowStart,
      windowEnd,
    });

    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          status: { in: [BookingStatus.ACTIVE, BookingStatus.COMPLETED] },
          startDate: { lte: windowEnd },
          endDate: { gte: windowStart },
        }),
        orderBy: { startDate: 'desc' },
      }),
    );
  });

  it('scopes findFirst by organizationId (cross-tenant predicate)', async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    await adapter.findFirstOverlapForTrip({
      organizationId: 'org-b',
      vehicleId: 'veh-shared',
      tripStart: new Date('2026-03-01T08:00:00Z'),
      tripEnd: new Date('2026-03-01T09:00:00Z'),
    });
    expect(prisma.booking.findFirst.mock.calls[0][0].where.organizationId).toBe('org-b');
  });

  it('loadDriverPoolsForBookings skips query when no booking ids', async () => {
    const map = await adapter.loadDriverPoolsForBookings({
      organizationId: 'org-1',
      bookingIds: [],
    });
    expect(map.size).toBe(0);
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
  });
});
