import IORedis from 'ioredis';
import { RedisService } from '@shared/redis/redis.service';
import { CoreAppM2mRedisRateLimitService } from './core-app-m2m-redis-rate-limit.service';
import { CORE_APP_M2M_RATE_LIMIT_PREFIX } from './core-app-m2m-rate-limit.redis-script';

const LIVE = process.env.CORE_APP_M2M_RATE_LIMIT_REDIS_INTEGRATION === '1';

function redisConnectionOptions() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number.parseInt(process.env.CORE_APP_M2M_RATE_LIMIT_REDIS_TEST_DB || '14', 10),
    maxRetriesPerRequest: null as null,
  };
}

async function probeRedis(): Promise<boolean> {
  const client = new IORedis({ ...redisConnectionOptions(), connectTimeout: 3_000, lazyConnect: true });
  try {
    await client.connect();
    const pong = await client.ping();
    await client.quit();
    return pong === 'PONG';
  } catch {
    try {
      await client.quit();
    } catch {
      /* ignore */
    }
    return false;
  }
}

function createReplica(): { service: CoreAppM2mRedisRateLimitService; redis: RedisService } {
  const redis = new RedisService(redisConnectionOptions());
  return { service: new CoreAppM2mRedisRateLimitService(redis), redis };
}

async function flushTestKeys(redis: RedisService): Promise<void> {
  const pattern = `${CORE_APP_M2M_RATE_LIMIT_PREFIX}:*`;
  const client = redis as unknown as IORedis;
  let cursor = '0';
  do {
    const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = next;
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } while (cursor !== '0');
}

const describeLive = LIVE ? describe : describe.skip;

describeLive('CoreAppM2mRedisRateLimitService — Redis integration', () => {
  let redisAvailable = false;
  let replicaA: CoreAppM2mRedisRateLimitService;
  let replicaB: CoreAppM2mRedisRateLimitService;
  let redisA: RedisService;

  beforeAll(async () => {
    redisAvailable = await probeRedis();
    if (!redisAvailable) return;
    const a = createReplica();
    const b = createReplica();
    replicaA = a.service;
    replicaB = b.service;
    redisA = a.redis;
    process.env.CORE_APP_M2M_EXCHANGE_RATE_LIMIT_MAX = '5';
    process.env.CORE_APP_M2M_EXCHANGE_RATE_LIMIT_WINDOW_MS = '60_000';
  });

  afterAll(async () => {
    if (redisA) {
      await flushTestKeys(redisA);
      await redisA.quit();
    }
  });

  beforeEach(async () => {
    if (!redisAvailable) return;
    await flushTestKeys(redisA);
  });

  it('shares exchange quota across two replicas', async () => {
    if (!redisAvailable) return;
    const ip = '203.0.113.50';
    for (let i = 0; i < 5; i += 1) {
      await replicaA.assertExchangeAllowed(ip);
    }
    await expect(replicaB.assertExchangeAllowed(ip)).rejects.toMatchObject({ status: 429 });
  });

  it('isolates organizations for vehicle list reads', async () => {
    if (!redisAvailable) return;
    process.env.CORE_APP_M2M_VEHICLE_READ_LIST_RATE_LIMIT_MAX = '2';
    await replicaA.assertVehicleReadAllowed({
      clientId: 'rental-app',
      organizationId: 'org-a',
      operation: 'list',
    });
    await replicaA.assertVehicleReadAllowed({
      clientId: 'rental-app',
      organizationId: 'org-a',
      operation: 'list',
    });
    await expect(
      replicaB.assertVehicleReadAllowed({
        clientId: 'rental-app',
        organizationId: 'org-a',
        operation: 'list',
      }),
    ).rejects.toMatchObject({ status: 429 });

    await expect(
      replicaB.assertVehicleReadAllowed({
        clientId: 'rental-app',
        organizationId: 'org-b',
        operation: 'list',
      }),
    ).resolves.toBeUndefined();
  });

  it('returns 503 when Redis is unavailable (fail-closed)', async () => {
    const broken = {
      eval: jest.fn().mockRejectedValue(new Error('connection lost')),
    } as unknown as RedisService;
    const service = new CoreAppM2mRedisRateLimitService(broken);
    await expect(service.assertExchangeAllowed('10.0.0.2')).rejects.toMatchObject({ status: 503 });
  });
});