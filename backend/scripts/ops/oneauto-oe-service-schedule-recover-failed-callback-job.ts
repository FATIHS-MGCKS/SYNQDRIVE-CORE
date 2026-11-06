#!/usr/bin/env npx ts-node
/**
 * Owner-invoked recovery for a FAILED OE_SERVICE_SCHEDULE full-data callback job.
 * Replays `one_auto_provider_callback_inbox` only — never calls One Auto.
 *
 * Default: dry-run (no DB writes). Remove `--dry-run` only after DRY_RUN_OK.
 *
 * Production (requires explicit env):
 *   ONEAUTO_OE_SERVICE_SCHEDULE_CALLBACK_RECOVERY_PRODUCTION_AUTHORIZED=1
 *   ONEAUTO_OE_SERVICE_SCHEDULE_CALLBACK_RECOVERY_OWNER_ACK=1
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { OneAutoOeServiceScheduleFailedCallbackRecoveryCliModule } from '../../src/modules/oneauto-provider/oneauto-oe-service-schedule-failed-callback-recovery-cli.module';
import { OneAutoOeServiceScheduleFailedCallbackRecoveryService } from '../../src/modules/oneauto-provider/oneauto-oe-service-schedule-failed-callback-recovery.service';
import { ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU } from '../../src/modules/oneauto-provider/service-schedule/oneauto-service-schedule-eu.types';

{
  const envPath =
    process.env.SYNQDRIVE_BACKEND_ENV ?? path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
      }
    }
  }
}

function parseArg(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${prefix}=`));
  if (!hit) return undefined;
  return hit.split('=').slice(1).join('=').trim();
}

async function main(): Promise<void> {
  const jobId = parseArg('--job-id');
  const organizationId = parseArg('--organization-id');
  const vehicleId = parseArg('--vehicle-id');
  const expectedVin = parseArg('--expected-vin');
  const expectedServiceSku = parseArg('--expected-service-sku') ?? ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU;
  const expectedLastErrorCode =
    parseArg('--expected-last-error-code') ?? 'ONEAUTO_CALLBACK_PAYLOAD_INCOMPLETE';
  const expectedNormal = parseArg('--expected-normal-services-count');
  const expectedExtra = parseArg('--expected-extra-services-count');

  const noDryRun = process.argv.includes('--execute');
  const dryRun = !noDryRun;
  const json = process.argv.includes('--json');

  if (!jobId || !organizationId || !vehicleId || !expectedVin) {
    console.error(
      'Usage: oneauto-oe-service-schedule-recover-failed-callback-job.ts ' +
        '--job-id=<id> --organization-id=<uuid> --vehicle-id=<uuid> --expected-vin=<vin> ' +
        '[--expected-service-sku=OE_SERVICE_SCHEDULE] [--expected-last-error-code=ONEAUTO_CALLBACK_PAYLOAD_INCOMPLETE] ' +
        '[--expected-normal-services-count=9] [--expected-extra-services-count=21] ' +
        '[--execute] [--json]',
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(
    OneAutoOeServiceScheduleFailedCallbackRecoveryCliModule,
    { logger: ['error', 'warn'] },
  );

  try {
    const recovery = app.get(OneAutoOeServiceScheduleFailedCallbackRecoveryService);
    const result = await recovery.recoverFailedScheduleCallbackJob({
      jobId,
      organizationId,
      vehicleId,
      expectedVin,
      expectedServiceSku,
      expectedLastErrorCode,
      expectedNormalServicesCount: expectedNormal != null ? Number.parseInt(expectedNormal, 10) : undefined,
      expectedExtraServicesCount: expectedExtra != null ? Number.parseInt(expectedExtra, 10) : undefined,
      dryRun,
    });

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(JSON.stringify(result));
    }

    const okOutcomes = new Set(['RECOVERED', 'DRY_RUN_OK', 'ALREADY_RECOVERED']);
    process.exit(okOutcomes.has(result.outcome) ? 0 : 2);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
