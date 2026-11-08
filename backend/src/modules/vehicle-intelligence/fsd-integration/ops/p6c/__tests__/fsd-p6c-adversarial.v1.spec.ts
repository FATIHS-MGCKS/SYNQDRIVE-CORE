import {
  buildFsdP6cFleetDiscoveryPlanReportV1,
} from '../fsd-p6c-fleet-plan.v1';
import {
  buildFsdP6cLiveTestGoNoGoV1,
  resolveFsdP6cArchitectureReviewClearedV1,
} from '../fsd-p6c-go-no-go.v1';
import {
  evaluateFsdP6cProviderBudgetGuardV1,
} from '../fsd-p6c-provider-budget-guard.v1';
import { assertProductionFleetManifestV1 } from '../fsd-p6c-production-manifest-guard.v1';
import {
  hydrateFsdP6cOfflineFleetManifestV1,
  FSD_P6C_OFFLINE_FIXTURE_HYDRATION_ENV,
} from '../fsd-p6c-offline-manifest-hydrate.v1';
import { parseFsdP6cFleetManifestV1 } from '../fsd-p6c-fleet-manifest.v1';
import {
  assertFsd3TerminalAllowsFsd4ReuseV1,
  assertFsd4TerminalAllowsFleetContinueV1,
} from '../fsd-p6c-fsd3-fsd4-chain-guard.v1';
import * as fs from 'node:fs';
import * as path from 'node:path';

const fixturePath = path.join(__dirname, '..', '__fixtures__', 'fsd-p6c-offline-fleet-manifest.v1.json');

describe('FSD P6C adversarial guards', () => {
  it('rejects hydration outside OFFLINE_PLAN gates', () => {
    const manifest = parseFsdP6cFleetManifestV1(JSON.parse(fs.readFileSync(fixturePath, 'utf8')));
    expect(() =>
      hydrateFsdP6cOfflineFleetManifestV1(manifest, { allowHydration: false }),
    ).toThrow(/HYDRATION_FORBIDDEN/);
    expect(() =>
      hydrateFsdP6cOfflineFleetManifestV1(manifest, {
        allowHydration: true,
        env: {},
      }),
    ).toThrow(/HYDRATION_ENV_REQUIRED/);
  });

  it('never emits GO for OFFLINE_PLAN or owner-only', () => {
    const manifest = hydrateFsdP6cOfflineFleetManifestV1(
      parseFsdP6cFleetManifestV1(JSON.parse(fs.readFileSync(fixturePath, 'utf8'))),
      {
        allowHydration: true,
        env: { [FSD_P6C_OFFLINE_FIXTURE_HYDRATION_ENV]: '1' },
      },
    );
    const tokenMap = new Map(manifest.vehicles.map((v) => [v.vehicleId, 424242]));
    const plan = buildFsdP6cFleetDiscoveryPlanReportV1({ manifest, tokenIdByVehicleId: tokenMap });
    const guard = evaluateFsdP6cProviderBudgetGuardV1(plan);

    const offlineGo = buildFsdP6cLiveTestGoNoGoV1({
      planReport: plan,
      providerBudgetGuard: guard,
      context: 'OFFLINE_PLAN',
      liveProvider: 'mock',
      ownerAuthorizationSatisfied: false,
      productionManifestValid: false,
      architectureReviewCleared: false,
    });
    expect(offlineGo.decision).toBe('NO_GO');

    const ownerOnlyGo = buildFsdP6cLiveTestGoNoGoV1({
      planReport: plan,
      providerBudgetGuard: guard,
      context: 'EXECUTE',
      liveProvider: 'dimo_live',
      ownerAuthorizationSatisfied: true,
      productionManifestValid: true,
      architectureReviewCleared: false,
    });
    expect(ownerOnlyGo.decision).toBe('NO_GO');

    const archOnly =
      resolveFsdP6cArchitectureReviewClearedV1({
        SYNQDRIVE_FSD_P6C_ARCHITECTURE_REVIEW_CLEARED: '1',
      }) && true;
    expect(archOnly).toBe(true);
    const archOwnerOnlyGo = buildFsdP6cLiveTestGoNoGoV1({
      planReport: plan,
      providerBudgetGuard: guard,
      context: 'EXECUTE',
      liveProvider: 'dimo_live',
      ownerAuthorizationSatisfied: true,
      productionManifestValid: true,
      architectureReviewCleared: archOnly,
    });
    expect(archOwnerOnlyGo.decision).toBe('NO_GO');
  });

  it('rejects placeholder production manifest', () => {
    const manifest = hydrateFsdP6cOfflineFleetManifestV1(
      parseFsdP6cFleetManifestV1(JSON.parse(fs.readFileSync(fixturePath, 'utf8'))),
      {
        allowHydration: true,
        env: { [FSD_P6C_OFFLINE_FIXTURE_HYDRATION_ENV]: '1' },
      },
    );
    expect(() => assertProductionFleetManifestV1(manifest)).toThrow();
  });

  it('stops fleet on FSD4 PARTIAL', () => {
    expect(() =>
      assertFsd4TerminalAllowsFleetContinueV1({
        mode: 'EXECUTE',
        historicalRequestKey: 'h',
        runId: 'run',
        terminalStatus: 'PARTIAL',
        operatorAuthorizationReference: 'ref',
        releaseSha: 'sha',
      }),
    ).toThrow(/FSD_P6C_FLEET_STOPPED_FSD4_PARTIAL/);
  });

  it('blocks FSD4 when FSD3 is not COMPLETED', () => {
    expect(() =>
      assertFsd3TerminalAllowsFsd4ReuseV1({
        mode: 'EXECUTE',
        discoveryRequestKey: 'k',
        runId: 'run',
        terminalStatus: 'PARTIAL',
        operatorAuthorizationReference: 'ref',
        releaseSha: 'sha',
      }),
    ).toThrow(/FSD4_BLOCKED/);
  });

  it('surfaces CATALOG_PENDING in plan when declared catalog missing', () => {
    const manifest = parseFsdP6cFleetManifestV1(JSON.parse(fs.readFileSync(fixturePath, 'utf8')));
    const tokenMap = new Map(manifest.vehicles.map((v) => [v.vehicleId, 424242]));
    const plan = buildFsdP6cFleetDiscoveryPlanReportV1({
      manifest,
      tokenIdByVehicleId: tokenMap,
      allowCatalogPending: true,
    });
    expect(plan.anyCatalogPending).toBe(true);
    expect(evaluateFsdP6cProviderBudgetGuardV1(plan).ok).toBe(false);
  });
});
