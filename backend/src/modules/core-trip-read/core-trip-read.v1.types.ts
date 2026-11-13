import type { ProductSlug, TripStatus } from '@prisma/client';

/**
 * Contract `core.trip.read.v1` — technical trip reads scoped to a vehicle in an organization.
 *
 * Does NOT classify private vs. business journeys: `isPrivateTrip` is a booking/driver attribution
 * fallback, not a privacy signal, and does not affect visibility. Exposes only minimal technical
 * fields (no booking/customer/driver/GPS/provider data). Authorization: user JWT + ACTIVE org
 * membership + `fleet.read` + ACTIVE product license. Privacy/consent suitability for future app
 * consumers requires a separate gate; this contract does not authorize M2M or production activation.
 * Reconciled, absorbed CANCELLED gap-split suffixes are hidden (list, count, detail → 404), same as
 * the customer trip list; other CANCELLED trips remain readable.
 * `productSlug` echoes license check only — not product-specific trip assignment.
 */
export const CORE_TRIP_READ_CONTRACT_VERSION = 'core.trip.read.v1' as const;

export type CoreTripReadV1 = {
  version: typeof CORE_TRIP_READ_CONTRACT_VERSION;
  tripId: string;
  vehicleId: string;
  tripStatus: TripStatus;
  startTime: string;
  endTime: string | null;
  distanceKm: number | null;
};

export type CoreTripReadListV1 = {
  version: typeof CORE_TRIP_READ_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  productSlug: ProductSlug;
  trips: CoreTripReadV1[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export type CoreTripReadSingleV1 = {
  version: typeof CORE_TRIP_READ_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  productSlug: ProductSlug;
  trip: CoreTripReadV1;
};
