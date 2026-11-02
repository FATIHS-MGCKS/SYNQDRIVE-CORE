import { ConfigService } from '@nestjs/config';
import { OneAutoProviderJobStatus } from '@prisma/client';
import {
  ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS,
} from './catalog/oneauto-documented-contracts';
import {
  ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS,
} from './catalog/oneauto-verified-contracts';
import type { OneAutoExecutionVerifiedProviderContract } from './catalog/oneauto-contract-types';
import { OneAutoHttpClient } from './client/oneauto-http.client';
import { isValidVin, normalizeVin } from './client/oneauto-vin.util';
import { assertNotRedirectStatus } from './client/oneauto-http-response-body.util';
import {
  evaluateSuccessResultErrorEnvelope,
  mergeEnvelopeDiagnostic,
} from './oneauto-response-envelope.util';
import { assertOneAutoPositiveOrgBudgetWhenEnabled } from './oneauto-execution-budget-guard.util';
import { OneAutoProviderExecutionService } from './oneauto-provider-execution.service';

const TEST_VIN = 'WBA12345678901234';
const SKU = 'OE_VIN_LOOKUP_EU';

function executionVerifiedFixture(): OneAutoExecutionVerifiedProviderContract {
  const doc = ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS.get(SKU);
  if (!doc) throw new Error(`missing ${SKU}`);
  return {
    ...doc,
    evidenceState: 'EXECUTION_VERIFIED',
    asyncPollSameUrlWithoutNewCharge: false,
    http206CompleteSuccessAllowed: false,
    pricingSourceVersion: 'p25e-offline-only',
  };
}

function enabledSandboxConfig(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: () => ({
      enabled: true,
      apiKeyPresent: true,
      sandbox: true,
      baseUrl: 'https://sandbox.oneautoapi.com',
      requestTimeoutMs: 5_000,
      orgDailyBudgetMinor: 10_000,
      maxResponseBytes: 256,
      maxRetries: 0,
      ...overrides,
    }),
  } as unknown as ConfigService;
}

