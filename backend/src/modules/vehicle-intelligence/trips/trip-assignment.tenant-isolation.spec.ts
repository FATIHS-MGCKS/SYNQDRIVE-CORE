import {
  TripAssignmentStatus,
  TripAssignmentSubjectType,
  TripBookingLinkSource,
} from '@prisma/client';
import { TripAssignmentService } from './trip-assignment.service';

function makeMocks() {
  const bookingOverlap = {
    findFirstOverlapForTrip: jest.fn(),
    findOverlapsForVehicleWindow: jest.fn(),
    loadDriverPoolsForBookings: jest.fn(),
  };
  const prisma = {
    vehicleTrip: { findUnique: jest.fn(), update: jest.fn() },
    vehicle: { findUnique: jest.fn() },
  } as any;
  return { prisma, bookingOverlap };
}

const overlapBooking = {
  id: 'booking-9',
  vehicleId: 'vehicle-1',
  customerId: 'customer-99',
  assignedDriverId: null,
  startDate: new Date('2026-03-01T07:00:00Z'),
  endDate: new Date('2026-03-01T10:00:00Z'),
  customer: { customerType: 'INDIVIDUAL' as const },
};

const baseTrip = {
  id: 'trip-3',
  vehicleId: 'vehicle-1',
  startTime: new Date('2026-03-01T08:00:00Z'),
  endTime: new Date('2026-03-01T09:00:00Z'),
  driverName: 'Driver Name',
  assignmentStatus: null,
  assignmentSubjectType: null,
  assignmentSubjectId: null,
  assignedBookingId: null,
  bookingLinkSource: null,
  bookingCustomerId: null,
  assignedDriverId: null,
  actualDriverId: null,
  isPrivateTrip: false,
};

describe('TripAssignmentService — tenant isolation', () => {
  it('selects overlapping booking when organization matches vehicle', async () => {
    const { prisma, bookingOverlap } = makeMocks();
    prisma.vehicle.findUnique.mockResolvedValue({ organizationId: 'org-a' });
    bookingOverlap.findFirstOverlapForTrip.mockResolvedValue(overlapBooking);
    const service = new TripAssignmentService(prisma, bookingOverlap as any);

    const result = await service.resolveForTrip(baseTrip as any);

    expect(bookingOverlap.findFirstOverlapForTrip).toHaveBeenCalledWith({
      organizationId: 'org-a',
      vehicleId: 'vehicle-1',
      tripStart: baseTrip.startTime,
      tripEnd: baseTrip.endTime,
    });
    expect(result.assignmentStatus).toBe(TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER);
    expect(result.bookingLinkSource).toBe(TripBookingLinkSource.TIME_WINDOW);
    expect(result.scoreEligible).toBe(false);
  });

  it('does not call overlap port when vehicle organization is missing (fail closed)', async () => {
    const { prisma, bookingOverlap } = makeMocks();
    prisma.vehicle.findUnique.mockResolvedValue(null);
    const service = new TripAssignmentService(prisma, bookingOverlap as any);

    const result = await service.resolveForTrip(baseTrip as any);

    expect(bookingOverlap.findFirstOverlapForTrip).not.toHaveBeenCalled();
    expect(result.assignmentStatus).toBe(TripAssignmentStatus.ASSIGNED_DRIVER);
  });

  it('does not call overlap port when vehicle has no organizationId', async () => {
    const { prisma, bookingOverlap } = makeMocks();
    prisma.vehicle.findUnique.mockResolvedValue({ organizationId: null });
    const service = new TripAssignmentService(prisma, bookingOverlap as any);

    await service.resolveForTrip(baseTrip as any);
    expect(bookingOverlap.findFirstOverlapForTrip).not.toHaveBeenCalled();
  });

  it('always resolves organization from Vehicle — public API cannot inject tenant', async () => {
    const { prisma, bookingOverlap } = makeMocks();
    prisma.vehicle.findUnique.mockResolvedValue({ organizationId: 'org-from-vehicle' });
    bookingOverlap.findFirstOverlapForTrip.mockResolvedValue(null);
    const service = new TripAssignmentService(prisma, bookingOverlap as any);

    await service.resolveForTrip(baseTrip as any);

    expect(prisma.vehicle.findUnique).toHaveBeenCalledWith({
      where: { id: 'vehicle-1' },
      select: { organizationId: true },
    });
    expect(bookingOverlap.findFirstOverlapForTrip).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-from-vehicle' }),
    );
  });

  it('uses trusted organizationId in port call (wrong org yields no auto-assignment)', async () => {
    const { prisma, bookingOverlap } = makeMocks();
    prisma.vehicle.findUnique.mockResolvedValue({ organizationId: 'org-a' });
    bookingOverlap.findFirstOverlapForTrip.mockResolvedValue(null);
    const service = new TripAssignmentService(prisma, bookingOverlap as any);

    await service.resolveForTrip(baseTrip as any);

    expect(bookingOverlap.findFirstOverlapForTrip).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-a', vehicleId: 'vehicle-1' }),
    );
  });

  it('preserves explicit persisted assignment when overlap lookup is skipped', async () => {
    const { prisma, bookingOverlap } = makeMocks();
    prisma.vehicle.findUnique.mockResolvedValue(null);
    const service = new TripAssignmentService(prisma, bookingOverlap as any);

    const result = await service.resolveForTrip({
      ...baseTrip,
      assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      assignmentSubjectType: TripAssignmentSubjectType.BOOKING_CUSTOMER,
      assignmentSubjectId: 'customer-explicit',
      assignedBookingId: 'booking-explicit',
      bookingLinkSource: TripBookingLinkSource.EXPLICIT,
      bookingCustomerId: 'customer-explicit',
    } as any);

    expect(bookingOverlap.findFirstOverlapForTrip).not.toHaveBeenCalled();
    expect(result.assignedBookingId).toBe('booking-explicit');
    expect(result.bookingLinkSource).toBe(TripBookingLinkSource.EXPLICIT);
    expect(result.scoreEligible).toBe(true);
  });

  it('falls back to PRIVATE_UNASSIGNED when no overlap and no driver (closed trip)', async () => {
    const { prisma, bookingOverlap } = makeMocks();
    prisma.vehicle.findUnique.mockResolvedValue({ organizationId: 'org-a' });
    bookingOverlap.findFirstOverlapForTrip.mockResolvedValue(null);
    const service = new TripAssignmentService(prisma, bookingOverlap as any);

    const result = await service.resolveForTrip({
      ...baseTrip,
      driverName: null,
    } as any);

    expect(result.assignmentStatus).toBe(TripAssignmentStatus.PRIVATE_UNASSIGNED);
    expect(result.isPrivateTrip).toBe(true);
    expect(result.scoreEligible).toBe(false);
  });
});
