import {
  buildExecutionVerifiedOeVinLookupEu,
  buildExecutionVerifiedOeVinLookupEuFullDataCallback,
} from './catalog/oneauto-execution-verified-registry';
import { ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS } from './catalog/oneauto-verified-contracts';
import { OneAutoProviderExecutionService } from './oneauto-provider-execution.service';
import { OneAutoProviderCallbackService } from './oneauto-provider-callback.service';
import { OneAutoProviderJobStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import {
  generateOneAutoCallbackDeliveryToken,
} from './oneauto-callback-delivery.util';
import { evaluateOneAutoFullDataCallbackPayload } from './oneauto-callback-full-data.util';

const TEST_VIN = 'WBA12345678901234';

function validCallbackBody(vin: string = TEST_VIN) {
  return {
    success: true,
    result: {
      vehicle_identification_number: vin,
      manufacturer_desc: 'BMW',
      vehicle_desc: 'Test',
    },
  };
}

function executionPrismaStub(status: OneAutoProviderJobStatus, jobId = 'j-reg') {
  return {
    oneAutoProviderJob: {
      findUnique: jest.fn().mockResolvedValue({
        id: jobId,
        organizationId: 'org1',
        vehicleId: 'v1',
        vinSnapshot: TEST_VIN,
        serviceSku: 'OE_VIN_LOOKUP_EU',
        status,
        pollAttemptCount: 0,
        initialProviderDispatchAt: null,
        expiresAt: new Date(Date.now() + 3600_000),
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
    oneAutoProviderResponse: { create: jest.fn() },
    vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: TEST_VIN }) },
  };
}

describe('OneAuto E4 registry promotion (CALLBACK_FULL_DATA seed)', () => {
  it('seeds OE_VIN_LOOKUP_EU with CALLBACK_FULL_DATA while base builder stays NONE', () => {
    expect(buildExecutionVerifiedOeVinLookupEu().asyncCompletionMode).toBe('NONE');
    const seeded = ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.get('OE_VIN_LOOKUP_EU')!;
    expect(seeded.asyncCompletionMode).toBe('CALLBACK_FULL_DATA');
    expect(buildExecutionVerifiedOeVinLookupEuFullDataCallback().asyncCompletionMode).toBe(
      'CALLBACK_FULL_DATA',
    );
    expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.has('OE_SERVICE_HISTORY_EU')).toBe(true);
  });

  it('does not attach callback_url when registry is CALLBACK_FULL_DATA but callback flags are OFF', async () => {
    const http = {
      executeProviderGet: jest.fn().mockResolvedValue({
        httpStatus: 202,
        providerStatusHeader: null,
        body: { success: true, result: { status: 'Accepted' } },
        redactedRequestPath: 'ezyvin/vinlookup/',
      }),
    };
    const config = {
      get: (key?: string) =>
        key === 'oneautoProvider'
          ? {
              enabled: true,
              orgDailyBudgetMinor: 500,
              callbackEnabled: false,
              callbackFullDataEnabled: false,
              providerResultRetentionMs: 3_600_000,
            }
          : undefined,
    } as unknown as ConfigService;
    const svc = new OneAutoProviderExecutionService(
      executionPrismaStub(OneAutoProviderJobStatus.QUEUED) as never,
      http as never,
      config,
      { add: jest.fn() } as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
      { tryIngestFromSucceededJob: jest.fn() } as never,
    );
    await svc.processJob('j-reg', 'initial');
    expect(http.executeProviderGet).toHaveBeenCalledWith(
      expect.objectContaining({ optionalQueryParameters: undefined }),
    );
  });

  it('attaches callback_url and return_data_in_callback when flags ON and registry CALLBACK_FULL_DATA', async () => {
    const http = {
      executeProviderGet: jest.fn().mockResolvedValue({
        httpStatus: 202,
        providerStatusHeader: null,
        body: { success: true, result: { status: 'Accepted' } },
        redactedRequestPath: 'ezyvin/vinlookup/',
      }),
    };
    const config = {
      get: (key?: string) =>
        key === 'oneautoProvider'
          ? {
              enabled: true,
              orgDailyBudgetMinor: 500,
              callbackEnabled: true,
              callbackFullDataEnabled: true,
              callbackRetrievalGetEnabled: false,
              callbackPublicBaseUrl: 'https://app.synqdrive.eu/api/v1',
              providerResultRetentionMs: 3_600_000,
            }
          : undefined,
    } as unknown as ConfigService;
    const svc = new OneAutoProviderExecutionService(
      executionPrismaStub(OneAutoProviderJobStatus.QUEUED) as never,
      http as never,
      config,
      { add: jest.fn() } as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
      { tryIngestFromSucceededJob: jest.fn() } as never,
    );
    await svc.processJob('j-reg', 'initial');
    expect(http.executeProviderGet).toHaveBeenCalledWith(
      expect.objectContaining({
        optionalQueryParameters: expect.objectContaining({
          return_data_in_callback: true,
          callback_url: expect.stringMatching(/provider-callback\/.+/),
        }),
      }),
    );
  });

  it('preserves sync HTTP 200 initial completion with seeded registry and flags OFF', async () => {
    const http = {
      executeProviderGet: jest.fn().mockResolvedValue({
        httpStatus: 200,
        providerStatusHeader: null,
        body: validCallbackBody(),
        redactedRequestPath: 'ezyvin/vinlookup/',
      }),
    };
    const prisma = executionPrismaStub(OneAutoProviderJobStatus.QUEUED);
    const config = {
      get: (key?: string) =>
        key === 'oneautoProvider'
          ? { enabled: true, orgDailyBudgetMinor: 500, providerResultRetentionMs: 3_600_000 }
          : undefined,
    } as unknown as ConfigService;
    const svc = new OneAutoProviderExecutionService(
      prisma as never,
      http as never,
      config,
      { add: jest.fn() } as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
      { tryIngestFromSucceededJob: jest.fn() } as never,
    );
    await svc.processJob('j-reg', 'initial');
    expect(prisma.oneAutoProviderJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OneAutoProviderJobStatus.SUCCEEDED }),
      }),
    );
    expect(http.executeProviderGet).toHaveBeenCalledTimes(1);
  });

  it('completes full-data callback without retrieval GET (seeded registry)', async () => {
    const { deliveryToken, deliveryTokenSha256 } = generateOneAutoCallbackDeliveryToken();
    const queue = { add: jest.fn() };
    const contract = ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.get('OE_VIN_LOOKUP_EU')!;
    const prisma = {
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'j-e4',
          organizationId: 'org1',
          vehicleId: 'v1',
          serviceSku: 'OE_VIN_LOOKUP_EU',
          vinSnapshot: TEST_VIN,
          status: OneAutoProviderJobStatus.AWAITING_PROVIDER,
          providerCallbackReceivedAt: null,
          retrievalProviderDispatchAt: null,
          providerResultExpiresAt: new Date(Date.now() + 60_000),
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
      },
      oneAutoProviderCallbackInbox: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: TEST_VIN }) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          oneAutoProviderResponse: { create: jest.fn() },
          oneAutoProviderJob: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        }),
      ),
    };
    const config = {
      get: (key?: string) =>
        key === 'oneautoProvider'
          ? {
              enabled: true,
              callbackEnabled: true,
              callbackFullDataEnabled: true,
              callbackRetrievalGetEnabled: false,
            }
          : undefined,
    } as unknown as ConfigService;
    const materialize = { tryMaterializeFromSucceededJob: jest.fn() };
    const callbackSvc = new OneAutoProviderCallbackService(
      prisma as never,
      config,
      queue as never,
      materialize as never,
      { tryIngestFromSucceededJob: jest.fn() } as never,
    );
    const result = await callbackSvc.ingestProviderCallback({
      deliveryToken,
      rawBody: JSON.stringify(validCallbackBody()),
      parsedBody: validCallbackBody(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.status).toBe('completed');
    expect(queue.add).not.toHaveBeenCalledWith('retrieval', expect.anything(), expect.anything());
    expect(materialize.tryMaterializeFromSucceededJob).toHaveBeenCalledWith('j-e4');
    expect(
      evaluateOneAutoFullDataCallbackPayload({
        body: validCallbackBody(),
        contract,
        jobVinSnapshot: TEST_VIN,
        vehicleVin: TEST_VIN,
      }).ok,
    ).toBe(true);
    expect(deliveryTokenSha256).toHaveLength(64);
  });

  it('rejects duplicate callback payload (idempotent)', async () => {
    const prisma = {
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'j1',
          organizationId: 'org1',
          vehicleId: 'v1',
          serviceSku: 'OE_VIN_LOOKUP_EU',
          vinSnapshot: TEST_VIN,
          status: OneAutoProviderJobStatus.AWAITING_PROVIDER,
          providerCallbackReceivedAt: null,
          retrievalProviderDispatchAt: null,
          providerResultExpiresAt: new Date(Date.now() + 60_000),
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
      oneAutoProviderCallbackInbox: {
        findFirst: jest.fn().mockResolvedValue({ id: 'inbox1' }),
      },
    };
    const config = {
      get: (key?: string) =>
        key === 'oneautoProvider'
          ? { enabled: true, callbackEnabled: true, callbackFullDataEnabled: true }
          : undefined,
    } as unknown as ConfigService;
    const svc = new OneAutoProviderCallbackService(
      prisma as never,
      config,
      { add: jest.fn() } as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
        { tryIngestFromSucceededJob: jest.fn() } as never,
    );
    const { deliveryToken } = generateOneAutoCallbackDeliveryToken();
    const result = await svc.ingestProviderCallback({
      deliveryToken,
      rawBody: '{}',
      parsedBody: {},
    });
    expect(result).toEqual({ ok: true, status: 'duplicate' });
  });

  it('ignores callback on expired job', async () => {
    const prisma = {
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'j1',
          organizationId: 'org1',
          vehicleId: 'v1',
          serviceSku: 'OE_VIN_LOOKUP_EU',
          vinSnapshot: TEST_VIN,
          status: OneAutoProviderJobStatus.EXPIRED,
          providerCallbackReceivedAt: null,
          retrievalProviderDispatchAt: null,
          providerResultExpiresAt: new Date(Date.now() - 1000),
          expiresAt: new Date(Date.now() - 1000),
        }),
      },
      oneAutoProviderCallbackInbox: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    const config = {
      get: (key?: string) =>
        key === 'oneautoProvider'
          ? { enabled: true, callbackEnabled: true, callbackFullDataEnabled: true }
          : undefined,
    } as unknown as ConfigService;
    const svc = new OneAutoProviderCallbackService(
      prisma as never,
      config,
      { add: jest.fn() } as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
      { tryIngestFromSucceededJob: jest.fn() } as never,
    );
    const { deliveryToken } = generateOneAutoCallbackDeliveryToken();
    const result = await svc.ingestProviderCallback({
      deliveryToken,
      rawBody: JSON.stringify(validCallbackBody()),
      parsedBody: validCallbackBody(),
    });
    expect(result).toEqual({ ok: true, status: 'ignored_expired' });
  });

  it('handles callback before initial 202 commit via RUNNING state', async () => {
    const queue = { add: jest.fn() };
    const prisma = {
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'j-race',
          organizationId: 'org1',
          vehicleId: 'v1',
          serviceSku: 'OE_VIN_LOOKUP_EU',
          vinSnapshot: TEST_VIN,
          status: OneAutoProviderJobStatus.RUNNING,
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
      vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: TEST_VIN }) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          oneAutoProviderResponse: { create: jest.fn() },
          oneAutoProviderJob: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        }),
      ),
    };
    const config = {
      get: (key?: string) =>
        key === 'oneautoProvider'
          ? { enabled: true, callbackEnabled: true, callbackFullDataEnabled: true }
          : undefined,
    } as unknown as ConfigService;
    const svc = new OneAutoProviderCallbackService(
      prisma as never,
      config,
      queue as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
      { tryIngestFromSucceededJob: jest.fn() } as never,
    );
    const { deliveryToken } = generateOneAutoCallbackDeliveryToken();
    const result = await svc.ingestProviderCallback({
      deliveryToken,
      rawBody: JSON.stringify(validCallbackBody()),
      parsedBody: validCallbackBody(),
    });
    expect(result.ok).toBe(true);
    expect(queue.add).not.toHaveBeenCalled();
  });
});