describe('OneAuto P2.5E offline security hardening', () => {
  afterEach(() => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.clear();
    delete process.env.ONEAUTO_API_KEY;
  });

  describe('envelope fail-closed', () => {
    it('rejects HTTP 200 when success is false', () => {
      const evalResult = evaluateSuccessResultErrorEnvelope(200, { success: false, error: 'x' }, {
        responseEnvelope: 'SUCCESS_RESULT_ERROR',
      });
      expect(evalResult.ok).toBe(false);
      if (!evalResult.ok) {
        expect(evalResult.code).toBe('ONEAUTO_PROVIDER_ENVELOPE_FAILURE');
      }
    });

    it('rejects HTTP 200 when success is missing or malformed', () => {
      expect(
        evaluateSuccessResultErrorEnvelope(200, { result: {} }, { responseEnvelope: 'SUCCESS_RESULT_ERROR' }).ok,
      ).toBe(false);
      expect(
        evaluateSuccessResultErrorEnvelope(200, { success: 'yes' }, { responseEnvelope: 'SUCCESS_RESULT_ERROR' }).ok,
      ).toBe(false);
    });

    it('allows HTTP 200 when success is true without inspecting result', () => {
      expect(
        evaluateSuccessResultErrorEnvelope(200, { success: true, result: { any: 'shape' } }, {
          responseEnvelope: 'SUCCESS_RESULT_ERROR',
        }).ok,
      ).toBe(true);
    });

    it('does not mark job SUCCEEDED on HTTP 200 success=false (mocked worker)', async () => {
      ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(SKU, executionVerifiedFixture());
      const http = {
        executeProviderGet: jest.fn().mockResolvedValue({
          httpStatus: 200,
          providerStatusHeader: null,
          body: { success: false, error: 'provider-side failure' },
          redactedRequestPath: 'ezyvin/vinlookup/',
        }),
      };
      const prisma = {
        oneAutoProviderJob: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'job-env-fail',
            organizationId: 'org1',
            vehicleId: 'v1',
            vinSnapshot: TEST_VIN,
            serviceSku: SKU,
            status: OneAutoProviderJobStatus.QUEUED,
            pollAttemptCount: 0,
            expiresAt: new Date(Date.now() + 60_000),
            initialProviderDispatchAt: null,
          }),
          update: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        oneAutoProviderResponse: { create: jest.fn() },
        vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: TEST_VIN }) },
      };
      const config = {
        get: (key?: string) =>
          key === 'oneautoProvider'
            ? { enabled: true, orgDailyBudgetMinor: 500, maxPollAttempts: 1, pollIntervalMs: 1 }
            : { enabled: true, orgDailyBudgetMinor: 500 },
      } as unknown as ConfigService;
      const queue = { add: jest.fn() };
      const svc = new OneAutoProviderExecutionService(
        prisma as never,
        http as never,
        config,
        queue as never,
      );
      await svc.processJob('job-env-fail', 'initial');
      expect(prisma.oneAutoProviderJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastErrorCode: 'ONEAUTO_PROVIDER_ENVELOPE_FAILURE' }),
        }),
      );
      expect(prisma.oneAutoProviderResponse.create).toHaveBeenCalled();
      const persisted = prisma.oneAutoProviderResponse.create.mock.calls[0][0].data.responseBodyJson as Record<
        string,
        unknown
      >;
      expect(persisted._synqdriveEnvelopeDiagnostic).toBeDefined();
    });

    it('merges sanitized envelope diagnostics without leaking error text as new fields', () => {
      const merged = mergeEnvelopeDiagnostic({ success: false, error: 'secret-ish' }, {
        success: false,
        providerErrorPresent: true,
      });
      expect(merged._synqdriveEnvelopeDiagnostic).toEqual({
        success: false,
        providerErrorPresent: true,
      });
      expect(merged.error).toBe('secret-ish');
    });
  });

  describe('HTTP client VIN validation', () => {
    it('rejects invalid VIN before fetch', async () => {
      process.env.ONEAUTO_API_KEY = 'test-key';
      ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(SKU, executionVerifiedFixture());
      const fetchMock = jest.fn();
      const client = new OneAutoHttpClient(enabledSandboxConfig(), fetchMock);
      await expect(
        client.executeProviderGet({ contract: executionVerifiedFixture(), vin: 'NOT-A-VIN' }),
      ).rejects.toMatchObject({ code: 'ONEAUTO_INVALID_VIN' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('normalizes lowercase and whitespace VINs', async () => {
      process.env.ONEAUTO_API_KEY = 'test-key';
      ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(SKU, executionVerifiedFixture());
      const fetchMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify({ success: true, result: {} }),
      });
      const client = new OneAutoHttpClient(enabledSandboxConfig({ maxResponseBytes: 4096 }), fetchMock);
      await client.executeProviderGet({
        contract: executionVerifiedFixture(),
        vin: `  ${TEST_VIN.toLowerCase()}  `,
      });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`vehicle_identification_number=${TEST_VIN}`);
      expect(init.redirect).toBe('manual');
      expect(isValidVin(normalizeVin(`  ${TEST_VIN.toLowerCase()}  `))).toBe(true);
    });
  });

  describe('transport hardening', () => {
    it('rejects redirect status before reading body', () => {
      expect(() => assertNotRedirectStatus(302)).toThrow();
    });

    it('rejects redirect responses from fetch', async () => {
      process.env.ONEAUTO_API_KEY = 'test-key';
      ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(SKU, executionVerifiedFixture());
      const fetchMock = jest.fn().mockResolvedValue({
        status: 302,
        headers: { get: () => null },
        text: async () => '',
      });
      const client = new OneAutoHttpClient(enabledSandboxConfig(), fetchMock);
      await expect(
        client.executeProviderGet({ contract: executionVerifiedFixture(), vin: TEST_VIN }),
      ).rejects.toMatchObject({ code: 'ONEAUTO_UNEXPECTED_REDIRECT' });
    });

    it('rejects oversized bodies', async () => {
      process.env.ONEAUTO_API_KEY = 'test-key';
      ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(SKU, executionVerifiedFixture());
      const huge = 'x'.repeat(512);
      const fetchMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: { get: () => null },
        text: async () => huge,
      });
      const client = new OneAutoHttpClient(enabledSandboxConfig({ maxResponseBytes: 128 }), fetchMock);
      await expect(
        client.executeProviderGet({ contract: executionVerifiedFixture(), vin: TEST_VIN }),
      ).rejects.toMatchObject({ code: 'ONEAUTO_RESPONSE_TOO_LARGE' });
    });

    it('maps generic network failures without embedding response text', async () => {
      process.env.ONEAUTO_API_KEY = 'test-key';
      ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(SKU, executionVerifiedFixture());
      const fetchMock = jest.fn().mockRejectedValue(new Error('network down'));
      const client = new OneAutoHttpClient(enabledSandboxConfig(), fetchMock);
      await expect(
        client.executeProviderGet({ contract: executionVerifiedFixture(), vin: TEST_VIN }),
      ).rejects.toMatchObject({ code: 'ONEAUTO_PROVIDER_REQUEST_FAILED' });
    });

    it('stores non-JSON responses without raw preview text', async () => {
      process.env.ONEAUTO_API_KEY = 'test-key';
      ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(SKU, executionVerifiedFixture());
      const fetchMock = jest.fn().mockResolvedValue({
        status: 502,
        headers: { get: () => null },
        text: async () => 'upstream secret-token=abc',
      });
      const client = new OneAutoHttpClient(enabledSandboxConfig({ maxResponseBytes: 4096 }), fetchMock);
      const result = await client.executeProviderGet({
        contract: executionVerifiedFixture(),
        vin: TEST_VIN,
      });
      expect(result.body).toEqual({ _nonJsonResponse: true, byteLength: expect.any(Number) });
      expect(JSON.stringify(result.body)).not.toContain('secret-token');
    });
  });

  describe('budget guard when enabled', () => {
    it('blocks outbound HTTP when enabled but org budget cap is zero', async () => {
      process.env.ONEAUTO_API_KEY = 'test-key';
      ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(SKU, executionVerifiedFixture());
      const fetchMock = jest.fn();
      const client = new OneAutoHttpClient(
        enabledSandboxConfig({ orgDailyBudgetMinor: 0 }),
        fetchMock,
      );
      await expect(
        client.executeProviderGet({ contract: executionVerifiedFixture(), vin: TEST_VIN }),
      ).rejects.toMatchObject({ code: 'ONEAUTO_BUDGET_NOT_CONFIGURED' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not require budget when provider disabled', () => {
      expect(() =>
        assertOneAutoPositiveOrgBudgetWhenEnabled({ enabled: false, orgDailyBudgetMinor: 0 }),
      ).not.toThrow();
    });
  });

  describe('production fences unchanged', () => {
    it('keeps EXECUTION_VERIFIED registry empty in module map', () => {
      expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.size).toBe(0);
    });
  });
});
