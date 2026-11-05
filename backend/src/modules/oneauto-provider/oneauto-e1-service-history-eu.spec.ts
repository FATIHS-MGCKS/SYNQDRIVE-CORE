import {
  buildExecutionVerifiedOeServiceHistoryEuFullDataCallback,
} from './catalog/oneauto-execution-verified-registry';
import { ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS } from './catalog/oneauto-verified-contracts';
import { OneAutoProviderCallbackService } from './oneauto-provider-callback.service';
import { OneAutoProviderExecutionService } from './oneauto-provider-execution.service';
import { OneAutoProviderJobStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { seedOneAutoExecutionVerifiedRegistry } from './catalog/oneauto-execution-verified-registry';
import { generateOneAutoCallbackDeliveryToken } from './oneauto-callback-delivery.util';
import {
  evaluateOneAutoFullDataCallbackPayload,
  unwrapOneAutoCallbackBody,
} from './oneauto-callback-full-data.util';
import { resolveEffectiveOrgDailyBudgetMinor } from './oneauto-org-budget-test-allowance.util';
import { isOneAutoSkuRuntimeExecutionEnabled } from './oneauto-sku-runtime-activation.util';

const TEST_VIN = 'WVWZZZ3HZLE010725';

function serviceHistoryCallbackBody(
  vin: string = TEST_VIN,
  events: Record<string, unknown>[] = [
    {
      date_of_service_event: '2024-06-01',
      mileage_observed: 12000,
      mileage_unit: 'km',
      service_provider: 'VW Workshop',
      service_type: 'Maintenance',
      service_actions: ['Oil change'],
    },
  ],
) {
  return {
    success: true,
    result: {
      vehicle_identification_number: vin,
      service_events: events,
    },
  };
}

function wrappedCallbackBody(inner: Record<string, unknown>, status = 200) {
  return { status, result: inner };
}

describe('OneAuto E1 OE_SERVICE_HISTORY_EU (offline)', () => {
  const prevHistoryRuntime = process.env.ONEAUTO_SKU_OE_SERVICE_HISTORY_EU_RUNTIME_ENABLED;

  beforeEach(() => {
    process.env.ONEAUTO_SKU_OE_SERVICE_HISTORY_EU_RUNTIME_ENABLED = '1';
    seedOneAutoExecutionVerifiedRegistry(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS);
  });

  afterEach(() => {
    if (prevHistoryRuntime === undefined) {
      delete process.env.ONEAUTO_SKU_OE_SERVICE_HISTORY_EU_RUNTIME_ENABLED;
    } else {
      process.env.ONEAUTO_SKU_OE_SERVICE_HISTORY_EU_RUNTIME_ENABLED = prevHistoryRuntime;
    }
    seedOneAutoExecutionVerifiedRegistry(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS);
  });

  it('seeds execution-verified registry with CALLBACK_FULL_DATA for service history', () => {
    const contract = ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.get('OE_SERVICE_HISTORY_EU')!;
    expect(contract.asyncCompletionMode).toBe('CALLBACK_FULL_DATA');
    expect(contract.providerPathTemplate).toBe('ezyvin/servicehistory/');
  });

  it('requires explicit SKU runtime flag (default off)', () => {
    delete process.env.ONEAUTO_SKU_OE_SERVICE_HISTORY_EU_RUNTIME_ENABLED;
    expect(isOneAutoSkuRuntimeExecutionEnabled('OE_SERVICE_HISTORY_EU')).toBe(false);
  });

  it('evaluates bare and wrapped callback envelopes', () => {
    const contract = buildExecutionVerifiedOeServiceHistoryEuFullDataCallback();
    const bare = evaluateOneAutoFullDataCallbackPayload({
      body: serviceHistoryCallbackBody(),
      contract,
      jobVinSnapshot: TEST_VIN,
      vehicleVin: TEST_VIN,
    });
    expect(bare.ok).toBe(true);
    const wrapped = evaluateOneAutoFullDataCallbackPayload({
      body: wrappedCallbackBody(serviceHistoryCallbackBody()),
      contract,
      jobVinSnapshot: TEST_VIN,
      vehicleVin: TEST_VIN,
    });
    expect(wrapped.ok).toBe(true);
    expect(unwrapOneAutoCallbackBody(wrappedCallbackBody(serviceHistoryCallbackBody())).wrapped).toBe(
      true,
    );
  });

  it('accepts empty service_events array as successful empty history', () => {
    const contract = buildExecutionVerifiedOeServiceHistoryEuFullDataCallback();
    const evalResult = evaluateOneAutoFullDataCallbackPayload({
      body: serviceHistoryCallbackBody(TEST_VIN, []),
      contract,
      jobVinSnapshot: TEST_VIN,
      vehicleVin: TEST_VIN,
    });
    expect(evalResult.ok).toBe(true);
  });

  it('rejects callback when service_events key is absent (unknown shape)', () => {
    const contract = buildExecutionVerifiedOeServiceHistoryEuFullDataCallback();
    const evalResult = evaluateOneAutoFullDataCallbackPayload({
      body: {
        success: true,
        result: { vehicle_identification_number: TEST_VIN },
      },
      contract,
      jobVinSnapshot: TEST_VIN,
      vehicleVin: TEST_VIN,
    });
    expect(evalResult.ok).toBe(false);
    if (!evalResult.ok) {
      expect(evalResult.code).toBe('ONEAUTO_CALLBACK_PAYLOAD_INCOMPLETE');
    }
  });

  it('classifies provider success=false as provider failure', () => {
    const contract = buildExecutionVerifiedOeServiceHistoryEuFullDataCallback();
    const evalResult = evaluateOneAutoFullDataCallbackPayload({
      body: { success: false, result: null, error: 'no data' },
      contract,
      jobVinSnapshot: TEST_VIN,
      vehicleVin: TEST_VIN,
    });
    expect(evalResult.ok).toBe(false);
    if (!evalResult.ok) {
      expect(evalResult.code).toBe('ONEAUTO_CALLBACK_PROVIDER_FAILURE');
    }
  });

  it('classifies wrapped HTTP 206 as partial content', () => {
    const contract = buildExecutionVerifiedOeServiceHistoryEuFullDataCallback();
    const evalResult = evaluateOneAutoFullDataCallbackPayload({
      body: wrappedCallbackBody(serviceHistoryCallbackBody(), 206),
      contract,
      jobVinSnapshot: TEST_VIN,
      vehicleVin: TEST_VIN,
    });
    expect(evalResult.ok).toBe(false);
    if (!evalResult.ok) expect(evalResult.code).toBe('ONEAUTO_PARTIAL_CONTENT');
  });

  it('HTTP 202 initial dispatch then callback completes without retrieval GET', async () => {
    const { deliveryToken, deliveryTokenSha256 } = generateOneAutoCallbackDeliveryToken();
    const http = {
      executeProviderGet: jest.fn().mockResolvedValue({
        httpStatus: 202,
        providerStatusHeader: null,
        body: { success: true, result: { status: 'Accepted' } },
        redactedRequestPath: 'ezyvin/servicehistory/',
      }),
    };
    const queue = { add: jest.fn() };
    const prisma = {
      oneAutoProviderJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'j-e1',
          organizationId: 'org1',
          vehicleId: 'v1',
          vinSnapshot: TEST_VIN,
          serviceSku: 'OE_SERVICE_HISTORY_EU',
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
    );
    await exec.processJob('j-e1', 'initial');
    expect(http.executeProviderGet).toHaveBeenCalledTimes(1);

    const tx = {
      oneAutoProviderResponse: { create: jest.fn() },
      oneAutoProviderJob: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prismaCb = {
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'j-e1',
          organizationId: 'org1',
          vehicleId: 'v1',
          serviceSku: 'OE_SERVICE_HISTORY_EU',
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
    const cb = new OneAutoProviderCallbackService(
      prismaCb as never,
      config,
      queue as never,
      materialize as never,
    );
    const result = await cb.ingestProviderCallback({
      deliveryToken,
      rawBody: JSON.stringify(serviceHistoryCallbackBody()),
      parsedBody: serviceHistoryCallbackBody(),
    });
    expect(result).toEqual({ ok: true, status: 'completed' });
    expect(prismaCb.oneAutoProviderJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { callbackDeliveryTokenSha256: deliveryTokenSha256 } }),
    );
    expect(queue.add).not.toHaveBeenCalled();
    expect(materialize.tryMaterializeFromSucceededJob).not.toHaveBeenCalled();
  });

  it('raises effective budget cap only for allowlisted org on service history SKU', () => {
    const orgId = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
    expect(
      resolveEffectiveOrgDailyBudgetMinor({
        organizationId: orgId,
        serviceSku: 'OE_SERVICE_HISTORY_EU',
        cfg: {
          orgDailyBudgetMinor: 100,
          e1ServiceHistoryTestOrgIds: [orgId],
          e1ServiceHistoryTestOrgBudgetCapMinor: 500,
        },
      }),
    ).toBe(500);
    expect(
      resolveEffectiveOrgDailyBudgetMinor({
        organizationId: orgId,
        serviceSku: 'OE_VIN_LOOKUP_EU',
        cfg: {
          orgDailyBudgetMinor: 100,
          e1ServiceHistoryTestOrgIds: [orgId],
          e1ServiceHistoryTestOrgBudgetCapMinor: 500,
        },
      }),
    ).toBe(100);
  });
});
