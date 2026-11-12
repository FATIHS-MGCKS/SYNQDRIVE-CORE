import { DrivingIntelligenceJobRepository } from './driving-intelligence-jobs.repository';
import type { PersistDrivingIntelligenceJobInput } from './driving-intelligence-jobs.types';
import type { TripBookingOverlapPort } from '../trips/ports/trip-booking-overlap.port';

function makeOverlapPort(): TripBookingOverlapPort {
  return {
    findFirstOverlapForTrip: jest.fn(),
    findOverlapsForVehicleWindow: jest.fn(),
    loadDriverPoolsForBookings: jest.fn(),
    loadDriverPoolForBooking: jest.fn(),
    loadBookingAttributionContext: jest.fn(),
    findPickupHandoverProofForTrip: jest.fn(),
    resolveBookingVehicleForOrganization: jest.fn().mockResolvedValue({ vehicleId: null }),
  };
}

function makePrisma() {
  return {
    vehicle: { findFirst: jest.fn() },
    vehicleTrip: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
    drivingAnalysisRun: { findFirst: jest.fn() },
    drivingIntelligenceJob: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  } as any;
}

function persistInput(overrides: Partial<PersistDrivingIntelligenceJobInput> = {}): PersistDrivingIntelligenceJobInput {
  return {
    organizationId: 'org-1',
    vehicleId: 'vehicle-1',
    tripId: 'trip-1',
    bookingId: null,
    analysisRunId: 'run-1',
    jobType: 'DRIVING_ROUTE_ENRICH',
    modelVersion: 'di-v1',
    idempotencyKey: 'idem-1',
    correlationId: 'corr-1',
    requestedAt: new Date('2026-07-16T10:00:00.000Z'),
    ...overrides,
  };
}

describe('DrivingIntelligenceJobRepository', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repository: DrivingIntelligenceJobRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repository = new DrivingIntelligenceJobRepository(prisma, makeOverlapPort());
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'vehicle-1' });
    prisma.vehicleTrip.findFirst.mockResolvedValue({ id: 'trip-1', vehicleId: 'vehicle-1' });
    prisma.drivingAnalysisRun.findFirst.mockResolvedValue({
      id: 'run-1',
      vehicleId: 'vehicle-1',
      tripId: 'trip-1',
    });
  });

  it('returns existing row for duplicate idempotency key', async () => {
    prisma.drivingIntelligenceJob.findUnique.mockResolvedValue({
      id: 'job-existing',
      status: 'ENQUEUED',
      idempotencyKey: 'idem-1',
    });

    const result = await repository.persistOrGet(persistInput());
    expect(result.created).toBe(false);
    expect(result.deduplicated).toBe(true);
    expect(result.job.id).toBe('job-existing');
    expect(prisma.drivingIntelligenceJob.create).not.toHaveBeenCalled();
  });

  it('creates a new persistent row when idempotency key is new', async () => {
    prisma.drivingIntelligenceJob.findUnique.mockResolvedValue(null);
    prisma.drivingIntelligenceJob.create.mockResolvedValue({
      id: 'job-new',
      status: 'PENDING',
      jobType: 'DRIVING_ROUTE_ENRICH',
    });

    const result = await repository.persistOrGet(persistInput());
    expect(result.created).toBe(true);
    expect(result.deduplicated).toBe(false);
    expect(result.job.id).toBe('job-new');
    expect(prisma.drivingIntelligenceJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          jobType: 'DRIVING_ROUTE_ENRICH',
          status: 'PENDING',
        }),
      }),
    );
  });

  it('skips enqueue for terminal or in-flight statuses', () => {
    expect(repository.shouldSkipEnqueue('COMPLETED')).toBe(true);
    expect(repository.shouldSkipEnqueue('DEAD_LETTER')).toBe(true);
    expect(repository.shouldSkipEnqueue('ENQUEUED')).toBe(true);
    expect(repository.shouldSkipEnqueue('IN_PROGRESS')).toBe(true);
    expect(repository.shouldSkipEnqueue('PENDING')).toBe(false);
    expect(repository.shouldSkipEnqueue('FAILED')).toBe(false);
  });
});
