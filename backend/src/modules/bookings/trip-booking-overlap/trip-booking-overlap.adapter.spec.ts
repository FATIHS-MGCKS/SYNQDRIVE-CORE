import { BookingStatus, HandoverKind } from '@prisma/client';
import { BOOKING_PICKUP_HANDOVER_WINDOW_MS } from '@modules/vehicle-intelligence/trips/ports/trip-booking-overlap.port';
import { TripBookingOverlapPrismaAdapter } from './trip-booking-overlap.adapter';

describe('TripBookingOverlapPrismaAdapter', () => {
  const prisma = {
    booking: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    bookingHandoverProtocol: {
      findFirst: jest.fn(),
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

  it('findFirstOverlapForTrip applies optional bookingId before selecting first row', async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    await adapter.findFirstOverlapForTrip({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripStart: new Date('2026-03-01T08:00:00Z'),
      tripEnd: new Date('2026-03-01T09:00:00Z'),
      bookingId: 'book-filter',
    });
    expect(prisma.booking.findFirst.mock.calls[0][0].where.id).toBe('book-filter');
  });

  it('loadDriverPoolForBooking throws NotFoundException for foreign or missing booking', async () => {
    prisma.booking.findFirst = jest.fn().mockResolvedValue(null);
    await expect(
      adapter.loadDriverPoolForBooking({ organizationId: 'org-1', bookingId: 'missing' }),
    ).rejects.toThrow('Booking not found for organization');
  });

  it('loadDriverPoolsForBookings skips query when no booking ids', async () => {
    const map = await adapter.loadDriverPoolsForBookings({
      organizationId: 'org-1',
      bookingIds: [],
    });
    expect(map.size).toBe(0);
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
  });

  it('loadBookingAttributionContext returns null for missing booking', async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    const ctx = await adapter.loadBookingAttributionContext({
      organizationId: 'org-1',
      bookingId: 'missing',
    });
    expect(ctx).toBeNull();
    expect(prisma.booking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'missing', organizationId: 'org-1' },
      }),
    );
  });

  it('findPickupHandoverProofForTrip queries PICKUP window with signatures', async () => {
    prisma.bookingHandoverProtocol.findFirst.mockResolvedValue(null);
    const tripStart = new Date('2026-05-01T10:00:00Z');
    const tripEnd = new Date('2026-05-01T11:00:00Z');
    await adapter.findPickupHandoverProofForTrip({
      organizationId: 'org-1',
      bookingId: 'book-1',
      tripStart,
      tripEnd,
    });
    const windowStart = new Date(tripStart.getTime() - BOOKING_PICKUP_HANDOVER_WINDOW_MS);
    const windowEnd = new Date(tripEnd.getTime() + BOOKING_PICKUP_HANDOVER_WINDOW_MS);
    expect(prisma.bookingHandoverProtocol.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        bookingId: 'book-1',
        kind: HandoverKind.PICKUP,
        performedAt: { gte: windowStart, lte: windowEnd },
        OR: [
          { customerSignatureName: { not: null } },
          { staffSignatureName: { not: null } },
        ],
      },
      orderBy: { performedAt: 'desc' },
      select: expect.any(Object),
    });
  });

  it('resolveBookingVehicleForOrganization returns vehicleId and throws for missing booking', async () => {
    prisma.booking.findFirst.mockResolvedValue({ id: 'book-1', vehicleId: null });
    const result = await adapter.resolveBookingVehicleForOrganization({
      organizationId: 'org-1',
      bookingId: 'book-1',
    });
    expect(result).toEqual({ vehicleId: null });

    prisma.booking.findFirst.mockResolvedValue(null);
    await expect(
      adapter.resolveBookingVehicleForOrganization({
        organizationId: 'org-1',
        bookingId: 'missing',
      }),
    ).rejects.toThrow('Booking not found for organization');
  });
});
