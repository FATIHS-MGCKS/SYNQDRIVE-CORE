import {
  ONEAUTO_SERVICE_CATALOG,
  resolveCatalogEntryForRuntime,
} from './catalog/oneauto-service-catalog';
import { buildOneAutoContractGateReport } from './catalog/oneauto-verified-contracts';
import { ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS } from './catalog/oneauto-documented-contracts';
import { listDocumentedOneAutoContracts } from './catalog/oneauto-documented-contracts';
import { assertOneAutoAllowlistedPath } from './client/oneauto-allowlist';
import { OneAutoHttpClient } from './client/oneauto-http.client';
import { ConfigService } from '@nestjs/config';

describe('OneAuto catalog', () => {
  it('lists six initial SKUs', () => {
    expect(ONEAUTO_SERVICE_CATALOG).toHaveLength(6);
  });

  it('marks runtime entries CONTRACT_UNVERIFIED when execution registry empty', () => {
    const entry = ONEAUTO_SERVICE_CATALOG[0];
    const resolved = resolveCatalogEntryForRuntime(entry, {
      providerEnabled: true,
      indicativePriceMinorBySku: { [entry.serviceSku]: 100 },
      pricingCatalogVersion: 'v1',
    });
    expect(resolved.availabilityStatus).toBe('CONTRACT_UNVERIFIED');
    expect(buildOneAutoContractGateReport(entry.serviceSku).executable).toBe(false);
  });

  it('blocks runtime availability when feature disabled', () => {
    const entry = ONEAUTO_SERVICE_CATALOG[0];
    const resolved = resolveCatalogEntryForRuntime(entry, {
      providerEnabled: false,
      indicativePriceMinorBySku: { [entry.serviceSku]: 100 },
      pricingCatalogVersion: 'v1',
    });
    expect(resolved.availabilityStatus).toBe('DISABLED_FLAG');
  });
});

describe('OneAuto allowlist', () => {
  it('rejects documented paths when execution registry is empty', () => {
    const doc = listDocumentedOneAutoContracts()[0];
    expect(() => assertOneAutoAllowlistedPath('GET', doc.providerPathTemplate)).toThrow(
      /CONTRACT_UNVERIFIED|NOT_ALLOWLISTED/,
    );
  });
});

describe('OneAutoHttpClient', () => {
  const config = {
    get: () => ({
      enabled: true,
      apiKeyPresent: true,
      sandbox: true,
      baseUrl: 'https://sandbox.oneautoapi.com',
      requestTimeoutMs: 5000,
      maxRetries: 0,
    }),
  } as unknown as ConfigService;

  it('throws when disabled', async () => {
    const disabledConfig = {
      get: () => ({ enabled: false, apiKeyPresent: true }),
    } as unknown as ConfigService;
    const client = new OneAutoHttpClient(disabledConfig);
    const doc = ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS.get('OE_VIN_LOOKUP_EU')!;
    await expect(
      client.executeProviderGet({
        contract: {
          ...doc,
          evidenceState: 'EXECUTION_VERIFIED',
          asyncPollSameUrlWithoutNewCharge: false,
          http206CompleteSuccessAllowed: false,
          pricingSourceVersion: 'test',
        },
        vin: 'WBA12345678901234',
      }),
    ).rejects.toMatchObject({ code: 'ONEAUTO_DISABLED' });
  });

  it('rejects legacy getVinLookup without execution-verified contract', async () => {
    process.env.ONEAUTO_API_KEY = 'test-key-redacted';
    const client = new OneAutoHttpClient(config);
    await expect(
      client.getVinLookup({
        relativePath: 'ezyvin/vinlookup',
        vin: 'WBA12345678901234',
      }),
    ).rejects.toMatchObject({ code: 'CONTRACT_UNVERIFIED' });
  });
});
