import {
  ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS,
  listDocumentedOneAutoContracts,
} from './catalog/oneauto-documented-contracts';
import {
  ONEAUTO_DE_PREPAY_REFERENCE_PRICES,
} from './catalog/oneauto-prepay-reference-prices';
import {
  ONEAUTO_SERVICE_CATALOG,
  resolveCatalogEntryForRuntime,
} from './catalog/oneauto-service-catalog';
import {
  ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS,
  buildOneAutoContractGateReport,
} from './catalog/oneauto-verified-contracts';
import {
  assertOneAutoAllowlistedPath,
  isOneAutoPathAllowlisted,
  listAllowlistedMethodPathKeys,
} from './client/oneauto-allowlist';
import { isValidVin, normalizeVin } from './client/oneauto-vin.util';
import { OneAutoHttpClient } from './client/oneauto-http.client';
import { redactProviderResponseBody } from './oneauto-provider-redact.util';
import { ConfigService } from '@nestjs/config';
import type { OneAutoExecutionVerifiedProviderContract } from './catalog/oneauto-contract-types';
import { OneAutoProviderExecutionService } from './oneauto-provider-execution.service';
import { OneAutoProviderJobStatus } from '@prisma/client';

const TEST_VIN = 'WBA12345678901234';

function executionVerifiedFixture(
  sku: string,
  overrides: Partial<OneAutoExecutionVerifiedProviderContract> = {},
): OneAutoExecutionVerifiedProviderContract {
  const doc = ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS.get(sku);
  if (!doc) throw new Error(`missing documented ${sku}`);
  return {
    ...doc,
    evidenceState: 'EXECUTION_VERIFIED',
    asyncPollSameUrlWithoutNewCharge: false,
    http206CompleteSuccessAllowed: false,
    pricingSourceVersion: 'test-attestation-v1',
    ...overrides,
  };
}

describe('OneAuto P2.5A documented contracts', () => {
  it('records six official GET paths', () => {
    expect(listDocumentedOneAutoContracts()).toHaveLength(6);
    const paths = listDocumentedOneAutoContracts().map((c) => c.providerPathTemplate);
    expect(paths).toEqual(
      expect.arrayContaining([
        'ezyvin/servicehistory/',
        'oneauto/oeserviceschedulefromvin/v2',
        'oneauto/oebuilddecode/v2',
        'oneauto/oebuildsheeteuropefromvin/v2',
        'ezyvin/vinlookup/',
        'oneauto/recallcheckfromvin/v2',
      ]),
    );
  });

  it('uses x-api-key and vehicle_identification_number on all documented entries', () => {
    for (const c of listDocumentedOneAutoContracts()) {
      expect(c.authHeaderName).toBe('x-api-key');
      expect(c.vinQueryParameter).toBe('vehicle_identification_number');
      expect(c.asyncPollSameUrlWithoutNewCharge).toBe(false);
      expect(c.http206CompleteSuccessAllowed).toBe(false);
    }
  });

  it('marks documented SKUs not executable in gate report', () => {
    const gate = buildOneAutoContractGateReport('OE_VIN_LOOKUP_EU');
    expect(gate.executable).toBe(false);
    expect(gate.reason).toBe('DOCUMENTED_NOT_EXECUTABLE');
    expect(gate.documentationState).toBe('DOCUMENTED');
  });

  it('maps async capabilities per audit', () => {
    expect(ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS.get('OE_BUILD_DECODE')?.asyncCapability).toBe(
      'ASYNC_CAPABLE',
    );
    expect(ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS.get('OE_VIN_LOOKUP_EU')?.asyncCapability).toBe(
      'ASYNC_CAPABLE',
    );
    expect(ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS.get('RECALL_CHECK')?.asyncCapability).toBe(
      'SYNC_ONLY',
    );
  });
});

