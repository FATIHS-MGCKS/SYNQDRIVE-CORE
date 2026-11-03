import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OneAutoProviderJobStatus } from '@prisma/client';
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
import { redactProviderResponseBody } from './oneauto-provider-redact.util';

export type OneAutoCallbackIngestResult =
  | { ok: true; status: 'accepted' | 'duplicate' | 'ignored_expired' | 'ignored_terminal' }
  | { ok: false; status: 'unknown_token' | 'disabled' };

@Injectable()
export class OneAutoProviderCallbackService {
  private readonly logger = new Logger(OneAutoProviderCallbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_NAMES.ONEAUTO_PROVIDER) private readonly queue: Queue<OneAutoProviderJobPayload>,
  ) {}

  async ingestProviderCallback(input: {
    deliveryToken: string;
    rawBody: string;
    parsedBody: unknown;
  }): Promise<OneAutoCallbackIngestResult> {
    const cfg = this.config.get<{
      enabled?: boolean;
      callbackEnabled?: boolean;
      callbackRetrievalGetEnabled?: boolean;
    }>('oneautoProvider');
    if (cfg?.enabled !== true || cfg.callbackEnabled !== true || cfg.callbackRetrievalGetEnabled !== true) {
      return { ok: false, status: 'disabled' };
    }

    const deliveryTokenSha256 = sha256Hex(input.deliveryToken);
    const job = await this.prisma.oneAutoProviderJob.findFirst({
      where: { callbackDeliveryTokenSha256: deliveryTokenSha256 },
      select: {
        id: true,
        organizationId: true,
        serviceSku: true,
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
    if (!contract || contract.asyncCompletionMode !== 'CALLBACK_NOTIFY_THEN_GET') {
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
}
