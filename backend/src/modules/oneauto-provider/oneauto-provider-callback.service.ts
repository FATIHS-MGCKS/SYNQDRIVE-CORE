import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OneAutoProviderJobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../workers/queues/queue-names';
import type { OneAutoProviderJobPayload } from './oneauto-provider-execution.service';
import { getVerifiedOneAutoContract } from './catalog/oneauto-verified-contracts';
import {
  hashCallbackPayload,
  sha256Hex,
} from './oneauto-callback-delivery.util';
import {
  ONEAUTO_CALLBACK_PROVIDER_OUTCOME_CODES,
  evaluateOneAutoFullDataCallbackPayload,
  isOeVinLookupEuFullDataCallbackSku,
} from './oneauto-callback-full-data.util';
import { persistFullDataCallbackSuccessInTransaction } from './oneauto-e4-full-data-callback-completion.util';
import { redactOneAutoErrorMessage, redactProviderResponseBody } from './oneauto-provider-redact.util';
import { OneAutoOemVinLookupEuSuggestionMaterializationService } from './oem-specification/oneauto-oem-vin-lookup-eu-suggestion-materialization.service';

export type OneAutoCallbackIngestResult =
  | {
      ok: true;
      status:
        | 'accepted'
        | 'completed'
        | 'duplicate'
        | 'ignored_expired'
        | 'ignored_terminal'
        | 'pending_initial_dispatch'
        /** Authenticated callback processed; provider reported a business failure / partial result. */
        | 'provider_failure';
    }
  | { ok: false; status: 'unknown_token' | 'disabled' | 'payload_rejected' };

type RuntimeCallbackCfg = {
  enabled?: boolean;
  callbackEnabled?: boolean;
  callbackRetrievalGetEnabled?: boolean;
  callbackFullDataEnabled?: boolean;
};