describe('OneAuto catalog (P2 compatibility)', () => {
  it('lists six SKUs with documented paths', () => {
    expect(ONEAUTO_SERVICE_CATALOG).toHaveLength(6);
    expect(ONEAUTO_SERVICE_CATALOG.every((e) => e.providerPathDocumented)).toBe(true);
    expect(ONEAUTO_SERVICE_CATALOG[0].providerPathTemplate).not.toMatch(/^oe\//);
  });

  it('marks runtime CONTRACT_UNVERIFIED when execution registry empty', () => {
    const entry = ONEAUTO_SERVICE_CATALOG[0];
    const resolved = resolveCatalogEntryForRuntime(entry, {
      providerEnabled: true,
      indicativePriceMinorBySku: { [entry.serviceSku]: 100 },
      pricingCatalogVersion: 'v1',
    });
    expect(resolved.availabilityStatus).toBe('CONTRACT_UNVERIFIED');
    expect(buildOneAutoContractGateReport(entry.serviceSku).executable).toBe(false);
  });
});

describe('OneAuto DE PrePay reference prices', () => {
  it('documents EUR minor prepay values without loading runtime config', () => {
    const bySku = Object.fromEntries(
      ONEAUTO_DE_PREPAY_REFERENCE_PRICES.map((p) => [p.serviceSku, p.prepayMinor]),
    );
    expect(bySku.OE_SERVICE_HISTORY_EU).toBe(300);
    expect(bySku.OE_SERVICE_SCHEDULE).toBe(210);
    expect(bySku.OE_BUILD_DECODE).toBe(180);
    expect(bySku.OE_BUILD_SHEET_EU).toBe(195);
    expect(bySku.OE_VIN_LOOKUP_EU).toBe(36);
    expect(bySku.RECALL_CHECK).toBeNull();
  });
});

describe('OneAuto allowlist', () => {
  afterEach(() => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.clear();
  });

  it('rejects all documented paths when execution registry empty', () => {
    expect(listAllowlistedMethodPathKeys()).toHaveLength(0);
    for (const doc of listDocumentedOneAutoContracts()) {
      expect(isOneAutoPathAllowlisted('GET', doc.providerPathTemplate)).toBe(false);
      expect(() => assertOneAutoAllowlistedPath('GET', doc.providerPathTemplate)).toThrow(
        /NOT_ALLOWLISTED|CONTRACT_UNVERIFIED/,
      );
    }
  });

  it('allows only execution-verified paths', () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(
      'OE_VIN_LOOKUP_EU',
      executionVerifiedFixture('OE_VIN_LOOKUP_EU'),
    );
    expect(isOneAutoPathAllowlisted('GET', 'ezyvin/vinlookup')).toBe(true);
    expect(isOneAutoPathAllowlisted('GET', 'oneauto/recallcheckfromvin')).toBe(false);
  });
});

