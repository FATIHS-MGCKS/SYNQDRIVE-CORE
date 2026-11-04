import { ConfigService } from '@nestjs/config';
import { OneAutoProviderJobStatus } from '@prisma/client';
import { seedOneAutoExecutionVerifiedRegistry } from './catalog/oneauto-execution-verified-registry';
import { ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS } from './catalog/oneauto-verified-contracts';
import type { OneAutoExecutionVerifiedProviderContract } from './catalog/oneauto-contract-types';
import { ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS } from './catalog/oneauto-documented-contracts';
import { OneAutoProviderExecutionService } from './oneauto-provider-execution.service';
import { OneAutoProviderCallbackService } from './oneauto-provider-callback.service';
import {
  buildOneAutoProviderCallbackUrl,
  generateOneAutoCallbackDeliveryToken,
  sha256Hex,
} from './oneauto-callback-delivery.util';
import { OneAutoHttpClient } from './client/oneauto-http.client';

const TEST_VIN = 'WBA12345678901234';

function verifiedFixture(
  overrides: Partial<OneAutoExecutionVerifiedProviderContract> = {},
): OneAutoExecutionVerifiedProviderContract {
  const doc = ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS.get('OE_VIN_LOOKUP_EU');
  if (!doc) throw new Error('missing doc');
  return {
    ...doc,
    evidenceState: 'EXECUTION_VERIFIED',
    asyncPollSameUrlWithoutNewCharge: false,
    http206CompleteSuccessAllowed: false,
    asyncCompletionMode: 'NONE',
    catalogExecutionMode: 'ASYNC_CAPABLE',
    asyncCapability: 'ASYNC_CAPABLE',
    pricingSourceVersion: 'test-v1',
    ...overrides,
  };
}

describe('OneAuto P4 PR3 callback completion (offline, flags default OFF)', () => {
  afterEach(() => {
    seedOneAutoExecutionVerifiedRegistry(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS);
  });

  it('builds callback URL with encoded delivery token', () => {
    const { deliveryToken } = generateOneAutoCallbackDeliveryToken();
    const url = buildOneAutoProviderCallbackUrl('https://app.synqdrive.eu/api/v1', deliveryToken);
    expect(url).toMatch(
      /^https:\/\/app\.synqdrive\.eu\/api\/v1\/webhooks\/oneauto\/provider-callback\/.+/,
    );
  });

  it('does not attach callback_url on initial dispatch when registry mode is NONE', async () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set('OE_VIN_LOOKUP_EU', verifiedFixture());
    const http = {
      executeProviderGet: jest.fn().mockResolvedValue({
        httpStatus: 202,
        providerStatusHeader: null,
        body: { success: true, result: { status: 'Accepted' } },
        redactedRequestPath: 'ezyvin/vinlookup/',
      }),
    };
    const prisma = {
      oneAutoProviderJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'j1',
          organizationId: 'org1',
          vehicleId: 'v1',
          vinSnapshot: TEST_VIN,
          serviceSku: 'OE_VIN_LOOKUP_EU',
          status: OneAutoProviderJobStatus.QUEUED,
          pollAttemptCount: 0,
          initialProviderDispatchAt: null,
          expiresAt: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      oneAutoProviderResponse: { create: jest.fn() },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: TEST_VIN }) },
    };
    const config = {
      get: (key?: string) =>
        key === 'oneautoProvider'
          ? {
              enabled: true,
              orgDailyBudgetMinor: 500,
              callbackEnabled: true,
              callbackRetrievalGetEnabled: true,
              providerResultRetentionMs: 3_600_000,
            }
          : undefined,
    } as unknown as ConfigService;
    const svc = new OneAutoProviderExecutionService(
      prisma as never,
      http as never,
      config,
      { add: jest.fn() } as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
    );
    await svc.processJob('j1', 'initial');
    expect(http.executeProviderGet).toHaveBeenCalledWith(
      expect.objectContaining({
        optionalQueryParameters: undefined,
      }),
    );
  });

  it('queues retrieval after callback when mode and flags allow', async () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(
      'OE_VIN_LOOKUP_EU',
      verifiedFixture({ asyncCompletionMode: 'CALLBACK_NOTIFY_THEN_GET' }),
    );
    const { deliveryToken, deliveryTokenSha256 } = generateOneAutoCallbackDeliveryToken();
    const prisma = {
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'j-cb',
          organizationId: 'org1',
          serviceSku: 'OE_VIN_LOOKUP_EU',
          status: OneAutoProviderJobStatus.AWAITING_PROVIDER,
          providerCallbackReceivedAt: null,
          retrievalProviderDispatchAt: null,
          providerResultExpiresAt: new Date(Date.now() + 60_000),
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      oneAutoProviderCallbackInbox: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    const queue = { add: jest.fn() };
    const config = {
      get: () => ({
        enabled: true,
        callbackEnabled: true,
        callbackRetrievalGetEnabled: true,
      }),
    } as unknown as ConfigService;
    const svc = new OneAutoProviderCallbackService(prisma as never, config, queue as never);
    const result = await svc.ingestProviderCallback({
      deliveryToken,
      rawBody: JSON.stringify({ notify: true }),
      parsedBody: { notify: true },
    });
    expect(result).toEqual({ ok: true, status: 'accepted' });
    expect(prisma.oneAutoProviderJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { callbackDeliveryTokenSha256: deliveryTokenSha256 },
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'retrieval',
      { jobId: 'j-cb', phase: 'retrieval' },
      expect.objectContaining({ jobId: 'oneauto:retrieval:j-cb' }),
    );
  });

  it('rejects callback ingest when flags disabled', async () => {
    const config = {
      get: () => ({ enabled: true, callbackEnabled: false, callbackRetrievalGetEnabled: false }),
    } as unknown as ConfigService;
    const svc = new OneAutoProviderCallbackService(
      { oneAutoProviderJob: { findFirst: jest.fn() } } as never,
      config,
      { add: jest.fn() } as never,
    );
    const result = await svc.ingestProviderCallback({
      deliveryToken: 'x',
      rawBody: '{}',
      parsedBody: {},
    });
    expect(result).toEqual({ ok: false, status: 'disabled' });
  });

  it('http client encodes optional callback query params', async () => {
    process.env.ONEAUTO_API_KEY = 'test-key';
    const fetchMock = jest.fn().mockResolvedValue({
      status: 202,
      headers: { get: () => null },
      text: async () => '{}',
    });
    const client = new OneAutoHttpClient(
      {
        get: () => ({
          enabled: true,
          apiKeyPresent: true,
          baseUrl: 'https://sandbox.oneautoapi.com',
          orgDailyBudgetMinor: 100,
        }),
      } as unknown as ConfigService,
      fetchMock,
    );
    const contract = verifiedFixture({ asyncCompletionMode: 'CALLBACK_NOTIFY_THEN_GET' });
    await client.executeProviderGet({
      contract,
      vin: TEST_VIN,
      optionalQueryParameters: {
        callback_url: 'https://app.synqdrive.eu/api/v1/webhooks/oneauto/provider-callback/tok',
        return_data_in_callback: false,
      },
    });
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('callback_url=');
    expect(calledUrl).toContain('return_data_in_callback=false');
    delete process.env.ONEAUTO_API_KEY;
  });
});
