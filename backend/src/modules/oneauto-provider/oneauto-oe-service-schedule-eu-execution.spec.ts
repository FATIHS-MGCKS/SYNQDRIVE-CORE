import {
  buildExecutionVerifiedOeServiceScheduleEuFullDataCallback,
  seedOneAutoExecutionVerifiedRegistry,
} from './catalog/oneauto-execution-verified-registry';
import { ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS } from './catalog/oneauto-verified-contracts';
import { OneAutoProviderCallbackService } from './oneauto-provider-callback.service';
import { OneAutoProviderExecutionService } from './oneauto-provider-execution.service';
import { OneAutoProviderJobStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { generateOneAutoCallbackDeliveryToken } from './oneauto-callback-delivery.util';
import {
  evaluateOneAutoFullDataCallbackPayload,
  unwrapOneAutoCallbackBody,
} from './oneauto-callback-full-data.util';
import { isOneAutoSkuRuntimeExecutionEnabled } from './oneauto-sku-runtime-activation.util';
import {
  buildOeServiceScheduleSuccessEnvelope,
  ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
} from './service-schedule/oneauto-oe-service-schedule.fixtures';

const TEST_VIN = ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN;

function scheduleCallbackBody(vin: string = TEST_VIN) {
  return buildOeServiceScheduleSuccessEnvelope(vin);
}

function wrappedCallbackBody(inner: Record<string, unknown>, status = 200) {
  return { status, result: inner };
}

describe('OneAuto OE_SERVICE_SCHEDULE EU execution (offline, E4 pattern)', () => {
  const prevScheduleRuntime = process.env.ONEAUTO_SKU_OE_SERVICE_SCHEDULE_RUNTIME_ENABLED;

  beforeEach(() => {
    process.env.ONEAUTO_SKU_OE_SERVICE_SCHEDULE_RUNTIME_ENABLED = '1';
    seedOneAutoExecutionVerifiedRegistry(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS);
  });

  afterEach(() => {
    if (prevScheduleRuntime === undefined) {
      delete process.env.ONEAUTO_SKU_OE_SERVICE_SCHEDULE_RUNTIME_ENABLED;
    } else {
      process.env.ONEAUTO_SKU_OE_SERVICE_SCHEDULE_RUNTIME_ENABLED = prevScheduleRuntime;
    }
    seedOneAutoExecutionVerifiedRegistry(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS);
  });

  it('seeds execution-verified registry with CALLBACK_FULL_DATA for service schedule', () => {
    const contract = ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.get('OE_SERVICE_SCHEDULE')!;
    expect(contract.asyncCompletionMode).toBe('CALLBACK_FULL_DATA');
    expect(contract.providerPathTemplate).toBe('oneauto/oeserviceschedulefromvin/v2');
  });

  it('requires explicit SKU runtime flag (default off)', () => {
    delete process.env.ONEAUTO_SKU_OE_SERVICE_SCHEDULE_RUNTIME_ENABLED;
    expect(isOneAutoSkuRuntimeExecutionEnabled('OE_SERVICE_SCHEDULE')).toBe(false);
  });

  it('HTTP 200 initial dispatch succeeds without side-effect ingestion hooks', async () => {
    const http = {
      executeProviderGet: jest.fn().mockResolvedValue({
        httpStatus: 200,
        providerStatusHeader: null,
        body: { success: true, result: scheduleCallbackBody() },
        redactedRequestPath: 'oneauto/oeserviceschedulefromvin/v2',
      }),
    };
    const prisma = {
      oneAutoProviderJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'j-sched-200',
          organizationId: 'org1',
          vehicleId: 'v1',
          vinSnapshot: TEST_VIN,
          serviceSku: 'OE_SERVICE_SCHEDULE',
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
          ? { enabled: true, orgDailyBudgetMinor: 500, callbackEnabled: true, callbackFullDataEnabled: true }
          : undefined,
    } as unknown as ConfigService;
    const materialize = { tryMaterializeFromSucceededJob: jest.fn() };
    const ingestion = { tryIngestFromSucceededJob: jest.fn() };
    const exec = new OneAutoProviderExecutionService(
      prisma as never,
      http as never,
      config,
      { add: jest.fn() } as never,
      materialize as never,
      ingestion as never,
    );
    await exec.processJob('j-sched-200', 'initial');
    expect(http.executeProviderGet).toHaveBeenCalledTimes(1);
    expect(materialize.tryMaterializeFromSucceededJob).not.toHaveBeenCalled();
    expect(ingestion.tryIngestFromSucceededJob).not.toHaveBeenCalled();
  });

  it('HTTP 202 initial dispatch then full-data callback completes without retrieval GET', async () => {
    const { deliveryToken, deliveryTokenSha256 } = generateOneAutoCallbackDeliveryToken();
    const http = {
      executeProviderGet: jest.fn().mockResolvedValue({
        httpStatus: 202,
        providerStatusHeader: null,
        body: { success: true, result: { status: 'Accepted' } },
        redactedRequestPath: 'oneauto/oeserviceschedulefromvin/v2',
      }),
    };
    const queue = { add: jest.fn() };
    const prisma = {
      oneAutoProviderJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'j-sched-202',
          organizationId: 'org1',
          vehicleId: 'v1',
          vinSnapshot: TEST_VIN,
          serviceSku: 'OE_SERVICE_SCHEDULE',
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
    await exec.processJob('j-sched-202', 'initial');
    expect(http.executeProviderGet).toHaveBeenCalledTimes(1);

    const tx = {
      oneAutoProviderResponse: { create: jest.fn() },
      oneAutoProviderJob: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prismaCb = {
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'j-sched-202',
          organizationId: 'org1',
          vehicleId: 'v1',
          serviceSku: 'OE_SERVICE_SCHEDULE',
          vinSnapshot: TEST_VIN,
          status: OneAutoProviderJobStatus.AWAITING_PROVIDER,
          providerCallbackReceivedAt: null,
          retrievalProviderDispatchAt: null,
          providerResultExpiresAt: new Date(Date.now() + 60_000),
          expiresAt: new Date(Date.now() + 3600_000),
        }),
      },
      oneAutoProviderCallbackInbox: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: TEST_VIN }) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<number>) => fn(tx)),
    };
    const materialize = { tryMaterializeFromSucceededJob: jest.fn() };
    const ingestion = { tryIngestFromSucceededJob: jest.fn() };
    const cb = new OneAutoProviderCallbackService(
      prismaCb as never,
      config,
      queue as never,
      materialize as never,
      ingestion as never,
    );
    const result = await cb.ingestProviderCallback({
      deliveryToken,
      rawBody: JSON.stringify(scheduleCallbackBody()),
      parsedBody: scheduleCallbackBody(),
    });
    expect(result).toEqual({ ok: true, status: 'completed' });
    expect(prismaCb.oneAutoProviderJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { callbackDeliveryTokenSha256: deliveryTokenSha256 } }),
    );
    expect(queue.add).not.toHaveBeenCalled();
    expect(materialize.tryMaterializeFromSucceededJob).not.toHaveBeenCalled();
    expect(ingestion.tryIngestFromSucceededJob).not.toHaveBeenCalled();
  });

  it('classifies wrapped HTTP 206 as partial content', () => {
    const contract = buildExecutionVerifiedOeServiceScheduleEuFullDataCallback();
    const evalResult = evaluateOneAutoFullDataCallbackPayload({
      body: wrappedCallbackBody(scheduleCallbackBody(), 206),
      contract,
      jobVinSnapshot: TEST_VIN,
      vehicleVin: TEST_VIN,
    });
    expect(evalResult.ok).toBe(false);
    if (!evalResult.ok) expect(evalResult.code).toBe('ONEAUTO_PARTIAL_CONTENT');
  });

  it('rejects callback VIN mismatch', () => {
    const contract = buildExecutionVerifiedOeServiceScheduleEuFullDataCallback();
    const evalResult = evaluateOneAutoFullDataCallbackPayload({
      body: scheduleCallbackBody('WVWZZZ3HZLE010725'),
      contract,
      jobVinSnapshot: TEST_VIN,
      vehicleVin: TEST_VIN,
    });
    expect(evalResult.ok).toBe(false);
    if (!evalResult.ok) expect(evalResult.code).toBe('ONEAUTO_CALLBACK_VIN_MISMATCH');
  });

  it('unwraps wrapped callback bodies for schedule SKU', () => {
    const inner = scheduleCallbackBody();
    const unwrapped = unwrapOneAutoCallbackBody(wrappedCallbackBody(inner));
    expect(unwrapped.wrapped).toBe(true);
    expect(unwrapped.envelope).toEqual(inner);
  });

  it('rejects duplicate callback payload', async () => {
    const prisma = {
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'j-dup',
          organizationId: 'org1',
          vehicleId: 'v1',
          serviceSku: 'OE_SERVICE_SCHEDULE',
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
});
