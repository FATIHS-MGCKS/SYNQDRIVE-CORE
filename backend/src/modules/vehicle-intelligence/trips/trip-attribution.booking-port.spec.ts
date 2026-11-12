import { NotFoundException } from '@nestjs/common';
import { TripAssignmentStatus } from '@prisma/client';
import { TripAttributionService } from './trip-attribution.service';
import type { TripBookingOverlapPort } from './ports/trip-booking-overlap.port';

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

describe('TripAttributionService — booking port decoupling', () => {
  it('scopes overlap lookup by organization and vehicle via port', async () => {
    const port = makeOverlapPort();
    const service = new TripAttributionService(port);
    const tripStart = new Date('2026-06-01T10:00:00Z');
    const tripEnd = new Date('2026-06-01T11:00:00Z');

    await service.findBookingOverlap('org-1', {
      vehicleId: 'veh-1',
      startTime: tripStart,
      endTime: tripEnd,
    });

    expect(port.findFirstOverlapForTrip).toHaveBeenCalledWith({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripStart,
      tripEnd,
      bookingId: undefined,
    });
  });

  it('applies assignedBookingId filter before first overlap row (no post-filter only)', async () => {
    const port = makeOverlapPort({
      findFirstOverlapForTrip: jest.fn().mockResolvedValue({
        id: 'book-assigned',
        vehicleId: 'veh-1',
        customerId: 'cust-1',
        assignedDriverId: null,
        startDate: new Date('2026-06-01T09:00:00Z'),
        endDate: new Date('2026-06-01T12:00:00Z'),
        customer: { customerType: 'INDIVIDUAL' },
      }),
    });
    const service = new TripAttributionService(port);

    await service.findBookingOverlap('org-1', {
      vehicleId: 'veh-1',
      startTime: new Date('2026-06-01T10:00:00Z'),
      endTime: new Date('2026-06-01T11:00:00Z'),
      assignedBookingId: 'book-assigned',
    });

    expect(port.findFirstOverlapForTrip).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'book-assigned' }),
    );
  });

  it('explicit booking skips overlap lookup in resolveAttributionForTrip', async () => {
    const port = makeOverlapPort();
    const service = new TripAttributionService(port);

    await service.resolveAttributionForTrip('org-1', {
      isPrivateTrip: false,
      assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      assignedBookingId: 'book-1',
      assignmentSubjectId: 'cust-1',
      assignmentSubjectType: 'BOOKING_CUSTOMER',
      bookingLinkSource: 'EXPLICIT',
      bookingCustomerId: 'cust-1',
      vehicleId: 'veh-1',
      startTime: new Date('2026-06-01T10:00:00Z'),
      endTime: new Date('2026-06-01T11:00:00Z'),
    });

    expect(port.findFirstOverlapForTrip).not.toHaveBeenCalled();
    expect(port.loadDriverPoolForBooking).toHaveBeenCalledWith({
      organizationId: 'org-1',
      bookingId: 'book-1',
    });
  });

  it('missing booking for driver pool propagates NotFoundException', async () => {
    const port = makeOverlapPort({
      loadDriverPoolForBooking: jest.fn().mockRejectedValue(
        new NotFoundException('Booking not found for organization'),
      ),
    });
    const service = new TripAttributionService(port);

    await expect(
      service.resolveAttributionForTrip('org-1', {
        isPrivateTrip: false,
        assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
        assignedBookingId: 'missing',
        assignmentSubjectId: 'cust-1',
        assignmentSubjectType: 'BOOKING_CUSTOMER',
        bookingLinkSource: 'EXPLICIT',
        vehicleId: 'veh-1',
        startTime: new Date(),
        endTime: new Date(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('TIME_WINDOW assigned trip keeps hint-only semantics and no customer charging', async () => {
    const port = makeOverlapPort();
    const service = new TripAttributionService(port);

    const attribution = service.resolveAttribution({
      isPrivateTrip: false,
      assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      assignedBookingId: 'book-2',
      assignmentSubjectId: 'cust-2',
      bookingLinkSource: 'TIME_WINDOW',
    });

    expect(attribution.scope).toBe('BOOKING_TIME_WINDOW_MATCH');
    expect(attribution.customerChargeable).toBe(false);
    expect(attribution.customerDecisionEligible).toBe(false);
  });

  it('returns unassigned when assigned booking id does not overlap (port returns null)', async () => {
    const port = makeOverlapPort({
      findFirstOverlapForTrip: jest.fn().mockResolvedValue(null),
    });
    const service = new TripAttributionService(port);

    const attribution = await service.resolveAttributionForTrip('org-1', {
      isPrivateTrip: false,
      assignmentStatus: TripAssignmentStatus.UNKNOWN_ASSIGNMENT,
      assignedBookingId: 'book-wrong',
      assignmentSubjectId: null,
      assignmentSubjectType: null,
      bookingLinkSource: 'TIME_WINDOW',
      vehicleId: 'veh-1',
      startTime: new Date('2026-06-01T10:00:00Z'),
      endTime: new Date('2026-06-01T11:00:00Z'),
    });

    expect(port.findFirstOverlapForTrip).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'book-wrong', organizationId: 'org-1' }),
    );
    expect(attribution.scope).toBe('BOOKING_TIME_WINDOW_MATCH');
    expect(attribution.confidence).toBe('MEDIUM');
  });

  it('overlap path uses port-returned booking for attribution mapping', async () => {
    const port = makeOverlapPort({
      findFirstOverlapForTrip: jest.fn().mockResolvedValue({
        id: 'book-3',
        vehicleId: 'veh-1',
        customerId: 'cust-3',
        assignedDriverId: 'drv-1',
        startDate: new Date('2026-06-01T09:00:00Z'),
        endDate: new Date('2026-06-01T12:00:00Z'),
        customer: { customerType: 'INDIVIDUAL' },
      }),
    });
    const service = new TripAttributionService(port);

    const attribution = await service.resolveAttributionForTrip('org-1', {
      isPrivateTrip: false,
      assignmentStatus: TripAssignmentStatus.UNKNOWN_ASSIGNMENT,
      assignedBookingId: null,
      assignmentSubjectId: null,
      assignmentSubjectType: null,
      bookingLinkSource: null,
      vehicleId: 'veh-1',
      startTime: new Date('2026-06-01T10:00:00Z'),
      endTime: new Date('2026-06-01T11:00:00Z'),
    });

    expect(attribution.scope).toBe('BOOKING_TIME_WINDOW_MATCH');
    expect(attribution.bookingId).toBe('book-3');
    expect(attribution.customerChargeable).toBe(false);
  });
});
