import { resolveCoreEntitlementsM2mProductionReady } from './entitlements-query.types';

describe('resolveCoreEntitlementsM2mProductionReady', () => {
  it('is false when M2M is disabled (default)', () => {
    expect(
      resolveCoreEntitlementsM2mProductionReady({
        CORE_APP_M2M_ENABLED: 'false',
        CORE_APP_M2M_PRODUCTION_READY: 'true',
      }),
    ).toBe(false);
  });

  it('stays false when only CORE_APP_M2M_ENABLED is true', () => {
    expect(
      resolveCoreEntitlementsM2mProductionReady({
        CORE_APP_M2M_ENABLED: 'true',
        CORE_APP_M2M_PRODUCTION_READY: 'false',
      }),
    ).toBe(false);
    expect(
      resolveCoreEntitlementsM2mProductionReady({
        CORE_APP_M2M_ENABLED: 'true',
      }),
    ).toBe(false);
  });

  it('is true only when both enabled and production-ready flags are set', () => {
    expect(
      resolveCoreEntitlementsM2mProductionReady({
        CORE_APP_M2M_ENABLED: 'true',
        CORE_APP_M2M_PRODUCTION_READY: 'true',
      }),
    ).toBe(true);
  });
});
