import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OneAutoProviderJobStatus } from '@prisma/client';
import { OneAutoProviderService } from './oneauto-provider.service';
import { OneAutoProviderExecutionService } from './oneauto-provider-execution.service';
import * as verifiedContracts from './catalog/oneauto-verified-contracts';
import * as contractGate from './catalog/oneauto-contract-gate.util';

describe('OneAutoProviderService cost and idempotency', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn() },
    oneAutoProviderJob: {
      findUnique: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const execution = { enqueueExecution: jest.fn() };
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
    try {
      await service.executeConfirmed({
        orgId: 'org1',
        vehicleId: 'v1',
        serviceSku: 'OE_VIN_LOOKUP_EU',
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
  });
});
