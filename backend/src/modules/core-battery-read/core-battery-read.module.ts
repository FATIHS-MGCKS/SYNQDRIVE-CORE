import { Module, forwardRef } from '@nestjs/common';
import { CanonicalBatteryHealthConsumerModule } from '@modules/vehicle-intelligence/battery-health/canonical-battery-health-consumer.module';
import { CoreVehicleReadModule } from '@modules/core-vehicle-read/core-vehicle-read.module';
import { PrismaModule } from '@shared/database/prisma.module';
import { CoreBatteryReadV1Controller } from './core-battery-read.v1.controller';
import { CoreBatteryReadV1Service } from './core-battery-read.v1.service';

/**
 * P3-PR4 read module: imports {@link CanonicalBatteryHealthConsumerModule} only
 * (not RentalHealth). Technical mapping lives in core-battery-read v1 mapper.
 */
@Module({
  imports: [PrismaModule, CoreVehicleReadModule, forwardRef(() => CanonicalBatteryHealthConsumerModule)],
  controllers: [CoreBatteryReadV1Controller],
  providers: [CoreBatteryReadV1Service],
  exports: [CoreBatteryReadV1Service],
})
export class CoreBatteryReadModule {}
