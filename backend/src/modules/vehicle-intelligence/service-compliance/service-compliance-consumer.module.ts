import { Module, forwardRef } from '@nestjs/common';
import { VehicleIntelligenceModule } from '../vehicle-intelligence.module';
import { ServiceComplianceService } from './service-compliance.service';
import { SERVICE_COMPLIANCE_CONSUMER_EXPORT } from './service-compliance-consumer.tokens';

/**
 * Read-only import boundary for Core consumers of {@link ServiceComplianceService}.
 */
@Module({
  imports: [forwardRef(() => VehicleIntelligenceModule)],
  providers: [
    {
      provide: SERVICE_COMPLIANCE_CONSUMER_EXPORT,
      useExisting: ServiceComplianceService,
    },
  ],
  exports: [SERVICE_COMPLIANCE_CONSUMER_EXPORT],
})
export class ServiceComplianceConsumerModule {}
