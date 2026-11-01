import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OneAutoProviderJobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  ONEAUTO_SERVICE_CATALOG,
  resolveCatalogEntryForRuntime,
} from './catalog/oneauto-service-catalog';
import { assertOneAutoSkuExecutable } from './catalog/oneauto-contract-gate.util';
import { assertOneAutoPositiveOrgBudgetWhenEnabled } from './oneauto-execution-budget-guard.util';
import { buildOneAutoContractGateReport } from './catalog/oneauto-verified-contracts';
import { isValidVin, normalizeVin } from './client/oneauto-vin.util';
import { OneAutoProviderExecutionService } from './oneauto-provider-execution.service';
import {
  oneAutoBudgetExceededException,
  oneAutoBindingMismatchException,
  oneAutoBudgetNotConfiguredException,
  oneAutoConfirmationRequiredException,
  oneAutoContractUnverifiedException,
  oneAutoCrossTenantException,
  oneAutoDisabledException,
  oneAutoInvalidVinException,
  oneAutoJobNotFoundException,
  oneAutoPriceMismatchException,
  oneAutoQuoteExpiredException,
  oneAutoUnavailableException,
} from './oneauto-provider.errors';

type RuntimeCfg = {
  enabled?: boolean;
  indicativePriceMinorBySku?: Record<string, number>;
  pricingCatalogVersion?: string;
  orgDailyBudgetMinor?: number;
  quoteTtlMs?: number;
  jobTtlMs?: number;
};

@Injectable()
export class OneAutoProviderService {
  private readonly logger = new Logger(OneAutoProviderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly execution: OneAutoProviderExecutionService,
  ) {}

  private runtimeCfg(): RuntimeCfg {
    return this.config.get<RuntimeCfg>('oneautoProvider') ?? {};
  }

  private resolvedCatalog() {
    const cfg = this.runtimeCfg();
    return ONEAUTO_SERVICE_CATALOG.map((entry) =>
      resolveCatalogEntryForRuntime(entry, {
        providerEnabled: cfg.enabled === true,
        indicativePriceMinorBySku: cfg.indicativePriceMinorBySku ?? {},
        pricingCatalogVersion: cfg.pricingCatalogVersion ?? 'synqdrive-catalog-v1',
      }),
    );
  }

  getCatalog() {
    return {
      services: this.resolvedCatalog().map((entry) => ({
        ...entry,
        contractGate: buildOneAutoContractGateReport(entry.serviceSku),
        executable: entry.availabilityStatus === 'AVAILABLE',
      })),
      indicativePricingDisclaimer:
        'Published indicative prices are not guaranteed billing amounts. Actual cost remains UNKNOWN until provider billing evidence exists.',
    };
  }

  getServiceAvailability(serviceSku: string) {
    const entry = this.resolvedCatalog().find((e) => e.serviceSku === serviceSku);
    if (!entry) {
      return { serviceSku, available: false, executable: false, reason: 'UNKNOWN_SKU' as const };
    }
    const gate = buildOneAutoContractGateReport(serviceSku);
    return {
      serviceSku,
      available: entry.availabilityStatus === 'AVAILABLE',
      executable: entry.availabilityStatus === 'AVAILABLE',
      availabilityStatus: entry.availabilityStatus,
      contractGate: gate,
      indicativePriceMinor: entry.indicativePriceMinor,
      currency: entry.currency,
      pricingSourceVersion: entry.pricingSourceVersion,
    };
  }

  async quote(orgId: string, vehicleId: string, serviceSku: string) {
    this.assertFeatureEnabledForQuote();
    const { vehicle, entry } = await this.loadVehicleAndSku(orgId, vehicleId, serviceSku);
    this.assertVehicleBinding(orgId, vehicleId, vehicle.vin);
    if (entry.availabilityStatus === 'CONTRACT_UNVERIFIED') {
      throw oneAutoContractUnverifiedException(serviceSku);
    }
    if (entry.availabilityStatus !== 'AVAILABLE') {
      throw oneAutoUnavailableException(`Service not available: ${entry.availabilityStatus}`);
    }
    const vin = normalizeVin(vehicle.vin)!;
    const quoteIssuedAt = new Date();
    const quoteTtlMs = this.runtimeCfg().quoteTtlMs ?? 5 * 60_000;
    return {
      organizationId: orgId,
      vehicleId,
      serviceSku,
      vinSnapshot: vin,
      estimatedPriceMinor: entry.indicativePriceMinor,
      currency: entry.currency,
      pricingSourceVersion: entry.pricingSourceVersion,
      executionMode: entry.executionMode,
      indicativeNotGuaranteed: true,
      quoteIssuedAt: quoteIssuedAt.toISOString(),
      quoteExpiresAt: new Date(quoteIssuedAt.getTime() + quoteTtlMs).toISOString(),
      contractGate: buildOneAutoContractGateReport(serviceSku),
    };
  }

