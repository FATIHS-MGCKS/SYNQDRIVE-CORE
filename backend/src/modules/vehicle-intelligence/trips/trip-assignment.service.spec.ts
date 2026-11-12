import {
  TripAssignmentStatus,
  TripAssignmentSubjectType,
} from '@prisma/client';
import { TripAssignmentService } from './trip-assignment.service';

function makeMockPrisma() {
  return {
    vehicleTrip: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
    },
  } as any;
}

function makeMockBookingOverlap() {
  return {
    findFirstOverlapForTrip: jest.fn(),
    findOverlapsForVehicleWindow: jest.fn(),
    loadDriverPoolsForBookings: jest.fn(),
  };
}

function makeMockMetrics() {
  return {
    tripAssignmentResolutions: {
      inc: jest.fn(),
    },
  } as any;
}

describe('TripAssignmentService', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let metrics: ReturnType<typeof makeMockMetrics>;
  let bookingOverlap: ReturnType<typeof makeMockBookingOverlap>;
  let service: TripAssignmentService;

  beforeEach(() => {
    prisma = makeMockPrisma();
    metrics = makeMockMetrics();
    bookingOverlap = makeMockBookingOverlap();
    bookingOverlap.findFirstOverlapForTrip.mockResolvedValue(null);
    prisma.vehicle.findUnique.mockResolvedValue({ organizationId: 'org-1' });
    service = new TripAssignmentService(prisma, bookingOverlap as any, metrics);
  });

  it('resolves explicit driver assignment when driverName exists', async () => {
    const result = await service.resolveForTrip({
      id: 'trip-1',
      vehicleId: 'vehicle-1',
      startTime: new Date('2026-03-01T08:00:00Z'),
      endTime: new Date('2026-03-01T09:00:00Z'),
      driverName: 'Max Mustermann',
      assignmentStatus: null,
      assignmentSubjectType: null,
      assignmentSubjectId: null,
      assignedBookingId: null,
      isPrivateTrip: false,
    } as any);

    expect(result.assignmentStatus).toBe(TripAssignmentStatus.ASSIGNED_DRIVER);
    expect(result.assignmentSubjectType).toBe(TripAssignmentSubjectType.DRIVER);
    expect(result.assignmentSubjectId).toBe('Max Mustermann');
    expect(result.scoreEligible).toBe(true);
    expect(metrics.tripAssignmentResolutions.inc).not.toHaveBeenCalled();
  });

  it('marks open trips without assignment as unknown', async () => {
    const result = await service.resolveForTrip({
      id: 'trip-2',
      vehicleId: 'vehicle-1',
      startTime: new Date('2026-03-01T08:00:00Z'),
      endTime: null,
      driverName: null,
      assignmentStatus: null,
      assignmentSubjectType: null,
      assignmentSubjectId: null,
      assignedBookingId: null,
      isPrivateTrip: false,
    } as any);

    expect(result.assignmentStatus).toBe(TripAssignmentStatus.UNKNOWN_ASSIGNMENT);
    expect(result.isPrivateTrip).toBe(false);
    expect(result.scoreEligible).toBe(false);
  });

  it('prefers overlapping booking customer assignment', async () => {
    bookingOverlap.findFirstOverlapForTrip.mockResolvedValue({
      id: 'booking-9',
      vehicleId: 'vehicle-1',
      customerId: 'customer-99',
      assignedDriverId: null,
      startDate: new Date('2026-03-01T07:00:00Z'),
      endDate: new Date('2026-03-01T10:00:00Z'),
      customer: { customerType: 'INDIVIDUAL' },
    });
    const result = await service.resolveForTrip({
      id: 'trip-3',
      vehicleId: 'vehicle-1',
      startTime: new Date('2026-03-01T08:00:00Z'),
      endTime: new Date('2026-03-01T09:00:00Z'),
      driverName: 'Driver Name',
      assignmentStatus: null,
      assignmentSubjectType: null,
      assignmentSubjectId: null,
      assignedBookingId: null,
      isPrivateTrip: false,
    } as any);

    expect(result.assignmentStatus).toBe(
      TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
    );
    expect(result.assignmentSubjectType).toBe(
      TripAssignmentSubjectType.BOOKING_CUSTOMER,
    );
    expect(result.assignmentSubjectId).toBe('customer-99');
    expect(result.bookingCustomerId).toBe('customer-99');
    expect(result.assignedDriverId).toBeNull();
    expect(result.assignedBookingId).toBe('booking-9');
    expect(result.bookingLinkSource).toBe('TIME_WINDOW');
    expect(result.scoreEligible).toBe(false);
  });

  it('records assignment-resolution metric when applying assignment', async () => {
    prisma.vehicleTrip.findUnique.mockResolvedValue({
      id: 'trip-4',
      vehicleId: 'vehicle-1',
      startTime: new Date('2026-03-01T08:00:00Z'),
      endTime: new Date('2026-03-01T09:00:00Z'),
      driverName: null,
      assignmentStatus: null,
      assignmentSubjectType: null,
      assignmentSubjectId: null,
      assignedBookingId: null,
      isPrivateTrip: false,
    });
    bookingOverlap.findFirstOverlapForTrip.mockResolvedValue({
      id: 'booking-11',
      vehicleId: 'vehicle-1',
      customerId: 'cust-11',
      assignedDriverId: null,
      startDate: new Date('2026-03-01T07:00:00Z'),
      endDate: new Date('2026-03-01T10:00:00Z'),
      customer: { customerType: 'INDIVIDUAL' },
    });
    prisma.vehicleTrip.update.mockResolvedValue({});
    prisma.vehicle.findUnique.mockResolvedValue({ organizationId: 'org-1' });

    await service.applyAssignmentToTrip('trip-4');

    expect(metrics.tripAssignmentResolutions.inc).toHaveBeenCalledWith({
      status: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      score_eligible: 'no',
    });
    expect(prisma.vehicleTrip.update).toHaveBeenCalled();
  });
});

