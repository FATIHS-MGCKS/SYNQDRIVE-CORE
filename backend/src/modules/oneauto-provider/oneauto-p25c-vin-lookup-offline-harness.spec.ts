import { ConfigService } from '@nestjs/config';
import { OneAutoProviderJobStatus } from '@prisma/client';
import { ONEAUTO_SKU_TO_OPENAPI_PATH_KEY } from './catalog/oneauto-openapi-sku-bindings';
import { getDocumentedOneAutoContract } from './catalog/oneauto-documented-contracts';
import { buildOneAutoDocumentedGetUrl } from './catalog/oneauto-documented-request.util';
import {
  assertOpenApi303,
  getOpenApiGetOperation,
  loadOneAutoOpenApiEvidence,
} from './catalog/oneauto-openapi-evidence.util';
import type { OneAutoExecutionVerifiedProviderContract } from './catalog/oneauto-contract-types';
import { ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS } from './catalog/oneauto-documented-contracts';
import {
  ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS,
  buildOneAutoContractGateReport,
} from './catalog/oneauto-verified-contracts';
import { OneAutoHttpClient } from './client/oneauto-http.client';
import { isValidVin, normalizeVin } from './client/oneauto-vin.util';
import { OneAutoProviderExecutionService } from './oneauto-provider-execution.service';
import { redactProviderResponseBody } from './oneauto-provider-redact.util';

const SKU = 'OE_VIN_LOOKUP_EU';
/** Synthetic VIN for offline harness only — not attested as vendor-approved sandbox fixture. */
const SYNTHETIC_VIN = 'WBA12345678901234';
const SANDBOX_BASE = 'https://sandbox.oneautoapi.com';

function executionVerifiedFixture(
  overrides: Partial<OneAutoExecutionVerifiedProviderContract> = {},
): OneAutoExecutionVerifiedProviderContract {
  const doc = ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS.get(SKU);
  if (!doc) throw new Error(`missing documented ${SKU}`);
  return {
    ...doc,
    evidenceState: 'EXECUTION_VERIFIED',
    asyncPollSameUrlWithoutNewCharge: false,
    http206CompleteSuccessAllowed: false,
    pricingSourceVersion: 'p25c-offline-harness-only',
    ...overrides,
  };
}

function sandboxEnabledConfig(): ConfigService {
  return {
    get: () => ({
      enabled: true,
      apiKeyPresent: true,
      sandbox: true,
      baseUrl: SANDBOX_BASE,
      requestTimeoutMs: 5_000,
      maxRetries: 0,
      orgDailyBudgetMinor: 10_000,
      maxResponseBytes: 1_048_576,
    }),
  } as unknown as ConfigService;
}

