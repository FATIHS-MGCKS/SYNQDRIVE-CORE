/** Core-owned notification port for rental driving-analysis recompute (no Rental types). */
export const TRIP_RENTAL_RECOMPUTE_PORT = Symbol('TRIP_RENTAL_RECOMPUTE_PORT');

export interface TripRentalRecomputePort {
  notifyTripCompleted(input: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
  }): Promise<unknown>;

  notifyBookingAssignmentCorrected(input: {
    organizationId: string;
    vehicleId: string;
    bookingId: string;
    tripId: string;
  }): Promise<unknown>;
}
