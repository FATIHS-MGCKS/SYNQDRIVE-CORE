import { Module } from '@nestjs/common';
import { CoreVehicleReadModule } from '@modules/core-vehicle-read/core-vehicle-read.module';
import { PrismaModule } from '@shared/database/prisma.module';
import { CoreTripReadV1Controller } from './core-trip-read.v1.controller';
import { CoreTripReadV1Service } from './core-trip-read.v1.service';

@Module({
  imports: [PrismaModule, CoreVehicleReadModule],
  controllers: [CoreTripReadV1Controller],
  providers: [CoreTripReadV1Service],
  exports: [CoreTripReadV1Service],
})
export class CoreTripReadModule {}
