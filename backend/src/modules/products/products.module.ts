import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { CoreEntitlementsReadController } from './entitlements/core-entitlements-read.controller';
import { EntitlementsQueryService } from './entitlements/entitlements-query.service';
import { CoreAppM2mModule } from '@modules/core-app-m2m/core-app-m2m.module';

@Module({
  imports: [CoreAppM2mModule],
  controllers: [ProductsController, CoreEntitlementsReadController],
  providers: [ProductsService, EntitlementsQueryService],
  exports: [ProductsService, EntitlementsQueryService],
})
export class ProductsModule {}
