import { Module, forwardRef } from '@nestjs/common';
import { TireHealthConsumerModule } from '@modules/vehicle-intelligence/tires/tire-health-consumer.module';
import { HighMobilityModule } from '@modules/high-mobility/high-mobility.module';
import { CoreVehicleReadModule } from '@modules/core-vehicle-read/core-vehicle-read.module';
import { PrismaModule } from '@shared/database/prisma.module';
import { CoreTireReadV1Controller } from './core-tire-read.v1.controller';
import { CoreTireReadV1Service } from './core-tire-read.v1.service';

/**
 * P3-PR7 read module: imports {@link TireHealthConsumerModule} only (not RentalHealth).
 */
@Module({
  imports: [
    PrismaModule,
    CoreVehicleReadModule,
    HighMobilityModule,
    forwardRef(() => TireHealthConsumerModule),
  ],
  controllers: [CoreTireReadV1Controller],
  providers: [CoreTireReadV1Service],
  exports: [CoreTireReadV1Service],
})
export class CoreTireReadModule {}