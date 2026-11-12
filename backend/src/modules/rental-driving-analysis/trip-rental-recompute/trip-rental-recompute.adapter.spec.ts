import { RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS } from '../rental-driving-analysis.recompute.types';
import { TripRentalRecomputePortAdapter } from './trip-rental-recompute.adapter';

describe('TripRentalRecomputePortAdapter', () => {
  const trigger = {
    enqueueForTrip: jest.fn().mockResolvedValue({ enqueued: true }),
    enqueueForBooking: jest.fn().mockResolvedValue({ enqueued: true }),
  };
  let adapter: TripRentalRecomputePortAdapter;

  beforeEach(() => {
    jest.resetAllMocks();
    adapter = new TripRentalRecomputePortAdapter(trigger as any);
  });

  it('notifyTripCompleted preserves TRIP_COMPLETED reason and correlation', async () => {
    await adapter.notifyTripCompleted({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
    });

    expect(trigger.enqueueForTrip).toHaveBeenCalledTimes(1);
    expect(trigger.enqueueForTrip).toHaveBeenCalledWith({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      reason: RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.TRIP_COMPLETED,
      correlationId: `rental-recompute:trip:trip-1:${RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.TRIP_COMPLETED}`,
    });
  });

  it('notifyBookingAssignmentCorrected preserves BOOKING_ASSIGNMENT_CORRECTED semantics', async () => {
    await adapter.notifyBookingAssignmentCorrected({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      bookingId: 'book-1',
      tripId: 'trip-2',
    });

    expect(trigger.enqueueForBooking).toHaveBeenCalledTimes(1);
    expect(trigger.enqueueForBooking).toHaveBeenCalledWith({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      bookingId: 'book-1',
      tripId: 'trip-2',
      reason: RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.BOOKING_ASSIGNMENT_CORRECTED,
      correlationId: `rental-recompute:book-1:${RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.BOOKING_ASSIGNMENT_CORRECTED}`,
    });
  });

  it('notifyAttributionChanged preserves ATTRIBUTION_CHANGED reason and correlation', async () => {
    await adapter.notifyAttributionChanged({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      bookingId: 'book-a',
      tripId: 'trip-a',
    });

    expect(trigger.enqueueForBooking).toHaveBeenCalledWith({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      bookingId: 'book-a',
      tripId: 'trip-a',
      reason: RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.ATTRIBUTION_CHANGED,
      correlationId: `rental-recompute:book-a:${RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.ATTRIBUTION_CHANGED}`,
    });
  });

  it('notifyTripAnalysisCompleted preserves TRIP_ANALYSIS_COMPLETED reason and correlation', async () => {
    await adapter.notifyTripAnalysisCompleted({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-x',
    });

    expect(trigger.enqueueForTrip).toHaveBeenCalledWith({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-x',
      reason: RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.TRIP_ANALYSIS_COMPLETED,
      correlationId: `rental-recompute:trip-analysis:trip-x:${RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.TRIP_ANALYSIS_COMPLETED}`,
    });
  });

  it('notifyMisuseReconciled preserves MISUSE_RECONCILED reason and correlation', async () => {
    await adapter.notifyMisuseReconciled({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      bookingId: 'book-m',
      tripId: 'trip-m',
    });

    expect(trigger.enqueueForBooking).toHaveBeenCalledWith({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      bookingId: 'book-m',
      tripId: 'trip-m',
      reason: RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.MISUSE_RECONCILED,
      correlationId: `rental-recompute:book-m:${RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.MISUSE_RECONCILED}`,
    });
  });

  it('propagates booking trigger rejection for notifyAttributionChanged', async () => {
    trigger.enqueueForBooking.mockRejectedValue(new Error('booking enqueue rejected'));

    await expect(
      adapter.notifyAttributionChanged({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        bookingId: 'book-1',
        tripId: 'trip-1',
      }),
    ).rejects.toThrow('booking enqueue rejected');
  });

  it('propagates booking trigger rejection for notifyMisuseReconciled', async () => {
    trigger.enqueueForBooking.mockRejectedValue(new Error('misuse enqueue rejected'));

    await expect(
      adapter.notifyMisuseReconciled({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        bookingId: 'book-1',
        tripId: 'trip-1',
      }),
    ).rejects.toThrow('misuse enqueue rejected');
  });

  it('propagates trip trigger rejection for notifyTripAnalysisCompleted', async () => {
    trigger.enqueueForTrip.mockRejectedValue(new Error('trip enqueue rejected'));

    await expect(
      adapter.notifyTripAnalysisCompleted({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tripId: 'trip-1',
      }),
    ).rejects.toThrow('trip enqueue rejected');
  });
});
