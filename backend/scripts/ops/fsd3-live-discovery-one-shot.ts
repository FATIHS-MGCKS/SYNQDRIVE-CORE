/**
 * Privileged one-shot FSD3 catalog/snapshot discovery (operator CLI).
 * Uses MASTER_ADMIN operator auth + existing orchestration; no L2 crypto layer.
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { FsdDiscoveryOpsModule } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd-discovery-ops.module';
import { Fsd3OneShotLiveBootstrapModule } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-live-bootstrap.module';
import { Fsd3OneShotPreflightService } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-preflight.service';
import { Fsd3OneShotExecutionService } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-execution.service';
import { FsdDimoAdapterFactoryService } from '../../src/modules/vehicle-intelligence/fsd-integration/fsd-dimo-adapter-factory.service';
import { createFsd3MockDiscoveryProvider } from '../../src/modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-mock-provider.v1';
import { assertFsd3OneShotHostAttestation } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-host-attestation.v1';
import { assertFsd3OneShotLiveExecuteOwnerAuthorized } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-live-owner-gate.v1';
import { FSD3_P6B_CLI_BUDGET_V1 } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-cli-budget.v1';
import {
  resolveFsd3OneShotReleaseShaForAuditV1,
  type Fsd3OneShotLiveProviderV1,
} from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-types.v1';

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

type CliMode = 'AUTHORIZED_READ_ONLY_PREFLIGHT' | 'EXECUTE';

function parseLiveProvider(raw: string | undefined): Fsd3OneShotLiveProviderV1 {
  if (raw === 'mock') {
    return 'mock';
  }
  if (raw === 'live') {
    return 'dimo_live';
  }
  throw new Error('INVALID_PROVIDER');
}

function parseArgs() {
  const get = (prefix: string) =>
    process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
  const modeRaw = get('--mode=') ?? 'AUTHORIZED_READ_ONLY_PREFLIGHT';
  if (!['AUTHORIZED_READ_ONLY_PREFLIGHT', 'EXECUTE'].includes(modeRaw)) {
    throw new Error('INVALID_MODE');
  }
  const providerRaw = get('--provider=');
  return {
    mode: modeRaw as CliMode,
    organizationId: get('--organization-id='),
    vehicleId: get('--vehicle-id='),
    linkId: get('--link-id='),
    actorUserId: get('--actor-user-id='),
    discoveryRequestKey: get('--discovery-request-key='),
    providerRaw,
    liveProvider: providerRaw ? parseLiveProvider(providerRaw) : undefined,
  };
}

function requireScope(args: ReturnType<typeof parseArgs>) {
  const missing = [
    ['--organization-id', args.organizationId],
    ['--vehicle-id', args.vehicleId],
    ['--link-id', args.linkId],
    ['--discovery-request-key', args.discoveryRequestKey],
    ['--actor-user-id', args.actorUserId],
  ].filter(([, v]) => !v?.trim());
  if (missing.length) {
    throw new Error(`Missing: ${missing.map(([k]) => k).join(', ')}`);
  }
  return {
    organizationId: args.organizationId!,
    vehicleId: args.vehicleId!,
    providerSourceLinkId: args.linkId!,
    discoveryRequestKey: args.discoveryRequestKey!,
    actorUserId: args.actorUserId!,
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args.providerRaw) {
    throw new Error('MISSING_EXPLICIT_PROVIDER');
  }
  const liveProvider = args.liveProvider!;
  const { organizationId, vehicleId, providerSourceLinkId, discoveryRequestKey, actorUserId } =
    requireScope(args);

  assertFsd3OneShotHostAttestation();

  if (args.mode === 'EXECUTE' && liveProvider === 'dimo_live') {
    assertFsd3OneShotLiveExecuteOwnerAuthorized();
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }

  const scope = { organizationId, vehicleId, providerSourceLinkId, discoveryRequestKey };
  const releaseSha = resolveFsd3OneShotReleaseShaForAuditV1();

  const useLiveAdapter =
    args.mode === 'EXECUTE' &&
    liveProvider === 'dimo_live' &&
    process.env.FSD3_ONE_SHOT_FORCE_MOCK_PROVIDER !== '1';

  const nestModule = useLiveAdapter ? Fsd3OneShotLiveBootstrapModule : FsdDiscoveryOpsModule;
  const app = await NestFactory.createApplicationContext(nestModule, {
    logger: ['error', 'warn'],
  });

  try {
    const preflightSvc = app.get(Fsd3OneShotPreflightService);
    const preflight = await preflightSvc.runAuthorizedReadOnlyPreflight({ scope, actorUserId });

    if (args.mode === 'AUTHORIZED_READ_ONLY_PREFLIGHT') {
      console.log(
        JSON.stringify(
          {
            status: 'AUTHORIZED_READ_ONLY_PREFLIGHT',
            scope,
            releaseSha,
            liveProvider,
            budget: FSD3_P6B_CLI_BUDGET_V1,
            preflight,
          },
          null,
          2,
        ),
      );
      return;
    }

    const executionSvc = app.get(Fsd3OneShotExecutionService);

    if (liveProvider === 'mock' || process.env.FSD3_ONE_SHOT_FORCE_MOCK_PROVIDER === '1') {
      const provider = createFsd3MockDiscoveryProvider({ mode: 'TESLA_REFERENCE_26' });
      const result = await executionSvc.executeOneShot({
        scope,
        preflight,
        liveProvider: 'mock',
        provider,
        releaseSha,
      });
      console.log(JSON.stringify({ status: 'EXECUTE_MOCK', result }, null, 2));
      return;
    }

    const adapterFactory = app.get(FsdDimoAdapterFactoryService);
    const livePort = adapterFactory.createAdapter().createFsd3Port();
    const result = await executionSvc.executeOneShot({
      scope,
      preflight,
      liveProvider: 'dimo_live',
      provider: livePort,
      releaseSha,
    });
    console.log(JSON.stringify({ status: 'EXECUTE_LIVE', result }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
