import type { ProductSlug, TripStatus } from '@prisma/client';

/**
 * Contract `core.trip.read.v1` — technical trip reads scoped to a vehicle in an organization.
 *
 * Excludes `isPrivateTrip=true` rows (fail-closed as not found). No booking/customer/GPS fields.
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
