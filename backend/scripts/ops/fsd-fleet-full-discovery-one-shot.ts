/**
 * P6C privileged fleet full signal discovery (FSD3 catalog/snapshot + FSD4 historical).
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { FsdDiscoveryOpsModule } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd-discovery-ops.module';
import { FsdP6dLiveFleetBootstrapModule } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd-p6d-live-fleet-bootstrap.module';
import { FsdP6cFleetDiscoveryService } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd-p6c-fleet-discovery.service';
import { FsdP6dFleetLiveExecutorService } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd-p6d-fleet-live-executor.service';
import { assertFsd3OneShotHostAttestation } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-host-attestation.v1';
import { assertFsd3OneShotLiveExecuteOwnerAuthorized } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-live-owner-gate.v1';
import { resolveFsd3OneShotReleaseShaForAuditV1 } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-types.v1';
import {
  assertFsdP6cFleetManifestOrderV1,
  parseFsdP6cFleetManifestV1,
} from '../../src/modules/vehicle-intelligence/fsd-integration/ops/p6c/fsd-p6c-fleet-manifest.v1';
import { buildFsdP6cFleetDiscoveryPlanReportV1 } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/p6c/fsd-p6c-fleet-plan.v1';
import {
  FSD_P6C_OFFLINE_FIXTURE_HYDRATION_ENV,
  hydrateFsdP6cOfflineFleetManifestV1,
} from '../../src/modules/vehicle-intelligence/fsd-integration/ops/p6c/fsd-p6c-offline-manifest-hydrate.v1';
import { evaluateFsdP6cProviderBudgetGuardV1 } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/p6c/fsd-p6c-provider-budget-guard.v1';
import {
  buildFsdP6cLiveTestGoNoGoV1,
  resolveFsdP6cArchitectureReviewClearedV1,
} from '../../src/modules/vehicle-intelligence/fsd-integration/ops/p6c/fsd-p6c-go-no-go.v1';
import { assertProductionFleetManifestV1 } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/p6c/fsd-p6c-production-manifest-guard.v1';
import { assertFsdP6cMockExecuteDatabaseAllowedV1 } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/p6c/fsd-p6c-mock-execute-db-guard.v1';
import type { Fsd3OneShotLiveProviderV1 } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-types.v1';

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

type CliMode =
  | 'OFFLINE_PLAN'
  | 'AUTHORIZED_READ_ONLY_PREFLIGHT'
  | 'PREPARE_LIVE_FLEET'
  | 'EXECUTE';

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
  if (!['OFFLINE_PLAN', 'AUTHORIZED_READ_ONLY_PREFLIGHT', 'PREPARE_LIVE_FLEET', 'EXECUTE'].includes(modeRaw)) {
    throw new Error('INVALID_MODE');
  }
  return {
    mode: modeRaw as CliMode,
    fleetManifestPath: get('--fleet-manifest='),
    actorUserId: get('--actor-user-id='),
    providerRaw: get('--provider='),
    planTokenId: get('--plan-token-id='),
    allowOfflineFixture: get('--allow-offline-fixture=') === '1',
    liveProvider: get('--provider=') ? parseLiveProvider(get('--provider=')) : undefined,
  };
}

function loadManifest(mode: CliMode, manifestPath: string, allowOfflineFixture: boolean) {
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
  const parsed = parseFsdP6cFleetManifestV1(raw);

  if (mode === 'OFFLINE_PLAN') {
    if (!allowOfflineFixture) {
      throw new Error('OFFLINE_PLAN_REQUIRES_ALLOW_OFFLINE_FIXTURE_1');
    }
    process.env[FSD_P6C_OFFLINE_FIXTURE_HYDRATION_ENV] = '1';
    return hydrateFsdP6cOfflineFleetManifestV1(parsed, { allowHydration: true });
  }

  assertProductionFleetManifestV1(parsed);
  return parsed;
}

function parseTokenMap(args: ReturnType<typeof parseArgs>, manifest: ReturnType<typeof loadManifest>) {
  const tokenId = args.planTokenId ? Number.parseInt(args.planTokenId, 10) : 4_242_42;
  if (!Number.isFinite(tokenId) || tokenId <= 0) {
    throw new Error('INVALID_PLAN_TOKEN_ID');
  }
  const map = new Map<string, number>();
  for (const v of manifest.vehicles) {
    map.set(v.vehicleId, tokenId);
  }
  return map;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args.fleetManifestPath?.trim()) {
    throw new Error('MISSING_FLEET_MANIFEST');
  }
  const manifest = loadManifest(args.mode, args.fleetManifestPath, args.allowOfflineFixture);
  const releaseSha = resolveFsd3OneShotReleaseShaForAuditV1();

  if (args.mode === 'OFFLINE_PLAN') {
    assertFsdP6cFleetManifestOrderV1(manifest);
    const planReport = buildFsdP6cFleetDiscoveryPlanReportV1({
      manifest,
      tokenIdByVehicleId: parseTokenMap(args, manifest),
    });
    const guard = evaluateFsdP6cProviderBudgetGuardV1(planReport);
    const goNoGo = buildFsdP6cLiveTestGoNoGoV1({
      planReport,
      providerBudgetGuard: guard,
      context: 'OFFLINE_PLAN',
      liveProvider: 'mock',
      ownerAuthorizationSatisfied: false,
      productionManifestValid: false,
      architectureReviewCleared: resolveFsdP6cArchitectureReviewClearedV1(),
    });
    console.log(
      JSON.stringify(
        {
          status: 'OFFLINE_PLAN',
          offlineReferenceOnly: true,
          releaseSha,
          planReport,
          providerBudgetGuard: guard,
          goNoGo,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (!args.actorUserId?.trim()) {
    throw new Error('MISSING_ACTOR_USER_ID');
  }
  if (!args.providerRaw) {
    throw new Error('MISSING_EXPLICIT_PROVIDER');
  }
  const liveProvider = args.liveProvider!;

  assertFsd3OneShotHostAttestation();

  if (
    (args.mode === 'EXECUTE' || args.mode === 'PREPARE_LIVE_FLEET') &&
    liveProvider === 'dimo_live'
  ) {
    assertFsd3OneShotLiveExecuteOwnerAuthorized();
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }

  if (args.mode === 'EXECUTE' && liveProvider === 'mock') {
    assertFsdP6cMockExecuteDatabaseAllowedV1();
  }
  if (
    (args.mode === 'EXECUTE' || args.mode === 'PREPARE_LIVE_FLEET') &&
    liveProvider === 'dimo_live'
  ) {
    assertFsdP6cMockExecuteDatabaseAllowedV1();
  }

  const useP6dLive =
    (args.mode === 'EXECUTE' || args.mode === 'PREPARE_LIVE_FLEET') && liveProvider === 'dimo_live';
  const nestModule = useP6dLive ? FsdP6dLiveFleetBootstrapModule : FsdDiscoveryOpsModule;
  const app = await NestFactory.createApplicationContext(nestModule, {
    logger: ['error', 'warn'],
  });

  try {
    const fleetSvc = app.get(FsdP6cFleetDiscoveryService);

    if (args.mode === 'AUTHORIZED_READ_ONLY_PREFLIGHT') {
      const report = await fleetSvc.runAuthorizedFleetPreflight({
        manifest,
        actorUserId: args.actorUserId,
        liveProvider,
      });
      console.log(JSON.stringify({ releaseSha, ...report }, null, 2));
      return;
    }

    if (args.mode === 'PREPARE_LIVE_FLEET' && liveProvider === 'dimo_live') {
      const p6d = app.get(FsdP6dFleetLiveExecutorService);
      const prepared = await p6d.prepareLiveFleetExecution({
        manifest,
        actorUserId: args.actorUserId,
      });
      console.log(JSON.stringify({ releaseSha, ...prepared, stop: 'AWAIT_CHATGPT_ARCHITECTURE_REVIEW' }, null, 2));
      return;
    }

    if (args.mode === 'EXECUTE' && liveProvider === 'dimo_live') {
      const p6d = app.get(FsdP6dFleetLiveExecutorService);
      const result = await p6d.executeFleetSequentialLive({
        manifest,
        actorUserId: args.actorUserId,
        releaseSha,
      });
      console.log(
        JSON.stringify(
          {
            ...result,
            stop: 'AWAIT_CHATGPT_ARCHITECTURE_REVIEW',
          },
          null,
          2,
        ),
      );
      if (result.fleetStopped) {
        process.exit(3);
      }
      return;
    }

    const result = await fleetSvc.executeFleetSequentialMock({
      manifest,
      actorUserId: args.actorUserId,
      releaseSha,
    });
    console.log(
      JSON.stringify(
        {
          status: result.fleetStopped ? 'EXECUTE_MOCK_FLEET_STOPPED' : 'EXECUTE_MOCK_FLEET',
          releaseSha,
          ...result,
        },
        null,
        2,
      ),
    );
    if (result.fleetStopped) {
      process.exit(3);
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
