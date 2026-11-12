import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { CoreAppM2mAdminController } from './core-app-m2m-admin.controller';
import { CoreAppM2mExchangeController } from './core-app-m2m-exchange.controller';
import { CoreAppM2mClientService } from './core-app-m2m-client.service';
import { CoreAppM2mTokenService } from './core-app-m2m-token.service';
import { CoreAppEntitlementsAuthGuard } from './core-app-entitlements-auth.guard';
import { CoreAppM2mExchangeRateLimitService } from './core-app-m2m-exchange-rate-limit.service';

@Module({
  imports: [PrismaModule],
  controllers: [CoreAppM2mExchangeController, CoreAppM2mAdminController],
  providers: [
    CoreAppM2mClientService,
    CoreAppM2mTokenService,
    CoreAppEntitlementsAuthGuard,
    CoreAppM2mExchangeRateLimitService,
  ],
  exports: [CoreAppM2mTokenService, CoreAppEntitlementsAuthGuard, CoreAppM2mClientService],
})
export class CoreAppM2mModule {}