describe('OneAutoHttpClient contract-driven HTTP', () => {
  const config = {
    get: () => ({
      enabled: true,
      apiKeyPresent: true,
      sandbox: true,
      baseUrl: 'https://sandbox.oneautoapi.com',
      requestTimeoutMs: 5000,
      maxRetries: 0,
      orgDailyBudgetMinor: 10_000,
      maxResponseBytes: 1_048_576,
    }),
  } as unknown as ConfigService;

  afterEach(() => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.clear();
    delete process.env.ONEAUTO_API_KEY;
  });

  it('throws when disabled', async () => {
    const disabledConfig = {
      get: () => ({ enabled: false, apiKeyPresent: true }),
    } as unknown as ConfigService;
    const client = new OneAutoHttpClient(disabledConfig);
    await expect(
      client.executeProviderGet({
        contract: executionVerifiedFixture('OE_VIN_LOOKUP_EU'),
        vin: TEST_VIN,
      }),
    ).rejects.toMatchObject({ code: 'ONEAUTO_DISABLED' });
  });

  it('throws when API key missing', async () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(
      'OE_VIN_LOOKUP_EU',
      executionVerifiedFixture('OE_VIN_LOOKUP_EU'),
    );
    const client = new OneAutoHttpClient(config);
    await expect(
      client.executeProviderGet({
        contract: executionVerifiedFixture('OE_VIN_LOOKUP_EU'),
        vin: TEST_VIN,
      }),
    ).rejects.toMatchObject({ code: 'ONEAUTO_API_KEY_MISSING' });
  });

  it('rejects documented-only contract (not execution-verified state)', async () => {
    process.env.ONEAUTO_API_KEY = 'test-key-redacted';
    const client = new OneAutoHttpClient(config);
    const docOnly = {
      ...executionVerifiedFixture('OE_VIN_LOOKUP_EU'),
      evidenceState: 'DOCUMENTED' as const,
    };
    await expect(
      client.executeProviderGet({ contract: docOnly as never, vin: TEST_VIN }),
    ).rejects.toMatchObject({ code: 'CONTRACT_UNVERIFIED' });
  });

  it('rejects unsupported path when not allowlisted', async () => {
    process.env.ONEAUTO_API_KEY = 'test-key-redacted';
    const client = new OneAutoHttpClient(config);
    await expect(
      client.executeProviderGet({
        contract: executionVerifiedFixture('OE_VIN_LOOKUP_EU'),
        vin: TEST_VIN,
      }),
    ).rejects.toMatchObject({ code: 'CONTRACT_UNVERIFIED' });
  });

  it('sends x-api-key and vehicle_identification_number on allowlisted request', async () => {
    process.env.ONEAUTO_API_KEY = 'test-key-redacted';
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(
      'OE_VIN_LOOKUP_EU',
      executionVerifiedFixture('OE_VIN_LOOKUP_EU'),
    );
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({ success: true, result: {} }),
    });
    const client = new OneAutoHttpClient(config, fetchMock);
    await client.executeProviderGet({
      contract: executionVerifiedFixture('OE_VIN_LOOKUP_EU'),
      vin: TEST_VIN,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('vehicle_identification_number=WBA12345678901234');
    expect(url).toContain('sandbox.oneautoapi.com/ezyvin/vinlookup/');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('test-key-redacted');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('rejects disallowed base URL host', async () => {
    process.env.ONEAUTO_API_KEY = 'test-key-redacted';
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(
      'OE_VIN_LOOKUP_EU',
      executionVerifiedFixture('OE_VIN_LOOKUP_EU'),
    );
    const badHostConfig = {
      get: () => ({
        enabled: true,
        apiKeyPresent: true,
        sandbox: true,
        baseUrl: 'https://evil.example.com',
        requestTimeoutMs: 5000,
        maxRetries: 0,
        orgDailyBudgetMinor: 10_000,
      }),
    } as unknown as ConfigService;
    const client = new OneAutoHttpClient(badHostConfig);
    await expect(
      client.executeProviderGet({
        contract: executionVerifiedFixture('OE_VIN_LOOKUP_EU'),
        vin: TEST_VIN,
      }),
    ).rejects.toMatchObject({ code: 'ONEAUTO_BASE_URL_NOT_ALLOWLISTED' });
  });

  it('legacy getVinLookup is blocked', async () => {
    const client = new OneAutoHttpClient(config);
    await expect(
      client.getVinLookup({ relativePath: 'ezyvin/vinlookup', vin: TEST_VIN }),
    ).rejects.toMatchObject({ code: 'CONTRACT_UNVERIFIED' });
  });
});

