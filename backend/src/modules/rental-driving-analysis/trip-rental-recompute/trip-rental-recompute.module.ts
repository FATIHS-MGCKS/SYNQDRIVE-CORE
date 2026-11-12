import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { TRIP_RENTAL_RECOMPUTE_PORT } from '@modules/vehicle-intelligence/trips/ports/trip-rental-recompute.port';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { RentalDrivingAnalysisRecomputeTriggerService } from '../rental-driving-analysis-recompute.trigger';
import { tripRentalRecomputePortProviders } from './trip-rental-recompute.providers';

/**
 * Minimal rental adapter for trip rental recompute port — no RentalDrivingAnalysisModule import.
 */
@Module({
  imports: [PrismaModule, forwardRef(() => VehicleIntelligenceModule)],
  providers: [RentalDrivingAnalysisRecomputeTriggerService, ...tripRentalRecomputePortProviders],
  exports: [TRIP_RENTAL_RECOMPUTE_PORT, RentalDrivingAnalysisRecomputeTriggerService],
})
export class TripRentalRecomputeModule {}
