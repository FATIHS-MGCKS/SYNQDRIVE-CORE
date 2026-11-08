/**
 * P6C privileged fleet full signal discovery (FSD3 catalog/snapshot + FSD4 historical).
 * Sequential per-vehicle runs with planner-derived budgets. No PM2 FSD flag changes.
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { FsdDiscoveryOpsModule } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd-discovery-ops.module';
import { Fsd3OneShotLiveBootstrapModule } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-live-bootstrap.module';
import { FsdP6cFleetDiscoveryService } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd-p6c-fleet-discovery.service';
import { assertFsd3OneShotHostAttestation } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-host-attestation.v1';
import { assertFsd3OneShotLiveExecuteOwnerAuthorized } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-live-owner-gate.v1';
import { resolveFsd3OneShotReleaseShaForAuditV1 } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-types.v1';
import {
  assertFsdP6cFleetManifestOrderV1,
  parseFsdP6cFleetManifestV1,
} from '../../src/modules/vehicle-intelligence/fsd-integration/ops/p6c/fsd-p6c-fleet-manifest.v1';
import { buildFsdP6cFleetDiscoveryPlanReportV1 } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/p6c/fsd-p6c-fleet-plan.v1';
import { hydrateFsdP6cOfflineFleetManifestV1 } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/p6c/fsd-p6c-offline-manifest-hydrate.v1';
import {
  evaluateFsdP6cProviderBudgetGuardV1,
} from '../../src/modules/vehicle-intelligence/fsd-integration/ops/p6c/fsd-p6c-provider-budget-guard.v1';
import { buildFsdP6cLiveTestGoNoGoV1 } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/p6c/fsd-p6c-go-no-go.v1';
import { SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-live-owner-gate.v1';
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
  return {
    mode: modeRaw as CliMode,
    fleetManifestPath: get('--fleet-manifest='),
    actorUserId: get('--actor-user-id='),
    providerRaw: get('--provider='),
    planTokenId: get('--plan-token-id='),
    liveProvider: get('--provider=') ? parseLiveProvider(get('--provider=')) : undefined,
  };
}

function loadManifest(manifestPath: string) {
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
  const parsed = parseFsdP6cFleetManifestV1(raw);
  return hydrateFsdP6cOfflineFleetManifestV1(parsed);
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
  const manifest = loadManifest(args.fleetManifestPath);
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
      ownerAuthorizationSatisfied: process.env[SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED] === '1',
    });
    console.log(
      JSON.stringify(
        {
          status: 'OFFLINE_PLAN',
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

  if (args.mode === 'EXECUTE' && liveProvider === 'dimo_live') {
    assertFsd3OneShotLiveExecuteOwnerAuthorized();
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }

  if (args.mode === 'EXECUTE' && liveProvider === 'dimo_live') {
    throw new Error('FSD_P6C_LIVE_FLEET_EXECUTE_NOT_IN_THIS_PR');
  }

  const nestModule =
    args.mode === 'EXECUTE' && liveProvider === 'dimo_live' ?
      Fsd3OneShotLiveBootstrapModule
    : FsdDiscoveryOpsModule;
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

    const result = await fleetSvc.executeFleetSequentialMock({
      manifest,
      actorUserId: args.actorUserId,
      releaseSha,
    });
    console.log(JSON.stringify({ status: 'EXECUTE_MOCK_FLEET', releaseSha, ...result }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