describe('OneAutoProviderExecutionService async and 206 policy', () => {
  afterEach(() => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.clear();
  });

  function buildService(http: { executeProviderGet: jest.Mock }) {
    const prisma = {
      oneAutoProviderJob: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      oneAutoProviderResponse: { create: jest.fn() },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({ vin: TEST_VIN }),
      },
    };
    const config = {
      get: (key?: string) =>
        key === 'oneautoProvider'
          ? { enabled: true, orgDailyBudgetMinor: 500, maxPollAttempts: 2, pollIntervalMs: 1 }
          : { enabled: true, orgDailyBudgetMinor: 500 },
    } as unknown as ConfigService;
    const queue = { add: jest.fn() };
    const svc = new OneAutoProviderExecutionService(
      prisma as never,
      http as never,
      config,
      queue as never,
    );
    return { svc, prisma, queue, http };
  }

  it('does not call HTTP when execution registry empty', async () => {
    const http = { executeProviderGet: jest.fn() };
    const { svc, prisma } = buildService(http);
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue({
      id: 'j1',
      organizationId: 'org1',
      vehicleId: 'v1',
      vinSnapshot: TEST_VIN,
      serviceSku: 'OE_VIN_LOOKUP_EU',
      status: OneAutoProviderJobStatus.QUEUED,
      pollAttemptCount: 0,
      expiresAt: new Date(Date.now() + 60_000),
      initialProviderDispatchAt: null,
    });
    await svc.processJob('j1', 'initial');
    expect(http.executeProviderGet).not.toHaveBeenCalled();
  });

  it('fails closed on HTTP 202 when poll billing not attested', async () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(
      'OE_SERVICE_HISTORY_EU',
      executionVerifiedFixture('OE_SERVICE_HISTORY_EU'),
    );
    const http = {
      executeProviderGet: jest.fn().mockResolvedValue({
        httpStatus: 202,
        providerStatusHeader: null,
        body: { success: true },
        redactedRequestPath: 'ezyvin/servicehistory/',
      }),
    };
    const { svc, prisma, queue } = buildService(http);
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue({
      id: 'j2',
      organizationId: 'org1',
      vehicleId: 'v1',
      vinSnapshot: TEST_VIN,
      serviceSku: 'OE_SERVICE_HISTORY_EU',
      status: OneAutoProviderJobStatus.QUEUED,
      pollAttemptCount: 0,
      expiresAt: new Date(Date.now() + 60_000),
      initialProviderDispatchAt: null,
    });
    await svc.processJob('j2', 'initial');
    expect(queue.add).not.toHaveBeenCalled();
    expect(prisma.oneAutoProviderJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastErrorCode: 'ONEAUTO_ASYNC_POLL_UNVERIFIED' }),
      }),
    );
  });

  it('fails closed on HTTP 206 when not attested as complete success', async () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(
      'OE_VIN_LOOKUP_EU',
      executionVerifiedFixture('OE_VIN_LOOKUP_EU', { http206CompleteSuccessAllowed: false }),
    );
    const http = {
      executeProviderGet: jest.fn().mockResolvedValue({
        httpStatus: 206,
        providerStatusHeader: 'partial',
        body: { success: true, result: {} },
        redactedRequestPath: 'ezyvin/vinlookup',
      }),
    };
    const { svc, prisma } = buildService(http);
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue({
      id: 'j3',
      organizationId: 'org1',
      vehicleId: 'v1',
      vinSnapshot: TEST_VIN,
      serviceSku: 'OE_VIN_LOOKUP_EU',
      status: OneAutoProviderJobStatus.QUEUED,
      pollAttemptCount: 0,
      expiresAt: new Date(Date.now() + 60_000),
      initialProviderDispatchAt: null,
    });
    await svc.processJob('j3', 'initial');
    expect(prisma.oneAutoProviderJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastErrorCode: 'ONEAUTO_PARTIAL_CONTENT' }),
      }),
    );
  });

  it('succeeds on HTTP 200 with unknown actual charge', async () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(
      'OE_VIN_LOOKUP_EU',
      executionVerifiedFixture('OE_VIN_LOOKUP_EU'),
    );
    const http = {
      executeProviderGet: jest.fn().mockResolvedValue({
        httpStatus: 200,
        providerStatusHeader: 'success',
        body: { success: true, result: {} },
        redactedRequestPath: 'ezyvin/vinlookup',
      }),
    };
    const { svc, prisma } = buildService(http);
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue({
      id: 'j4',
      organizationId: 'org1',
      vehicleId: 'v1',
      vinSnapshot: TEST_VIN,
      serviceSku: 'OE_VIN_LOOKUP_EU',
      status: OneAutoProviderJobStatus.QUEUED,
      pollAttemptCount: 0,
      expiresAt: new Date(Date.now() + 60_000),
      initialProviderDispatchAt: null,
    });
    await svc.processJob('j4', 'initial');
    expect(prisma.oneAutoProviderJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OneAutoProviderJobStatus.SUCCEEDED,
          actualChargeKnown: false,
        }),
      }),
    );
  });

  it('skips duplicate initial dispatch', async () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(
      'OE_VIN_LOOKUP_EU',
      executionVerifiedFixture('OE_VIN_LOOKUP_EU'),
    );
    const http = { executeProviderGet: jest.fn() };
    const { svc, prisma } = buildService(http);
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue({
      id: 'j5',
      organizationId: 'org1',
      vehicleId: 'v1',
      vinSnapshot: TEST_VIN,
      serviceSku: 'OE_VIN_LOOKUP_EU',
      status: OneAutoProviderJobStatus.QUEUED,
      pollAttemptCount: 0,
      expiresAt: new Date(Date.now() + 60_000),
      initialProviderDispatchAt: new Date(),
    });
    prisma.oneAutoProviderJob.updateMany.mockResolvedValue({ count: 0 });
    await svc.processJob('j5', 'initial');
    expect(http.executeProviderGet).not.toHaveBeenCalled();
  });
});

describe('OneAuto VIN util', () => {
  it('rejects invalid VIN', () => {
    expect(isValidVin('')).toBe(false);
  });
});

describe('OneAuto redaction', () => {
  it('redacts sensitive keys in provider JSON', () => {
    const out = redactProviderResponseBody({
      vin: TEST_VIN,
      apiKey: 'secret',
    }) as Record<string, unknown>;
    expect(out.apiKey).toBe('[REDACTED]');
  });
});
