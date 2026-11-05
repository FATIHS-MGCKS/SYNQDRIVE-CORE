import {
  ONEAUTO_OE_SERVICE_HISTORY_EU_RUNTIME_ENABLED_ENV,
  ONEAUTO_OE_SERVICE_SCHEDULE_EU_RUNTIME_ENABLED_ENV,
  isOneAutoSkuRuntimeExecutionEnabled,
} from './oneauto-sku-runtime-activation.util';
import { ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU } from './service-schedule/oneauto-service-schedule-eu.types';
import { ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU } from './service-history/oneauto-service-history-eu.types';

describe('OneAuto SKU runtime activation', () => {
  afterEach(() => {
    delete process.env[ONEAUTO_OE_SERVICE_HISTORY_EU_RUNTIME_ENABLED_ENV];
    delete process.env[ONEAUTO_OE_SERVICE_SCHEDULE_EU_RUNTIME_ENABLED_ENV];
  });

  it('defaults OE Service Schedule execution OFF', () => {
    expect(isOneAutoSkuRuntimeExecutionEnabled(ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU)).toBe(false);
  });

  it('defaults OE Service History execution OFF', () => {
    expect(isOneAutoSkuRuntimeExecutionEnabled(ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU)).toBe(false);
  });
});
