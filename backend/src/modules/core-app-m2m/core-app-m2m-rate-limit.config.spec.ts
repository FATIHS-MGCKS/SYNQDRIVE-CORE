import {
  resolveCoreAppM2mExchangeRateLimitMax,
  resolveCoreAppM2mExchangeRateLimitWindowMs,
  resolveCoreAppM2mVehicleDetailRateLimitMax,
  resolveCoreAppM2mVehicleListRateLimitMax,
  resolveCoreAppM2mVehicleRateLimitWindowMs,
} from './core-app-m2m-rate-limit.config';

describe('core-app-m2m-rate-limit.config', () => {
  it('uses documented defaults when env unset', () => {
    expect(resolveCoreAppM2mExchangeRateLimitMax({} as NodeJS.ProcessEnv)).toBe(20);
    expect(resolveCoreAppM2mExchangeRateLimitWindowMs({} as NodeJS.ProcessEnv)).toBe(60_000);
    expect(resolveCoreAppM2mVehicleListRateLimitMax({} as NodeJS.ProcessEnv)).toBe(120);
    expect(resolveCoreAppM2mVehicleDetailRateLimitMax({} as NodeJS.ProcessEnv)).toBe(60);
    expect(resolveCoreAppM2mVehicleRateLimitWindowMs({} as NodeJS.ProcessEnv)).toBe(60_000);
  });

  it('rejects non-positive overrides', () => {
    const env = {
      CORE_APP_M2M_EXCHANGE_RATE_LIMIT_MAX: '0',
      CORE_APP_M2M_VEHICLE_READ_LIST_RATE_LIMIT_MAX: '-1',
    } as NodeJS.ProcessEnv;
    expect(resolveCoreAppM2mExchangeRateLimitMax(env)).toBe(20);
    expect(resolveCoreAppM2mVehicleListRateLimitMax(env)).toBe(120);
  });
});