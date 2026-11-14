import { Module, forwardRef } from '@nestjs/common';
import { ServiceComplianceConsumerModule } from '@modules/vehicle-intelligence/service-compliance/service-compliance-consumer.module';
import { CoreVehicleReadModule } from '@modules/core-vehicle-read/core-vehicle-read.module';
import { PrismaModule } from '@shared/database/prisma.module';
import { CoreServiceIntelligenceReadV1Controller } from './core-service-intelligence-read.v1.controller';
import { CoreServiceIntelligenceReadV1Service } from './core-service-intelligence-read.v1.service';

/**
 * P3-PR6 read module: imports {@link ServiceComplianceConsumerModule} only (not RentalHealth).
 */
@Module({
  imports: [
    PrismaModule,
    CoreVehicleReadModule,
    forwardRef(() => ServiceComplianceConsumerModule),
  ],
  controllers: [CoreServiceIntelligenceReadV1Controller],
  providers: [CoreServiceIntelligenceReadV1Service],
  exports: [CoreServiceIntelligenceReadV1Service],
})
export class CoreServiceIntelligenceReadModule {}
