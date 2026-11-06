import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OneAutoProviderJobStatus } from '@prisma/client';
import { OneAutoProviderService } from './oneauto-provider.service';
import { OneAutoProviderExecutionService } from './oneauto-provider-execution.service';
import * as verifiedContracts from './catalog/oneauto-verified-contracts';
import * as contractGate from './catalog/oneauto-contract-gate.util';
import { ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU } from './service-schedule/oneauto-service-schedule-eu.types';

describe('OneAutoProviderService cost and idempotency', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn() },
    oneAutoProviderJob: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
    },
    oneAutoProviderResponse: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const execution = { enqueueExecution: jest.fn(), expireProviderResultIfDue: jest.fn() };
  const config = {
    get: () => ({
      enabled: true,
      indicativePriceMinorBySku: { OE_VIN_LOOKUP_EU: 150 },
      pricingCatalogVersion: 'synqdrive-catalog-v1',
      orgDailyBudgetMinor: 500,
      quoteTtlMs: 300_000,
      jobTtlMs: 86_400_000,
    }),
  } as unknown as ConfigService;

  let service: OneAutoProviderService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OneAutoProviderService(
      prisma as never,
      config,
      execution as unknown as OneAutoProviderExecutionService,
    );
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'v1',
      organizationId: 'org1',
      vin: 'WBA12345678901234',
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  });

  it('blocks execute when provider contract is unverified', async () => {
    /** Documented-only SKU — verified execution SKUs (e.g. OE_SERVICE_HISTORY_EU) fail earlier with SKU_RUNTIME_DISABLED when unpriced. */
    try {
      await service.executeConfirmed({
        orgId: 'org1',
        vehicleId: 'v1',
        serviceSku: 'OE_BUILD_DECODE',
        idempotencyKey: 'key-1',
        confirmedPriceMinor: 150,
        pricingSourceVersion: 'synqdrive-catalog-v1',
        quoteIssuedAt: new Date().toISOString(),
        acknowledgeIndicativeNotGuaranteed: true,
        masterAdminUserId: 'ma-1',
      });
      throw new Error('expected CONTRACT_UNVERIFIED');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'CONTRACT_UNVERIFIED',
      });
    }
  });

  it('blocks execute when enabled without org daily budget cap', async () => {
    const noBudgetConfig = {
      get: () => ({
        enabled: true,
        indicativePriceMinorBySku: { OE_VIN_LOOKUP_EU: 150 },
        pricingCatalogVersion: 'synqdrive-catalog-v1',
        orgDailyBudgetMinor: 0,
        quoteTtlMs: 300_000,
        jobTtlMs: 86_400_000,
      }),
    } as unknown as ConfigService;
    const noBudgetService = new OneAutoProviderService(
      prisma as never,
      noBudgetConfig,
      execution as unknown as OneAutoProviderExecutionService,
    );
    try {
      await noBudgetService.executeConfirmed({
        orgId: 'org1',
        vehicleId: 'v1',
        serviceSku: 'OE_VIN_LOOKUP_EU',
        idempotencyKey: 'key-budget-config',
        confirmedPriceMinor: 150,
        pricingSourceVersion: 'synqdrive-catalog-v1',
        quoteIssuedAt: new Date().toISOString(),
        acknowledgeIndicativeNotGuaranteed: true,
        masterAdminUserId: 'ma-1',
      });
      throw new Error('expected ONEAUTO_BUDGET_NOT_CONFIGURED');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'ONEAUTO_BUDGET_NOT_CONFIGURED',
      });
    }
  });

  it('returns existing job for duplicate idempotency key', async () => {
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue({
      id: 'job-existing',
      organizationId: 'org1',
      vehicleId: 'v1',
      vinSnapshot: 'WBA12345678901234',
      serviceSku: 'OE_VIN_LOOKUP_EU',
      status: OneAutoProviderJobStatus.SUCCEEDED,
      idempotencyKey: 'key-dup',
      providerRequestId: null,
      estimatedPriceMinor: 150,
      currency: 'GBP',
      pricingSourceVersion: 'synqdrive-catalog-v1',
      costConfirmedAt: new Date(),
      confirmedPriceMinor: 150,
      actualChargeMinor: null,
      actualChargeKnown: false,
      pollAttemptCount: 0,
      lastErrorCode: null,
      initialProviderDispatchAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.executeConfirmed({
      orgId: 'org1',
      vehicleId: 'v1',
      serviceSku: 'OE_VIN_LOOKUP_EU',
      idempotencyKey: 'key-dup',
      confirmedPriceMinor: 150,
      pricingSourceVersion: 'synqdrive-catalog-v1',
      quoteIssuedAt: new Date().toISOString(),
      acknowledgeIndicativeNotGuaranteed: true,
      masterAdminUserId: 'ma-1',
    });
    expect(result.id).toBe('job-existing');
    expect(prisma.oneAutoProviderJob.create).not.toHaveBeenCalled();
  });

  it('rejects budget exceeded inside transaction', async () => {
    jest.spyOn(contractGate, 'assertOneAutoSkuExecutable').mockImplementation(() => undefined);
    jest.spyOn(service, 'quote').mockResolvedValue({
      organizationId: 'org1',
      vehicleId: 'v1',
      serviceSku: 'OE_VIN_LOOKUP_EU',
      vinSnapshot: 'WBA12345678901234',
      estimatedPriceMinor: 150,
      currency: 'GBP',
      pricingSourceVersion: 'synqdrive-catalog-v1',
      executionMode: 'SYNC',
      indicativeNotGuaranteed: true,
      quoteIssuedAt: new Date().toISOString(),
      quoteExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      contractGate: verifiedContracts.buildOneAutoContractGateReport('OE_VIN_LOOKUP_EU'),
    });
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue(null);
    prisma.oneAutoProviderJob.findFirst.mockResolvedValue(null);
    prisma.oneAutoProviderJob.aggregate.mockResolvedValue({ _sum: { budgetReservedMinor: 400 } });
    prisma.oneAutoProviderJob.create.mockImplementation(() => {
      throw new Error('create must not run when budget exceeded');
    });
    await expect(
      service.executeConfirmed({
        orgId: 'org1',
        vehicleId: 'v1',
        serviceSku: 'OE_VIN_LOOKUP_EU',
        idempotencyKey: 'key-budget',
        confirmedPriceMinor: 150,
        pricingSourceVersion: 'synqdrive-catalog-v1',
        quoteIssuedAt: new Date().toISOString(),
        acknowledgeIndicativeNotGuaranteed: true,
        masterAdminUserId: 'ma-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.oneAutoProviderJob.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: expect.arrayContaining([
              OneAutoProviderJobStatus.EXPIRED,
              OneAutoProviderJobStatus.FAILED,
            ]),
          },
        }),
      }),
    );
  });

  describe('getLatestSucceededJobId', () => {
    const EXPECTED_VIN = 'WBA12345678901234';

    it('returns null when no succeeded schedule job exists', async () => {
      prisma.oneAutoProviderJob.findFirst.mockResolvedValue(null);
      const out = await service.getLatestSucceededJobId('org1', 'v1', 'OE_SERVICE_SCHEDULE');
      expect(out).toEqual({ jobId: null });
      expect(prisma.oneAutoProviderJob.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org1',
            vehicleId: 'v1',
            serviceSku: 'OE_SERVICE_SCHEDULE',
            status: OneAutoProviderJobStatus.SUCCEEDED,
            vinSnapshot: EXPECTED_VIN,
          }),
          orderBy: { updatedAt: 'desc' },
          select: { id: true },
        }),
      );
    });

    it('returns latest succeeded job id when vinSnapshot matches current vehicle VIN', async () => {
      prisma.oneAutoProviderJob.findFirst.mockResolvedValue({ id: 'job-sched-1' });
      const out = await service.getLatestSucceededJobId('org1', 'v1', 'OE_SERVICE_SCHEDULE');
      expect(out).toEqual({ jobId: 'job-sched-1' });
      expect(prisma.oneAutoProviderJob.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org1',
            vehicleId: 'v1',
            serviceSku: 'OE_SERVICE_SCHEDULE',
            status: OneAutoProviderJobStatus.SUCCEEDED,
            vinSnapshot: EXPECTED_VIN,
          }),
        }),
      );
    });

    it('returns null when succeeded job exists only for a different historical VIN on the same vehicle', async () => {
      /** DB enforces vinSnapshot — no row matches current normalized VIN */
      prisma.oneAutoProviderJob.findFirst.mockResolvedValue(null);
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 'v1',
        organizationId: 'org1',
        vin: 'WBADT43452G123456',
      });
      const out = await service.getLatestSucceededJobId('org1', 'v1', 'OE_SERVICE_SCHEDULE');
      expect(out).toEqual({ jobId: null });
      expect(prisma.oneAutoProviderJob.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            vinSnapshot: 'WBADT43452G123456',
          }),
        }),
      );
    });

    it('scopes vehicle load and job query by organizationId and vehicleId', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 'veh-z',
        organizationId: 'org-z',
        vin: EXPECTED_VIN,
      });
      prisma.oneAutoProviderJob.findFirst.mockResolvedValue(null);
      await service.getLatestSucceededJobId('org-z', 'veh-z', 'OE_SERVICE_SCHEDULE');
      expect(prisma.vehicle.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'veh-z', organizationId: 'org-z' },
        }),
      );
      expect(prisma.oneAutoProviderJob.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-z',
            vehicleId: 'veh-z',
          }),
        }),
      );
    });
  });

  describe('getJobResult', () => {
    const sameFetchedAt = new Date('2026-11-06T12:00:00.000Z');
    const scheduleEnvelope = { status: 200, result: { success: true, result: { vehicle_identification_number: 'WBA12345678901234' } } };

    it('OE_SERVICE_SCHEDULE: prefers responsePhase callback over recovery_audit when fetchedAt ties', async () => {
      prisma.oneAutoProviderJob.findFirst.mockResolvedValue({
        id: 'job-s1',
        organizationId: 'org1',
        vehicleId: 'v1',
        vinSnapshot: 'WBA12345678901234',
        serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
        status: OneAutoProviderJobStatus.SUCCEEDED,
        idempotencyKey: 'k',
        providerRequestId: null,
        estimatedPriceMinor: 150,
        currency: 'EUR',
        pricingSourceVersion: 'v1',
        costConfirmedAt: new Date(),
        confirmedPriceMinor: 150,
        actualChargeMinor: null,
        actualChargeKnown: false,
        pollAttemptCount: 0,
        lastErrorCode: null,
        initialProviderDispatchAt: new Date(),
        expiresAt: new Date(),
        providerResultExpiresAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.oneAutoProviderResponse.findFirst.mockResolvedValueOnce({
        id: 'resp-callback',
        jobId: 'job-s1',
        httpStatus: 200,
        providerStatusHeader: null,
        responseBodyJson: scheduleEnvelope,
        responsePhase: 'callback',
        fetchedAt: sameFetchedAt,
      });

      const out = await service.getJobResult('org1', 'job-s1');

      expect(prisma.oneAutoProviderResponse.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.oneAutoProviderResponse.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jobId: 'job-s1', responsePhase: 'callback' },
        }),
      );
      expect(out.latestResponse?.responseBodyJson).toEqual(scheduleEnvelope);
    });

    it('OE_SERVICE_SCHEDULE: falls back to latest by fetchedAt when no callback row', async () => {
      prisma.oneAutoProviderJob.findFirst.mockResolvedValue({
        id: 'job-s2',
        organizationId: 'org1',
        vehicleId: 'v1',
        vinSnapshot: 'WBA12345678901234',
        serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
        status: OneAutoProviderJobStatus.SUCCEEDED,
        idempotencyKey: 'k',
        providerRequestId: null,
        estimatedPriceMinor: 150,
        currency: 'EUR',
        pricingSourceVersion: 'v1',
        costConfirmedAt: new Date(),
        confirmedPriceMinor: 150,
        actualChargeMinor: null,
        actualChargeKnown: false,
        pollAttemptCount: 0,
        lastErrorCode: null,
        initialProviderDispatchAt: new Date(),
        expiresAt: new Date(),
        providerResultExpiresAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.oneAutoProviderResponse.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'resp-fallback',
          jobId: 'job-s2',
          httpStatus: 200,
          providerStatusHeader: null,
          responseBodyJson: { legacy: true },
          responsePhase: 'retrieval',
          fetchedAt: sameFetchedAt,
        });

      const out = await service.getJobResult('org1', 'job-s2');

      expect(prisma.oneAutoProviderResponse.findFirst).toHaveBeenCalledTimes(2);
      expect(out.latestResponse?.responseBodyJson).toEqual({ legacy: true });
    });

    it('non-schedule SKU: uses global latest response order', async () => {
      prisma.oneAutoProviderJob.findFirst.mockResolvedValue({
        id: 'job-vin',
        organizationId: 'org1',
        vehicleId: 'v1',
        vinSnapshot: 'WBA12345678901234',
        serviceSku: 'OE_VIN_LOOKUP_EU',
        status: OneAutoProviderJobStatus.SUCCEEDED,
        idempotencyKey: 'k',
        providerRequestId: null,
        estimatedPriceMinor: 150,
        currency: 'GBP',
        pricingSourceVersion: 'v1',
        costConfirmedAt: new Date(),
        confirmedPriceMinor: 150,
        actualChargeMinor: null,
        actualChargeKnown: false,
        pollAttemptCount: 0,
        lastErrorCode: null,
        initialProviderDispatchAt: new Date(),
        expiresAt: new Date(),
        providerResultExpiresAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.oneAutoProviderResponse.findFirst.mockResolvedValueOnce({
        id: 'resp-vin',
        jobId: 'job-vin',
        httpStatus: 200,
        providerStatusHeader: null,
        responseBodyJson: { vin: 'ok' },
        responsePhase: 'callback',
        fetchedAt: sameFetchedAt,
      });

      const out = await service.getJobResult('org1', 'job-vin');

      expect(prisma.oneAutoProviderResponse.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.oneAutoProviderResponse.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jobId: 'job-vin' },
        }),
      );
      expect(out.latestResponse?.responseBodyJson).toEqual({ vin: 'ok' });
    });
  });
});
