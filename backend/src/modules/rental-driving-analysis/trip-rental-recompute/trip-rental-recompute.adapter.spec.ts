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
});
