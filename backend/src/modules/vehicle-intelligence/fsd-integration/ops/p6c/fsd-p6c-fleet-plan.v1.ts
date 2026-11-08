import {
  planFsdFullSignalDiscoveryV1,
  type FsdFullDiscoveryPlanV1,
} from '@modules/vehicle-intelligence/full-signal-discovery/fsd-discovery.planner.v1';
import { FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-discovery.planner.v1';
import type { FsdBudgetConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';
import type {
  FsdP6cFleetManifestV1,
  FsdP6cFleetVehicleManifestEntryV1,
} from './fsd-p6c-fleet-manifest.v1';
import { assertP6cHistoricalWindowAdmissibleV1, resolveP6cCliBudgetFromManifest } from './fsd-p6c-cli-budget.v1';
import {
  computeMaxPlannedProviderRequestsPerVehicleV1,
  resolveFsdP6cPlannedMaxParallelProviderRequestsV1,
} from './fsd-p6c-request-concurrency.v1';

export type FsdP6cCatalogPlanModeV1 = 'DECLARED_FIELDS' | 'CATALOG_PENDING';

export type FsdP6cPlanCompletenessV1 = 'FULL' | 'BUDGET_TRUNCATED' | 'CATALOG_PENDING';

export type FsdP6cPlanBindingV1 =
  | 'OFFLINE_REFERENCE'
  | 'PRODUCTION_DECLARED_FIELDS'
  | 'UNBOUND';

export type FsdP6cVehicleDiscoveryPlanV1 = {
  label: FsdP6cFleetVehicleManifestEntryV1['label'];
  vehicleId: string;
  providerSourceLinkId: string;
  tokenId: number;
  catalogPlanMode: FsdP6cCatalogPlanModeV1;
  fullPlan: FsdFullDiscoveryPlanV1 | null;
  fsd3PlannedProviderRequests: number;
  fsd4PlannedProviderRequests: number;
  maxPlannedProviderRequestsPerVehicle: number;
  catalogReuseEligible: boolean;
};

export type FsdP6cFleetDiscoveryPlanReportV1 = {
  schemaVersion: 'FSD_P6C_FLEET_PLAN_REPORT_V1';
  organizationId: string;
  budget: FsdBudgetConfigV1;
  historicalWindow: FsdP6cFleetManifestV1['historicalWindow'];
  vehicles: readonly FsdP6cVehicleDiscoveryPlanV1[];
  /** Sequential cumulative provider requests if each vehicle runs in order (not peak concurrency). */
  fleetCumulativePlannedProviderRequests: number;
  /** @deprecated use fleetCumulativePlannedProviderRequests */
  fleetSequentialPlannedProviderRequests: number;
  /** Configured max parallel provider slots during sequential fleet execution (default 1). */
  peakInFlightProviderRequests: number;
  maxPlannedProviderRequestsPerVehicle: number;
  allExecutable: boolean;
  anyCatalogPending: boolean;
  planCompleteness: FsdP6cPlanCompletenessV1;
  planBinding: FsdP6cPlanBindingV1;
};

function countFsd3PlannedRequests(plan: FsdFullDiscoveryPlanV1): number {
  return FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1 + plan.snapshot.documents.length;
}

function countFsd4PlannedRequests(plan: FsdFullDiscoveryPlanV1): number {
  const historicalChunks = plan.historical?.chunks.length ?? 0;
  return historicalChunks;
}

function resolvePlanBinding(manifest: FsdP6cFleetManifestV1): FsdP6cPlanBindingV1 {
  if (manifest.offlineFixtureHydration === true) {
    return 'OFFLINE_REFERENCE';
  }
  if (manifest.productionManifest === true) {
    return 'PRODUCTION_DECLARED_FIELDS';
  }
  return 'UNBOUND';
}

function buildCatalogPendingFullPlan(): FsdFullDiscoveryPlanV1 {
  return {
    executable: false,
    nonExecutableReason: 'INSUFFICIENT_REQUEST_BUDGET_FOR_CATALOG',
    declaredFieldNames: [],
    classifiedCount: 0,
    catalogReservedRequestSlots: FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1,
    snapshot: { documents: [], catalogSignals: [], deferredSignals: [] },
    historical: null,
    executableProviderRequestCount: 0,
    totalPlannedProviderRequests: 0,
    budgetValidation: {
      ok: false,
      reason: 'REQUEST_BUDGET_EXCEEDED',
      plannedRequestCount: 0,
      limit: 0,
    },
    deferredByBudget: [],
  };
}

export function buildFsdP6cFleetDiscoveryPlanReportV1(input: {
  manifest: FsdP6cFleetManifestV1;
  tokenIdByVehicleId: ReadonlyMap<string, number>;
  /** When false, empty declaredFieldNames throws. When true, emits CATALOG_PENDING rows. */
  allowCatalogPending?: boolean;
}): FsdP6cFleetDiscoveryPlanReportV1 {
  const budget = resolveP6cCliBudgetFromManifest(input.manifest);
  assertP6cHistoricalWindowAdmissibleV1({
    window: input.manifest.historicalWindow,
    budget,
  });

  const allowCatalogPending = input.allowCatalogPending === true;
  const vehicles: FsdP6cVehicleDiscoveryPlanV1[] = [];
  let fleetCumulativePlannedProviderRequests = 0;
  let anyCatalogPending = false;
  let anyBudgetTruncated = false;

  for (const entry of input.manifest.vehicles) {
    const tokenId = input.tokenIdByVehicleId.get(entry.vehicleId);
    if (tokenId == null) {
      throw new Error('FSD_P6C_PLAN_TOKEN_ID_MISSING');
    }

    if (entry.declaredFieldNames.length === 0) {
      if (!allowCatalogPending) {
        throw new Error('FSD_P6C_PLAN_EMPTY_DECLARED_FIELDS');
      }
      anyCatalogPending = true;
      vehicles.push({
        label: entry.label,
        vehicleId: entry.vehicleId,
        providerSourceLinkId: entry.providerSourceLinkId,
        tokenId,
        catalogPlanMode: 'CATALOG_PENDING',
        fullPlan: buildCatalogPendingFullPlan(),
        fsd3PlannedProviderRequests: 0,
        fsd4PlannedProviderRequests: 0,
        maxPlannedProviderRequestsPerVehicle: 0,
        catalogReuseEligible: false,
      });
      continue;
    }

    const fullPlan = planFsdFullSignalDiscoveryV1({
      tokenId,
      declaredFieldNames: entry.declaredFieldNames,
      historicalWindow: input.manifest.historicalWindow,
      budget,
    });

    if (fullPlan.deferredByBudget.length > 0) {
      anyBudgetTruncated = true;
    }

    const fsd3Planned = countFsd3PlannedRequests(fullPlan);
    const fsd4Planned = countFsd4PlannedRequests(fullPlan);
    fleetCumulativePlannedProviderRequests += fsd3Planned + fsd4Planned;

    vehicles.push({
      label: entry.label,
      vehicleId: entry.vehicleId,
      providerSourceLinkId: entry.providerSourceLinkId,
      tokenId,
      catalogPlanMode: 'DECLARED_FIELDS',
      fullPlan,
      fsd3PlannedProviderRequests: fsd3Planned,
      fsd4PlannedProviderRequests: fsd4Planned,
      maxPlannedProviderRequestsPerVehicle: computeMaxPlannedProviderRequestsPerVehicleV1({
        fsd3PlannedProviderRequests: fsd3Planned,
        fsd4PlannedProviderRequests: fsd4Planned,
      }),
      catalogReuseEligible: true,
    });
  }

  if (
    input.manifest.fleetPlannedRequestDisclosureCap != null &&
    fleetCumulativePlannedProviderRequests > input.manifest.fleetPlannedRequestDisclosureCap
  ) {
    throw new Error('FSD_P6C_FLEET_DISCLOSURE_CAP_EXCEEDED');
  }

  const peakInFlightProviderRequests = resolveFsdP6cPlannedMaxParallelProviderRequestsV1({
    budget,
  });
  const maxPlannedProviderRequestsPerVehicle = vehicles.length
    ? Math.max(...vehicles.map((v) => v.maxPlannedProviderRequestsPerVehicle))
    : 0;

  const allExecutable =
    !anyCatalogPending && vehicles.every((v) => v.fullPlan?.executable === true);

  let planCompleteness: FsdP6cPlanCompletenessV1 = 'FULL';
  if (anyCatalogPending) {
    planCompleteness = 'CATALOG_PENDING';
  } else if (anyBudgetTruncated || !allExecutable) {
    planCompleteness = 'BUDGET_TRUNCATED';
  }

  return {
    schemaVersion: 'FSD_P6C_FLEET_PLAN_REPORT_V1',
    organizationId: input.manifest.organizationId,
    budget,
    historicalWindow: input.manifest.historicalWindow,
    vehicles,
    fleetCumulativePlannedProviderRequests,
    fleetSequentialPlannedProviderRequests: fleetCumulativePlannedProviderRequests,
    peakInFlightProviderRequests,
    maxPlannedProviderRequestsPerVehicle,
    allExecutable,
    anyCatalogPending,
    planCompleteness,
    planBinding: resolvePlanBinding(input.manifest),
  };
}
