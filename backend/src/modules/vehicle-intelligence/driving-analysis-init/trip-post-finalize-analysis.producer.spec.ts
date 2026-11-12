import { TripPostFinalizeAnalysisProducer } from './trip-post-finalize-analysis.producer';
import { DrivingAnalysisInitService } from './driving-analysis-init.service';
import type { TripRentalRecomputePort } from '../trips/ports/trip-rental-recompute.port';

describe('TripPostFinalizeAnalysisProducer', () => {
  it('awaits durable init and returns null when organizationId is missing', async () => {
    const analysisInit = {
      initializeForCompletedTrip: jest.fn(),
    };
    const producer = new TripPostFinalizeAnalysisProducer(
      analysisInit as unknown as DrivingAnalysisInitService,
    );

    const result = await producer.produceAfterPersistedCompletion({
      tripId: 'trip-1',
      vehicleId: 'vehicle-1',
      organizationId: null,
      source: 'LIVE_FINALIZE',
    });

    expect(result).toBeNull();
    expect(analysisInit.initializeForCompletedTrip).not.toHaveBeenCalled();
  });

  it('returns queue errors without throwing so finalize path is not poisoned', async () => {
    const analysisInit = {
      initializeForCompletedTrip: jest.fn().mockResolvedValue({
        runId: 'run-1',
        runCreated: true,
        runDeduplicated: false,
        jobs: [],
        queueErrors: ['Redis down'],
      }),
    };
    const rentalRecompute: TripRentalRecomputePort = {
      notifyTripCompleted: jest.fn().mockResolvedValue({ enqueued: true }),
      notifyBookingAssignmentCorrected: jest.fn(),
    };
    const producer = new TripPostFinalizeAnalysisProducer(
      analysisInit as unknown as DrivingAnalysisInitService,
      rentalRecompute,
    );

    const result = await producer.produceAfterPersistedCompletion({
      tripId: 'trip-1',
      vehicleId: 'vehicle-1',
      organizationId: 'org-1',
      source: 'LIVE_FINALIZE',
    });

    expect(result?.queueErrors).toEqual(['Redis down']);
    expect(rentalRecompute.notifyTripCompleted).toHaveBeenCalledWith({
      organizationId: 'org-1',
      vehicleId: 'vehicle-1',
      tripId: 'trip-1',
    });
  });

  it('does not fail finalize when rental recompute notification rejects', async () => {
    const analysisInit = {
      initializeForCompletedTrip: jest.fn().mockResolvedValue({
        runId: 'run-2',
        runCreated: true,
        runDeduplicated: false,
        jobs: [],
        queueErrors: [],
      }),
    };
    const rentalRecompute: TripRentalRecomputePort = {
      notifyTripCompleted: jest.fn().mockRejectedValue(new Error('queue down')),
      notifyBookingAssignmentCorrected: jest.fn(),
    };
    const producer = new TripPostFinalizeAnalysisProducer(
      analysisInit as unknown as DrivingAnalysisInitService,
      rentalRecompute,
    );

    await producer.produceAfterPersistedCompletion({
      tripId: 'trip-9',
      vehicleId: 'vehicle-9',
      organizationId: 'org-9',
      source: 'LIVE_FINALIZE',
    });

    expect(analysisInit.initializeForCompletedTrip).toHaveBeenCalled();
    expect(rentalRecompute.notifyTripCompleted).toHaveBeenCalledTimes(1);
  });
});
