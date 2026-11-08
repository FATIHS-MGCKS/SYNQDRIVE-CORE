import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildFsdP6cFleetDiscoveryPlanReportV1,
} from '../fsd-p6c-fleet-plan.v1';
import { parseFsdP6cFleetManifestV1 } from '../fsd-p6c-fleet-manifest.v1';
import {
  FSD_P6C_OFFLINE_FIXTURE_HYDRATION_ENV,
  hydrateFsdP6cOfflineFleetManifestV1,
} from '../fsd-p6c-offline-manifest-hydrate.v1';
import {
  assertFsdP6cProviderBudgetGuardV1,
  evaluateFsdP6cProviderBudgetGuardV1,
} from '../fsd-p6c-provider-budget-guard.v1';
import { buildFsdP6cLiveTestGoNoGoV1 } from '../fsd-p6c-go-no-go.v1';

describe('FSD P6C fleet planner-derived budgets', () => {
  const fixturePath = path.join(__dirname, '..', '__fixtures__', 'fsd-p6c-offline-fleet-manifest.v1.json');

  it('builds executable plans for four fleet labels with disclosure totals', () => {
    const manifest = hydrateFsdP6cOfflineFleetManifestV1(
      parseFsdP6cFleetManifestV1(JSON.parse(fs.readFileSync(fixturePath, 'utf8'))),
      {
        allowHydration: true,
        env: { [FSD_P6C_OFFLINE_FIXTURE_HYDRATION_ENV]: '1' },
      },
    );
    const tokenMap = new Map(manifest.vehicles.map((v) => [v.vehicleId, 4_242_42]));
    const report = buildFsdP6cFleetDiscoveryPlanReportV1({ manifest, tokenIdByVehicleId: tokenMap });

    expect(report.vehicles).toHaveLength(4);
    expect(report.allExecutable).toBe(true);
    expect(report.fleetSequentialPlannedProviderRequests).toBeGreaterThan(0);

    const tesla = report.vehicles.find((v) => v.label === 'tesla_model_3')!;
    expect(report.peakInFlightProviderRequests).toBe(1);
    expect(report.maxPlannedProviderRequestsPerVehicle).toBeGreaterThanOrEqual(7);
    expect(tesla.fsd3PlannedProviderRequests).toBe(2);
    expect(tesla.fsd4PlannedProviderRequests).toBe(5);
    expect(tesla.maxPlannedProviderRequestsPerVehicle).toBe(7);

    const vag = report.vehicles.find((v) => v.label === 'vw_tiguan')!;
    expect(vag.fsd3PlannedProviderRequests).toBeGreaterThanOrEqual(2);
    expect(vag.fsd4PlannedProviderRequests).toBe(4);

    const guard = evaluateFsdP6cProviderBudgetGuardV1(report);
    expect(guard.ok).toBe(true);
    assertFsdP6cProviderBudgetGuardV1(report);

    const goNoGo = buildFsdP6cLiveTestGoNoGoV1({
      planReport: report,
      providerBudgetGuard: guard,
      context: 'OFFLINE_PLAN',
      liveProvider: 'mock',
      ownerAuthorizationSatisfied: false,
      productionManifestValid: false,
      architectureReviewCleared: false,
    });
    expect(goNoGo.decision).toBe('NO_GO');
    expect(goNoGo.stop).toBe('AWAIT_CHATGPT_REVIEW');
  });

  it('rejects non-executable plans under tight per-run budget', () => {
    const manifest = hydrateFsdP6cOfflineFleetManifestV1(
      parseFsdP6cFleetManifestV1(JSON.parse(fs.readFileSync(fixturePath, 'utf8'))),
      {
        allowHydration: true,
        env: { [FSD_P6C_OFFLINE_FIXTURE_HYDRATION_ENV]: '1' },
      },
    );
    const tight = {
      ...manifest,
      budget: { ...manifest.budget, maxRequestsPerRun: 0 },
    };
    const tokenMap = new Map(tight.vehicles.map((v) => [v.vehicleId, 4_242_42]));
    const report = buildFsdP6cFleetDiscoveryPlanReportV1({ manifest: tight, tokenIdByVehicleId: tokenMap });
    expect(report.allExecutable).toBe(false);
    const guard = evaluateFsdP6cProviderBudgetGuardV1(report);
    expect(guard.ok).toBe(false);
  });
});
