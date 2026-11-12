import { DrivingAnalysisReconciliationService } from './driving-analysis-reconciliation.service';
import {
  DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES,
  buildReconciliationIdempotencyKey,
} from './driving-analysis-reconciliation.types';

function makeRentalPort() {
  return {
    scanBookingsWithoutRentalAnalysis: jest.fn().mockResolvedValue([
      {
        checkType: 'BOOKING_WITHOUT_RENTAL_ANALYSIS',
        organizationId: 'org-1',
        entityType: 'booking',
        entityId: 'book-1',
        detail: 'vehicle=veh-1',
      },
    ]),
    remediateBookingWithoutRentalAnalysis: jest.fn().mockResolvedValue('enqueued'),
  };
}

describe('DrivingAnalysisReconciliationService — rental port delegation', () => {
  it('delegates booking scan to port and preserves finding merge order slot', async () => {
    const rental = makeRentalPort();
    const prisma = {
      organization: { findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]) },
      vehicleTrip: { findMany: jest.fn().mockResolvedValue([]) },
      drivingAnalysisRun: { findMany: jest.fn().mockResolvedValue([]) },
      tripDrivingImpact: { findMany: jest.fn().mockResolvedValue([]) },
      drivingEvent: { findMany: jest.fn().mockResolvedValue([]) },
      drivingIntelligenceJob: { findMany: jest.fn().mockResolvedValue([]) },
      drivingAnalysisStage: { findMany: jest.fn().mockResolvedValue([]) },
      booking: { findMany: jest.fn() },
    };
    const jobRepository = {
      findRetryablePending: jest.fn().mockResolvedValue([]),
      findStuckInProgress: jest.fn().mockResolvedValue([]),
    };
    const service = new DrivingAnalysisReconciliationService(
      prisma as any,
      { initializeForCompletedTrip: jest.fn() } as any,
      { enqueue: jest.fn() } as any,
      jobRepository as any,
      rental as any,
    );

    const result = await service.runPeriodicReconciliation({ maxActions: 10 });
    expect(rental.scanBookingsWithoutRentalAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
    );
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
    expect(result.findings.some((f) => f.entityId === 'book-1')).toBe(true);
  });

  it('records reconciliation metric exactly once for rental remediation', async () => {
    const rental = makeRentalPort();
    const tripMetrics = { drivingAnalysisReconciliationActions: { inc: jest.fn() } };
    const prisma = {
      organization: { findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]) },
      vehicleTrip: { findMany: jest.fn().mockResolvedValue([]) },
      drivingAnalysisRun: { findMany: jest.fn().mockResolvedValue([]) },
      tripDrivingImpact: { findMany: jest.fn().mockResolvedValue([]) },
      drivingEvent: { findMany: jest.fn().mockResolvedValue([]) },
      drivingIntelligenceJob: { findMany: jest.fn().mockResolvedValue([]) },
      drivingAnalysisStage: { findMany: jest.fn().mockResolvedValue([]) },
      booking: { findMany: jest.fn() },
    };
    const jobRepository = {
      findRetryablePending: jest.fn().mockResolvedValue([]),
      findStuckInProgress: jest.fn().mockResolvedValue([]),
    };
    const service = new DrivingAnalysisReconciliationService(
      prisma as any,
      { initializeForCompletedTrip: jest.fn() } as any,
      { enqueue: jest.fn() } as any,
      jobRepository as any,
      rental as any,
      undefined,
      undefined,
      undefined,
      tripMetrics as any,
    );

    await service.runPeriodicReconciliation({ maxActions: 5 });

    expect(rental.remediateBookingWithoutRentalAnalysis).toHaveBeenCalledWith({
      finding: expect.objectContaining({
        checkType: DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.BOOKING_WITHOUT_RENTAL_ANALYSIS,
        entityId: 'book-1',
      }),
      idempotencyKey: buildReconciliationIdempotencyKey(
        DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.BOOKING_WITHOUT_RENTAL_ANALYSIS,
        'book-1',
      ),
    });
    expect(tripMetrics.drivingAnalysisReconciliationActions.inc).toHaveBeenCalledWith({
      check_type: DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.BOOKING_WITHOUT_RENTAL_ANALYSIS,
      result: 'enqueued',
    });
    expect(tripMetrics.drivingAnalysisReconciliationActions.inc).toHaveBeenCalledTimes(1);
  });
});
