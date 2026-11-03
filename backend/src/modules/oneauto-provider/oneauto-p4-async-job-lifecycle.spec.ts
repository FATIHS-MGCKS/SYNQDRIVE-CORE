import { ConfigService } from '@nestjs/config';
import { OneAutoProviderJobStatus } from '@prisma/client';
import { seedOneAutoExecutionVerifiedRegistry } from './catalog/oneauto-execution-verified-registry';
import { ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS } from './catalog/oneauto-verified-contracts';
import type { OneAutoExecutionVerifiedProviderContract } from './catalog/oneauto-contract-types';
import { ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS } from './catalog/oneauto-documented-contracts';
import { OneAutoProviderExecutionService } from './oneauto-provider-execution.service';
import { OneAutoProviderService } from './oneauto-provider.service';
import { OneAutoProviderExecutionService as ExecutionSvc } from './oneauto-provider-execution.service';
import { ConflictException } from '@nestjs/common';

const TEST_VIN = 'WBA12345678901234';

const PRODUCTION_202_BODY = {
  success: true,
  result: {
    status: 'Accepted',
    message:
      'As a callback_url was not provided you will need to poll this method until a non-202 result is returned.',
    function: 'Vin Lookup',
    callBackUrl: null,
  },
};

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
    catalogExecutionMode: 'ASYNC_CAPABLE',
    asyncCapability: 'ASYNC_CAPABLE',
    asyncCompletionMode: 'NONE' as const,
    ...overrides,
  };
}

