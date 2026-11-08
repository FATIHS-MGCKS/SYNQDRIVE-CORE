/**
 * Read-only FSD discovery run inspector (tenant-scoped).
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { FsdDiscoveryOpsModule } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd-discovery-ops.module';
import { Fsd3DiscoveryRunInspectorService } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-discovery-run-inspector.service';
import { assertFsd3OneShotHostAttestation } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-host-attestation.v1';

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

function parseArgs() {
  const get = (prefix: string) =>
    process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
  return {
    organizationId: get('--organization-id='),
    runId: get('--run-id='),
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args.organizationId?.trim() || !args.runId?.trim()) {
    console.error('Usage: --organization-id= --run-id=');
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL required');
    process.exit(2);
  }
  assertFsd3OneShotHostAttestation();

  const app = await NestFactory.createApplicationContext(FsdDiscoveryOpsModule, {
    logger: ['error', 'warn'],
  });
  try {
    const inspector = app.get(Fsd3DiscoveryRunInspectorService);
    const report = await inspector.inspectTenantScoped({
      organizationId: args.organizationId,
      runId: args.runId,
    });
    console.log(JSON.stringify({ status: 'INSPECT_OK', report }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
