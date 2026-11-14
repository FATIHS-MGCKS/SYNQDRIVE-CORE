import { Module } from '@nestjs/common';
import { CoreAppM2mModule } from '@modules/core-app-m2m/core-app-m2m.module';
import { ProductVehicleAccessModule } from '@modules/products/product-vehicle-access/product-vehicle-access.module';
import { PrismaModule } from '@shared/database/prisma.module';
import { CoreAppVehicleReadAuthGuard } from './core-app-vehicle-read-auth.guard';
import { CoreAppVehicleReadV1Controller } from './core-app-vehicle-read.v1.controller';
import { CoreAppVehicleReadV1Service } from './core-app-vehicle-read.v1.service';

@Module({
  imports: [PrismaModule, CoreAppM2mModule, ProductVehicleAccessModule],
  controllers: [CoreAppVehicleReadV1Controller],
  providers: [CoreAppVehicleReadV1Service, CoreAppVehicleReadAuthGuard],
})
export class CoreAppVehicleReadModule {}