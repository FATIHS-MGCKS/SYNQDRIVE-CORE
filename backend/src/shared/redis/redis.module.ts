import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import redisConfig from '@config/redis.config';
import { RedisService } from './redis.service';
import { RedisDistributedLockService } from './redis-distributed-lock.service';

@Global()
@Module({
  imports: [ConfigModule.forFeature(redisConfig)],
  providers: [RedisService, RedisDistributedLockService],
  exports: [RedisService, RedisDistributedLockService],
})
export class RedisModule {}
