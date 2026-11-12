import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { CoreEntitlementsReadController } from './entitlements/core-entitlements-read.controller';
import { EntitlementsQueryService } from './entitlements/entitlements-query.service';

@Module({
  controllers: [ProductsController, CoreEntitlementsReadController],
  providers: [ProductsService, EntitlementsQueryService],
  exports: [ProductsService, EntitlementsQueryService],
})
export class ProductsModule {}
