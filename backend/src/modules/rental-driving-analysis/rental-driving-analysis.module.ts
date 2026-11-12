import { forwardRef, Module } from '@nestjs/common';
import { RentalDrivingAnalysisController } from './rental-driving-analysis.controller';
import { RentalDrivingAnalysisService } from './rental-driving-analysis.service';
import { RentalDrivingAnalysisRecomputeTriggerService } from './rental-driving-analysis-recompute.trigger';
import { RentalDrivingAnalysisRecomputeJobHandler } from './rental-driving-analysis-recompute.handler';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';
import { TRIP_RENTAL_RECOMPUTE_PORT } from '@modules/vehicle-intelligence/trips/ports/trip-rental-recompute.port';
import { tripRentalRecomputePortProviders } from './trip-rental-recompute/trip-rental-recompute.providers';

@Module({
  imports: [forwardRef(() => VehicleIntelligenceModule)],
  controllers: [RentalDrivingAnalysisController],
  providers: [
    RentalDrivingAnalysisService,
    RentalDrivingAnalysisRecomputeTriggerService,
    RentalDrivingAnalysisRecomputeJobHandler,
    ...tripRentalRecomputePortProviders,
  ],
  exports: [
    RentalDrivingAnalysisService,
    RentalDrivingAnalysisRecomputeTriggerService,
    RentalDrivingAnalysisRecomputeJobHandler,
    TRIP_RENTAL_RECOMPUTE_PORT,
  ],
})
export class RentalDrivingAnalysisModule {}
