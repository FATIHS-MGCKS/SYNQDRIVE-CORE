import { RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS } from '../rental-driving-analysis.recompute.types';
import { DrivingMisuseReconcileJobHandler } from '@modules/vehicle-intelligence/misuse-cases/misuse-case-reconcile/driving-misuse-reconcile.handler';
import { DrivingAnalysisStageOrchestratorService } from '@modules/vehicle-intelligence/driving-analysis-stage/driving-analysis-stage.orchestrator.service';
import { DriverAttributionService } from '@modules/vehicle-intelligence/driver-attribution/driver-attribution.service';
import type { TripRentalRecomputePort } from '@modules/vehicle-intelligence/trips/ports/trip-rental-recompute.port';

describe('TripRentalRecomputePort — Core call-site semantics', () => {
  describe('DrivingMisuseReconcileJobHandler', () => {
    it('awaits notifyMisuseReconciled and propagates rejection', async () => {
      const reconcile = { reconcileTrip: jest.fn().mockResolvedValue({ upserted: 0, resolved: 0 }) };
      const rentalRecompute: TripRentalRecomputePort = {
        notifyTripCompleted: jest.fn(),
        notifyBookingAssignmentCorrected: jest.fn(),
        notifyAttributionChanged: jest.fn(),
        notifyTripAnalysisCompleted: jest.fn(),
        notifyMisuseReconciled: jest.fn().mockRejectedValue(new Error('enqueue failed')),
      };
      const handler = new DrivingMisuseReconcileJobHandler(reconcile as any, rentalRecompute);

      await expect(
        handler.handle({
          id: 'job-1',
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          tripId: 'trip-1',
          bookingId: 'book-1',
          analysisRunId: 'run-1',
          jobType: 'DRIVING_MISUSE_RECONCILE',
        } as any),
      ).rejects.toThrow('enqueue failed');

      expect(rentalRecompute.notifyMisuseReconciled).toHaveBeenCalledTimes(1);
      expect(rentalRecompute.notifyMisuseReconciled).toHaveBeenCalledWith({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        bookingId: 'book-1',
        tripId: 'trip-1',
      });
    });

    it('skips recompute when bookingId is absent', async () => {
      const reconcile = { reconcileTrip: jest.fn().mockResolvedValue({ upserted: 0, resolved: 0 }) };
      const rentalRecompute: TripRentalRecomputePort = {
        notifyTripCompleted: jest.fn(),
        notifyBookingAssignmentCorrected: jest.fn(),
        notifyAttributionChanged: jest.fn(),
        notifyTripAnalysisCompleted: jest.fn(),
        notifyMisuseReconciled: jest.fn(),
      };
      const handler = new DrivingMisuseReconcileJobHandler(reconcile as any, rentalRecompute);

      await handler.handle({
        id: 'job-1',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tripId: 'trip-1',
        bookingId: null,
        analysisRunId: 'run-1',
        jobType: 'DRIVING_MISUSE_RECONCILE',
      } as any);

      expect(rentalRecompute.notifyMisuseReconciled).not.toHaveBeenCalled();
    });
  });

  describe('DrivingAnalysisStageOrchestratorService', () => {
    const stageRepository = {
      markCompleted: jest.fn().mockResolvedValue({}),
      findByRun: jest.fn(),
    };
    const runRepository = {
      findById: jest.fn(),
      syncStatusFromStages: jest.fn().mockResolvedValue({}),
    };
    const jobDispatcher = { enqueue: jest.fn() };

    beforeEach(() => {
      jest.resetAllMocks();
      stageRepository.markCompleted.mockResolvedValue({});
      runRepository.syncStatusFromStages.mockResolvedValue({});
    });

    it('notifyTripAnalysisCompleted is fire-and-forget with warn on rejection', async () => {
      const logger = { warn: jest.fn(), log: jest.fn() };
      const rentalRecompute: TripRentalRecomputePort = {
        notifyTripCompleted: jest.fn(),
        notifyBookingAssignmentCorrected: jest.fn(),
        notifyAttributionChanged: jest.fn(),
        notifyTripAnalysisCompleted: jest.fn().mockRejectedValue(new Error('trip analysis enqueue failed')),
        notifyMisuseReconciled: jest.fn(),
      };
      runRepository.findById.mockResolvedValue({
        status: 'COMPLETED',
        vehicleId: 'veh-1',
        tripId: 'trip-9',
        modelVersion: 'di-v2-pipeline-v1',
      });
      stageRepository.findByRun.mockResolvedValue([]);

      const orchestrator = new DrivingAnalysisStageOrchestratorService(
        stageRepository as any,
        runRepository as any,
        jobDispatcher as any,
        undefined,
        rentalRecompute,
      );
      Object.defineProperty(orchestrator, 'logger', { value: logger });

      await orchestrator.onJobCompleted('org-1', 'run-1', 'DIMO_TRIP_SEGMENT_VALIDATE');

      await new Promise((resolve) => setImmediate(resolve));

      expect(rentalRecompute.notifyTripAnalysisCompleted).toHaveBeenCalledTimes(1);
      expect(rentalRecompute.notifyTripAnalysisCompleted).toHaveBeenCalledWith({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tripId: 'trip-9',
      });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Rental analysis recompute enqueue failed run=run-1'),
      );
    });

    it('does not enqueue when run is not COMPLETED', async () => {
      const rentalRecompute: TripRentalRecomputePort = {
        notifyTripCompleted: jest.fn(),
        notifyBookingAssignmentCorrected: jest.fn(),
        notifyAttributionChanged: jest.fn(),
        notifyTripAnalysisCompleted: jest.fn(),
        notifyMisuseReconciled: jest.fn(),
      };
      runRepository.findById.mockResolvedValue({
        status: 'IN_PROGRESS',
        vehicleId: 'veh-1',
        tripId: 'trip-9',
        modelVersion: 'di-v2-pipeline-v1',
      });
      stageRepository.findByRun.mockResolvedValue([]);

      const orchestrator = new DrivingAnalysisStageOrchestratorService(
        stageRepository as any,
        runRepository as any,
        jobDispatcher as any,
        undefined,
        rentalRecompute,
      );

      await orchestrator.onJobCompleted('org-1', 'run-1', 'DIMO_TRIP_SEGMENT_VALIDATE');
      await new Promise((resolve) => setImmediate(resolve));

      expect(rentalRecompute.notifyTripAnalysisCompleted).not.toHaveBeenCalled();
    });
  });

  describe('DriverAttributionService.enqueueDownstreamReconciliation', () => {
    it('awaits notifyAttributionChanged and propagates rejection', async () => {
      const jobDispatcher = { enqueue: jest.fn().mockResolvedValue({}) };
      const prisma = {
        drivingAnalysisRun: {
          findFirst: jest.fn().mockResolvedValue({ id: 'run-attr' }),
        },
      };
      const rentalRecompute: TripRentalRecomputePort = {
        notifyTripCompleted: jest.fn(),
        notifyBookingAssignmentCorrected: jest.fn(),
        notifyAttributionChanged: jest.fn().mockRejectedValue(new Error('attribution enqueue failed')),
        notifyTripAnalysisCompleted: jest.fn(),
        notifyMisuseReconciled: jest.fn(),
      };
      const service = new DriverAttributionService(
        prisma as any,
        {} as any,
        {} as any,
        jobDispatcher as any,
        rentalRecompute,
      );

      await expect(
        (service as any).enqueueDownstreamReconciliation({
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          tripId: 'trip-1',
          bookingId: 'book-1',
          analysisRunId: 'run-attr',
          correlationId: 'corr-1',
        }),
      ).rejects.toThrow('attribution enqueue failed');

      expect(jobDispatcher.enqueue).toHaveBeenCalledTimes(1);
      expect(rentalRecompute.notifyAttributionChanged).toHaveBeenCalledTimes(1);
      expect(rentalRecompute.notifyAttributionChanged).toHaveBeenCalledWith({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        bookingId: 'book-1',
        tripId: 'trip-1',
      });
    });

    it('does not call port when bookingId is null', async () => {
      const jobDispatcher = { enqueue: jest.fn().mockResolvedValue({}) };
      const prisma = {
        drivingAnalysisRun: {
          findFirst: jest.fn().mockResolvedValue({ id: 'run-attr' }),
        },
      };
      const rentalRecompute: TripRentalRecomputePort = {
        notifyTripCompleted: jest.fn(),
        notifyBookingAssignmentCorrected: jest.fn(),
        notifyAttributionChanged: jest.fn(),
        notifyTripAnalysisCompleted: jest.fn(),
        notifyMisuseReconciled: jest.fn(),
      };
      const service = new DriverAttributionService(
        prisma as any,
        {} as any,
        {} as any,
        jobDispatcher as any,
        rentalRecompute,
      );

      await (service as any).enqueueDownstreamReconciliation({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tripId: 'trip-1',
        bookingId: null,
        analysisRunId: 'run-attr',
        correlationId: 'corr-1',
      });

      expect(rentalRecompute.notifyAttributionChanged).not.toHaveBeenCalled();
    });
  });
});

describe('TripRentalRecomputePortAdapter — correlation constants', () => {
  it('documents reason literals used by adapter mapping', () => {
    expect(RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.ATTRIBUTION_CHANGED).toBe('ATTRIBUTION_CHANGED');
    expect(RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.TRIP_ANALYSIS_COMPLETED).toBe(
      'TRIP_ANALYSIS_COMPLETED',
    );
    expect(RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.MISUSE_RECONCILED).toBe('MISUSE_RECONCILED');
  });
});
