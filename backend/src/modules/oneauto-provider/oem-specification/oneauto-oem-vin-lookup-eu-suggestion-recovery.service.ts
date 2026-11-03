import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OneAutoProviderJobStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU } from './oneauto-vin-lookup-oem-suggestion.types';
import { OneAutoOemVinLookupEuSuggestionMaterializationService } from './oneauto-oem-vin-lookup-eu-suggestion-materialization.service';

export type OneAutoOemSuggestionRecoveryReport = {
  disabled: boolean;
  candidates: number;
  attempted: number;
  skippedConcurrent: boolean;
  outcomes: Record<string, number>;
};

@Injectable()
export class OneAutoOemVinLookupEuSuggestionRecoveryService {
  private readonly logger = new Logger(OneAutoOemVinLookupEuSuggestionRecoveryService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly materialization: OneAutoOemVinLookupEuSuggestionMaterializationService,
  ) {}

  private suggestionsEnabled(): boolean {
    const cfg = this.config.get<{ oemSuggestionsEnabled?: boolean }>('oneautoProvider');
    return cfg?.oemSuggestionsEnabled === true;
  }

  private batchSize(): number {
    const cfg = this.config.get<{ oemSuggestionsRecoveryBatchSize?: number }>('oneautoProvider');
    const size = cfg?.oemSuggestionsRecoveryBatchSize ?? 25;
    return Number.isFinite(size) && size > 0 ? Math.min(size, 200) : 25;
  }

  /**
   * Bounded backfill for SUCCEEDED jobs missing snapshots (post-crash / late flag enable).
   * Uses persisted responses only via tryMaterializeFromSucceededJob — never provider HTTP.
   */
  async recoverMissingSnapshotsBatch(): Promise<OneAutoOemSuggestionRecoveryReport> {
    if (!this.suggestionsEnabled()) {
      return {
        disabled: true,
        candidates: 0,
        attempted: 0,
        skippedConcurrent: false,
        outcomes: {},
      };
    }
    if (this.running) {
      return {
        disabled: false,
        candidates: 0,
        attempted: 0,
        skippedConcurrent: true,
        outcomes: {},
      };
    }
    this.running = true;
    const outcomes: Record<string, number> = {};
    try {
      const now = new Date();
      const candidates = await this.prisma.oneAutoProviderJob.findMany({
        where: {
          status: OneAutoProviderJobStatus.SUCCEEDED,
          serviceSku: ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU,
          expiresAt: { gt: now },
          oemVinLookupEuSuggestionSnapshot: { is: null },
        },
        select: { id: true },
        orderBy: { updatedAt: 'desc' },
        take: this.batchSize(),
      });
      if (candidates.length === 0) {
        return {
          disabled: false,
          candidates: 0,
          attempted: 0,
          skippedConcurrent: false,
          outcomes,
        };
      }

      let attempted = 0;
      for (const job of candidates) {
        const evidence = await this.materialization.tryMaterializeFromSucceededJob(job.id);
        attempted += 1;
        outcomes[evidence.outcome] = (outcomes[evidence.outcome] ?? 0) + 1;
      }

      this.logger.log(
        JSON.stringify({
          kind: 'ONEAUTO_OEM_SUGGESTION_RECOVERY',
          candidates: candidates.length,
          attempted,
          outcomes,
        }),
      );

      return {
        disabled: false,
        candidates: candidates.length,
        attempted,
        skippedConcurrent: false,
        outcomes,
      };
    } finally {
      this.running = false;
    }
  }
}
