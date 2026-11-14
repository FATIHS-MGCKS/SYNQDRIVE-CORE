import { Module, forwardRef } from '@nestjs/common';
import { VehicleIntelligenceModule } from '../vehicle-intelligence.module';
import { TireHealthService } from './tire-health.service';
import { TIRE_HEALTH_CONSUMER_EXPORT } from './tire-health-consumer.tokens';

/**
 * Read-only import boundary for Core (and other) consumers of {@link TireHealthService}.
 * Does not register controllers; does not duplicate tire providers.
 */
@Module({
  imports: [forwardRef(() => VehicleIntelligenceModule)],
  providers: [
    {
      provide: TIRE_HEALTH_CONSUMER_EXPORT,
      useExisting: TireHealthService,
    },
  ],
  exports: [TIRE_HEALTH_CONSUMER_EXPORT],
})
export class TireHealthConsumerModule {}