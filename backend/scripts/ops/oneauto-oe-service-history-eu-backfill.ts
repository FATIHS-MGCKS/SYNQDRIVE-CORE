#!/usr/bin/env node
/**
 * Safe backfill/reconcile for persisted OE_SERVICE_HISTORY_EU responses.
 * Uses Prisma only — does not boot Nest AppModule (no schedulers/queues).
 *
 * From repo root:
 *   cd backend && ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED=1 \
 *   npx ts-node -r tsconfig-paths/register scripts/ops/oneauto-oe-service-history-eu-backfill.ts \
 *     --vehicle-id=<uuid> [--org-id=<uuid>] [--job-id=<cuid>] [--limit=25] [--dry-run]
 */
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import oneautoProviderConfig from '../../src/config/oneauto-provider.config';
import { OneAutoOeServiceHistoryEuIngestionService } from '../../src/modules/oneauto-provider/service-history/oneauto-oe-service-history-eu-ingestion.service';
import {
  buildOneAutoOeServiceHistoryEuBackfillDryRunPlan,
  reconcileOneAutoOeServiceHistoryEuJobs,
} from '../../src/modules/oneauto-provider/service-history/oneauto-oe-service-history-eu-backfill.lib';
import { readOneAutoBooleanEnv } from '../../src/modules/oneauto-provider/oneauto-boolean-env.util';

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const organizationId = readArg('org-id');
  const vehicleId = readArg('vehicle-id');
  const providerJobId = readArg('job-id');
  const limitRaw = readArg('limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 25;

  const prisma = new PrismaClient();
  try {
    const plans = await buildOneAutoOeServiceHistoryEuBackfillDryRunPlan(prisma, {
      organizationId,
      vehicleId,
      providerJobId,
      limit,
    });

    console.log(
      JSON.stringify(
        {
          dryRun,
          providerGetRequests: 0,
          candidateCount: plans.length,
          plans,
        },
        null,
        2,
      ),
    );

    if (dryRun) {
      return;
    }

    if (!readOneAutoBooleanEnv('ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED', false)) {
      console.error('ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED is not active (use true or 1).');
      process.exit(2);
    }

    const config = {
      get: (key: string) => (key === 'oneautoProvider' ? oneautoProviderConfig() : {}),
    } as ConfigService;
    const ingestion = new OneAutoOeServiceHistoryEuIngestionService(prisma as never, config);

    const summary = await reconcileOneAutoOeServiceHistoryEuJobs(
      prisma,
      (jobId) => ingestion.tryIngestFromSucceededJob(jobId),
      { organizationId, vehicleId, providerJobId, limit },
    );
    console.log(JSON.stringify({ summary, providerGetRequests: 0 }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
