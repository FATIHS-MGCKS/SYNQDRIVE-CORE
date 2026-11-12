import { Module, forwardRef } from '@nestjs/common';
import { RentalDrivingAnalysisCoreModule } from './rental-driving-analysis-core.module';
import { RentalDrivingAnalysisRecomputeJobHandler } from './rental-driving-analysis-recompute.handler';

/** Registers the rental recompute job handler without importing full RentalDrivingAnalysisModule. */
@Module({
  imports: [forwardRef(() => RentalDrivingAnalysisCoreModule)],
  providers: [RentalDrivingAnalysisRecomputeJobHandler],
  exports: [RentalDrivingAnalysisRecomputeJobHandler],
})
export class RentalDrivingAnalysisRecomputeHandlerModule {}
