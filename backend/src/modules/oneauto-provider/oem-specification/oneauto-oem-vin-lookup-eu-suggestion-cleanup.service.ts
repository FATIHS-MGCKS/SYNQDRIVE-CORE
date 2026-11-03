import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';

export type OneAutoOemSuggestionCleanupReport = {
  candidates: number;
  deleted: number;
  skippedConcurrent: boolean;
};

@Injectable()
export class OneAutoOemVinLookupEuSuggestionCleanupService {
  private readonly logger = new Logger(OneAutoOemVinLookupEuSuggestionCleanupService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private batchSize(): number {
    const cfg = this.config.get<{ oemSuggestionsCleanupBatchSize?: number }>('oneautoProvider');
    const size = cfg?.oemSuggestionsCleanupBatchSize ?? 100;
    return Number.isFinite(size) && size > 0 ? Math.min(size, 1000) : 100;
  }

  async deleteExpiredBatch(): Promise<OneAutoOemSuggestionCleanupReport> {
    if (this.running) {
      return { candidates: 0, deleted: 0, skippedConcurrent: true };
    }
    this.running = true;
    const now = new Date();
    try {
      const batch = await this.prisma.oneAutoOemVinLookupEuSuggestionSnapshot.findMany({
        where: { expiresAt: { lte: now } },
        select: { id: true },
        take: this.batchSize(),
        orderBy: { expiresAt: 'asc' },
      });
      if (batch.length === 0) {
        return { candidates: 0, deleted: 0, skippedConcurrent: false };
      }
      const result = await this.prisma.oneAutoOemVinLookupEuSuggestionSnapshot.deleteMany({
        where: { id: { in: batch.map((row) => row.id) } },
      });
      if (result.count > 0) {
        this.logger.log(
          JSON.stringify({
            kind: 'ONEAUTO_OEM_SUGGESTION_CLEANUP',
            deleted: result.count,
          }),
        );
      }
      return { candidates: batch.length, deleted: result.count, skippedConcurrent: false };
    } finally {
      this.running = false;
    }
  }
}
