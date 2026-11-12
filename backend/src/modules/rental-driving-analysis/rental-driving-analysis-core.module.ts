import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';
import { RentalDrivingAnalysisService } from './rental-driving-analysis.service';

/**
 * Rental driving analysis computation — imports Core trip/DTc services via VehicleIntelligenceModule only.
 */
@Module({
  imports: [PrismaModule, forwardRef(() => VehicleIntelligenceModule)],
  providers: [RentalDrivingAnalysisService],
  exports: [RentalDrivingAnalysisService],
})
export class RentalDrivingAnalysisCoreModule {}
