import type {
  BookingDriverPoolContext,
  BookingOverlapCandidate,
} from '../trip-canonical-hydration.types';

/** Core-owned port contract — Rental supplies overlap data for trip assignment/hydration. */
export const TRIP_BOOKING_OVERLAP_PORT = Symbol('TRIP_BOOKING_OVERLAP_PORT');

/**
 * Resolves rental booking overlap for canonical trips.
 *
 * Note: single-trip assignment lookup is vehicle-scoped only (no organizationId) —
 * preserved from legacy `TripAssignmentService.findBookingAssignment` behavior.
 */
export interface TripBookingOverlapPort {
  findFirstOverlapForTrip(input: {
    vehicleId: string;
    tripStart: Date;
    tripEnd: Date;
  }): Promise<BookingOverlapCandidate | null>;

  findOverlapsForVehicleWindow(input: {
    organizationId: string;
    vehicleId: string;
    windowStart: Date;
    windowEnd: Date;
  }): Promise<BookingOverlapCandidate[]>;

  loadDriverPoolsForBookings(input: {
    organizationId: string;
    bookingIds: string[];
  }): Promise<Map<string, BookingDriverPoolContext>>;
}
