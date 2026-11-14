import { Module, forwardRef } from '@nestjs/common';
import { VehicleIntelligenceModule } from '../vehicle-intelligence.module';
import { BrakeHealthService } from './brake-health.service';
import { BRAKE_HEALTH_CONSUMER_EXPORT } from './brake-health-consumer.tokens';

/**
 * Read-only import boundary for Core (and other) consumers of {@link BrakeHealthService}.
 * Does not register controllers; does not duplicate brake providers.
 */
@Module({
  imports: [forwardRef(() => VehicleIntelligenceModule)],
  providers: [
    {
      provide: BRAKE_HEALTH_CONSUMER_EXPORT,
      useExisting: BrakeHealthService,
    },
  ],
  exports: [BRAKE_HEALTH_CONSUMER_EXPORT],
})
export class BrakeHealthConsumerModule {}