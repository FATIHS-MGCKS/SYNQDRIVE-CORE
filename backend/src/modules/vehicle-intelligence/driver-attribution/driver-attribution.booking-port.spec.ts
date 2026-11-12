import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CustomerType, HandoverKind, TripAssignmentStatus } from '@prisma/client';
import { DriverAttributionService } from './driver-attribution.service';
import type { TripBookingOverlapPort } from '../trips/ports/trip-booking-overlap.port';
import { BOOKING_PICKUP_HANDOVER_WINDOW_MS } from '../trips/ports/trip-booking-overlap.port';

function makeOverlapPort(
  overrides: Partial<TripBookingOverlapPort> = {},
): TripBookingOverlapPort {
  return {
    findFirstOverlapForTrip: jest.fn().mockResolvedValue(null),
    findOverlapsForVehicleWindow: jest.fn().mockResolvedValue([]),
    loadDriverPoolsForBookings: jest.fn().mockResolvedValue(new Map()),
    loadDriverPoolForBooking: jest.fn().mockResolvedValue({
      allowedDriverIds: [],
      primaryDriverId: null,
    }),
    loadBookingAttributionContext: jest.fn().mockResolvedValue(null),
    findPickupHandoverProofForTrip: jest.fn().mockResolvedValue(null),
    resolveBookingVehicleForOrganization: jest.fn().mockResolvedValue({ vehicleId: null }),
    ...overrides,
  };
}

function baseTrip(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trip-1',
    vehicleId: 'veh-1',
    startTime: new Date('2026-04-01T12:00:00Z'),
    endTime: new Date('2026-04-01T13:00:00Z'),
    isPrivateTrip: false,
    assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
    assignmentSubjectType: 'BOOKING_CUSTOMER',
    assignmentSubjectId: 'cust-trip',
    assignedBookingId: 'book-1',
    bookingLinkSource: 'EXPLICIT' as const,
    bookingCustomerId: 'cust-trip',
    assignedDriverId: 'drv-trip',
    actualDriverId: null,
    ...overrides,
  };
}

