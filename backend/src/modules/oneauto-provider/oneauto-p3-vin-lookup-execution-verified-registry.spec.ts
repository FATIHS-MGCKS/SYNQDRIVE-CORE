import {
  buildExecutionVerifiedOeVinLookupEu,
  buildExecutionVerifiedOeVinLookupEuFullDataCallback,
  buildExecutionVerifiedOeServiceHistoryEuFullDataCallback,
  buildExecutionVerifiedOeServiceScheduleEuFullDataCallback,
  ONEAUTO_E1_SERVICE_HISTORY_EU_PRICING_SOURCE_VERSION,
  ONEAUTO_OE_SERVICE_SCHEDULE_EU_PRICING_SOURCE_VERSION,
  ONEAUTO_EXECUTION_VERIFIED_SKUS_READONLY,
  ONEAUTO_P4_VIN_LOOKUP_EU_PRICING_SOURCE_VERSION,
  seedOneAutoExecutionVerifiedRegistry,
} from './catalog/oneauto-execution-verified-registry';
import {
  ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS,
  buildOneAutoContractGateReport,
} from './catalog/oneauto-verified-contracts';
import {
  ONEAUTO_SERVICE_CATALOG,
  resolveCatalogEntryForRuntime,
} from './catalog/oneauto-service-catalog';
import { isOneAutoPathAllowlisted } from './client/oneauto-allowlist';

