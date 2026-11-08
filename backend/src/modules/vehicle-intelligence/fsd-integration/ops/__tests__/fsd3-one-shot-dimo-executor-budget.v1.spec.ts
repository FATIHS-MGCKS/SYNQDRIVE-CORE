import { DimoProviderBudgetError } from '@modules/dimo/provider-budget/dimo-http-error.util';
import { DimoProviderBudgetService } from '@modules/dimo/provider-budget/dimo-provider-budget.service';
import { DimoRequestExecutor } from '@modules/dimo/provider-budget/dimo-request-executor.service';

describe('FSD3 P6B DIMO executor budget (mocked network)', () => {
  it('rejects third provider dispatch before execute callback runs', async () => {
    const acquire = jest
      .fn()
      .mockResolvedValueOnce({ token: 'a', category: 'ADMIN', acquiredAt: Date.now() })
      .mockResolvedValueOnce({ token: 'b', category: 'ADMIN', acquiredAt: Date.now() })
      .mockRejectedValueOnce(new DimoProviderBudgetError('cap', 'ACQUIRE_TIMEOUT', 'ADMIN'));
  const release = jest.fn();
  const budget = {
    isEnabled: () => true,
    getConfig: () => ({ globalMaxRetries: 0, globalRetryAfterMaxMs: 60_000 }),
    getMetrics: () => ({
      requestsTotal: { inc: jest.fn() },
      requestDurationSeconds: { observe: jest.fn() },
      rateLimitedTotal: { inc: jest.fn() },
      retryAfterSeconds: { observe: jest.fn() },
    }),
    acquirePermit: acquire,
    releasePermit: release,
    record429: jest.fn(),
  } as unknown as DimoProviderBudgetService;

    const executor = new DimoRequestExecutor(budget);
    const network = jest.fn().mockResolvedValue({ ok: true });
    await executor.execute({ category: 'ADMIN', execute: network });
    await executor.execute({ category: 'ADMIN', execute: network });
    await expect(executor.execute({ category: 'ADMIN', execute: network })).rejects.toBeInstanceOf(
      DimoProviderBudgetError,
    );
    expect(network).toHaveBeenCalledTimes(2);
  });
});