@Injectable()
export class OneAutoProviderCallbackService {
  private readonly logger = new Logger(OneAutoProviderCallbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_NAMES.ONEAUTO_PROVIDER) private readonly queue: Queue<OneAutoProviderJobPayload>,
    private readonly oemSuggestionMaterialization: OneAutoOemVinLookupEuSuggestionMaterializationService,
  ) {}

  private runtimeCfg(): RuntimeCallbackCfg {
    return this.config.get<RuntimeCallbackCfg>('oneautoProvider') ?? {};
  }

  private notifyThenGetActive(contract: { asyncCompletionMode?: string } | null | undefined): boolean {
    const cfg = this.runtimeCfg();
    return (
      cfg.enabled === true &&
      cfg.callbackEnabled === true &&
      cfg.callbackRetrievalGetEnabled === true &&
      contract?.asyncCompletionMode === 'CALLBACK_NOTIFY_THEN_GET'
    );
  }

  private fullDataCallbackActive(contract: { asyncCompletionMode?: string } | null | undefined): boolean {
    const cfg = this.runtimeCfg();
    return (
      cfg.enabled === true &&
      cfg.callbackEnabled === true &&
      cfg.callbackFullDataEnabled === true &&
      contract?.asyncCompletionMode === 'CALLBACK_FULL_DATA'
    );
  }

  async ingestProviderCallback(input: {
    deliveryToken: string;
    rawBody: string;
    parsedBody: unknown;
  }): Promise<OneAutoCallbackIngestResult> {
    const cfg = this.runtimeCfg();
    if (cfg.enabled !== true || cfg.callbackEnabled !== true) {
      return { ok: false, status: 'disabled' };
    }

    const deliveryTokenSha256 = sha256Hex(input.deliveryToken);
    const job = await this.prisma.oneAutoProviderJob.findFirst({
      where: { callbackDeliveryTokenSha256: deliveryTokenSha256 },
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        serviceSku: true,
        vinSnapshot: true,
        status: true,
        providerCallbackReceivedAt: true,
        retrievalProviderDispatchAt: true,
        providerResultExpiresAt: true,
        expiresAt: true,
      },
    });
    if (!job) {
      return { ok: false, status: 'unknown_token' };
    }

    const contract = getVerifiedOneAutoContract(job.serviceSku);
    const notifyMode = this.notifyThenGetActive(contract);
    const fullDataMode = this.fullDataCallbackActive(contract);
    if (!notifyMode && !fullDataMode) {
      return { ok: false, status: 'disabled' };
    }

    if (fullDataMode && !isOeVinLookupEuFullDataCallbackSku(job.serviceSku)) {
      return { ok: false, status: 'disabled' };
    }

    const payloadSha256 = hashCallbackPayload(input.rawBody);
    const duplicateRow = await this.prisma.oneAutoProviderCallbackInbox.findFirst({
      where: { jobId: job.id, payloadSha256 },
    });
    if (duplicateRow) {
      return { ok: true, status: 'duplicate' };
    }

    const now = new Date();
    const expired =
      job.status === OneAutoProviderJobStatus.EXPIRED ||
      (job.providerResultExpiresAt && job.providerResultExpiresAt <= now) ||
      (job.expiresAt && job.expiresAt <= now);

    await this.prisma.oneAutoProviderCallbackInbox.create({
      data: {
        organizationId: job.organizationId,
        jobId: job.id,
        payloadSha256,
        payloadJson: redactProviderResponseBody(input.parsedBody) as object,
        duplicate: false,
      },
    });

    if (
      job.status === OneAutoProviderJobStatus.SUCCEEDED ||
      job.status === OneAutoProviderJobStatus.FAILED
    ) {
      return { ok: true, status: 'ignored_terminal' };
    }

    if (expired) {
      return { ok: true, status: 'ignored_expired' };
    }

    if (fullDataMode) {
      return this.ingestFullDataCallback(job, input.parsedBody, now);
    }

    return this.ingestNotifyThenGetCallback(job, now);
  }

  private async ingestNotifyThenGetCallback(
    job: {
      id: string;
      status: OneAutoProviderJobStatus;
      providerCallbackReceivedAt: Date | null;
      retrievalProviderDispatchAt: Date | null;
    },
    now: Date,
  ): Promise<OneAutoCallbackIngestResult> {
    if (job.status !== OneAutoProviderJobStatus.AWAITING_PROVIDER) {
      return { ok: true, status: 'ignored_terminal' };
    }

    const markReceived = await this.prisma.oneAutoProviderJob.updateMany({
      where: {
        id: job.id,
        status: OneAutoProviderJobStatus.AWAITING_PROVIDER,
        providerCallbackReceivedAt: null,
      },
      data: { providerCallbackReceivedAt: now },
    });

    const shouldEnqueueRetrieval =
      markReceived.count > 0 || (job.providerCallbackReceivedAt && !job.retrievalProviderDispatchAt);

    if (shouldEnqueueRetrieval && !job.retrievalProviderDispatchAt) {
      await this.queue.add(
        'retrieval',
        { jobId: job.id, phase: 'retrieval' },
        {
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: false,
          jobId: `oneauto:retrieval:${job.id}`,
        },
      );
      this.logger.log(`OneAuto callback accepted for job ${job.id} — retrieval queued`);
    }

    return { ok: true, status: 'accepted' };
  }

  private async ingestFullDataCallback(
    job: {
      id: string;
      organizationId: string;
      vehicleId: string;
      serviceSku: string;
      vinSnapshot: string;
      status: OneAutoProviderJobStatus;
    },
    parsedBody: unknown,
    now: Date,
  ): Promise<OneAutoCallbackIngestResult> {
    const contract = getVerifiedOneAutoContract(job.serviceSku);
    if (!contract) {
      return { ok: false, status: 'disabled' };
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: job.vehicleId, organizationId: job.organizationId },
      select: { vin: true },
    });
    if (!vehicle) {
      await this.failJobFromCallback(job.id, 'ONEAUTO_BINDING_MISMATCH', 'Vehicle binding missing');
      return { ok: false, status: 'payload_rejected' };
    }

    const evaluation = evaluateOneAutoFullDataCallbackPayload({
      body: parsedBody,
      contract,
      jobVinSnapshot: job.vinSnapshot,
      vehicleVin: vehicle.vin,
    });
    if (!evaluation.ok) {
      if (ONEAUTO_CALLBACK_PROVIDER_OUTCOME_CODES.has(evaluation.code) && evaluation.envelope) {
        // Provider answered (e.g. "no data for this VIN"): keep the envelope as audit trail like the sync path.
        await this.prisma.oneAutoProviderResponse.create({
          data: {
            jobId: job.id,
            httpStatus: evaluation.wrapperStatus ?? 200,
            providerStatusHeader: null,
            responseBodyJson: redactProviderResponseBody(evaluation.envelope) as Prisma.InputJsonValue,
            responsePhase: 'callback',
          },
        });
        await this.failJobFromCallback(
          job.id,
          evaluation.code,
          evaluation.code === 'ONEAUTO_PARTIAL_CONTENT'
            ? 'Provider callback reported partial content (HTTP 206) — not attested as complete success'
            : 'Provider callback reported failure (success=false) — no result delivered',
        );
        return { ok: true, status: 'provider_failure' };
      }
      await this.failJobFromCallback(
        job.id,
        evaluation.code,
        'Full-data callback payload rejected',
      );
      return { ok: false, status: 'payload_rejected' };
    }

    if (
      job.status !== OneAutoProviderJobStatus.AWAITING_PROVIDER &&
      job.status !== OneAutoProviderJobStatus.RUNNING
    ) {
      return { ok: true, status: 'ignored_terminal' };
    }

    // Persist the unwrapped envelope so downstream readers (result API, OEM materialization) see
    // the same SUCCESS_RESULT_ERROR shape as the sync HTTP 200 path. Raw body stays in the inbox.
    const completed = await this.prisma.$transaction(async (tx) => {
      const { transitioned } = await persistFullDataCallbackSuccessInTransaction(tx, {
        jobId: job.id,
        evaluation,
        providerCallbackReceivedAt: now,
        eligiblePriorStatuses: [
          OneAutoProviderJobStatus.RUNNING,
          OneAutoProviderJobStatus.AWAITING_PROVIDER,
        ],
      });
      return transitioned ? 1 : 0;
    });

    if (completed === 0) {
      const fresh = await this.prisma.oneAutoProviderJob.findUnique({
        where: { id: job.id },
        select: { status: true },
      });
      if (fresh?.status === OneAutoProviderJobStatus.SUCCEEDED) {
        return { ok: true, status: 'ignored_terminal' };
      }
      return { ok: true, status: 'pending_initial_dispatch' };
    }

    await this.oemSuggestionMaterialization.tryMaterializeFromSucceededJob(job.id);
    this.logger.log(`OneAuto full-data callback completed job ${job.id}`);
    return { ok: true, status: 'completed' };
  }

  private async failJobFromCallback(jobId: string, code: string, message: string): Promise<void> {
    await this.prisma.oneAutoProviderJob.updateMany({
      where: {
        id: jobId,
        status: {
          in: [
            OneAutoProviderJobStatus.RUNNING,
            OneAutoProviderJobStatus.AWAITING_PROVIDER,
            OneAutoProviderJobStatus.QUEUED,
            OneAutoProviderJobStatus.CREATED,
          ],
        },
      },
      data: {
        status: OneAutoProviderJobStatus.FAILED,
        lastErrorCode: code,
        lastErrorMessageRedacted: redactOneAutoErrorMessage(message),
        actualChargeKnown: false,
      },
    });
    this.logger.warn(`OneAuto callback rejected for job ${jobId}: ${code}`);
  }
}