describe('OneAuto P4 async job lifecycle (offline)', () => {
  afterEach(() => {
    seedOneAutoExecutionVerifiedRegistry(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS);
  });

  function buildExecutionService(http: { executeProviderGet: jest.Mock }) {
    const prisma = {
      oneAutoProviderJob: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
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
          ? { enabled: true, orgDailyBudgetMinor: 500, providerResultRetentionMs: 3_600_000 }
          : { enabled: true, orgDailyBudgetMinor: 500 },
    } as unknown as ConfigService;
    const queue = { add: jest.fn() };
    const oemMaterialization = { tryMaterializeFromSucceededJob: jest.fn() };
    const svc = new OneAutoProviderExecutionService(
      prisma as never,
      http as never,
      config,
      queue as never,
      oemMaterialization as never,
    );
    return { svc, prisma, queue, http };
  }

  it('HTTP 200 → SUCCEEDED', async () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(
      'OE_VIN_LOOKUP_EU',
      executionVerifiedFixture('OE_VIN_LOOKUP_EU'),
    );
    const http = {
      executeProviderGet: jest.fn().mockResolvedValue({
        httpStatus: 200,
        providerStatusHeader: null,
        body: { success: true, result: { vehicle_identification_number: TEST_VIN } },
        redactedRequestPath: 'ezyvin/vinlookup/',
      }),
    };
    const { svc, prisma } = buildExecutionService(http);
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue({
      id: 'j-200',
      organizationId: 'org1',
      vehicleId: 'v1',
      vinSnapshot: TEST_VIN,
      serviceSku: 'OE_VIN_LOOKUP_EU',
      status: OneAutoProviderJobStatus.QUEUED,
      pollAttemptCount: 0,
      expiresAt: new Date(Date.now() + 60_000),
      initialProviderDispatchAt: null,
    });
    await svc.processJob('j-200', 'initial');
    expect(prisma.oneAutoProviderJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OneAutoProviderJobStatus.SUCCEEDED }),
      }),
    );
    expect(http.executeProviderGet).toHaveBeenCalledTimes(1);
  });

  it('HTTP 202 on async-capable SKU → AWAITING_PROVIDER without poll or second GET', async () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(
      'OE_VIN_LOOKUP_EU',
      executionVerifiedFixture('OE_VIN_LOOKUP_EU'),
    );
    const http = {
      executeProviderGet: jest.fn().mockResolvedValue({
        httpStatus: 202,
        providerStatusHeader: null,
        body: PRODUCTION_202_BODY,
        redactedRequestPath: 'ezyvin/vinlookup/',
      }),
    };
    const { svc, prisma, queue } = buildExecutionService(http);
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue({
      id: 'j-202',
      organizationId: 'org1',
      vehicleId: 'v1',
      vinSnapshot: TEST_VIN,
      serviceSku: 'OE_VIN_LOOKUP_EU',
      status: OneAutoProviderJobStatus.QUEUED,
      pollAttemptCount: 0,
      expiresAt: new Date(Date.now() + 86_400_000),
      initialProviderDispatchAt: null,
    });
    await svc.processJob('j-202', 'initial');
    expect(http.executeProviderGet).toHaveBeenCalledTimes(1);
    expect(queue.add).not.toHaveBeenCalled();
    expect(prisma.oneAutoProviderJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OneAutoProviderJobStatus.AWAITING_PROVIDER,
          providerResultExpiresAt: expect.any(Date),
          actualChargeKnown: false,
        }),
      }),
    );
    expect(prisma.oneAutoProviderResponse.create).toHaveBeenCalled();
  });

  it('HTTP 206 → fail-closed', async () => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(
      'OE_VIN_LOOKUP_EU',
      executionVerifiedFixture('OE_VIN_LOOKUP_EU'),
    );
    const http = {
      executeProviderGet: jest.fn().mockResolvedValue({
        httpStatus: 206,
        providerStatusHeader: 'partial',
        body: { success: true, result: {} },
        redactedRequestPath: 'ezyvin/vinlookup/',
      }),
    };
    const { svc, prisma } = buildExecutionService(http);
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue({
      id: 'j-206',
      organizationId: 'org1',
      vehicleId: 'v1',
      vinSnapshot: TEST_VIN,
      serviceSku: 'OE_VIN_LOOKUP_EU',
      status: OneAutoProviderJobStatus.QUEUED,
      pollAttemptCount: 0,
      expiresAt: new Date(Date.now() + 60_000),
      initialProviderDispatchAt: null,
    });
    await svc.processJob('j-206', 'initial');
    expect(prisma.oneAutoProviderJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastErrorCode: 'ONEAUTO_PARTIAL_CONTENT' }),
      }),
    );
  });

  it('does not issue provider request when job already AWAITING_PROVIDER', async () => {
    const http = { executeProviderGet: jest.fn() };
    const { svc, prisma } = buildExecutionService(http);
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue({
      id: 'j-await',
      organizationId: 'org1',
      vehicleId: 'v1',
      vinSnapshot: TEST_VIN,
      serviceSku: 'OE_VIN_LOOKUP_EU',
      status: OneAutoProviderJobStatus.AWAITING_PROVIDER,
      pollAttemptCount: 0,
      expiresAt: new Date(Date.now() + 86_400_000),
      providerResultExpiresAt: new Date(Date.now() + 86_400_000),
      initialProviderDispatchAt: new Date(),
    });
    prisma.oneAutoProviderJob.updateMany.mockResolvedValue({ count: 0 });
    await svc.processJob('j-await', 'initial');
    expect(http.executeProviderGet).not.toHaveBeenCalled();
  });

  it('expires AWAITING_PROVIDER idempotently when retention elapsed', async () => {
    const http = { executeProviderGet: jest.fn() };
    const { svc, prisma } = buildExecutionService(http);
    prisma.oneAutoProviderJob.updateMany.mockResolvedValueOnce({ count: 1 });
    await svc.expireProviderResultIfDue('j-exp');
    expect(prisma.oneAutoProviderJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'j-exp',
          status: OneAutoProviderJobStatus.AWAITING_PROVIDER,
        }),
        data: expect.objectContaining({
          status: OneAutoProviderJobStatus.EXPIRED,
          lastErrorCode: 'ONEAUTO_PROVIDER_RESULT_EXPIRED',
        }),
      }),
    );
    prisma.oneAutoProviderJob.updateMany.mockResolvedValueOnce({ count: 0 });
    await svc.expireProviderResultIfDue('j-exp');
  });

  it('batch-expires due AWAITING jobs without getJob (scheduler path)', async () => {
    const http = { executeProviderGet: jest.fn() };
    const { svc, prisma } = buildExecutionService(http);
    prisma.oneAutoProviderJob.findMany.mockResolvedValue([{ id: 'j-batch-1' }, { id: 'j-batch-2' }]);
    prisma.oneAutoProviderJob.updateMany.mockResolvedValue({ count: 2 });
    const count = await svc.expireDueAwaitingProviderJobsBatch(50);
    expect(count).toBe(2);
    expect(http.executeProviderGet).not.toHaveBeenCalled();
    expect(prisma.oneAutoProviderJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OneAutoProviderJobStatus.EXPIRED,
          lastErrorCode: 'ONEAUTO_PROVIDER_RESULT_EXPIRED',
        }),
      }),
    );
  });

  it('blocks duplicate execute for same org/vehicle/sku while pending', async () => {
    const prisma = {
      oneAutoProviderJob: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({
          id: 'inflight',
          status: OneAutoProviderJobStatus.AWAITING_PROVIDER,
        }),
        aggregate: jest.fn(),
        create: jest.fn(),
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'v1',
          organizationId: 'org1',
          vin: TEST_VIN,
        }),
      },
      $transaction: jest.fn(),
    };
    const config = {
      get: () => ({
        enabled: true,
        orgDailyBudgetMinor: 500,
        quoteTtlMs: 60_000,
        indicativePriceMinorBySku: { OE_VIN_LOOKUP_EU: 36 },
        pricingCatalogVersion: 'synqdrive-p4-vin-lookup-async-capable-v1',
      }),
    } as unknown as ConfigService;
    const execution = { enqueueExecution: jest.fn(), expireProviderResultIfDue: jest.fn() };
    const service = new OneAutoProviderService(
      prisma as never,
      config,
      execution as unknown as ExecutionSvc,
    );
    try {
      await service.executeConfirmed({
        orgId: 'org1',
        vehicleId: 'v1',
        serviceSku: 'OE_VIN_LOOKUP_EU',
        idempotencyKey: 'new-key',
        confirmedPriceMinor: 36,
        pricingSourceVersion: 'synqdrive-p4-vin-lookup-async-capable-v1',
        quoteIssuedAt: new Date().toISOString(),
        acknowledgeIndicativeNotGuaranteed: true,
        masterAdminUserId: 'admin1',
      });
      throw new Error('expected ONEAUTO_JOB_IN_FLIGHT');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'ONEAUTO_JOB_IN_FLIGHT',
      });
    }
  });
});