describe('OneAuto execution-verified registry (VIN lookup + E1 service history + OE service schedule)', () => {
  const prevHistoryRuntime = process.env.ONEAUTO_SKU_OE_SERVICE_HISTORY_EU_RUNTIME_ENABLED;
  const prevScheduleRuntime = process.env.ONEAUTO_SKU_OE_SERVICE_SCHEDULE_RUNTIME_ENABLED;

  afterEach(() => {
    if (prevHistoryRuntime === undefined) {
      delete process.env.ONEAUTO_SKU_OE_SERVICE_HISTORY_EU_RUNTIME_ENABLED;
    } else {
      process.env.ONEAUTO_SKU_OE_SERVICE_HISTORY_EU_RUNTIME_ENABLED = prevHistoryRuntime;
    }
    if (prevScheduleRuntime === undefined) {
      delete process.env.ONEAUTO_SKU_OE_SERVICE_SCHEDULE_RUNTIME_ENABLED;
    } else {
      process.env.ONEAUTO_SKU_OE_SERVICE_SCHEDULE_RUNTIME_ENABLED = prevScheduleRuntime;
    }
    seedOneAutoExecutionVerifiedRegistry(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS);
  });

  it('seeds VIN lookup, OE service history, and OE service schedule SKUs', () => {
    expect(ONEAUTO_EXECUTION_VERIFIED_SKUS_READONLY).toEqual([
      'OE_VIN_LOOKUP_EU',
      'OE_SERVICE_HISTORY_EU',
      'OE_SERVICE_SCHEDULE',
    ]);
    expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.size).toBe(3);
    expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.has('OE_VIN_LOOKUP_EU')).toBe(true);
    expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.has('OE_SERVICE_HISTORY_EU')).toBe(true);
    expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.has('OE_SERVICE_SCHEDULE')).toBe(true);
  });

  it('seeds OE_VIN_LOOKUP_EU with E4 CALLBACK_FULL_DATA async completion (flags still gate runtime)', () => {
    const entry = buildExecutionVerifiedOeVinLookupEuFullDataCallback();
    expect(entry.asyncCompletionMode).toBe('CALLBACK_FULL_DATA');
    expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.get('OE_VIN_LOOKUP_EU')!
      .asyncCompletionMode).toBe('CALLBACK_FULL_DATA');
  });

  it('seeds OE_SERVICE_HISTORY_EU with E1 CALLBACK_FULL_DATA and pricing version', () => {
    const entry = buildExecutionVerifiedOeServiceHistoryEuFullDataCallback();
    expect(entry.asyncCompletionMode).toBe('CALLBACK_FULL_DATA');
    expect(entry.pricingSourceVersion).toBe(ONEAUTO_E1_SERVICE_HISTORY_EU_PRICING_SOURCE_VERSION);
  });

  it('fail-closes async poll and 206 success; async-capable classification (P4)', () => {
    const entry = buildExecutionVerifiedOeVinLookupEu();
    expect(entry.asyncPollSameUrlWithoutNewCharge).toBe(false);
    expect(entry.http206CompleteSuccessAllowed).toBe(false);
    expect(entry.catalogExecutionMode).toBe('ASYNC_CAPABLE');
    expect(entry.asyncCapability).toBe('ASYNC_CAPABLE');
    expect(entry.asyncCapability).not.toBe('SYNC_ONLY');
    expect(entry.pricingSourceVersion).toBe(ONEAUTO_P4_VIN_LOOKUP_EU_PRICING_SOURCE_VERSION);
  });

  it('marks attested SKUs gate EXECUTABLE', () => {
    const vinGate = buildOneAutoContractGateReport('OE_VIN_LOOKUP_EU');
    expect(vinGate.executable).toBe(true);
    const historyGate = buildOneAutoContractGateReport('OE_SERVICE_HISTORY_EU');
    expect(historyGate.executable).toBe(true);
    expect(historyGate.reason).toBe('EXECUTABLE');
    const scheduleGate = buildOneAutoContractGateReport('OE_SERVICE_SCHEDULE');
    expect(scheduleGate.executable).toBe(true);
  });

  it('resolves VIN lookup AVAILABLE when enabled and price configured', () => {
    const catalogEntry = ONEAUTO_SERVICE_CATALOG.find((e) => e.serviceSku === 'OE_VIN_LOOKUP_EU')!;
    const resolved = resolveCatalogEntryForRuntime(catalogEntry, {
      providerEnabled: true,
      indicativePriceMinorBySku: { OE_VIN_LOOKUP_EU: 36 },
      pricingCatalogVersion: ONEAUTO_P4_VIN_LOOKUP_EU_PRICING_SOURCE_VERSION,
    });
    expect(resolved.availabilityStatus).toBe('AVAILABLE');
    expect(resolved.executionMode).toBe('ASYNC_CAPABLE');
  });

  it('keeps service history SKU_RUNTIME_DISABLED until explicit env opt-in', () => {
    delete process.env.ONEAUTO_SKU_OE_SERVICE_HISTORY_EU_RUNTIME_ENABLED;
    const catalogEntry = ONEAUTO_SERVICE_CATALOG.find(
      (e) => e.serviceSku === 'OE_SERVICE_HISTORY_EU',
    )!;
    const resolved = resolveCatalogEntryForRuntime(catalogEntry, {
      providerEnabled: true,
      indicativePriceMinorBySku: { OE_SERVICE_HISTORY_EU: 300 },
      pricingCatalogVersion: ONEAUTO_E1_SERVICE_HISTORY_EU_PRICING_SOURCE_VERSION,
    });
    expect(resolved.availabilityStatus).toBe('SKU_RUNTIME_DISABLED');
  });

  it('uses EUR currency for configured OE_SERVICE_HISTORY_EU indicative price', () => {
    process.env.ONEAUTO_SKU_OE_SERVICE_HISTORY_EU_RUNTIME_ENABLED = '1';
    const catalogEntry = ONEAUTO_SERVICE_CATALOG.find(
      (e) => e.serviceSku === 'OE_SERVICE_HISTORY_EU',
    )!;
    const resolved = resolveCatalogEntryForRuntime(catalogEntry, {
      providerEnabled: true,
      indicativePriceMinorBySku: { OE_SERVICE_HISTORY_EU: 300 },
      pricingCatalogVersion: ONEAUTO_E1_SERVICE_HISTORY_EU_PRICING_SOURCE_VERSION,
    });
    expect(resolved.availabilityStatus).toBe('AVAILABLE');
    expect(resolved.indicativePriceMinor).toBe(300);
    expect(resolved.currency).toBe('EUR');
  });

  it('keeps VIN lookup catalog currency unchanged when price configured', () => {
    const catalogEntry = ONEAUTO_SERVICE_CATALOG.find((e) => e.serviceSku === 'OE_VIN_LOOKUP_EU')!;
    const resolved = resolveCatalogEntryForRuntime(catalogEntry, {
      providerEnabled: true,
      indicativePriceMinorBySku: { OE_VIN_LOOKUP_EU: 36 },
      pricingCatalogVersion: ONEAUTO_P4_VIN_LOOKUP_EU_PRICING_SOURCE_VERSION,
    });
    expect(resolved.indicativePriceMinor).toBe(36);
    expect(resolved.currency).toBe('GBP');
  });

  it('seeds OE_SERVICE_SCHEDULE with CALLBACK_FULL_DATA and pricing version', () => {
    const entry = buildExecutionVerifiedOeServiceScheduleEuFullDataCallback();
    expect(entry.asyncCompletionMode).toBe('CALLBACK_FULL_DATA');
    expect(entry.providerPathTemplate).toBe('oneauto/oeserviceschedulefromvin/v2');
    expect(entry.pricingSourceVersion).toBe(ONEAUTO_OE_SERVICE_SCHEDULE_EU_PRICING_SOURCE_VERSION);
  });

  it('uses EUR currency for configured OE_SERVICE_SCHEDULE indicative price when runtime enabled', () => {
    process.env.ONEAUTO_SKU_OE_SERVICE_SCHEDULE_RUNTIME_ENABLED = '1';
    const catalogEntry = ONEAUTO_SERVICE_CATALOG.find((e) => e.serviceSku === 'OE_SERVICE_SCHEDULE')!;
    const resolved = resolveCatalogEntryForRuntime(catalogEntry, {
      providerEnabled: true,
      indicativePriceMinorBySku: { OE_SERVICE_SCHEDULE: 210 },
      pricingCatalogVersion: ONEAUTO_OE_SERVICE_SCHEDULE_EU_PRICING_SOURCE_VERSION,
    });
    expect(resolved.availabilityStatus).toBe('AVAILABLE');
    expect(resolved.currency).toBe('EUR');
    expect(resolved.indicativePriceMinor).toBe(210);
  });

  it('allowlists vinlookup, servicehistory, and service schedule paths from seeded registry', () => {
    expect(isOneAutoPathAllowlisted('GET', 'ezyvin/vinlookup/')).toBe(true);
    expect(isOneAutoPathAllowlisted('GET', 'ezyvin/servicehistory/')).toBe(true);
    expect(isOneAutoPathAllowlisted('GET', 'oneauto/oeserviceschedulefromvin/v2')).toBe(true);
  });

  it('restore helper re-seeds after test isolation clear()', () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.clear();
    expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.size).toBe(0);
    seedOneAutoExecutionVerifiedRegistry(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS);
    expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.size).toBe(3);
  });
});
