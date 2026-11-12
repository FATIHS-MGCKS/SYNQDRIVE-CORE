import { NotFoundException } from '@nestjs/common';
import { DrivingIntelligenceJobRepository } from './driving-intelligence-jobs.repository';
import type { TripBookingOverlapPort } from '../trips/ports/trip-booking-overlap.port';
import type { PersistDrivingIntelligenceJobInput } from './driving-intelligence-jobs.types';

function makeOverlapPort(
  overrides: Partial<TripBookingOverlapPort> = {},
): TripBookingOverlapPort {
  return {
    findFirstOverlapForTrip: jest.fn(),
    findOverlapsForVehicleWindow: jest.fn(),
    loadDriverPoolsForBookings: jest.fn(),
    loadDriverPoolForBooking: jest.fn(),
    loadBookingAttributionContext: jest.fn(),
    findPickupHandoverProofForTrip: jest.fn(),
    resolveBookingVehicleForOrganization: jest
      .fn()
      .mockResolvedValue({ vehicleId: 'vehicle-1' }),
    ...overrides,
  };
}

function makePrisma() {
  return {
    vehicle: { findFirst: jest.fn() },
    vehicleTrip: { findFirst: jest.fn() },
    drivingAnalysisRun: { findFirst: jest.fn() },
    drivingIntelligenceJob: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    booking: { findFirst: jest.fn() },
  } as any;
}

function persistInput(
  overrides: Partial<PersistDrivingIntelligenceJobInput> = {},
): PersistDrivingIntelligenceJobInput {
  return {
    organizationId: 'org-1',
    vehicleId: 'vehicle-1',
    tripId: 'trip-1',
    bookingId: 'book-1',
    analysisRunId: 'run-1',
    jobType: 'DRIVING_ROUTE_ENRICH',
    modelVersion: 'di-v1',
    idempotencyKey: 'idem-1',
    correlationId: 'corr-1',
    requestedAt: new Date('2026-07-16T10:00:00.000Z'),
    ...overrides,
  };
}

describe('DrivingIntelligenceJobRepository — booking port validation', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let bookingOverlap: TripBookingOverlapPort;
  let repository: DrivingIntelligenceJobRepository;

  beforeEach(() => {
    prisma = makePrisma();
    bookingOverlap = makeOverlapPort();
    repository = new DrivingIntelligenceJobRepository(prisma, bookingOverlap);
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'vehicle-1' });
    prisma.vehicleTrip.findFirst.mockResolvedValue({ id: 'trip-1', vehicleId: 'vehicle-1' });
    prisma.drivingAnalysisRun.findFirst.mockResolvedValue({
      id: 'run-1',
      vehicleId: 'vehicle-1',
      tripId: 'trip-1',
    });
    prisma.drivingIntelligenceJob.findUnique.mockResolvedValue(null);
    prisma.drivingIntelligenceJob.create.mockResolvedValue({ id: 'job-new', status: 'PENDING' });
  });

  it('short-circuits on idempotency before booking validation', async () => {
    prisma.drivingIntelligenceJob.findUnique.mockResolvedValue({
      id: 'job-existing',
      status: 'ENQUEUED',
    });

    await repository.persistOrGet(persistInput());

    expect(bookingOverlap.resolveBookingVehicleForOrganization).not.toHaveBeenCalled();
    expect(prisma.booking.findFirst).not.toHaveBeenCalled();
  });

  it('delegates booking validation to port with org scope', async () => {
    await repository.persistOrGet(persistInput());

    expect(bookingOverlap.resolveBookingVehicleForOrganization).toHaveBeenCalledWith({
      organizationId: 'org-1',
      bookingId: 'book-1',
    });
    expect(prisma.booking.findFirst).not.toHaveBeenCalled();
  });

  it('propagates NotFoundException for missing/foreign booking', async () => {
    bookingOverlap.resolveBookingVehicleForOrganization = jest
      .fn()
      .mockRejectedValue(new NotFoundException('Booking not found for organization'));

    await expect(repository.persistOrGet(persistInput())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.drivingIntelligenceJob.create).not.toHaveBeenCalled();
  });

  it('allows null booking vehicleId without mismatch error', async () => {
    bookingOverlap.resolveBookingVehicleForOrganization = jest
      .fn()
      .mockResolvedValue({ vehicleId: null });

    await expect(repository.persistOrGet(persistInput())).resolves.toMatchObject({
      created: true,
    });
  });

  it('rejects booking vehicle mismatch with unchanged message', async () => {
    bookingOverlap.resolveBookingVehicleForOrganization = jest
      .fn()
      .mockResolvedValue({ vehicleId: 'other-vehicle' });

    await expect(repository.persistOrGet(persistInput())).rejects.toThrow(
      'Booking vehicle mismatch for organization',
    );
  });

  it('skips booking validation when bookingId is null', async () => {
    await repository.persistOrGet(persistInput({ bookingId: null }));

    expect(bookingOverlap.resolveBookingVehicleForOrganization).not.toHaveBeenCalled();
  });
});