describe('OneAuto P2.5C OE_VIN_LOOKUP_EU offline contract harness', () => {
  afterEach(() => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.clear();
    delete process.env.ONEAUTO_API_KEY;
  });

  describe('Phase 1 — documented contract vs OpenAPI evidence', () => {
    const openApi = loadOneAutoOpenApiEvidence();
    const doc = getDocumentedOneAutoContract(SKU)!;

    it('loads OpenAPI 3.0.3 and maps VIN lookup path', () => {
      assertOpenApi303(openApi);
      expect(ONEAUTO_SKU_TO_OPENAPI_PATH_KEY[SKU]).toBe('/ezyvin/vinlookup/');
      expect(doc.providerPathTemplate).toBe('ezyvin/vinlookup/');
      expect(doc.httpMethod).toBe('GET');
    });

    it('documents auth, VIN param, optional callbacks, and envelope', () => {
      const op = getOpenApiGetOperation(openApi, '/ezyvin/vinlookup/');
      expect(op.security).toEqual([{ 'x-api-key': [] }]);
      const query = (op.parameters ?? []).filter((p) => p.in === 'query');
      expect(query.filter((p) => p.required).map((p) => p.name)).toEqual(['vehicle_identification_number']);
      expect(query.filter((p) => !p.required).map((p) => p.name)).toEqual([
        'callback_url',
        'return_data_in_callback',
      ]);
      expect(doc.optionalQueryParameters.map((p) => p.name)).toEqual([
        'callback_url',
        'return_data_in_callback',
      ]);
      expect(doc.responseEnvelope).toBe('SUCCESS_RESULT_ERROR');
      expect(doc.responseHandling).toBe('OPAQUE_JSON');
    });

    it('notes OpenAPI lists HTTP 200 only (async HTTP codes UNKNOWN in snapshot)', () => {
      const op = getOpenApiGetOperation(openApi, '/ezyvin/vinlookup/');
      expect(Object.keys(op.responses ?? {})).toEqual(['200']);
      expect(doc.asyncCapability).toBe('ASYNC_CAPABLE');
      expect(doc.asyncPollSameUrlWithoutNewCharge).toBe(false);
    });

    it('keeps production execution registry empty', () => {
      expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.size).toBe(0);
      const gate = buildOneAutoContractGateReport(SKU);
      expect(gate.executable).toBe(false);
      expect(gate.reason).toBe('DOCUMENTED_NOT_EXECUTABLE');
    });
  });

  describe('Phase 2 — request serialization (mocked transport)', () => {
    it('builds exact documented sandbox URL for synthetic VIN', () => {
      const doc = getDocumentedOneAutoContract(SKU)!;
      const url = buildOneAutoDocumentedGetUrl(SANDBOX_BASE, doc, SYNTHETIC_VIN);
      expect(url).toBe(
        `${SANDBOX_BASE}/ezyvin/vinlookup/?vehicle_identification_number=${SYNTHETIC_VIN}`,
      );
    });

    it('rejects blank VIN before any mocked fetch', async () => {
      process.env.ONEAUTO_API_KEY = 'offline-harness-redacted-key';
      ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(SKU, executionVerifiedFixture());
      const fetchMock = jest.fn();
      const client = new OneAutoHttpClient(sandboxEnabledConfig(), fetchMock);
      await expect(
        client.executeProviderGet({ contract: executionVerifiedFixture(), vin: '   ' }),
      ).rejects.toMatchObject({ code: 'ONEAUTO_INVALID_VIN' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects invalid VIN before any mocked fetch', async () => {
      process.env.ONEAUTO_API_KEY = 'offline-harness-redacted-key';
      ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(SKU, executionVerifiedFixture());
      const fetchMock = jest.fn();
      const client = new OneAutoHttpClient(sandboxEnabledConfig(), fetchMock);
      await expect(
        client.executeProviderGet({ contract: executionVerifiedFixture(), vin: 'NOT-A-VIN' }),
      ).rejects.toMatchObject({ code: 'ONEAUTO_INVALID_VIN' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends GET with x-api-key and Accept application/json without logging the key', async () => {
      process.env.ONEAUTO_API_KEY = 'offline-harness-redacted-key';
      ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(SKU, executionVerifiedFixture());
      const fetchMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify({
            success: true,
            result: { vehicle_identification_number: SYNTHETIC_VIN },
          }),
      });
      const client = new OneAutoHttpClient(sandboxEnabledConfig(), fetchMock);
      await client.executeProviderGet({ contract: executionVerifiedFixture(), vin: SYNTHETIC_VIN });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `${SANDBOX_BASE}/ezyvin/vinlookup/?vehicle_identification_number=${SYNTHETIC_VIN}`,
      );
      expect(init.redirect).toBe('manual');
      expect(new URL(url).hostname).toBe('sandbox.oneautoapi.com');
      const headers = init.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('offline-harness-redacted-key');
      expect(headers.Accept).toBe('application/json');
      expect(headers.Authorization).toBeUndefined();
    });

    it('blocks disallowed base URL host before fetch', async () => {
      process.env.ONEAUTO_API_KEY = 'offline-harness-redacted-key';
      ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(SKU, executionVerifiedFixture());
      const badConfig = {
        get: () => ({
          enabled: true,
          apiKeyPresent: true,
          sandbox: true,
          baseUrl: 'https://evil.example.com',
          requestTimeoutMs: 5_000,
          maxRetries: 0,
          orgDailyBudgetMinor: 10_000,
        }),
      } as unknown as ConfigService;
      const fetchMock = jest.fn();
      const client = new OneAutoHttpClient(badConfig, fetchMock);
      await expect(
        client.executeProviderGet({ contract: executionVerifiedFixture(), vin: SYNTHETIC_VIN }),
      ).rejects.toMatchObject({ code: 'ONEAUTO_BASE_URL_NOT_ALLOWLISTED' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('maps network/abort failures to ONEAUTO_PROVIDER_TIMEOUT', async () => {
      process.env.ONEAUTO_API_KEY = 'offline-harness-redacted-key';
      ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(SKU, executionVerifiedFixture());
      const fetchMock = jest.fn().mockRejectedValue(new Error('network down'));
      const client = new OneAutoHttpClient(sandboxEnabledConfig(), fetchMock);
      await expect(
        client.executeProviderGet({ contract: executionVerifiedFixture(), vin: SYNTHETIC_VIN }),
      ).rejects.toMatchObject({ code: 'ONEAUTO_PROVIDER_REQUEST_FAILED' });
    });
  });

  describe('Phase 2 — response handling (opaque, mocked)', () => {
    it('parses JSON success envelope without validating result field shapes', async () => {
      process.env.ONEAUTO_API_KEY = 'offline-harness-redacted-key';
      ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(SKU, executionVerifiedFixture());
      const body = {
        success: false,
        error: 'documented error string shape only',
        result: null,
      };
      const fetchMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: { get: () => 'success' },
        text: async () => JSON.stringify(body),
      });
      const client = new OneAutoHttpClient(sandboxEnabledConfig(), fetchMock);
      const result = await client.executeProviderGet({
        contract: executionVerifiedFixture(),
        vin: SYNTHETIC_VIN,
      });
      expect(result.httpStatus).toBe(200);
      expect(result.providerStatusHeader).toBe('success');
      expect(result.body).toEqual(body);
      expect(result.redactedRequestPath).toBe('ezyvin/vinlookup/');
    });

    it('stores non-JSON bodies without raw preview text', async () => {
      process.env.ONEAUTO_API_KEY = 'offline-harness-redacted-key';
      ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(SKU, executionVerifiedFixture());
      const fetchMock = jest.fn().mockResolvedValue({
        status: 502,
        headers: { get: () => null },
        text: async () => 'upstream unavailable',
      });
      const client = new OneAutoHttpClient(sandboxEnabledConfig(), fetchMock);
      const result = await client.executeProviderGet({
        contract: executionVerifiedFixture(),
        vin: SYNTHETIC_VIN,
      });
      expect(result.httpStatus).toBe(502);
      expect(result.body).toEqual({ _nonJsonResponse: true, byteLength: expect.any(Number) });
    });

    it('redacts sensitive keys when persisting provider JSON', () => {
      const redacted = redactProviderResponseBody({
        success: true,
        result: { vehicle_identification_number: SYNTHETIC_VIN },
        apiKey: 'must-not-persist',
      }) as Record<string, unknown>;
      expect(redacted.apiKey).toBe('[REDACTED]');
    });
  });

  describe('Phase 2 — async semantics (fail-closed, mocked execution)', () => {
    function buildExecutionService(http: { executeProviderGet: jest.Mock }) {
      const prisma = {
        oneAutoProviderJob: {
          findUnique: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        oneAutoProviderResponse: { create: jest.fn() },
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({ vin: SYNTHETIC_VIN }),
        },
      };
      const config = {
        get: (key?: string) =>
          key === 'oneautoProvider'
            ? { enabled: true, orgDailyBudgetMinor: 500, maxPollAttempts: 2, pollIntervalMs: 1 }
            : { enabled: true, orgDailyBudgetMinor: 500 },
      } as unknown as ConfigService;
      const queue = { add: jest.fn() };
      return {
        svc: new OneAutoProviderExecutionService(
          prisma as never,
          http as never,
          config,
          queue as never,
        ),
        prisma,
        queue,
      };
    }

    it('fails closed on HTTP 202 when poll billing is not attested (async UNKNOWN for billing)', async () => {
      ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(SKU, executionVerifiedFixture());
      const http = {
        executeProviderGet: jest.fn().mockResolvedValue({
          httpStatus: 202,
          providerStatusHeader: null,
          body: { success: true },
          redactedRequestPath: 'ezyvin/vinlookup/',
        }),
      };
      const { svc, prisma, queue } = buildExecutionService(http);
      prisma.oneAutoProviderJob.findUnique.mockResolvedValue({
        id: 'job-p25c-202',
        organizationId: 'org-a',
        vehicleId: 'veh-a',
        vinSnapshot: SYNTHETIC_VIN,
        serviceSku: SKU,
        status: OneAutoProviderJobStatus.QUEUED,
        pollAttemptCount: 0,
        expiresAt: new Date(Date.now() + 60_000),
        initialProviderDispatchAt: null,
      });
      await svc.processJob('job-p25c-202', 'initial');
      expect(queue.add).not.toHaveBeenCalled();
      expect(prisma.oneAutoProviderJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastErrorCode: 'ONEAUTO_ASYNC_POLL_UNVERIFIED' }),
        }),
      );
    });
  });

  describe('Phase 3 — credential and VIN safety', () => {
    it('rejects outbound when ONEAUTO_ENABLED path disabled in config', async () => {
      const disabled = {
        get: () => ({ enabled: false, apiKeyPresent: true }),
      } as unknown as ConfigService;
      const client = new OneAutoHttpClient(disabled);
      await expect(
        client.executeProviderGet({ contract: executionVerifiedFixture(), vin: SYNTHETIC_VIN }),
      ).rejects.toMatchObject({ code: 'ONEAUTO_DISABLED' });
    });

    it('accepts only normalized 17-char synthetic VIN for harness data', () => {
      expect(isValidVin(SYNTHETIC_VIN)).toBe(true);
      expect(normalizeVin(`  ${SYNTHETIC_VIN}  `)).toBe(SYNTHETIC_VIN);
    });
  });
});
