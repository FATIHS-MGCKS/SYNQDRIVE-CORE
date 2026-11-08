/**
 * P6B — one-shot FSD3 catalog/snapshot discovery (privileged ops CLI).
 *
 * Modes:
 *   OFFLINE_PLAN — no DATABASE_URL, no provider, no writes
 *   AUTHORIZED_READ_ONLY_PREFLIGHT — DB reads + operator/L2 gates, no provider, no writes
 *   EXECUTE — full orchestration (live DIMO when provider is live adapter; use mock in CI)
 *
 * Usage:
 *   npx tsx scripts/ops/fsd3-live-discovery-one-shot.ts \
 *     --mode=OFFLINE_PLAN \
 *     --organization-id=... --vehicle-id=... --link-id=... \
 *     --actor-user-id=... --discovery-request-key=... \
 *     --executable-release-sha=... --l2-approval-file=/path/to/approval.json
 *
 * EXECUTE / PREFLIGHT also require FSD3_ONE_SHOT_HOST_ATTESTATION=1 in the operator shell.
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
import {
  assertFsd3LiveOwnerApprovalMatchesScope,
  parseFsd3LiveOwnerApprovalJson,
  type Fsd3OneShotCliScopeV1,
} from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-owner-approval.v1';
import { assertFsd3OneShotHostAttestation } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-host-attestation.v1';
import { FSD3_P6B_CLI_BUDGET_V1 } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-cli-budget.v1';

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

type CliMode = 'OFFLINE_PLAN' | 'AUTHORIZED_READ_ONLY_PREFLIGHT' | 'EXECUTE';

function parseArgs() {
  const get = (prefix: string) =>
    process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
  const modeRaw = get('--mode=') ?? 'OFFLINE_PLAN';
  if (!['OFFLINE_PLAN', 'AUTHORIZED_READ_ONLY_PREFLIGHT', 'EXECUTE'].includes(modeRaw)) {
    throw new Error('INVALID_MODE');
  }
  return {
    mode: modeRaw as CliMode,
    organizationId: get('--organization-id='),
    vehicleId: get('--vehicle-id='),
    linkId: get('--link-id='),
    actorUserId: get('--actor-user-id='),
    discoveryRequestKey: get('--discovery-request-key='),
    executableReleaseSha: get('--executable-release-sha='),
    l2ApprovalFile: get('--l2-approval-file='),
    provider: (get('--provider=') ?? 'live') as 'live' | 'mock',
  };
}

function buildScope(args: ReturnType<typeof parseArgs>): Fsd3OneShotCliScopeV1 {
  const missing = [
    ['--organization-id', args.organizationId],
    ['--vehicle-id', args.vehicleId],
    ['--link-id', args.linkId],
    ['--discovery-request-key', args.discoveryRequestKey],
    ['--executable-release-sha', args.executableReleaseSha],
    ['--l2-approval-file', args.l2ApprovalFile],
  ].filter(([, v]) => !v?.trim());
  if (missing.length) {
    throw new Error(`Missing: ${missing.map(([k]) => k).join(', ')}`);
  }
  return {
    organizationId: args.organizationId!,
    vehicleId: args.vehicleId!,
    providerSourceLinkId: args.linkId!,
    discoveryRequestKey: args.discoveryRequestKey!,
    executableReleaseSha: args.executableReleaseSha!,
  };
}

function loadOwnerApproval(filePath: string, scope: Fsd3OneShotCliScopeV1) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const approval = parseFsd3LiveOwnerApprovalJson(raw);
  assertFsd3LiveOwnerApprovalMatchesScope({ approval, scope });
  return approval;
}

function offlinePlan(args: ReturnType<typeof parseArgs>, scope: Fsd3OneShotCliScopeV1) {
  const approval = loadOwnerApproval(args.l2ApprovalFile!, scope);
  console.log(
    JSON.stringify(
      {
        status: 'OFFLINE_PLAN',
        scope,
        approvalReference: approval.approvalReference,
        budget: FSD3_P6B_CLI_BUDGET_V1,
        provider: args.provider,
        note: 'No database or DIMO provider calls in OFFLINE_PLAN',
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  const args = parseArgs();
  const scope = buildScope(args);

  if (args.mode === 'OFFLINE_PLAN') {
    offlinePlan(args, scope);
    return;
  }

  if (!args.actorUserId?.trim()) {
    console.error('Missing --actor-user-id for non-OFFLINE modes');
    process.exit(2);
  }

  assertFsd3OneShotHostAttestation();
  const approval = loadOwnerApproval(args.l2ApprovalFile!, scope);

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required for PREFLIGHT/EXECUTE');
    process.exit(2);
  }

  const nestModule =
    args.mode === 'EXECUTE' &&
    args.provider === 'live' &&
    process.env.FSD3_ONE_SHOT_FORCE_MOCK_PROVIDER !== '1'
      ? Fsd3OneShotLiveBootstrapModule
      : FsdDiscoveryOpsModule;

  const app = await NestFactory.createApplicationContext(nestModule, {
    logger: ['error', 'warn'],
  });

  try {
    const preflightSvc = app.get(Fsd3OneShotPreflightService);
    const preflight = await preflightSvc.runAuthorizedReadOnlyPreflight({
      scope,
      actorUserId: args.actorUserId,
    });

    if (args.mode === 'AUTHORIZED_READ_ONLY_PREFLIGHT') {
      console.log(
        JSON.stringify(
          {
            status: 'AUTHORIZED_READ_ONLY_PREFLIGHT',
            scope,
            approvalReference: approval.approvalReference,
            preflight,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (args.provider === 'mock' || process.env.FSD3_ONE_SHOT_FORCE_MOCK_PROVIDER === '1') {
      const executionSvc = app.get(Fsd3OneShotExecutionService);
      const provider = createFsd3MockDiscoveryProvider({ mode: 'TESLA_REFERENCE_26' });
      const result = await executionSvc.executeAuthorizedOneShot({
        scope,
        approvalReference: approval.approvalReference,
        preflight,
        provider,
      });
      console.log(JSON.stringify({ status: 'EXECUTE_MOCK', result }, null, 2));
      return;
    }

    const adapterFactory = app.get(FsdDimoAdapterFactoryService);
    const executionSvc = app.get(Fsd3OneShotExecutionService);
    const livePort = adapterFactory.createAdapter().createFsd3Port();
    const result = await executionSvc.executeAuthorizedOneShot({
      scope,
      approvalReference: approval.approvalReference,
      preflight,
      provider: livePort,
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
