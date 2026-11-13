import { Module, forwardRef } from '@nestjs/common';
import { VehicleIntelligenceModule } from '../vehicle-intelligence.module';
import { DtcService } from './dtc.service';
import { DTC_CONSUMER_EXPORT } from './dtc-consumer.tokens';

/**
 * Read-only import boundary for Core (and other) consumers of {@link DtcService}.
 * Does not register controllers; does not duplicate DTC providers.
 */
@Module({
  imports: [forwardRef(() => VehicleIntelligenceModule)],
  providers: [
    {
      provide: DTC_CONSUMER_EXPORT,
      useExisting: DtcService,
    },
  ],
  exports: [DTC_CONSUMER_EXPORT],
})
export class DtcConsumerModule {}