describe('DriverAttributionService — booking port decoupling', () => {
  it('uses trip-field fallback when assigned booking context is missing', async () => {
    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue(baseTrip()),
      },
    };
    const tripAttribution = {
      resolveAttributionForTrip: jest.fn().mockResolvedValue({
        scope: 'BOOKING_ASSIGNED',
        confidence: 'HIGH',
        reason: 'EXPLICIT',
      }),
    };
    const bookingOverlap = makeOverlapPort({
      loadBookingAttributionContext: jest.fn().mockResolvedValue(null),
    });
    const service = new DriverAttributionService(
      prisma as any,
      { findByTrip: jest.fn() } as any,
      tripAttribution as any,
      { enqueue: jest.fn() } as any,
      bookingOverlap,
    );

    await service.evaluateTripAttribution({ organizationId: 'org-1', tripId: 'trip-1' });

    expect(bookingOverlap.loadBookingAttributionContext).toHaveBeenCalledWith({
      organizationId: 'org-1',
      bookingId: 'book-1',
    });
    expect(tripAttribution.resolveAttributionForTrip).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        bookingCustomerId: 'cust-trip',
        assignedDriverId: 'drv-trip',
      }),
    );
  });

  it('prefers live booking context over trip snapshot fields', async () => {
    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue(baseTrip()),
      },
    };
    const tripAttribution = {
      resolveAttributionForTrip: jest.fn().mockResolvedValue({
        scope: 'BOOKING_ASSIGNED',
        confidence: 'HIGH',
        reason: 'EXPLICIT',
      }),
    };
    const bookingOverlap = makeOverlapPort({
      loadBookingAttributionContext: jest.fn().mockResolvedValue({
        customerId: 'cust-live',
        assignedDriverId: 'drv-live',
        customerType: CustomerType.CORPORATE,
      }),
    });
    const service = new DriverAttributionService(
      prisma as any,
      { findByTrip: jest.fn() } as any,
      tripAttribution as any,
      { enqueue: jest.fn() } as any,
      bookingOverlap,
    );

    await service.evaluateTripAttribution({ organizationId: 'org-1', tripId: 'trip-1' });

    expect(tripAttribution.resolveAttributionForTrip).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        bookingCustomerId: 'cust-live',
        assignedDriverId: 'drv-live',
      }),
    );
  });

  it('rejects manual correction when driver not in pool', async () => {
    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'trip-1',
          assignedBookingId: 'book-1',
        }),
      },
    };
    const bookingOverlap = makeOverlapPort({
      loadDriverPoolForBooking: jest.fn().mockResolvedValue({
        allowedDriverIds: ['drv-allowed'],
        primaryDriverId: 'drv-allowed',
      }),
    });
    const service = new DriverAttributionService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      bookingOverlap,
    );

    await expect(
      service.correctAttribution({
        organizationId: 'org-1',
        tripId: 'trip-1',
        driverId: 'drv-blocked',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows any driver when pool is empty (legacy permissive policy)', async () => {
    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'trip-1',
          assignedBookingId: 'book-1',
          vehicle: { organizationId: 'org-1' },
        }),
        update: jest.fn(),
      },
    };
    const bookingOverlap = makeOverlapPort({
      loadDriverPoolForBooking: jest.fn().mockResolvedValue({
        allowedDriverIds: [],
        primaryDriverId: null,
      }),
    });
    const service = new DriverAttributionService(
      prisma as any,
      {
        findByTrip: jest.fn().mockResolvedValue([]),
        upsertSnapshot: jest.fn().mockResolvedValue({ id: 'snap-1' }),
      } as any,
      {
        resolveAttributionForTrip: jest.fn().mockResolvedValue({
          scope: 'BOOKING_ASSIGNED',
          confidence: 'HIGH',
          reason: 'EXPLICIT',
          bookingId: 'book-1',
          customerId: 'c1',
          driverId: 'drv-any',
          attributionType: 'CUSTOMER_DRIVER',
          source: 'PIPELINE',
          resolverVersion: 'v1',
          reasons: [],
          conflicts: [],
          customerEligibility: 'ELIGIBLE',
          driverEligibility: 'ELIGIBLE',
          bookingCustomerId: 'c1',
          assignedDriverId: 'drv-any',
          actualDriverId: null,
        }),
      } as any,
      { enqueue: jest.fn() } as any,
      bookingOverlap,
    );

    jest.spyOn(service, 'resolveAndPersistTripAttribution').mockResolvedValue({
      row: {} as any,
      resolved: {} as any,
      changed: false,
    });

    await expect(
      service.correctAttribution({
        organizationId: 'org-1',
        tripId: 'trip-1',
        driverId: 'drv-any',
        userId: 'user-1',
      }),
    ).resolves.toBeDefined();
  });

  it('propagates NotFoundException from loadDriverPoolForBooking on foreign booking', async () => {
    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'trip-1',
          assignedBookingId: 'book-foreign',
        }),
      },
    };
    const bookingOverlap = makeOverlapPort({
      loadDriverPoolForBooking: jest
        .fn()
        .mockRejectedValue(new NotFoundException('Booking not found for organization')),
    });
    const service = new DriverAttributionService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      bookingOverlap,
    );

    await expect(
      service.correctAttribution({
        organizationId: 'org-1',
        tripId: 'trip-1',
        driverId: 'drv-1',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('delegates PICKUP handover lookup to port with trip window', async () => {
    const tripStart = new Date('2026-04-01T12:00:00Z');
    const tripEnd = new Date('2026-04-01T13:00:00Z');
    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue(baseTrip({ startTime: tripStart, endTime: tripEnd })),
      },
    };
    const tripAttribution = {
      resolveAttributionForTrip: jest.fn().mockResolvedValue({
        scope: 'BOOKING_ASSIGNED',
        confidence: 'HIGH',
        reason: 'EXPLICIT',
      }),
    };
    const handover = {
      protocolId: 'proto-1',
      bookingId: 'book-1',
      kind: HandoverKind.PICKUP,
      performedAt: new Date('2026-04-01T11:30:00Z'),
      customerSignatureName: 'Alice',
      staffSignatureName: null,
    };
    const bookingOverlap = makeOverlapPort({
      findPickupHandoverProofForTrip: jest.fn().mockResolvedValue(handover),
    });
    const service = new DriverAttributionService(
      prisma as any,
      { findByTrip: jest.fn() } as any,
      tripAttribution as any,
      { enqueue: jest.fn() } as any,
      bookingOverlap,
    );

    await service.evaluateTripAttribution({ organizationId: 'org-1', tripId: 'trip-1' });

    expect(bookingOverlap.findPickupHandoverProofForTrip).toHaveBeenCalledWith({
      organizationId: 'org-1',
      bookingId: 'book-1',
      tripStart,
      tripEnd,
    });
  });

  it('exposes handover window constant aligned with adapter', () => {
    expect(BOOKING_PICKUP_HANDOVER_WINDOW_MS).toBe(6 * 60 * 60 * 1000);
  });
});
