import type {
  BookingDriverPoolContext,
  BookingOverlapCandidate,
} from '../trip-canonical-hydration.types';

/** Core-owned port contract — Rental supplies overlap data for trip assignment/hydration. */
export const TRIP_BOOKING_OVERLAP_PORT = Symbol('TRIP_BOOKING_OVERLAP_PORT');

/**
 * Resolves rental booking overlap for canonical trips.
 *
 * `organizationId` for single-trip lookup must come from `Vehicle.organizationId`
 * (trusted server-side resolution in `TripAssignmentService`).
 */
export interface TripBookingOverlapPort {
  findFirstOverlapForTrip(input: {
    organizationId: string;
    vehicleId: string;
    tripStart: Date;
    tripEnd: Date;
    /** When set, constrain overlap lookup to this booking before selecting the first row. */
    bookingId?: string | null;
  }): Promise<BookingOverlapCandidate | null>;

  loadDriverPoolForBooking(input: {
    organizationId: string;
    bookingId: string;
  }): Promise<BookingDriverPoolContext>;

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
