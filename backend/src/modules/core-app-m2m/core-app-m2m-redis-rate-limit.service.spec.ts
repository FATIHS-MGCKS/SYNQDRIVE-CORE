import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { RedisService } from '@shared/redis/redis.service';
import { CoreAppM2mRedisRateLimitService } from './core-app-m2m-redis-rate-limit.service';

describe('CoreAppM2mRedisRateLimitService', () => {
  function createService(evalImpl: RedisService['eval']): CoreAppM2mRedisRateLimitService {
    const redis = { eval: evalImpl } as unknown as RedisService;
    return new CoreAppM2mRedisRateLimitService(redis);
  }

  it('allows when Lua script returns 1', async () => {
    const service = createService(jest.fn().mockResolvedValue(1));
    await expect(service.assertExchangeAllowed('10.0.0.1')).resolves.toBeUndefined();
  });

  it('throws 429 when Lua script returns 0', async () => {
    const service = createService(jest.fn().mockResolvedValue(0));
    await expect(service.assertExchangeAllowed('10.0.0.1')).rejects.toBeInstanceOf(HttpException);
  });

  it('fail-closed with 503 when Redis errors', async () => {
    const service = createService(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(service.assertExchangeAllowed('10.0.0.1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('isolates vehicle read limits by client, org, and operation class', async () => {
    const evalSpy = jest.fn().mockResolvedValue(1);
    const service = createService(evalSpy);
    await service.assertVehicleReadAllowed({
      clientId: 'client-a',
      organizationId: 'org-1',
      operation: 'list',
    });
    await service.assertVehicleReadAllowed({
      clientId: 'client-b',
      organizationId: 'org-1',
      operation: 'list',
    });
    const keys = evalSpy.mock.calls.map((c) => c[2] as string);
    expect(keys[0]).toContain('client-a');
    expect(keys[1]).toContain('client-b');
    expect(keys[0]).toContain(':list:');
    expect(keys[1]).toContain(':list:');
  });
});