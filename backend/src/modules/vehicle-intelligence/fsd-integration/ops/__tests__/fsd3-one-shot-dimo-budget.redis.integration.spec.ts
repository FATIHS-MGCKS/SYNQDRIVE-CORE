import { Registry } from 'prom-client';
import IORedis from 'ioredis';
import { RedisService } from '@shared/redis/redis.service';
import { DimoProviderBudgetService } from '@modules/dimo/provider-budget/dimo-provider-budget.service';
import {
  validateDimoProviderBudgetConfig,
  type DimoProviderBudgetConfigShape,
} from '@modules/dimo/provider-budget/dimo-provider-budget.config';
import { DimoProviderBudgetError } from '@modules/dimo/provider-budget/dimo-http-error.util';
import { DIMO_BUDGET_LEASES_KEY } from '@modules/dimo/provider-budget/dimo-provider-budget.redis';

const LIVE = process.env.DIMO_PROVIDER_BUDGET_REDIS_INTEGRATION === '1';

function redisConnectionOptions() {
  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number.parseInt(process.env.REDIS_DB || '15', 10),
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

function certConfig(): DimoProviderBudgetConfigShape {
  const config: DimoProviderBudgetConfigShape = {
    globalBudgetEnabled: true,
    globalMaxInFlight: 2,
    globalAcquireTimeoutMs: 500,
    globalLeaseMs: 5_000,
    globalRetryAfterMaxMs: 60_000,
    globalMaxRetries: 0,
    reservedHighPrioritySlots: 0,
    starvationPromotionMs: 60_000,
    providerCooldown429Threshold: 2,
    providerCooldownMs: 800,
    acquirePollIntervalMs: 10,
  };
  const errors = validateDimoProviderBudgetConfig(config);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
  return config;
}

(LIVE ? describe : describe.skip)('FSD3 P6B DimoProviderBudgetService (real Redis)', () => {
  jest.setTimeout(60_000);

  let budget: DimoProviderBudgetService;
  let redis: RedisService;

  beforeAll(async () => {
    if (!(await probeRedis())) {
      throw new Error('Redis not available for DIMO budget integration');
    }
    const config = certConfig();
    redis = new RedisService(redisConnectionOptions());
    budget = new DimoProviderBudgetService(config, redis, { registry: new Registry() } as never);
    budget.onModuleInit();
    await redis.del(DIMO_BUDGET_LEASES_KEY);
  });

  afterAll(async () => {
    await redis?.del(DIMO_BUDGET_LEASES_KEY);
    await redis?.quit();
  });

  it('rejects third in-flight permit via real budget service', async () => {
    const held = [
      await budget.acquirePermit({ category: 'ADMIN', priority: 'HIGH' }),
      await budget.acquirePermit({ category: 'ADMIN', priority: 'HIGH' }),
    ];
    await expect(
      budget.acquirePermit({ category: 'ADMIN', priority: 'HIGH', acquireTimeoutMs: 200 }),
    ).rejects.toBeInstanceOf(DimoProviderBudgetError);
    for (const permit of held) {
      await budget.releasePermit(permit);
    }
  });
});
