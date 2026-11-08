/**
 * P6B — one-shot FSD3 catalog/snapshot discovery (privileged ops CLI).
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
  parseFsd3LiveOwnerApprovalEnvelopeJson,
  verifyFsd3LiveOwnerApprovalEnvelopeV1,
  type Fsd3LiveOwnerApprovalEnvelopeV1,
  type Fsd3OneShotCliScopeV1,
} from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-owner-approval.v1';
import { assertFsd3OneShotHostAttestation } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-host-attestation.v1';
import { FSD3_P6B_CLI_BUDGET_V1 } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-cli-budget.v1';
import { resolveFsd3OneShotExecutableReleaseShaV1 } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-executable-attestation.v1';
import type { Fsd3OneShotLiveProviderV1 } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-execution-capability.v1';
import {
  type Fsd3OwnerApprovalTrustLoadContextV1,
} from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-trust-anchor.v1';

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
  const modeRaw = get('--mode=') ?? 'OFFLINE_PLAN';
  if (!['OFFLINE_PLAN', 'AUTHORIZED_READ_ONLY_PREFLIGHT', 'EXECUTE'].includes(modeRaw)) {
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
    l2ApprovalFile: get('--l2-approval-file='),
    providerRaw,
    liveProvider: providerRaw ? parseLiveProvider(providerRaw) : undefined,
  };
}

function buildScope(args: ReturnType<typeof parseArgs>, executableReleaseSha: string): Fsd3OneShotCliScopeV1 {
  const missing = [
    ['--organization-id', args.organizationId],
    ['--vehicle-id', args.vehicleId],
    ['--link-id', args.linkId],
    ['--discovery-request-key', args.discoveryRequestKey],
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
    executableReleaseSha,
  };
}

function resolveCliTrustContext(input: {
  mode: CliMode;
  liveProvider: Fsd3OneShotLiveProviderV1;
}): Fsd3OwnerApprovalTrustLoadContextV1 {
  if (input.mode === 'EXECUTE' && input.liveProvider === 'dimo_live') {
    if (process.env.FSD3_ONE_SHOT_ALLOW_TEST_TRUST_INLINE === '1') {
      throw new Error('FSD3_L2_TRUST_LIVE_INLINE_FORBIDDEN');
    }
    return { mode: 'OPERATOR_FILE_ANCHORED', liveDimoExecute: true };
  }
  const inline = process.env.FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_JSON?.trim();
  if (process.env.FSD3_ONE_SHOT_ALLOW_TEST_TRUST_INLINE === '1' && inline) {
    return { mode: 'TEST_ISOLATED_INLINE', trustStoreJson: inline };
  }
  return { mode: 'OPERATOR_FILE_ANCHORED' };
}

function loadVerifiedOwnerApprovalEnvelope(
  filePath: string,
  scope: Fsd3OneShotCliScopeV1,
  liveProvider: Fsd3OneShotLiveProviderV1,
  trustContext: Fsd3OwnerApprovalTrustLoadContextV1,
): Fsd3LiveOwnerApprovalEnvelopeV1 {
  const raw = fs.readFileSync(filePath, 'utf8');
  const envelope = parseFsd3LiveOwnerApprovalEnvelopeJson(raw);
  const approval = verifyFsd3LiveOwnerApprovalEnvelopeV1({ envelope, trustContext });
  assertFsd3LiveOwnerApprovalMatchesScope({ approval, scope, liveProvider });
  return envelope;
}

function offlinePlan(
  args: ReturnType<typeof parseArgs>,
  scope: Fsd3OneShotCliScopeV1,
  liveProvider: Fsd3OneShotLiveProviderV1,
  trustContext: Fsd3OwnerApprovalTrustLoadContextV1,
) {
  const envelope = loadVerifiedOwnerApprovalEnvelope(args.l2ApprovalFile!, scope, liveProvider, trustContext);
  console.log(
    JSON.stringify(
      {
        status: 'OFFLINE_PLAN',
        scope,
        attestedExecutableReleaseSha: scope.executableReleaseSha,
        approvalReference: envelope.payload.approvalReference,
        liveProvider,
        budget: FSD3_P6B_CLI_BUDGET_V1,
        note: 'No database or DIMO provider calls in OFFLINE_PLAN',
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  const args = parseArgs();
  const attestedSha = resolveFsd3OneShotExecutableReleaseShaV1({
    entrypointAbsolutePaths: [
      __filename,
      path.resolve(
        __dirname,
        '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-executable-attestation.v1.ts',
      ),
    ],
  });
  const scope = buildScope(args, attestedSha);
  const trustContext = resolveCliTrustContext({
    mode: args.mode,
    liveProvider: args.liveProvider ?? 'mock',
  });

  if (args.mode !== 'OFFLINE_PLAN' && !args.liveProvider) {
    throw new Error('MISSING_EXPLICIT_PROVIDER');
  }
  const liveProvider: Fsd3OneShotLiveProviderV1 =
    args.liveProvider ?? (args.mode === 'OFFLINE_PLAN' ? 'mock' : 'mock');

  if (args.mode === 'OFFLINE_PLAN') {
    offlinePlan(args, scope, liveProvider, trustContext);
    return;
  }

  if (!args.actorUserId?.trim()) {
    console.error('Missing --actor-user-id for non-OFFLINE modes');
    process.exit(2);
  }

  assertFsd3OneShotHostAttestation();
  const ownerApprovalEnvelope = loadVerifiedOwnerApprovalEnvelope(
    args.l2ApprovalFile!,
    scope,
    liveProvider,
    trustContext,
  );

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required for PREFLIGHT/EXECUTE');
    process.exit(2);
  }

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
            attestedExecutableReleaseSha: attestedSha,
            approvalReference: ownerApprovalEnvelope.payload.approvalReference,
            liveProvider,
            preflight,
          },
          null,
          2,
        ),
      );
      return;
    }

    const preflightTicket = preflightSvc.mintAuthorizedPreflightTicket({
      scope,
      actorUserId: args.actorUserId,
    });
    const executionCapability = preflightSvc.issueExecutionCapability({
      scope,
      verifiedOwnerApprovalEnvelope: ownerApprovalEnvelope,
      preflightTicket,
      actorUserId: args.actorUserId,
      liveProvider,
      trustContext,
    });

    const executionSvc = app.get(Fsd3OneShotExecutionService);

    if (liveProvider === 'mock' || process.env.FSD3_ONE_SHOT_FORCE_MOCK_PROVIDER === '1') {
      const provider = createFsd3MockDiscoveryProvider({ mode: 'TESLA_REFERENCE_26' });
      const result = await executionSvc.executeAuthorizedOneShot({
        executionCapability,
        provider,
        expectedLiveProvider: 'mock',
      });
      console.log(JSON.stringify({ status: 'EXECUTE_MOCK', result }, null, 2));
      return;
    }

    const adapterFactory = app.get(FsdDimoAdapterFactoryService);
    const livePort = adapterFactory.createAdapter().createFsd3Port();
    const result = await executionSvc.executeAuthorizedOneShot({
      executionCapability,
      provider: livePort,
      expectedLiveProvider: 'dimo_live',
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
