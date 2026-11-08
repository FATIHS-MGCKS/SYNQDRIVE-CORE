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

export type FsdP6cVehicleDiscoveryPlanV1 = {
  label: FsdP6cFleetVehicleManifestEntryV1['label'];
  vehicleId: string;
  providerSourceLinkId: string;
  tokenId: number;
  fullPlan: FsdFullDiscoveryPlanV1;
  fsd3PlannedProviderRequests: number;
  fsd4PlannedProviderRequests: number;
  catalogReuseEligible: boolean;
};

export type FsdP6cFleetDiscoveryPlanReportV1 = {
  schemaVersion: 'FSD_P6C_FLEET_PLAN_REPORT_V1';
  organizationId: string;
  budget: FsdBudgetConfigV1;
  historicalWindow: FsdP6cFleetManifestV1['historicalWindow'];
  vehicles: readonly FsdP6cVehicleDiscoveryPlanV1[];
  fleetSequentialPlannedProviderRequests: number;
  allExecutable: boolean;
};

function countFsd3PlannedRequests(plan: FsdFullDiscoveryPlanV1): number {
  return FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1 + plan.snapshot.documents.length;
}

function countFsd4PlannedRequests(plan: FsdFullDiscoveryPlanV1): number {
  const historicalChunks = plan.historical?.chunks.length ?? 0;
  /** Catalog slot is skipped when FSD-3 catalog reuse is verified at runtime. */
  return historicalChunks;
}

export function buildFsdP6cFleetDiscoveryPlanReportV1(input: {
  manifest: FsdP6cFleetManifestV1;
  tokenIdByVehicleId: ReadonlyMap<string, number>;
}): FsdP6cFleetDiscoveryPlanReportV1 {
  const budget = resolveP6cCliBudgetFromManifest(input.manifest);
  assertP6cHistoricalWindowAdmissibleV1({
    window: input.manifest.historicalWindow,
    budget,
  });

  const vehicles: FsdP6cVehicleDiscoveryPlanV1[] = [];
  let fleetSequentialPlannedProviderRequests = 0;

  for (const entry of input.manifest.vehicles) {
    const tokenId = input.tokenIdByVehicleId.get(entry.vehicleId);
    if (tokenId == null) {
      throw new Error('FSD_P6C_PLAN_TOKEN_ID_MISSING');
    }
    if (entry.declaredFieldNames.length === 0) {
      throw new Error('FSD_P6C_PLAN_EMPTY_DECLARED_FIELDS');
    }

    const fullPlan = planFsdFullSignalDiscoveryV1({
      tokenId,
      declaredFieldNames: entry.declaredFieldNames,
      historicalWindow: input.manifest.historicalWindow,
      budget,
    });

    const fsd3Planned = countFsd3PlannedRequests(fullPlan);
    const fsd4Planned = countFsd4PlannedRequests(fullPlan);
    fleetSequentialPlannedProviderRequests += fsd3Planned + fsd4Planned;

    vehicles.push({
      label: entry.label,
      vehicleId: entry.vehicleId,
      providerSourceLinkId: entry.providerSourceLinkId,
      tokenId,
      fullPlan,
      fsd3PlannedProviderRequests: fsd3Planned,
      fsd4PlannedProviderRequests: fsd4Planned,
      catalogReuseEligible: true,
    });
  }

  if (
    input.manifest.fleetPlannedRequestDisclosureCap != null &&
    fleetSequentialPlannedProviderRequests > input.manifest.fleetPlannedRequestDisclosureCap
  ) {
    throw new Error('FSD_P6C_FLEET_DISCLOSURE_CAP_EXCEEDED');
  }

  return {
    schemaVersion: 'FSD_P6C_FLEET_PLAN_REPORT_V1',
    organizationId: input.manifest.organizationId,
    budget,
    historicalWindow: input.manifest.historicalWindow,
    vehicles,
    fleetSequentialPlannedProviderRequests,
    allExecutable: vehicles.every((v) => v.fullPlan.executable),
  };
}
