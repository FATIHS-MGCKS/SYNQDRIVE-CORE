import { BookingStatus } from '@prisma/client';
import { RENTAL_RECONCILIATION_CHECK_BOOKING_WITHOUT_ANALYSIS } from '@modules/vehicle-intelligence/driving-analysis-reconciliation/ports/rental-driving-analysis-reconciliation.port';
import { RentalDrivingAnalysisReconciliationPortAdapter } from './rental-driving-analysis-reconciliation.adapter';

describe('RentalDrivingAnalysisReconciliationPortAdapter', () => {
  const prisma = {
    booking: { findMany: jest.fn(), findFirst: jest.fn() },
    vehicleTrip: { findFirst: jest.fn() },
    drivingAnalysisRun: { findFirst: jest.fn() },
  };
  const analysisInit = { initializeForCompletedTrip: jest.fn() };
  const jobDispatcher = { enqueue: jest.fn() };
  let adapter: RentalDrivingAnalysisReconciliationPortAdapter;

  beforeEach(() => {
    jest.resetAllMocks();
    adapter = new RentalDrivingAnalysisReconciliationPortAdapter(
      prisma as any,
      analysisInit as any,
      jobDispatcher as any,
    );
  });

  it('scan scopes by organization and completed booking window', async () => {
    prisma.booking.findMany.mockResolvedValue([
      { id: 'book-1', vehicleId: 'veh-1' },
    ]);
    const lookbackFrom = new Date('2026-01-01T00:00:00Z');
    const findings = await adapter.scanBookingsWithoutRentalAnalysis({
      organizationId: 'org-1',
      lookbackFrom,
      limit: 50,
    });

    expect(prisma.booking.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        status: BookingStatus.COMPLETED,
        endDate: { gte: lookbackFrom },
        rentalDrivingAnalyses: { none: { supersededAt: null } },
      },
      select: { id: true, vehicleId: true },
      take: 50,
    });
    expect(findings).toEqual([
      {
        checkType: RENTAL_RECONCILIATION_CHECK_BOOKING_WITHOUT_ANALYSIS,
        organizationId: 'org-1',
        entityType: 'booking',
        entityId: 'book-1',
        detail: 'vehicle=veh-1',
      },
    ]);
  });

  it('remediate skips when booking missing vehicle or not completed', async () => {
    prisma.booking.findFirst.mockResolvedValue({ vehicleId: null, status: BookingStatus.ACTIVE });
    const outcome = await adapter.remediateBookingWithoutRentalAnalysis({
      finding: {
        checkType: RENTAL_RECONCILIATION_CHECK_BOOKING_WITHOUT_ANALYSIS,
        organizationId: 'org-1',
        entityType: 'booking',
        entityId: 'book-1',
      },
      idempotencyKey: 'reconcile:BOOKING_WITHOUT_RENTAL_ANALYSIS:book-1:1',
    });
    expect(outcome).toBe('skipped');
    expect(prisma.vehicleTrip.findFirst).not.toHaveBeenCalled();
  });

  it('remediate skips when anchor trip missing', async () => {
    prisma.booking.findFirst.mockResolvedValue({
      vehicleId: 'veh-1',
      status: BookingStatus.COMPLETED,
    });
    prisma.vehicleTrip.findFirst.mockResolvedValue(null);

    const outcome = await adapter.remediateBookingWithoutRentalAnalysis({
      finding: {
        checkType: RENTAL_RECONCILIATION_CHECK_BOOKING_WITHOUT_ANALYSIS,
        organizationId: 'org-1',
        entityType: 'booking',
        entityId: 'book-1',
      },
      idempotencyKey: 'key-1',
    });
    expect(outcome).toBe('skipped');
    expect(prisma.vehicleTrip.findFirst).toHaveBeenCalledWith({
      where: { assignedBookingId: 'book-1', vehicleId: 'veh-1' },
      select: { id: true },
      orderBy: { endTime: 'desc' },
    });
  });

  it('remediate initializes analysis when run missing (REPAIR_FINALIZE)', async () => {
    prisma.booking.findFirst.mockResolvedValue({
      vehicleId: 'veh-1',
      status: BookingStatus.COMPLETED,
    });
    prisma.vehicleTrip.findFirst.mockResolvedValue({ id: 'trip-1' });
    prisma.drivingAnalysisRun.findFirst.mockResolvedValue(null);
    analysisInit.initializeForCompletedTrip.mockResolvedValue({
      jobs: [{ enqueued: true }],
    });

    const outcome = await adapter.remediateBookingWithoutRentalAnalysis({
      finding: {
        checkType: RENTAL_RECONCILIATION_CHECK_BOOKING_WITHOUT_ANALYSIS,
        organizationId: 'org-1',
        entityType: 'booking',
        entityId: 'book-1',
      },
      idempotencyKey: 'key-1',
    });

    expect(analysisInit.initializeForCompletedTrip).toHaveBeenCalledWith({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      source: 'REPAIR_FINALIZE',
    });
    expect(outcome).toBe('enqueued');
  });

  it('remediate enqueues RENTAL_DRIVING_ANALYSIS_RECOMPUTE with reconcile correlation', async () => {
    prisma.booking.findFirst.mockResolvedValue({
      vehicleId: 'veh-1',
      status: BookingStatus.COMPLETED,
    });
    prisma.vehicleTrip.findFirst.mockResolvedValue({ id: 'trip-1' });
    prisma.drivingAnalysisRun.findFirst.mockResolvedValue({ id: 'run-1' });
    jobDispatcher.enqueue.mockResolvedValue({ enqueued: true, deduplicated: false });

    const outcome = await adapter.remediateBookingWithoutRentalAnalysis({
      finding: {
        checkType: RENTAL_RECONCILIATION_CHECK_BOOKING_WITHOUT_ANALYSIS,
        organizationId: 'org-1',
        entityType: 'booking',
        entityId: 'book-1',
      },
      idempotencyKey: 'reconcile:BOOKING_WITHOUT_RENTAL_ANALYSIS:book-1:9',
    });

    expect(jobDispatcher.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tripId: 'trip-1',
        bookingId: 'book-1',
        analysisRunId: 'run-1',
        jobType: 'RENTAL_DRIVING_ANALYSIS_RECOMPUTE',
        idempotencyKey: 'reconcile:BOOKING_WITHOUT_RENTAL_ANALYSIS:book-1:9',
        correlationId: 'reconcile-booking:book-1',
      }),
    );
    expect(outcome).toBe('enqueued');
  });

  it('remediate returns skipped when enqueue deduplicates', async () => {
    prisma.booking.findFirst.mockResolvedValue({
      vehicleId: 'veh-1',
      status: BookingStatus.COMPLETED,
    });
    prisma.vehicleTrip.findFirst.mockResolvedValue({ id: 'trip-1' });
    prisma.drivingAnalysisRun.findFirst.mockResolvedValue({ id: 'run-1' });
    jobDispatcher.enqueue.mockResolvedValue({ enqueued: false, deduplicated: true });

    const outcome = await adapter.remediateBookingWithoutRentalAnalysis({
      finding: {
        checkType: RENTAL_RECONCILIATION_CHECK_BOOKING_WITHOUT_ANALYSIS,
        organizationId: 'org-1',
        entityType: 'booking',
        entityId: 'book-1',
      },
      idempotencyKey: 'key-dup',
    });
    expect(outcome).toBe('skipped');
  });
});
