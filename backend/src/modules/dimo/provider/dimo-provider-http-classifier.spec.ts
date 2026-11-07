import { DimoRateLimitedError } from '../provider-budget/dimo-http-error.util';
import { classifyDimoProviderHttpError } from './dimo-provider-http-classifier';

describe('dimo-provider-http-classifier', () => {
  it('classifies 403 distinctly', () => {
    const err = Object.assign(new Error('forbidden'), { response: { status: 403 } });
    expect(classifyDimoProviderHttpError(err).statusClass).toBe('forbidden');
  });

  it('parses Retry-After on 429', () => {
    const err = Object.assign(new Error('rate limited'), {
      response: { status: 429, headers: { 'retry-after': '3' } },
    });
    const obs = classifyDimoProviderHttpError(err);
    expect(obs.statusClass).toBe('rate_limited');
    expect(obs.retryAfterSeconds).toBe(3);
  });

  it('classifies timeout via ECONNABORTED', () => {
    const err = Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
    expect(classifyDimoProviderHttpError(err).statusClass).toBe('timeout');
  });

  it('classifies DimoRateLimitedError for gateway metrics', () => {
    const err = new DimoRateLimitedError('rl', 2000, 'ADMIN');
    const obs = classifyDimoProviderHttpError(err);
    expect(obs.statusClass).toBe('rate_limited');
    expect(obs.httpStatus).toBe(429);
    expect(obs.retryAfterSeconds).toBe(2);
  });
});
