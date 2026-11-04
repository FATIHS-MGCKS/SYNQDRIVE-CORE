#!/usr/bin/env npx ts-node
/**
 * Owner-invoked one-shot recovery for a FAILED One Auto E4 full-data callback job.
 * Replays the persisted inbox payload only — never calls the One Auto provider.
 *
 * Production (requires explicit env authorizations):
 *   ONEAUTO_E4_CALLBACK_RECOVERY_PRODUCTION_AUTHORIZED=1
 *   ONEAUTO_E4_CALLBACK_RECOVERY_OWNER_ACK=1
 *   npx ts-node -r tsconfig-paths/register scripts/ops/oneauto-e4-recover-failed-callback-job.ts \
 *     --job-id=cmw2hf8zg005mrfvji5e134ns \
 *     --organization-id=faa710c9-6d91-4079-a7d5-91fdccdec14a \
 *     --vehicle-id=8c850ff1-4201-432b-af2e-2711dbc7ca48 \
 *     --expected-last-error-code=ONEAUTO_CALLBACK_PAYLOAD_MALFORMED \
 *     --dry-run
 *
 * Remove --dry-run only after dry-run prints DRY_RUN_OK.
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { OneAutoE4FailedCallbackRecoveryCliModule } from '../../src/modules/oneauto-provider/oneauto-e4-failed-callback-recovery-cli.module';
import { OneAutoE4FailedCallbackRecoveryService } from '../../src/modules/oneauto-provider/oneauto-e4-failed-callback-recovery.service';

{
  const envPath =
    process.env.SYNQDRIVE_BACKEND_ENV ??
    path.resolve(__dirname, '..', '..', '.env');
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
  const expectedLastErrorCode =
    parseArg('--expected-last-error-code') ?? 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED';
  const dryRun = process.argv.includes('--dry-run');
  const json = process.argv.includes('--json');

  if (!jobId || !organizationId || !vehicleId) {
    console.error(
      'Usage: oneauto-e4-recover-failed-callback-job.ts --job-id=<id> --organization-id=<uuid> --vehicle-id=<uuid> [--expected-last-error-code=ONEAUTO_CALLBACK_PAYLOAD_MALFORMED] [--dry-run] [--json]',
    );
    process.exit(1);
  }

  const appModule = OneAutoE4FailedCallbackRecoveryCliModule;
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  try {
    const recovery = app.get(OneAutoE4FailedCallbackRecoveryService);
    const result = await recovery.recoverFailedFullDataCallbackJob({
      jobId,
      organizationId,
      vehicleId,
      expectedLastErrorCode,
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
