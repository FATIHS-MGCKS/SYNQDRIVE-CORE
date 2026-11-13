import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { CoreVehicleReadProductGuard } from './core-vehicle-read.product.guard';
import { CoreVehicleReadV1Controller } from './core-vehicle-read.v1.controller';
import { CoreVehicleReadV1Service } from './core-vehicle-read.v1.service';

@Module({
  imports: [PrismaModule],
  controllers: [CoreVehicleReadV1Controller],
  providers: [CoreVehicleReadV1Service, CoreVehicleReadProductGuard],
  exports: [CoreVehicleReadV1Service],
})
export class CoreVehicleReadModule {}
