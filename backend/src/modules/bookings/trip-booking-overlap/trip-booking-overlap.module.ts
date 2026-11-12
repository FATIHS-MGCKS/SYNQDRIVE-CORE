import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { TRIP_BOOKING_OVERLAP_PORT } from '@modules/vehicle-intelligence/trips/ports/trip-booking-overlap.port';
import { TripBookingOverlapPrismaAdapter } from './trip-booking-overlap.adapter';

/**
 * Minimal rental adapter module for trip booking overlap — no VehicleIntelligence import.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    TripBookingOverlapPrismaAdapter,
    {
      provide: TRIP_BOOKING_OVERLAP_PORT,
      useExisting: TripBookingOverlapPrismaAdapter,
    },
  ],
  exports: [TRIP_BOOKING_OVERLAP_PORT],
})
export class TripBookingOverlapModule {}
