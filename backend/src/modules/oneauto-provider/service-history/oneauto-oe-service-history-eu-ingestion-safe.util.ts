import { Logger } from '@nestjs/common';
import type { OneAutoOeServiceHistoryEuIngestionService } from './oneauto-oe-service-history-eu-ingestion.service';

/**
 * Never throws — provider job success must not depend on structured ingestion.
 */
export async function runOneAutoOeServiceHistoryIngestionSafely(
  ingestion: Pick<OneAutoOeServiceHistoryEuIngestionService, 'tryIngestFromSucceededJob'>,
  providerJobId: string,
  logger: Logger,
): Promise<void> {
  try {
    await ingestion.tryIngestFromSucceededJob(providerJobId);
  } catch (error) {
    logger.error(
      JSON.stringify({
        kind: 'ONEAUTO_OE_SERVICE_HISTORY_EU_INGESTION_UNHANDLED',
        providerJobId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
