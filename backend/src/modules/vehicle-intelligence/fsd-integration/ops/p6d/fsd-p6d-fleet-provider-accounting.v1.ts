import type { FsdP6cFleetManifestV1 } from '../p6c/fsd-p6c-fleet-manifest.v1';
import type { FsdP6dFleetPrepareArtifactV1 } from './fsd-p6d-fleet-prepare-artifact.v1';

export type FsdP6dFleetProviderAccountingV1 = {
  prepareCatalogDispatches: number;
  prepareCatalogLedgerAttemptsActual: number;
  prepareCatalogLedgerReplays: number;
  executePlannedFleetCumulativeRequests: number;
  fleetMaxRequestsPerRun: number;
  fleetDisclosureCap: number | null;
};

export function buildInitialFsdP6dFleetProviderAccountingV1(input: {
  manifest: FsdP6cFleetManifestV1;
  executePlannedFleetCumulativeRequests: number;
}): FsdP6dFleetProviderAccountingV1 {
  return {
    prepareCatalogDispatches: 0,
    prepareCatalogLedgerAttemptsActual: 0,
    prepareCatalogLedgerReplays: 0,
    executePlannedFleetCumulativeRequests: input.executePlannedFleetCumulativeRequests,
    fleetMaxRequestsPerRun: input.manifest.budget.maxRequestsPerRun,
    fleetDisclosureCap: input.manifest.fleetPlannedRequestDisclosureCap ?? null,
  };
}

export function recordFsdP6dPrepareCatalogDispatchAccountingV1(input: {
  accounting: FsdP6dFleetProviderAccountingV1;
  ledgerAttemptsSucceeded: number;
  replayed: boolean;
}): FsdP6dFleetProviderAccountingV1 {
  return {
    ...input.accounting,
    prepareCatalogDispatches: input.accounting.prepareCatalogDispatches + 1,
    prepareCatalogLedgerAttemptsActual:
      input.accounting.prepareCatalogLedgerAttemptsActual +
      (input.replayed ? 0 : input.ledgerAttemptsSucceeded),
    prepareCatalogLedgerReplays: input.accounting.prepareCatalogLedgerReplays + (input.replayed ? 1 : 0),
  };
}

export function assertFsdP6dFleetProviderAccountingWithinCapV1(input: {
  artifact: FsdP6dFleetPrepareArtifactV1;
  manifest: FsdP6cFleetManifestV1;
}): void {
  const accounting = input.artifact.providerAccounting;
  const prepareActual = accounting.prepareCatalogLedgerAttemptsActual;
  const executePlanned = accounting.executePlannedFleetCumulativeRequests;
  const totalPlanned = prepareActual + executePlanned;

  if (input.manifest.fleetPlannedRequestDisclosureCap != null) {
    if (totalPlanned > input.manifest.fleetPlannedRequestDisclosureCap) {
      throw new Error('FSD_P6D_PROVIDER_ACCOUNTING_DISCLOSURE_CAP_EXCEEDED');
    }
  }

  const perRunCap = input.manifest.budget.maxRequestsPerRun;
  const perVehicleMax = Math.ceil(executePlanned / Math.max(input.manifest.vehicles.length, 1));
  if (perVehicleMax > perRunCap) {
    throw new Error('FSD_P6D_PROVIDER_ACCOUNTING_PER_RUN_CAP_EXCEEDED');
  }
}

export function summarizeFsdP6dTotalProviderExposureV1(artifact: FsdP6dFleetPrepareArtifactV1): {
  prepareActual: number;
  executePlanned: number;
  totalPlanned: number;
} {
  const prepareActual = artifact.providerAccounting.prepareCatalogLedgerAttemptsActual;
  const executePlanned = artifact.providerAccounting.executePlannedFleetCumulativeRequests;
  return {
    prepareActual,
    executePlanned,
    totalPlanned: prepareActual + executePlanned,
  };
}
