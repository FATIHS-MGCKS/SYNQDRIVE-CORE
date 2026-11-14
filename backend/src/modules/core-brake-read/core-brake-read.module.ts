import { Module, forwardRef } from '@nestjs/common';
import { BrakeHealthConsumerModule } from '@modules/vehicle-intelligence/brakes/brake-health-consumer.module';
import { CoreVehicleReadModule } from '@modules/core-vehicle-read/core-vehicle-read.module';
import { PrismaModule } from '@shared/database/prisma.module';
import { CoreBrakeReadV1Controller } from './core-brake-read.v1.controller';
import { CoreBrakeReadV1Service } from './core-brake-read.v1.service';

/**
 * P3-PR8 read module: imports {@link BrakeHealthConsumerModule} only (not RentalHealth).
 */
@Module({
  imports: [PrismaModule, CoreVehicleReadModule, forwardRef(() => BrakeHealthConsumerModule)],
  controllers: [CoreBrakeReadV1Controller],
  providers: [CoreBrakeReadV1Service],
  exports: [CoreBrakeReadV1Service],
})
export class CoreBrakeReadModule {}