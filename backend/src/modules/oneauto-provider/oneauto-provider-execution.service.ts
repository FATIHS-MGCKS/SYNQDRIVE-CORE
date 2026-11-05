import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { OneAutoProviderJobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { QUEUE_NAMES } from '../../workers/queues/queue-names';
import { OneAutoHttpClient } from './client/oneauto-http.client';
import { assertOneAutoSkuExecutable } from './catalog/oneauto-contract-gate.util';
import { getVerifiedOneAutoContract } from './catalog/oneauto-verified-contracts';
import { isValidVin, normalizeVin } from './client/oneauto-vin.util';
import { assertOneAutoPositiveOrgBudgetWhenEnabled } from './oneauto-execution-budget-guard.util';
import {
  evaluateSuccessResultErrorEnvelope,
  mergeEnvelopeDiagnostic,
} from './oneauto-response-envelope.util';
import { redactOneAutoErrorMessage, redactProviderResponseBody } from './oneauto-provider-redact.util';
import { OneAutoOemVinLookupEuSuggestionMaterializationService } from './oem-specification/oneauto-oem-vin-lookup-eu-suggestion-materialization.service';
import {
  computeOneAutoProviderResultExpiresAt,
  isOneAutoAsyncCapableWithoutVerifiedPoll,
} from './oneauto-provider-result-retention.util';
import {
  buildOneAutoProviderCallbackUrl,
  generateOneAutoCallbackDeliveryToken,
} from './oneauto-callback-delivery.util';
import { isOneAutoSkuRuntimeExecutionEnabled } from './oneauto-sku-runtime-activation.util';
import type { OneAutoExecutionVerifiedProviderContract } from './catalog/oneauto-contract-types';

export type OneAutoProviderJobPayload = {
  jobId: string;
  phase: 'initial' | 'poll' | 'retrieval';
};

const TERMINAL_SUCCESS_HTTP = new Set([200]);
const AWAITING = new Set([202]);

const BILLABLE_JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: true,
  removeOnFail: false,
} as const;

