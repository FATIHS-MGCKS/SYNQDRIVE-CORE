import { forwardRef, Module } from '@nestjs/common';
import { RentalDrivingAnalysisController } from './rental-driving-analysis.controller';
import { RentalDrivingAnalysisService } from './rental-driving-analysis.service';
import { RentalDrivingAnalysisRecomputeTriggerService } from './rental-driving-analysis-recompute.trigger';
import { RentalDrivingAnalysisRecomputeJobHandler } from './rental-driving-analysis-recompute.handler';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';
import { TRIP_RENTAL_RECOMPUTE_PORT } from '@modules/vehicle-intelligence/trips/ports/trip-rental-recompute.port';
import { tripRentalRecomputePortProviders } from './trip-rental-recompute/trip-rental-recompute.providers';
import { RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT } from '@modules/vehicle-intelligence/driving-analysis-reconciliation/ports/rental-driving-analysis-reconciliation.port';
import { rentalDrivingAnalysisReconciliationPortProviders } from './reconciliation/rental-driving-analysis-reconciliation.providers';
import { RENTAL_DRIVING_ANALYSIS_RECOMPUTE_JOB_HANDLER_PORT } from '@modules/vehicle-intelligence/driving-intelligence-jobs/ports/rental-driving-analysis-recompute-job-handler.port';
import { rentalDrivingAnalysisRecomputeJobHandlerPortProviders } from './rental-driving-analysis-recompute-job-handler.providers';

@Module({
  imports: [forwardRef(() => VehicleIntelligenceModule)],
  controllers: [RentalDrivingAnalysisController],
  providers: [
    RentalDrivingAnalysisService,
    RentalDrivingAnalysisRecomputeTriggerService,
    RentalDrivingAnalysisRecomputeJobHandler,
    ...tripRentalRecomputePortProviders,
    ...rentalDrivingAnalysisReconciliationPortProviders,
    ...rentalDrivingAnalysisRecomputeJobHandlerPortProviders,
  ],
  exports: [
    RentalDrivingAnalysisService,
    RentalDrivingAnalysisRecomputeTriggerService,
    RentalDrivingAnalysisRecomputeJobHandler,
    TRIP_RENTAL_RECOMPUTE_PORT,
    RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT,
    RENTAL_DRIVING_ANALYSIS_RECOMPUTE_JOB_HANDLER_PORT,
  ],
})
export class RentalDrivingAnalysisModule {}
