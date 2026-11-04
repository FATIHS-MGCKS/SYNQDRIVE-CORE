import {
  buildExecutionVerifiedOeVinLookupEu,
  buildExecutionVerifiedOeVinLookupEuFullDataCallback,
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

describe('OneAuto P3/P4 OE_VIN_LOOKUP_EU execution-verified registry', () => {
  it('seeds exactly one SKU (VIN lookup only)', () => {
    expect(ONEAUTO_EXECUTION_VERIFIED_SKUS_READONLY).toEqual(['OE_VIN_LOOKUP_EU']);
    expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.size).toBe(1);
    expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.has('OE_VIN_LOOKUP_EU')).toBe(true);
    expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.has('OE_SERVICE_HISTORY_EU')).toBe(
      false,
    );
  });

  it('seeds OE_VIN_LOOKUP_EU with E4 CALLBACK_FULL_DATA async completion (flags still gate runtime)', () => {
    const entry = buildExecutionVerifiedOeVinLookupEuFullDataCallback();
    expect(entry.asyncCompletionMode).toBe('CALLBACK_FULL_DATA');
    expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.get('OE_VIN_LOOKUP_EU')!
      .asyncCompletionMode).toBe('CALLBACK_FULL_DATA');
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

  it('marks VIN lookup gate EXECUTABLE and service history DOCUMENTED_NOT_EXECUTABLE', () => {
    const vinGate = buildOneAutoContractGateReport('OE_VIN_LOOKUP_EU');
    expect(vinGate.executable).toBe(true);
    expect(vinGate.reason).toBe('EXECUTABLE');

    const historyGate = buildOneAutoContractGateReport('OE_SERVICE_HISTORY_EU');
    expect(historyGate.executable).toBe(false);
    expect(historyGate.reason).toBe('DOCUMENTED_NOT_EXECUTABLE');
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

  it('allowlists only vinlookup path from seeded registry', () => {
    expect(isOneAutoPathAllowlisted('GET', 'ezyvin/vinlookup/')).toBe(true);
    expect(isOneAutoPathAllowlisted('GET', 'ezyvin/servicehistory/')).toBe(false);
  });

  it('restore helper re-seeds after test isolation clear()', () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.clear();
    expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.size).toBe(0);
    seedOneAutoExecutionVerifiedRegistry(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS);
    expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.size).toBe(1);
  });
});
