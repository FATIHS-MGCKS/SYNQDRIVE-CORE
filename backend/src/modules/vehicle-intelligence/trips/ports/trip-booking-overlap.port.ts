import type { CustomerType, HandoverKind } from '@prisma/client';
import type {
  BookingDriverPoolContext,
  BookingOverlapCandidate,
} from '../trip-canonical-hydration.types';

export type BookingAttributionContext = {
  customerId: string;
  assignedDriverId: string | null;
  customerType: CustomerType | null;
};

export type BookingPickupHandoverProof = {
  protocolId: string;
  bookingId: string;
  kind: HandoverKind;
  performedAt: Date;
  customerSignatureName: string | null;
  staffSignatureName: string | null;
};

/** Inclusive window around trip start/end for PICKUP handover proof (matches DriverAttributionService). */
export const BOOKING_PICKUP_HANDOVER_WINDOW_MS = 6 * 60 * 60 * 1000;

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

  /** Assigned booking attribution fields only — null when booking missing or foreign to org. */
  loadBookingAttributionContext(input: {
    organizationId: string;
    bookingId: string;
  }): Promise<BookingAttributionContext | null>;

  /** Latest qualifying PICKUP handover proof within ±6h of trip window; null when none. */
  findPickupHandoverProofForTrip(input: {
    organizationId: string;
    bookingId: string;
    tripStart: Date;
    tripEnd: Date | null;
  }): Promise<BookingPickupHandoverProof | null>;

  /**
   * Tenant-scoped booking lookup for job validation.
   * Throws when booking is missing or foreign to the organization.
   */
  resolveBookingVehicleForOrganization(input: {
    organizationId: string;
    bookingId: string;
  }): Promise<{ vehicleId: string | null }>;
}
