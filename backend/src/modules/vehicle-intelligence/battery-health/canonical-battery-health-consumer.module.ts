import { Module, forwardRef } from '@nestjs/common';
import { VehicleIntelligenceModule } from '../vehicle-intelligence.module';

/**
 * Narrow read-only import boundary for consumers that need
 * {@link CanonicalBatteryHealthService} without living inside VehicleIntelligenceModule.
 * Registers no controllers; does not duplicate battery providers.
 */
@Module({
  imports: [forwardRef(() => VehicleIntelligenceModule)],
})
export class CanonicalBatteryHealthConsumerModule {}
