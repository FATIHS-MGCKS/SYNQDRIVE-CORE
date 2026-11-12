import { forwardRef, Module } from '@nestjs/common';
import { RentalDrivingAnalysisController } from './rental-driving-analysis.controller';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';
import { RentalDrivingAnalysisCoreModule } from './rental-driving-analysis-core.module';
import { TripRentalRecomputeModule } from './trip-rental-recompute/trip-rental-recompute.module';
import { RentalDrivingAnalysisRecomputeHandlerModule } from './rental-driving-analysis-recompute-handler.module';

@Module({
  imports: [
    forwardRef(() => VehicleIntelligenceModule),
    RentalDrivingAnalysisCoreModule,
    TripRentalRecomputeModule,
    RentalDrivingAnalysisRecomputeHandlerModule,
  ],
  controllers: [RentalDrivingAnalysisController],
  exports: [
    RentalDrivingAnalysisCoreModule,
    TripRentalRecomputeModule,
    RentalDrivingAnalysisRecomputeHandlerModule,
  ],
})
export class RentalDrivingAnalysisModule {}