  async executeConfirmed(input: {
    orgId: string;
    vehicleId: string;
    serviceSku: string;
    idempotencyKey: string;
    confirmedPriceMinor: number;
    pricingSourceVersion: string;
    quoteIssuedAt: string;
    acknowledgeIndicativeNotGuaranteed: boolean;
    masterAdminUserId: string;
  }) {
    const cfg = this.runtimeCfg();
    if (cfg.enabled !== true) throw oneAutoDisabledException();
    try {
      assertOneAutoPositiveOrgBudgetWhenEnabled(cfg);
    } catch {
      throw oneAutoBudgetNotConfiguredException();
    }
    if (!input.acknowledgeIndicativeNotGuaranteed) throw oneAutoConfirmationRequiredException();
    if (!input.idempotencyKey?.trim()) {
      throw oneAutoConfirmationRequiredException();
    }

    const existing = await this.prisma.oneAutoProviderJob.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: input.orgId,
          idempotencyKey: input.idempotencyKey.trim(),
        },
      },
    });
    if (existing) {
      return this.toJobDto(existing);
    }

    try {
      assertOneAutoSkuExecutable(input.serviceSku);
    } catch {
      throw oneAutoContractUnverifiedException(input.serviceSku);
    }

    const quoteIssuedAtMs = Date.parse(input.quoteIssuedAt);
    if (Number.isNaN(quoteIssuedAtMs)) {
      throw oneAutoQuoteExpiredException();
    }
    const quoteTtlMs = cfg.quoteTtlMs ?? 5 * 60_000;
    if (Date.now() - quoteIssuedAtMs > quoteTtlMs) {
      throw oneAutoQuoteExpiredException();
    }

    const freshQuote = await this.quote(input.orgId, input.vehicleId, input.serviceSku);
    if (freshQuote.estimatedPriceMinor == null) {
      throw oneAutoUnavailableException('Price not configured for SKU');
    }
    if (
      freshQuote.estimatedPriceMinor !== input.confirmedPriceMinor ||
      freshQuote.pricingSourceVersion !== input.pricingSourceVersion
    ) {
      throw oneAutoPriceMismatchException();
    }

    const jobTtlMs = cfg.jobTtlMs ?? 24 * 60 * 60_000;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + jobTtlMs);

    const job = await this.prisma.$transaction(async (tx) => {
      await this.assertBudgetAllowsTx(tx, input.orgId, input.confirmedPriceMinor);
      return tx.oneAutoProviderJob.create({
        data: {
          organizationId: input.orgId,
          vehicleId: input.vehicleId,
          vinSnapshot: freshQuote.vinSnapshot,
          serviceSku: input.serviceSku,
          status: OneAutoProviderJobStatus.CREATED,
          idempotencyKey: input.idempotencyKey.trim(),
          estimatedPriceMinor: freshQuote.estimatedPriceMinor,
          currency: freshQuote.currency,
          pricingSourceVersion: freshQuote.pricingSourceVersion,
          costConfirmedAt: now,
          costConfirmedByUserId: input.masterAdminUserId,
          initiatingMasterAdminUserId: input.masterAdminUserId,
          confirmedPriceMinor: input.confirmedPriceMinor,
          budgetReservedMinor: input.confirmedPriceMinor,
          quoteIssuedAt: new Date(quoteIssuedAtMs),
          actualChargeKnown: false,
          expiresAt,
        },
      });
    });

    this.logger.log(
      `OneAuto cost-confirmed job=${job.id} org=${input.orgId} sku=${input.serviceSku} minor=${input.confirmedPriceMinor}`,
    );

    await this.execution.enqueueExecution(job.id);
    return this.toJobDto(job);
  }

  async getJob(orgId: string, jobId: string) {
    const job = await this.prisma.oneAutoProviderJob.findFirst({
      where: { id: jobId, organizationId: orgId },
    });
    if (!job) throw oneAutoJobNotFoundException();
    return this.toJobDto(job);
  }

  async getJobResult(orgId: string, jobId: string) {
    const job = await this.prisma.oneAutoProviderJob.findFirst({
      where: { id: jobId, organizationId: orgId },
      include: {
        responses: { orderBy: { fetchedAt: 'desc' }, take: 1 },
      },
    });
    if (!job) throw oneAutoJobNotFoundException();
    const latest = job.responses[0];
    return {
      job: this.toJobDto(job),
      latestResponse: latest
        ? {
            httpStatus: latest.httpStatus,
            providerStatusHeader: latest.providerStatusHeader,
            responseBodyJson: latest.responseBodyJson,
            fetchedAt: latest.fetchedAt,
          }
        : null,
      actualChargeKnown: job.actualChargeKnown,
      actualChargeMinor: job.actualChargeMinor,
    };
  }

  private assertFeatureEnabledForQuote() {
    const cfg = this.runtimeCfg();
    if (cfg.enabled !== true) throw oneAutoDisabledException();
  }

  private assertVehicleBinding(orgId: string, vehicleId: string, vin: string | null) {
    const normalized = normalizeVin(vin);
    if (!isValidVin(normalized)) throw oneAutoInvalidVinException();
    if (!orgId?.trim() || !vehicleId?.trim()) throw oneAutoBindingMismatchException();
  }

  private async loadVehicleAndSku(orgId: string, vehicleId: string, serviceSku: string) {
    const entry = this.resolvedCatalog().find((e) => e.serviceSku === serviceSku);
    if (!entry) throw oneAutoUnavailableException('Unknown service SKU');
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: { id: true, organizationId: true, vin: true },
    });
    if (!vehicle) throw oneAutoCrossTenantException();
    return { vehicle, entry };
  }

  private async assertBudgetAllowsTx(
    tx: Prisma.TransactionClient,
    orgId: string,
    additionalMinor: number,
  ) {
    const cap = this.runtimeCfg().orgDailyBudgetMinor ?? 0;
    if (cap <= 0) return;
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const agg = await tx.oneAutoProviderJob.aggregate({
      where: {
        organizationId: orgId,
        costConfirmedAt: { gte: startOfDay },
        status: {
          in: [
            OneAutoProviderJobStatus.CREATED,
            OneAutoProviderJobStatus.QUEUED,
            OneAutoProviderJobStatus.RUNNING,
            OneAutoProviderJobStatus.AWAITING_PROVIDER,
            OneAutoProviderJobStatus.SUCCEEDED,
          ],
        },
      },
      _sum: { budgetReservedMinor: true },
    });
    const spent = agg._sum.budgetReservedMinor ?? 0;
    if (spent + additionalMinor > cap) throw oneAutoBudgetExceededException();
  }

  private toJobDto(job: {
    id: string;
    organizationId: string;
    vehicleId: string;
    vinSnapshot: string;
    serviceSku: string;
    status: OneAutoProviderJobStatus;
    idempotencyKey: string;
    providerRequestId: string | null;
    estimatedPriceMinor: number | null;
    currency: string;
    pricingSourceVersion: string | null;
    costConfirmedAt: Date | null;
    confirmedPriceMinor: number | null;
    actualChargeMinor: number | null;
    actualChargeKnown: boolean;
    pollAttemptCount: number;
    lastErrorCode: string | null;
    initialProviderDispatchAt: Date | null;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: job.id,
      organizationId: job.organizationId,
      vehicleId: job.vehicleId,
      vinSnapshot: job.vinSnapshot,
      serviceSku: job.serviceSku,
      status: job.status,
      idempotencyKey: job.idempotencyKey,
      providerRequestId: job.providerRequestId,
      estimatedPriceMinor: job.estimatedPriceMinor,
      confirmedPriceMinor: job.confirmedPriceMinor,
      currency: job.currency,
      pricingSourceVersion: job.pricingSourceVersion,
      costConfirmedAt: job.costConfirmedAt,
      actualChargeMinor: job.actualChargeMinor,
      actualChargeKnown: job.actualChargeKnown,
      pollAttemptCount: job.pollAttemptCount,
      lastErrorCode: job.lastErrorCode,
      initialProviderDispatchAt: job.initialProviderDispatchAt,
      expiresAt: job.expiresAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
