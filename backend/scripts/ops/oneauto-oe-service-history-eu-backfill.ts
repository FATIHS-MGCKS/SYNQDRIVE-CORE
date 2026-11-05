#!/usr/bin/env node
/**
 * Safe backfill/reconcile for persisted OE_SERVICE_HISTORY_EU responses.
 * Uses database evidence only — never performs provider HTTP.
 *
 * Usage:
 *   ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED=1 \
 *   npx ts-node -r tsconfig-paths/register scripts/ops/oneauto-oe-service-history-eu-backfill.ts \
 *     --vehicle-id=<uuid> [--org-id=<uuid>] [--job-id=<cuid>] [--limit=25] [--dry-run]
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { OneAutoOeServiceHistoryEuIngestionRecoveryService } from '../../src/modules/oneauto-provider/service-history/oneauto-oe-service-history-eu-ingestion-recovery.service';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { OneAutoProviderJobStatus } from '@prisma/client';
import { ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU } from '../../src/modules/oneauto-provider/service-history/oneauto-service-history-eu.types';

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

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const prisma = app.get(PrismaService);
    const recovery = app.get(OneAutoOeServiceHistoryEuIngestionRecoveryService);

    const candidates = await prisma.oneAutoProviderJob.findMany({
      where: {
        serviceSku: ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU,
        status: OneAutoProviderJobStatus.SUCCEEDED,
        ...(providerJobId ? { id: providerJobId } : {}),
        ...(organizationId ? { organizationId } : {}),
        ...(vehicleId ? { vehicleId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: Number.isFinite(limit) ? limit : 25,
      select: { id: true, vehicleId: true, organizationId: true, vinSnapshot: true, updatedAt: true },
    });

    console.log(
      JSON.stringify({
        dryRun,
        candidateCount: candidates.length,
        candidates,
      }),
    );

    if (dryRun) {
      return;
    }

    const summary = await recovery.reconcileSucceededJobs({
      organizationId,
      vehicleId,
      providerJobId,
      limit,
    });
    console.log(JSON.stringify({ summary }));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
