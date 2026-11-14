import { Module } from '@nestjs/common';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { CoreEntitlementsReadController } from './entitlements/core-entitlements-read.controller';
import { EntitlementsQueryService } from './entitlements/entitlements-query.service';
import { CoreAppM2mModule } from '@modules/core-app-m2m/core-app-m2m.module';
import { VehicleProductGrantModule } from './vehicle-product-grants/vehicle-product-grant.module';
import { ProductVehicleAccessModule } from './product-vehicle-access/product-vehicle-access.module';

@Module({
  imports: [ActivityLogModule, CoreAppM2mModule, VehicleProductGrantModule, ProductVehicleAccessModule],
  controllers: [ProductsController, CoreEntitlementsReadController],
  providers: [ProductsService, EntitlementsQueryService],
  exports: [ProductsService, EntitlementsQueryService, VehicleProductGrantModule, ProductVehicleAccessModule],
})
export class ProductsModule {}