@Injectable()
export class OneAutoProviderExecutionService {
  private readonly logger = new Logger(OneAutoProviderExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: OneAutoHttpClient,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_NAMES.ONEAUTO_PROVIDER) private readonly queue: Queue<OneAutoProviderJobPayload>,
    private readonly oemSuggestionMaterialization: OneAutoOemVinLookupEuSuggestionMaterializationService,
  ) {}

  async enqueueExecution(jobId: string): Promise<void> {
    await this.prisma.oneAutoProviderJob.update({
      where: { id: jobId },
      data: { status: OneAutoProviderJobStatus.QUEUED },
    });
    await this.queue.add(
      'execute',
      { jobId, phase: 'initial' },
      { ...BILLABLE_JOB_OPTIONS, jobId: `oneauto:${jobId}:initial` },
    );
  }

  /** Idempotent: expires AWAITING_PROVIDER jobs past provider/SynqDrive retention windows. */
  async expireProviderResultIfDue(jobId: string): Promise<void> {
    const now = new Date();
    await this.prisma.oneAutoProviderJob.updateMany({
      where: {
        id: jobId,
        status: OneAutoProviderJobStatus.AWAITING_PROVIDER,
        OR: [
          { providerResultExpiresAt: { lte: now } },
          {
            AND: [{ providerResultExpiresAt: null }, { expiresAt: { lte: now } }],
          },
        ],
      },
      data: {
        status: OneAutoProviderJobStatus.EXPIRED,
        lastErrorCode: 'ONEAUTO_PROVIDER_RESULT_EXPIRED',
        lastErrorMessageRedacted: redactOneAutoErrorMessage(
          'Provider result retention elapsed — internal reservation released; vendor charge remains unknown',
        ),
      },
    });
  }

  /**
   * Leader-scheduled batch expiry — does not depend on Master UI polling or getJob reads.
   */
  async expireDueAwaitingProviderJobsBatch(batchSize = 50): Promise<number> {
    const now = new Date();
    const due = await this.prisma.oneAutoProviderJob.findMany({
      where: {
        status: OneAutoProviderJobStatus.AWAITING_PROVIDER,
        OR: [
          { providerResultExpiresAt: { lte: now } },
          {
            AND: [{ providerResultExpiresAt: null }, { expiresAt: { lte: now } }],
          },
        ],
      },
      select: { id: true },
      take: batchSize,
    });
    if (due.length === 0) return 0;
    const result = await this.prisma.oneAutoProviderJob.updateMany({
      where: {
        id: { in: due.map((row) => row.id) },
        status: OneAutoProviderJobStatus.AWAITING_PROVIDER,
      },
      data: {
        status: OneAutoProviderJobStatus.EXPIRED,
        lastErrorCode: 'ONEAUTO_PROVIDER_RESULT_EXPIRED',
        lastErrorMessageRedacted: redactOneAutoErrorMessage(
          'Provider result retention elapsed — internal reservation released; vendor charge remains unknown',
        ),
      },
    });
    return result.count;
  }

  async processJob(jobId: string, phase: OneAutoProviderJobPayload['phase'] = 'initial'): Promise<void> {
    const job = await this.prisma.oneAutoProviderJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    if (
      job.status === OneAutoProviderJobStatus.SUCCEEDED ||
      job.status === OneAutoProviderJobStatus.FAILED ||
      job.status === OneAutoProviderJobStatus.EXPIRED
    ) {
      return;
    }

    if (job.status === OneAutoProviderJobStatus.AWAITING_PROVIDER && phase === 'initial') {
      await this.expireProviderResultIfDue(jobId);
      return;
    }

    if (job.expiresAt && job.expiresAt.getTime() < Date.now()) {
      await this.expireJob(jobId, 'ONEAUTO_JOB_EXPIRED', 'Job expired before provider completion');
      return;
    }

    try {
      assertOneAutoSkuExecutable(job.serviceSku);
    } catch {
      await this.failJob(jobId, 'CONTRACT_UNVERIFIED', 'Provider contract unverified');
      return;
    }

    const contract = getVerifiedOneAutoContract(job.serviceSku);
    if (!contract) {
      await this.failJob(jobId, 'CONTRACT_UNVERIFIED', 'Provider contract unverified');
      return;
    }

    const runtimeCfg = this.config.get<{
      enabled?: boolean;
      orgDailyBudgetMinor?: number;
      callbackEnabled?: boolean;
      callbackRetrievalGetEnabled?: boolean;
      callbackFullDataEnabled?: boolean;
      callbackPublicBaseUrl?: string;
      callbackReturnDataInCallback?: boolean;
      providerResultRetentionMs?: number;
      maxPollAttempts?: number;
      pollIntervalMs?: number;
    }>('oneautoProvider');
    const cfgEnabled = runtimeCfg?.enabled === true;
    if (!cfgEnabled) {
      await this.failJob(jobId, 'ONEAUTO_DISABLED', 'Provider disabled');
      return;
    }
    try {
      assertOneAutoPositiveOrgBudgetWhenEnabled(runtimeCfg ?? {});
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
          ? (err as { code: string }).code
          : 'ONEAUTO_BUDGET_NOT_CONFIGURED';
      await this.failJob(jobId, code, 'Organization daily budget not configured for enabled provider');
      return;
    }

    if (!isOneAutoSkuRuntimeExecutionEnabled(job.serviceSku)) {
      await this.failJob(jobId, 'ONEAUTO_SKU_RUNTIME_DISABLED', 'Service SKU runtime activation disabled');
      return;
    }

    const bindingOk = await this.assertJobBinding(job);
    if (!bindingOk) {
      await this.failJob(jobId, 'ONEAUTO_BINDING_MISMATCH', 'Job binding validation failed');
      return;
    }

    if (phase === 'retrieval') {
      await this.expireProviderResultIfDue(jobId);
      const awaiting = await this.prisma.oneAutoProviderJob.findUnique({ where: { id: jobId } });
      if (!awaiting || awaiting.status !== OneAutoProviderJobStatus.AWAITING_PROVIDER) {
        return;
      }
      if (!this.isCallbackNotifyThenGetEnabled(runtimeCfg, contract)) {
        await this.failJob(
          jobId,
          'ONEAUTO_CALLBACK_RETRIEVAL_DISABLED',
          'Callback retrieval GET is disabled or not attested',
        );
        return;
      }
      if (!awaiting.providerCallbackReceivedAt) {
        return;
      }
      if (awaiting.retrievalProviderDispatchAt) {
        return;
      }
    }

    if (phase === 'poll') {
      if (job.status !== OneAutoProviderJobStatus.AWAITING_PROVIDER) {
        return;
      }
      if (!job.initialProviderDispatchAt) {
        await this.failJob(jobId, 'ONEAUTO_ASYNC_POLL_UNVERIFIED', 'Missing initial dispatch marker');
        return;
      }
      if (!contract.asyncPollSameUrlWithoutNewCharge) {
        await this.failJob(
          jobId,
          'ONEAUTO_ASYNC_POLL_UNVERIFIED',
          'Async polling semantics not verified — fail closed',
        );
        return;
      }
    } else if (job.initialProviderDispatchAt && phase === 'initial') {
      this.logger.warn(`OneAuto job ${jobId} skipped duplicate initial dispatch`);
      return;
    }

    let callbackQuery:
      | Partial<Record<'callback_url' | 'return_data_in_callback', string | boolean>>
      | undefined;
    let callbackDeliveryTokenSha256: string | undefined;
    if (phase === 'initial') {
      const publicBase = runtimeCfg?.callbackPublicBaseUrl ?? 'https://app.synqdrive.eu/api/v1';
      if (this.isCallbackFullDataEnabled(runtimeCfg, contract)) {
        const generated = generateOneAutoCallbackDeliveryToken();
        callbackDeliveryTokenSha256 = generated.deliveryTokenSha256;
        callbackQuery = {
          callback_url: buildOneAutoProviderCallbackUrl(publicBase, generated.deliveryToken),
          return_data_in_callback: true,
        };
      } else if (this.isCallbackNotifyThenGetEnabled(runtimeCfg, contract)) {
        const generated = generateOneAutoCallbackDeliveryToken();
        callbackDeliveryTokenSha256 = generated.deliveryTokenSha256;
        callbackQuery = {
          callback_url: buildOneAutoProviderCallbackUrl(publicBase, generated.deliveryToken),
          return_data_in_callback: runtimeCfg?.callbackReturnDataInCallback === true,
        };
      }
    }

    const claimWhere =
      phase === 'retrieval'
        ? {
            id: jobId,
            status: OneAutoProviderJobStatus.AWAITING_PROVIDER,
            providerCallbackReceivedAt: { not: null },
            retrievalProviderDispatchAt: null,
          }
        : phase === 'poll'
        ? {
            id: jobId,
            status: OneAutoProviderJobStatus.AWAITING_PROVIDER,
            initialProviderDispatchAt: { not: null },
          }
        : {
            id: jobId,
            initialProviderDispatchAt: null,
            status: { in: [OneAutoProviderJobStatus.QUEUED, OneAutoProviderJobStatus.CREATED] },
          };

    const initialDispatchAt =
      phase === 'initial' ? new Date() : (job.initialProviderDispatchAt ?? undefined);

    const claim = await this.prisma.oneAutoProviderJob.updateMany({
      where: claimWhere,
      data: {
        status: OneAutoProviderJobStatus.RUNNING,
        ...(phase === 'initial' && initialDispatchAt
          ? { initialProviderDispatchAt: initialDispatchAt }
          : {}),
        ...(phase === 'initial' && callbackDeliveryTokenSha256
          ? { callbackDeliveryTokenSha256 }
          : {}),
        ...(phase === 'retrieval' ? { retrievalProviderDispatchAt: new Date() } : {}),
      },
    });
    if (claim.count === 0) {
      return;
    }

    const dispatchMarker = initialDispatchAt ?? job.initialProviderDispatchAt ?? new Date();

    try {
      const result = await this.http.executeProviderGet({
        contract,
        vin: job.vinSnapshot,
        optionalQueryParameters: callbackQuery,
      });

      const envelopeEval = evaluateSuccessResultErrorEnvelope(
        result.httpStatus,
        result.body,
        contract,
      );
      const bodyForPersistence =
        envelopeEval.ok === false
          ? mergeEnvelopeDiagnostic(result.body, envelopeEval.diagnostic)
          : result.body;

      await this.prisma.oneAutoProviderResponse.create({
        data: {
          jobId,
          httpStatus: result.httpStatus,
          providerStatusHeader: result.providerStatusHeader,
          responseBodyJson: redactProviderResponseBody(bodyForPersistence) as Prisma.InputJsonValue,
          responsePhase: phase,
        },
      });

      if (!envelopeEval.ok && result.httpStatus === 200) {
        await this.failJob(
          jobId,
          envelopeEval.code,
          'Provider JSON envelope did not indicate success (billing may still apply)',
        );
        return;
      }

      if (result.httpStatus === 206) {
        if (!contract.http206CompleteSuccessAllowed) {
          await this.failJob(
            jobId,
            'ONEAUTO_PARTIAL_CONTENT',
            'HTTP 206 partial content — not attested as complete success',
          );
          return;
        }
      }

      if (TERMINAL_SUCCESS_HTTP.has(result.httpStatus)) {
        await this.prisma.oneAutoProviderJob.update({
          where: { id: jobId },
          data: {
            status: OneAutoProviderJobStatus.SUCCEEDED,
            actualChargeKnown: false,
            actualChargeMinor: null,
          },
        });
        await this.oemSuggestionMaterialization.tryMaterializeFromSucceededJob(jobId);
        return;
      }

      if (AWAITING.has(result.httpStatus)) {
        const latest = await this.prisma.oneAutoProviderJob.findUnique({
          where: { id: jobId },
          select: { status: true },
        });
        if (latest?.status === OneAutoProviderJobStatus.SUCCEEDED) {
          return;
        }
        if (isOneAutoAsyncCapableWithoutVerifiedPoll(contract)) {
          const retentionMs = runtimeCfg?.providerResultRetentionMs;
          const providerResultExpiresAt = computeOneAutoProviderResultExpiresAt(
            dispatchMarker,
            retentionMs,
          );
          await this.prisma.oneAutoProviderJob.update({
            where: { id: jobId },
            data: {
              status: OneAutoProviderJobStatus.AWAITING_PROVIDER,
              providerResultExpiresAt,
              actualChargeKnown: false,
            },
          });
          return;
        }
        if (!contract.asyncPollSameUrlWithoutNewCharge) {
          await this.failJob(
            jobId,
            'ONEAUTO_ASYNC_POLL_UNVERIFIED',
            'Provider returned async pending but polling is not verified',
          );
          return;
        }
        const maxPoll = runtimeCfg?.maxPollAttempts ?? 12;
        const nextCount = job.pollAttemptCount + 1;
        if (nextCount >= maxPoll) {
          await this.failJob(jobId, 'ONEAUTO_POLL_EXHAUSTED', 'Provider async poll limit reached');
          return;
        }
        await this.prisma.oneAutoProviderJob.update({
          where: { id: jobId },
          data: {
            status: OneAutoProviderJobStatus.AWAITING_PROVIDER,
            pollAttemptCount: nextCount,
          },
        });
        const delay = runtimeCfg?.pollIntervalMs ?? 5_000;
        await this.queue.add(
          'poll',
          { jobId, phase: 'poll' },
          {
            ...BILLABLE_JOB_OPTIONS,
            jobId: `oneauto:poll:${jobId}:${nextCount}`,
            delay,
          },
        );
        return;
      }

      await this.failJob(jobId, 'ONEAUTO_PROVIDER_ERROR', `Provider HTTP ${result.httpStatus}`);
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
          ? (err as { code: string }).code
          : 'ONEAUTO_EXECUTION_FAILED';
      const message =
        err instanceof Error ? redactOneAutoErrorMessage(err.message) : 'One Auto execution failed';
      await this.failJob(jobId, code, message);
    }
  }

  private isCallbackNotifyThenGetEnabled(
    runtimeCfg:
      | { callbackEnabled?: boolean; callbackRetrievalGetEnabled?: boolean }
      | undefined,
    contract: OneAutoExecutionVerifiedProviderContract,
  ): boolean {
    return (
      runtimeCfg?.callbackEnabled === true &&
      runtimeCfg?.callbackRetrievalGetEnabled === true &&
      contract.asyncCompletionMode === 'CALLBACK_NOTIFY_THEN_GET'
    );
  }

  private isCallbackFullDataEnabled(
    runtimeCfg:
      | { callbackEnabled?: boolean; callbackFullDataEnabled?: boolean }
      | undefined,
    contract: OneAutoExecutionVerifiedProviderContract,
  ): boolean {
    return (
      runtimeCfg?.callbackEnabled === true &&
      runtimeCfg?.callbackFullDataEnabled === true &&
      contract.asyncCompletionMode === 'CALLBACK_FULL_DATA'
    );
  }

  private async assertJobBinding(job: {
    organizationId: string;
    vehicleId: string;
    vinSnapshot: string;
    serviceSku: string;
  }): Promise<boolean> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: job.vehicleId, organizationId: job.organizationId },
      select: { vin: true },
    });
    if (!vehicle) return false;
    const vin = normalizeVin(vehicle.vin);
    if (!isValidVin(vin) || vin !== job.vinSnapshot) return false;
    if (!getVerifiedOneAutoContract(job.serviceSku)) return false;
    return true;
  }

  private async expireJob(jobId: string, code: string, message: string): Promise<void> {
    await this.prisma.oneAutoProviderJob.update({
      where: { id: jobId },
      data: {
        status: OneAutoProviderJobStatus.EXPIRED,
        lastErrorCode: code,
        lastErrorMessageRedacted: redactOneAutoErrorMessage(message),
      },
    });
  }

  private async failJob(jobId: string, code: string, message: string): Promise<void> {
    this.logger.warn(`OneAuto job ${jobId} failed: ${code}`);
    await this.prisma.oneAutoProviderJob.update({
      where: { id: jobId },
      data: {
        status: OneAutoProviderJobStatus.FAILED,
        lastErrorCode: code,
        lastErrorMessageRedacted: redactOneAutoErrorMessage(message),
        actualChargeKnown: false,
      },
    });
  }
}
