import type { Fsd3DiscoveryRunInspectorReportV1 } from '../fsd3-discovery-run-inspector.service';
import type { FsdP6dFleetDiscoveryClassificationV1 } from './fsd-p6d-discovery-outcome.v1';
import type { FsdP6dVerifiedCatalogEvidenceV1 } from './fsd-p6d-catalog-provenance.v1';
import type { FsdP6cVehicleDiscoveryPlanV1 } from '../p6c/fsd-p6c-fleet-plan.v1';

export type FsdP6dVehicleEvaluationReportV1 = {
  label: string;
  vehicleId: string;
  catalogEvidence: Pick<
    FsdP6dVerifiedCatalogEvidenceV1,
    'source' | 'availableSignals' | 'connectionIdentityFingerprint' | 'dimoTokenId'
  >;
  plan: Pick<
    FsdP6cVehicleDiscoveryPlanV1,
    | 'fsd3PlannedProviderRequests'
    | 'fsd4PlannedProviderRequests'
    | 'maxPlannedProviderRequestsPerVehicle'
    | 'catalogPlanMode'
  > & { planCompletenessVehicleExecutable: boolean };
  fsd3RunId: string;
  fsd4RunId: string;
  fsd3TerminalStatus: string;
  fsd4TerminalStatus: string;
  fsd3Inspector: Fsd3DiscoveryRunInspectorReportV1 | null;
  fsd4Inspector: Fsd3DiscoveryRunInspectorReportV1 | null;
  classification: FsdP6dFleetDiscoveryClassificationV1;
  classificationReason: string;
  providerConsumption: {
    fsd3LedgerAttempts: number | null;
    fsd4LedgerAttempts: number | null;
  };
};

export function buildFsdP6dVehicleEvaluationReportV1(input: {
  label: string;
  vehicleId: string;
  catalogEvidence: FsdP6dVerifiedCatalogEvidenceV1;
  planRow: FsdP6cVehicleDiscoveryPlanV1;
  planCompleteness: 'FULL' | 'BUDGET_TRUNCATED' | 'CATALOG_PENDING';
  allExecutable: boolean;
  fsd3RunId: string;
  fsd4RunId: string;
  fsd3TerminalStatus: string;
  fsd4TerminalStatus: string;
  fsd3Inspector: Fsd3DiscoveryRunInspectorReportV1 | null;
  fsd4Inspector: Fsd3DiscoveryRunInspectorReportV1 | null;
  classification: FsdP6dFleetDiscoveryClassificationV1;
}): FsdP6dVehicleEvaluationReportV1 {
  const reason =
    input.classification === 'FULL_DISCOVERY_SUCCESS'
      ? 'FSD3_FSD4_COMPLETED_UNDER_FULL_PLAN'
      : input.classification === 'PARTIAL_DISCOVERY'
        ? 'NON_FULL_PLAN_OR_NON_COMPLETED_TERMINAL'
        : input.classification === 'FAILED_DISCOVERY'
          ? 'TERMINAL_FAILED'
          : 'INCOMPLETE_OR_BLOCKED';

  return {
    label: input.label,
    vehicleId: input.vehicleId,
    catalogEvidence: {
      source: input.catalogEvidence.source,
      availableSignals: input.catalogEvidence.availableSignals,
      connectionIdentityFingerprint: input.catalogEvidence.connectionIdentityFingerprint,
      dimoTokenId: input.catalogEvidence.dimoTokenId,
    },
    plan: {
      fsd3PlannedProviderRequests: input.planRow.fsd3PlannedProviderRequests,
      fsd4PlannedProviderRequests: input.planRow.fsd4PlannedProviderRequests,
      maxPlannedProviderRequestsPerVehicle: input.planRow.maxPlannedProviderRequestsPerVehicle,
      catalogPlanMode: input.planRow.catalogPlanMode,
      planCompletenessVehicleExecutable: input.planRow.fullPlan?.executable === true,
    },
    fsd3RunId: input.fsd3RunId,
    fsd4RunId: input.fsd4RunId,
    fsd3TerminalStatus: input.fsd3TerminalStatus,
    fsd4TerminalStatus: input.fsd4TerminalStatus,
    fsd3Inspector: input.fsd3Inspector,
    fsd4Inspector: input.fsd4Inspector,
    classification: input.classification,
    classificationReason: reason,
    providerConsumption: {
      fsd3LedgerAttempts: input.fsd3Inspector?.ledgerAttemptCount ?? null,
      fsd4LedgerAttempts: input.fsd4Inspector?.ledgerAttemptCount ?? null,
    },
  };
}
