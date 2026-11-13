import { Module, forwardRef } from '@nestjs/common';
import { DtcConsumerModule } from '@modules/vehicle-intelligence/dtc/dtc-consumer.module';
import { CoreVehicleReadModule } from '@modules/core-vehicle-read/core-vehicle-read.module';
import { PrismaModule } from '@shared/database/prisma.module';
import { CoreDtcReadV1Controller } from './core-dtc-read.v1.controller';
import { CoreDtcReadV1Service } from './core-dtc-read.v1.service';

/**
 * P3-PR5 read module: imports {@link DtcConsumerModule} only (not RentalHealth).
 */
@Module({
  imports: [PrismaModule, CoreVehicleReadModule, forwardRef(() => DtcConsumerModule)],
  controllers: [CoreDtcReadV1Controller],
  providers: [CoreDtcReadV1Service],
  exports: [CoreDtcReadV1Service],
})
export class CoreDtcReadModule {}
