import { Module, forwardRef } from '@nestjs/common';
import { VehicleIntelligenceModule } from '../vehicle-intelligence.module';
import { CanonicalBatteryHealthService } from './canonical-battery-health.service';
import { CANONICAL_BATTERY_HEALTH_CONSUMER_EXPORT } from './canonical-battery-health-consumer.tokens';

/**
 * Narrow read-only import boundary for consumers that need
 * {@link CanonicalBatteryHealthService} without living inside VehicleIntelligenceModule.
 * Registers no controllers; does not duplicate battery providers.
 */
@Module({
  imports: [forwardRef(() => VehicleIntelligenceModule)],
  providers: [
    {
      provide: CANONICAL_BATTERY_HEALTH_CONSUMER_EXPORT,
      useExisting: CanonicalBatteryHealthService,
    },
  ],
  exports: [CANONICAL_BATTERY_HEALTH_CONSUMER_EXPORT],
})
export class CanonicalBatteryHealthConsumerModule {}
