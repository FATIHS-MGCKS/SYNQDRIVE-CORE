import { Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  Ds4AssessmentOutboxRepositoryV1,
} from './ds4-assessment-outbox.repository.v1';
import {
  DI_V0_DS4_ASSESSMENT_TUNING,
  isDiV0Ds4AssessmentWorkerRunnable,
  parseDiV0Ds4AssessmentRuntimeConfig,
  type DiV0Ds4AssessmentRuntimeConfig,
} from './ds4-assessment.config';
import { Ds4AssessmentProcessorServiceV1 } from './ds4-assessment-processor.service.v1';

export type Ds4AssessmentPassResult = {
  configured: boolean;
  discovered: number;
  leasesRecovered: number;
  claimed: number;
  succeeded: number;
  failedRetryable: number;
  failedTerminal: number;
  skipped: number;
};

@Injectable()
export class Ds4AssessmentServiceV1 {
  private readonly logger = new Logger(Ds4AssessmentServiceV1.name);
  private readonly runtimeConfig: DiV0Ds4AssessmentRuntimeConfig;
  private readonly outbox: Ds4AssessmentOutboxRepositoryV1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: Ds4AssessmentProcessorServiceV1,
  ) {
    this.runtimeConfig = parseDiV0Ds4AssessmentRuntimeConfig(process.env);
    this.outbox = new Ds4AssessmentOutboxRepositoryV1(prisma as unknown as PrismaClient);
  }

  isConfigured(): boolean {
    return isDiV0Ds4AssessmentWorkerRunnable(this.runtimeConfig);
  }

  getRuntimeConfig(): DiV0Ds4AssessmentRuntimeConfig {
    return this.runtimeConfig;
  }

  async runPass(now = new Date()): Promise<Ds4AssessmentPassResult> {
    if (!this.isConfigured()) {
      return {
        configured: false,
        discovered: 0,
        leasesRecovered: 0,
        claimed: 0,
        succeeded: 0,
        failedRetryable: 0,
        failedTerminal: 0,
        skipped: 0,
      };
    }

    const maxAttempts = DI_V0_DS4_ASSESSMENT_TUNING.maxProcessingAttempts;
    const minMotionRunCreatedAt = this.runtimeConfig.minMotionRunCreatedAt!;

    const discovered = await this.outbox.discoverFromSucceededMotionRuns({
      limit: this.runtimeConfig.batchLimit,
      now,
      minMotionRunCreatedAt,
    });

    const leasesRecovered = await this.outbox.releaseExpiredProcessingLeases({
      now,
      maxProcessingAttempts: maxAttempts,
      retryDelayMs: DI_V0_DS4_ASSESSMENT_TUNING.baseRetryDelayMs,
    });

    const claimedRows = await this.outbox.claimBatch({
      limit: this.runtimeConfig.batchLimit,
      now,
      leaseMs: DI_V0_DS4_ASSESSMENT_TUNING.claimLeaseMs,
      maxProcessingAttempts: maxAttempts,
    });

    let succeeded = 0;
    let failedRetryable = 0;
    let failedTerminal = 0;
    let skipped = 0;

    for (const row of claimedRows) {
      try {
        const result = await this.processor.processMotionRun({
          organizationId: row.organizationId,
          vehicleId: row.vehicleId,
          tripId: row.tripId,
          sourceMotionRunId: row.sourceMotionRunId,
        });
        if (result.status === 'ok') {
          await this.outbox.markSucceeded(row.outboxId, row.claimToken);
          succeeded += 1;
        } else if (result.status === 'skipped') {
          await this.outbox.markSkipped(row.outboxId, row.claimToken, result.code);
          skipped += 1;
        } else {
          const before = await this.prisma.diV0Ds4AssessmentOutboxV1.findFirst({
            where: { outboxId: row.outboxId },
            select: { attemptCount: true, nextAttemptAt: true },
          });
          const nextCount = (before?.attemptCount ?? 0) + 1;
          const nextAttemptAt =
            nextCount >= maxAttempts
              ? (before?.nextAttemptAt ?? now)
              : new Date(now.getTime() + Ds4AssessmentOutboxRepositoryV1.computeRetryDelayMs(nextCount));
          const outcome = await this.outbox.markFailedRetryable(row.outboxId, row.claimToken, {
            nextAttemptAt,
            errorCode: result.code,
            now,
            maxProcessingAttempts: maxAttempts,
          });
          if (outcome === 'terminal') failedTerminal += 1;
          else failedRetryable += 1;
        }
      } catch (error) {
        const before = await this.prisma.diV0Ds4AssessmentOutboxV1.findFirst({
          where: { outboxId: row.outboxId },
          select: { attemptCount: true, nextAttemptAt: true },
        });
        const nextCount = (before?.attemptCount ?? 0) + 1;
        const nextAttemptAt =
          nextCount >= maxAttempts
            ? (before?.nextAttemptAt ?? now)
            : new Date(now.getTime() + Ds4AssessmentOutboxRepositoryV1.computeRetryDelayMs(nextCount));
        const outcome = await this.outbox.markFailedRetryable(row.outboxId, row.claimToken, {
          nextAttemptAt,
          errorCode: error instanceof Error ? error.message.slice(0, 120) : 'UNKNOWN',
          now,
          maxProcessingAttempts: maxAttempts,
        });
        if (outcome === 'terminal') failedTerminal += 1;
        else failedRetryable += 1;
      }
    }

    return {
      configured: true,
      discovered,
      leasesRecovered,
      claimed: claimedRows.length,
      succeeded,
      failedRetryable,
      failedTerminal,
      skipped,
    };
  }
}
