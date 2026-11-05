import {
  buildExecutionVerifiedOeVinLookupEuFullDataCallback,
} from './catalog/oneauto-execution-verified-registry';
import { ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS } from './catalog/oneauto-verified-contracts';
import type { OneAutoExecutionVerifiedProviderContract } from './catalog/oneauto-contract-types';
import { OneAutoProviderExecutionService } from './oneauto-provider-execution.service';
import { OneAutoProviderCallbackService } from './oneauto-provider-callback.service';
import { OneAutoProviderJobStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { seedOneAutoExecutionVerifiedRegistry } from './catalog/oneauto-execution-verified-registry';
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

function verifiedFullDataFixture(): OneAutoExecutionVerifiedProviderContract {
  return buildExecutionVerifiedOeVinLookupEuFullDataCallback();
}

describe('OneAuto E4 full-data callback (offline)', () => {
  afterEach(() => {
    seedOneAutoExecutionVerifiedRegistry(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS);
  });

  it('evaluates OpenAPI-shaped callback payload with result VIN', () => {
    const contract = verifiedFullDataFixture();
    const evalResult = evaluateOneAutoFullDataCallbackPayload({
      body: validCallbackBody(),
      contract,
      jobVinSnapshot: TEST_VIN,
      vehicleVin: TEST_VIN,
    });
    expect(evalResult.ok).toBe(true);
  });

  it('HTTP 202 then valid callback completes job without retrieval GET', async () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set('OE_VIN_LOOKUP_EU', verifiedFullDataFixture());
    const { deliveryToken, deliveryTokenSha256 } = generateOneAutoCallbackDeliveryToken();
    const http = {
      executeProviderGet: jest.fn().mockResolvedValue({
        httpStatus: 202,
        providerStatusHeader: null,
        body: { success: true, result: { status: 'Accepted' } },
        redactedRequestPath: 'ezyvin/vinlookup/',
      }),
    };
    const queue = { add: jest.fn() };
    const prisma = {
      oneAutoProviderJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'j-e4',
          organizationId: 'org1',
          vehicleId: 'v1',
          vinSnapshot: TEST_VIN,
          serviceSku: 'OE_VIN_LOOKUP_EU',
          status: OneAutoProviderJobStatus.QUEUED,
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
    const config = {
      get: (key?: string) =>
        key === 'oneautoProvider'
          ? {
              enabled: true,
              orgDailyBudgetMinor: 500,
              callbackEnabled: true,
              callbackFullDataEnabled: true,
              providerResultRetentionMs: 3_600_000,
            }
          : undefined,
    } as unknown as ConfigService;
    const exec = new OneAutoProviderExecutionService(
      prisma as never,
      http as never,
      config,
      queue as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
      { tryIngestFromSucceededJob: jest.fn() } as never,
    );
    await exec.processJob('j-e4', 'initial');
    expect(http.executeProviderGet).toHaveBeenCalledWith(
      expect.objectContaining({
        optionalQueryParameters: expect.objectContaining({
          return_data_in_callback: true,
        }),
      }),
    );
    expect(queue.add).not.toHaveBeenCalledWith('retrieval', expect.anything(), expect.anything());

    const tx = {
      oneAutoProviderResponse: { create: jest.fn() },
      oneAutoProviderJob: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prismaCb = {
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
          expiresAt: new Date(Date.now() + 3600_000),
        }),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      oneAutoProviderCallbackInbox: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: TEST_VIN }) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<number>) => fn(tx)),
    };
    const materialize = { tryMaterializeFromSucceededJob: jest.fn() };
    const cb = new OneAutoProviderCallbackService(
      prismaCb as never,
      config,
      queue as never,
      materialize as never,
      { tryIngestFromSucceededJob: jest.fn() } as never,
    );
    const result = await cb.ingestProviderCallback({
      deliveryToken,
      rawBody: JSON.stringify(validCallbackBody()),
      parsedBody: validCallbackBody(),
    });
    expect(result).toEqual({ ok: true, status: 'completed' });
    expect(prismaCb.oneAutoProviderJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { callbackDeliveryTokenSha256: deliveryTokenSha256 } }),
    );
    expect(queue.add).not.toHaveBeenCalled();
    expect(materialize.tryMaterializeFromSucceededJob).toHaveBeenCalledWith('j-e4');
  });

  it('rejects duplicate callback payload', async () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set('OE_VIN_LOOKUP_EU', verifiedFullDataFixture());
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
          expiresAt: new Date(Date.now() + 3600_000),
        }),
      },
      oneAutoProviderCallbackInbox: {
        findFirst: jest.fn().mockResolvedValue({ id: 'dup' }),
      },
    };
    const config = {
      get: () => ({
        enabled: true,
        callbackEnabled: true,
        callbackFullDataEnabled: true,
      }),
    } as unknown as ConfigService;
    const svc = new OneAutoProviderCallbackService(
      prisma as never,
      config,
      { add: jest.fn() } as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
        { tryIngestFromSucceededJob: jest.fn() } as never,
    );
    const result = await svc.ingestProviderCallback({
      deliveryToken: 'tok',
      rawBody: '{}',
      parsedBody: {},
    });
    expect(result).toEqual({ ok: true, status: 'duplicate' });
  });

  it('returns unknown_token for invalid delivery token', async () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set('OE_VIN_LOOKUP_EU', verifiedFullDataFixture());
    const prisma = {
      oneAutoProviderJob: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const config = {
      get: () => ({ enabled: true, callbackEnabled: true, callbackFullDataEnabled: true }),
    } as unknown as ConfigService;
    const svc = new OneAutoProviderCallbackService(
      prisma as never,
      config,
      { add: jest.fn() } as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
      { tryIngestFromSucceededJob: jest.fn() } as never,
    );
    const result = await svc.ingestProviderCallback({
      deliveryToken: 'missing',
      rawBody: '{}',
      parsedBody: {},
    });
    expect(result).toEqual({ ok: false, status: 'unknown_token' });
  });

  it('rejects malformed callback payload', async () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set('OE_VIN_LOOKUP_EU', verifiedFullDataFixture());
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
          expiresAt: new Date(Date.now() + 3600_000),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      oneAutoProviderCallbackInbox: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: TEST_VIN }) },
    };
    const config = {
      get: () => ({ enabled: true, callbackEnabled: true, callbackFullDataEnabled: true }),
    } as unknown as ConfigService;
    const svc = new OneAutoProviderCallbackService(
      prisma as never,
      config,
      { add: jest.fn() } as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
      { tryIngestFromSucceededJob: jest.fn() } as never,
    );
    const result = await svc.ingestProviderCallback({
      deliveryToken: 'tok',
      rawBody: '{"success":"yes"}',
      parsedBody: { success: 'yes' },
    });
    expect(result).toEqual({ ok: false, status: 'payload_rejected' });
    expect(prisma.oneAutoProviderJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OneAutoProviderJobStatus.FAILED,
          lastErrorCode: 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED',
        }),
      }),
    );
  });

  it('handles callback before initial 202 commit via RUNNING state', async () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set('OE_VIN_LOOKUP_EU', verifiedFullDataFixture());
    const tx = {
      oneAutoProviderResponse: { create: jest.fn() },
      oneAutoProviderJob: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
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
          providerResultExpiresAt: null,
          expiresAt: new Date(Date.now() + 3600_000),
        }),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      oneAutoProviderCallbackInbox: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: TEST_VIN }) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<number>) => fn(tx)),
    };
    const config = {
      get: () => ({ enabled: true, callbackEnabled: true, callbackFullDataEnabled: true }),
    } as unknown as ConfigService;
    const svc = new OneAutoProviderCallbackService(
      prisma as never,
      config,
      { add: jest.fn() } as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
      { tryIngestFromSucceededJob: jest.fn() } as never,
    );
    const result = await svc.ingestProviderCallback({
      deliveryToken: 'tok',
      rawBody: JSON.stringify(validCallbackBody()),
      parsedBody: validCallbackBody(),
    });
    expect(result.ok).toBe(true);
    expect(result).toEqual(expect.objectContaining({ status: 'completed' }));
  });

  it('does not enqueue retrieval for full-data mode', async () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set('OE_VIN_LOOKUP_EU', verifiedFullDataFixture());
    const queue = { add: jest.fn() };
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
          expiresAt: new Date(Date.now() + 3600_000),
        }),
      },
      oneAutoProviderCallbackInbox: { findFirst: jest.fn().mockResolvedValue({ id: 'x' }) },
    };
    const config = {
      get: () => ({
        enabled: true,
        callbackEnabled: true,
        callbackFullDataEnabled: true,
        callbackRetrievalGetEnabled: true,
      }),
    } as unknown as ConfigService;
    const svc = new OneAutoProviderCallbackService(
      prisma as never,
      config,
      queue as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
      { tryIngestFromSucceededJob: jest.fn() } as never,
    );
    await svc.ingestProviderCallback({ deliveryToken: 't', rawBody: '{}', parsedBody: {} });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('ignores callback on expired job', async () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set('OE_VIN_LOOKUP_EU', verifiedFullDataFixture());
    const prisma = {
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'j-exp',
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
      get: () => ({ enabled: true, callbackEnabled: true, callbackFullDataEnabled: true }),
    } as unknown as ConfigService;
    const svc = new OneAutoProviderCallbackService(
      prisma as never,
      config,
      { add: jest.fn() } as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
      { tryIngestFromSucceededJob: jest.fn() } as never,
    );
    const result = await svc.ingestProviderCallback({
      deliveryToken: 'tok',
      rawBody: JSON.stringify(validCallbackBody()),
      parsedBody: validCallbackBody(),
    });
    expect(result).toEqual({ ok: true, status: 'ignored_expired' });
  });

  it('enforces tenant isolation on vehicle binding', async () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set('OE_VIN_LOOKUP_EU', verifiedFullDataFixture());
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
          expiresAt: new Date(Date.now() + 3600_000),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      oneAutoProviderCallbackInbox: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const config = {
      get: () => ({ enabled: true, callbackEnabled: true, callbackFullDataEnabled: true }),
    } as unknown as ConfigService;
    const svc = new OneAutoProviderCallbackService(
      prisma as never,
      config,
      { add: jest.fn() } as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
      { tryIngestFromSucceededJob: jest.fn() } as never,
    );
    const result = await svc.ingestProviderCallback({
      deliveryToken: 'tok',
      rawBody: JSON.stringify(validCallbackBody()),
      parsedBody: validCallbackBody(),
    });
    expect(result).toEqual({ ok: false, status: 'payload_rejected' });
  });

  it('rejects incomplete result object', () => {
    const contract = verifiedFullDataFixture();
    const evalResult = evaluateOneAutoFullDataCallbackPayload({
      body: { success: true, result: {} },
      contract,
      jobVinSnapshot: TEST_VIN,
      vehicleVin: TEST_VIN,
    });
    expect(evalResult.ok).toBe(false);
  });

  it('preserves sync HTTP 200 initial completion', async () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set('OE_VIN_LOOKUP_EU', verifiedFullDataFixture());
    const http = {
      executeProviderGet: jest.fn().mockResolvedValue({
        httpStatus: 200,
        providerStatusHeader: null,
        body: validCallbackBody(),
        redactedRequestPath: 'ezyvin/vinlookup/',
      }),
    };
    const prisma = {
      oneAutoProviderJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'j-sync',
          organizationId: 'org1',
          vehicleId: 'v1',
          vinSnapshot: TEST_VIN,
          serviceSku: 'OE_VIN_LOOKUP_EU',
          status: OneAutoProviderJobStatus.QUEUED,
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
    const config = {
      get: (key?: string) =>
        key === 'oneautoProvider'
          ? {
              enabled: true,
              orgDailyBudgetMinor: 500,
              callbackEnabled: true,
              callbackFullDataEnabled: true,
            }
          : undefined,
    } as unknown as ConfigService;
    const exec = new OneAutoProviderExecutionService(
      prisma as never,
      http as never,
      config,
      { add: jest.fn() } as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
      { tryIngestFromSucceededJob: jest.fn() } as never,
    );
    await exec.processJob('j-sync', 'initial');
    expect(prisma.oneAutoProviderJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OneAutoProviderJobStatus.SUCCEEDED }),
      }),
    );
    expect(http.executeProviderGet).toHaveBeenCalledTimes(1);
  });
});
