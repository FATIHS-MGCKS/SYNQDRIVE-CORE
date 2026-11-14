import { HttpException } from '@nestjs/common';
import { CoreAppM2mExchangeRateLimitService } from './core-app-m2m-exchange-rate-limit.service';
import { CoreAppM2mRedisRateLimitService } from './core-app-m2m-redis-rate-limit.service';

describe('CoreAppM2mExchangeRateLimitService', () => {
  it('delegates to distributed service with trusted IP key', async () => {
    const distributed = {
      assertExchangeAllowed: jest
        .fn()
        .mockImplementationOnce(async () => undefined)
        .mockImplementationOnce(async () => {
          throw new HttpException('Too many requests', 429);
        }),
    } as unknown as CoreAppM2mRedisRateLimitService;
    const service = new CoreAppM2mExchangeRateLimitService(distributed);

    await expect(service.assertAllowed('10.0.0.1')).resolves.toBeUndefined();
    await expect(service.assertAllowed('10.0.0.1')).rejects.toBeInstanceOf(HttpException);
    expect(distributed.assertExchangeAllowed).toHaveBeenCalledWith('10.0.0.1');
  });
});