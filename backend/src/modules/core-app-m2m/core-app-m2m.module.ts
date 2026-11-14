import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { RedisModule } from '@shared/redis/redis.module';
import { CoreAppM2mAdminController } from './core-app-m2m-admin.controller';
import { CoreAppM2mExchangeController } from './core-app-m2m-exchange.controller';
import { CoreAppM2mClientService } from './core-app-m2m-client.service';
import { CoreAppM2mTokenService } from './core-app-m2m-token.service';
import { CoreAppEntitlementsAuthGuard } from './core-app-entitlements-auth.guard';
import { CoreAppM2mExchangeRateLimitService } from './core-app-m2m-exchange-rate-limit.service';
import { CoreAppM2mRedisRateLimitService } from './core-app-m2m-redis-rate-limit.service';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [CoreAppM2mExchangeController, CoreAppM2mAdminController],
  providers: [
    CoreAppM2mClientService,
    CoreAppM2mTokenService,
    CoreAppEntitlementsAuthGuard,
    CoreAppM2mExchangeRateLimitService,
    CoreAppM2mRedisRateLimitService,
  ],
  exports: [
    CoreAppM2mTokenService,
    CoreAppEntitlementsAuthGuard,
    CoreAppM2mClientService,
    CoreAppM2mRedisRateLimitService,
  ],
})
export class CoreAppM2mModule {}
