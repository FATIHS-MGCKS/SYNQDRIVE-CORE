import { Module } from '@nestjs/common';
import { ProductVehicleAccessService } from './product-vehicle-access.service';

@Module({
  providers: [ProductVehicleAccessService],
  exports: [ProductVehicleAccessService],
})
export class ProductVehicleAccessModule {}