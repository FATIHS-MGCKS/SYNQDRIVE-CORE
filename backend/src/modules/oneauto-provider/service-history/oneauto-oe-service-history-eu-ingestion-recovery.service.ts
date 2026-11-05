import { Injectable, Logger } from '@nestjs/common';
import { OneAutoProviderJobStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU } from './oneauto-service-history-eu.types';
import { OneAutoOeServiceHistoryEuIngestionService } from './oneauto-oe-service-history-eu-ingestion.service';

export type OneAutoOeServiceHistoryEuIngestionRecoverySummary = {
  scanned: number;
  attempted: number;
  succeeded: number;
  partial: number;
  failed: number;
  skipped: number;
};

/**
 * Reconcile structured service history from persisted OneAuto responses — no provider HTTP.
 */
@Injectable()
export class OneAutoOeServiceHistoryEuIngestionRecoveryService {
  private readonly logger = new Logger(OneAutoOeServiceHistoryEuIngestionRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: OneAutoOeServiceHistoryEuIngestionService,
  ) {}

  async reconcileSucceededJobs(input: {
    organizationId?: string;
    vehicleId?: string;
    providerJobId?: string;
    limit?: number;
  }): Promise<OneAutoOeServiceHistoryEuIngestionRecoverySummary> {
    const limit = Math.min(Math.max(input.limit ?? 25, 1), 200);
    const jobs = await this.prisma.oneAutoProviderJob.findMany({
      where: {
        serviceSku: ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU,
        status: OneAutoProviderJobStatus.SUCCEEDED,
        ...(input.providerJobId ? { id: input.providerJobId } : {}),
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        ...(input.vehicleId ? { vehicleId: input.vehicleId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: { id: true },
    });

    const summary: OneAutoOeServiceHistoryEuIngestionRecoverySummary = {
      scanned: jobs.length,
      attempted: 0,
      succeeded: 0,
      partial: 0,
      failed: 0,
      skipped: 0,
    };

    for (const job of jobs) {
      summary.attempted += 1;
      const evidence = await this.ingestion.tryIngestFromSucceededJob(job.id);
      switch (evidence.outcome) {
        case 'SUCCEEDED':
        case 'ALREADY_SUCCEEDED':
        case 'SKIPPED_EMPTY':
          summary.succeeded += 1;
          break;
        case 'PARTIAL':
          summary.partial += 1;
          break;
        case 'FAILED':
          summary.failed += 1;
          break;
        default:
          summary.skipped += 1;
          break;
      }
    }

    this.logger.log(JSON.stringify({ kind: 'ONEAUTO_OE_SERVICE_HISTORY_EU_RECONCILE', ...summary }));
    return summary;
  }
}
