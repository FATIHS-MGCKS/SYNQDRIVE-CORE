import { Injectable } from '@nestjs/common';
import { CoreAppM2mRedisRateLimitService } from './core-app-m2m-redis-rate-limit.service';

/**
 * Token exchange rate limit facade (distributed Redis — P3-PR11C).
 */
@Injectable()
export class CoreAppM2mExchangeRateLimitService {
  constructor(private readonly distributed: CoreAppM2mRedisRateLimitService) {}

  async assertAllowed(trustedIpKey: string): Promise<void> {
    await this.distributed.assertExchangeAllowed(trustedIpKey);
  }
}