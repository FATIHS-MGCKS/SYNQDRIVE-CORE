import { createDefaultFsdBudgetConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';
import { FSD_P2E_HISTORICAL_WINDOW_V1 } from '@modules/vehicle-intelligence/full-signal-discovery/__fixtures__/fsd-p2e-tesla.fixture.v1';
import type { FsdP6cFleetManifestV1 } from '../../p6c/fsd-p6c-fleet-manifest.v1';
import { buildFsdP6cLiveTestGoNoGoV1 } from '../../p6c/fsd-p6c-go-no-go.v1';
import type { FsdP6cFleetDiscoveryPlanReportV1 } from '../../p6c/fsd-p6c-fleet-plan.v1';

export function minimalProductionFleetManifestV1(): FsdP6cFleetManifestV1 {
  return {
    schemaVersion: 'FSD_P6C_FLEET_MANIFEST_V1',
    productionManifest: true,
    organizationId: '11111111-1111-4111-8111-111111111111',
    historicalWindow: FSD_P2E_HISTORICAL_WINDOW_V1,
    budget: createDefaultFsdBudgetConfigV1(),
    vehicles: [
      {
        label: 'tesla_model_3',
        vehicleId: '22222222-2222-4222-8222-222222222222',
        providerSourceLinkId: '33333333-3333-4333-8333-333333333333',
        discoveryRequestKey: 'd1111111-1111-4111-8111-111111111111',
        historicalRequestKey: 'h1111111-1111-4111-8111-111111111111',
        declaredFieldNames: ['speed'],
        catalogProvenance: 'VERIFIED_LIVE_CATALOG',
      },
    ],
  };
}

export function productionGoNoGoFixture(): {
  manifest: FsdP6cFleetManifestV1;
  goNoGo: ReturnType<typeof buildFsdP6cLiveTestGoNoGoV1>;
  planReport: FsdP6cFleetDiscoveryPlanReportV1;
} {
  const manifest = minimalProductionFleetManifestV1();
  const planReport: FsdP6cFleetDiscoveryPlanReportV1 = {
    schemaVersion: 'FSD_P6C_FLEET_PLAN_REPORT_V1',
    organizationId: manifest.organizationId,
    budget: manifest.budget,
    historicalWindow: manifest.historicalWindow,
    vehicles: [],
    fleetCumulativePlannedProviderRequests: 7,
    fleetSequentialPlannedProviderRequests: 7,
    peakInFlightProviderRequests: 1,
    maxPlannedProviderRequestsPerVehicle: 7,
    allExecutable: true,
    anyCatalogPending: false,
    planCompleteness: 'FULL',
    planBinding: 'PRODUCTION_DECLARED_FIELDS',
  };
  const goNoGo = buildFsdP6cLiveTestGoNoGoV1({
    planReport,
    providerBudgetGuard: {
      ok: true,
      peakInFlightProviderRequests: 1,
      fleetCumulativePlannedProviderRequests: 7,
      fleetSequentialPlannedProviderRequests: 7,
      offlineReferenceOnly: false,
      notes: [],
    },
    context: 'EXECUTE',
    liveProvider: 'dimo_live',
    ownerAuthorizationSatisfied: true,
    productionManifestValid: true,
    architectureReviewCleared: true,
  });
  return { manifest, goNoGo, planReport };
}
