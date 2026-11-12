import { Injectable } from '@nestjs/common';
import type { TripRentalRecomputePort } from '@modules/vehicle-intelligence/trips/ports/trip-rental-recompute.port';
import { RentalDrivingAnalysisRecomputeTriggerService } from '../rental-driving-analysis-recompute.trigger';
import { RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS } from '../rental-driving-analysis.recompute.types';

@Injectable()
export class TripRentalRecomputePortAdapter implements TripRentalRecomputePort {
  constructor(private readonly trigger: RentalDrivingAnalysisRecomputeTriggerService) {}

  notifyTripCompleted(input: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
  }): Promise<unknown> {
    return this.trigger.enqueueForTrip({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      reason: RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.TRIP_COMPLETED,
      correlationId: `rental-recompute:trip:${input.tripId}:${RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.TRIP_COMPLETED}`,
    });
  }

  notifyBookingAssignmentCorrected(input: {
    organizationId: string;
    vehicleId: string;
    bookingId: string;
    tripId: string;
  }): Promise<unknown> {
    return this.trigger.enqueueForBooking({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      bookingId: input.bookingId,
      tripId: input.tripId,
      reason: RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.BOOKING_ASSIGNMENT_CORRECTED,
      correlationId: `rental-recompute:${input.bookingId}:${RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.BOOKING_ASSIGNMENT_CORRECTED}`,
    });
  }
}
