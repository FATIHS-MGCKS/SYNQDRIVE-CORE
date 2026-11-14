import { Module } from '@nestjs/common';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { VehicleProductGrantAdminController } from './vehicle-product-grant.admin.controller';
import { VehicleProductGrantService } from './vehicle-product-grant.service';

@Module({
  imports: [ActivityLogModule],
  controllers: [VehicleProductGrantAdminController],
  providers: [VehicleProductGrantService],
  exports: [VehicleProductGrantService],
})
export class VehicleProductGrantModule {}