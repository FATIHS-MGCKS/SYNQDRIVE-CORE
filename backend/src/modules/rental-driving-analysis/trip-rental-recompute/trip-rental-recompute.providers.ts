import { TRIP_RENTAL_RECOMPUTE_PORT } from '@modules/vehicle-intelligence/trips/ports/trip-rental-recompute.port';
import { TripRentalRecomputePortAdapter } from './trip-rental-recompute.adapter';

/** Canonical port wiring — imported by RentalDrivingAnalysisModule and scoped DI harness. */
export const tripRentalRecomputePortProviders = [
  TripRentalRecomputePortAdapter,
  {
    provide: TRIP_RENTAL_RECOMPUTE_PORT,
    useExisting: TripRentalRecomputePortAdapter,
  },
] as const;
