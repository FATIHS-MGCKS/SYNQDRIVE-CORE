import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RedisService } from '@shared/redis/redis.service';
import {
  resolveCoreAppM2mExchangeRateLimitMax,
  resolveCoreAppM2mExchangeRateLimitWindowMs,
  resolveCoreAppM2mVehicleDetailRateLimitMax,
  resolveCoreAppM2mVehicleListRateLimitMax,
  resolveCoreAppM2mVehicleRateLimitWindowMs,
} from './core-app-m2m-rate-limit.config';
import {
  CORE_APP_M2M_FIXED_WINDOW_SCRIPT,
  coreAppM2mExchangeRateLimitKey,
  coreAppM2mVehicleReadRateLimitKey,
  rateLimitWindowBucket,
} from './core-app-m2m-rate-limit.redis-script';

export type CoreAppM2mVehicleReadOperation = 'list' | 'detail';

/**
 * Distributed Redis rate limits for Core App M2M (exchange + vehicle read).
 * Fail-closed when Redis is unavailable — no in-memory fallback.
 */
@Injectable()
export class CoreAppM2mRedisRateLimitService {
  private readonly logger = new Logger(CoreAppM2mRedisRateLimitService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Token exchange: trusted server IP only (req.ip / socket — not raw X-Forwarded-For).
   */
  async assertExchangeAllowed(trustedIpKey: string): Promise<void> {
    const windowMs = resolveCoreAppM2mExchangeRateLimitWindowMs();
    const max = resolveCoreAppM2mExchangeRateLimitMax();
    const bucket = rateLimitWindowBucket(Date.now(), windowMs);
    const key = coreAppM2mExchangeRateLimitKey(trustedIpKey || 'unknown', bucket);
    await this.consumeFixedWindow(key, max, windowMs, 'exchange');
  }

  /**
   * Vehicle read: server-verified M2M principal dimensions only.
   */
  async assertVehicleReadAllowed(input: {
    clientId: string;
    organizationId: string;
    operation: CoreAppM2mVehicleReadOperation;
  }): Promise<void> {
    const windowMs = resolveCoreAppM2mVehicleRateLimitWindowMs();
    const max =
      input.operation === 'list'
        ? resolveCoreAppM2mVehicleListRateLimitMax()
        : resolveCoreAppM2mVehicleDetailRateLimitMax();
    const bucket = rateLimitWindowBucket(Date.now(), windowMs);
    const key = coreAppM2mVehicleReadRateLimitKey(
      input.clientId,
      input.organizationId,
      input.operation,
      bucket,
    );
    await this.consumeFixedWindow(key, max, windowMs, `vehicle_${input.operation}`);
  }

  private async consumeFixedWindow(
    key: string,
    max: number,
    windowMs: number,
    label: string,
  ): Promise<void> {
    const ttlMs = windowMs + 5_000;
    try {
      const allowed = await this.redis.eval(
        CORE_APP_M2M_FIXED_WINDOW_SCRIPT,
        1,
        key,
        String(ttlMs),
        String(max),
      );
      if (Number(allowed) === 0) {
        throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Core App M2M rate limit unavailable (${label}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new ServiceUnavailableException('Rate limit service unavailable');
    }
  }
}