import type { ProductSlug } from '@prisma/client';
import type {
  MaintenanceConflict,
  MaintenanceComputationMode,
  MaintenanceDataQualityFlag,
  MaintenanceDueState,
  MaintenanceIntervalMode,
  MaintenancePositionKind,
  MaintenanceProvenance,
  MaintenanceSeverity,
} from '@modules/vehicle-intelligence/service-compliance/maintenance-forecast/maintenance-forecast.types';
import type {
  ServiceComplianceSeverity,
  ServiceNextSource,
  ServiceTrackingStatus,
} from '@modules/vehicle-intelligence/service-compliance/service-compliance.types';

export const CORE_SERVICE_INTELLIGENCE_READ_CONTRACT_VERSION = 'core.service.intelligence.read.v1' as const;

export const CORE_SERVICE_INTELLIGENCE_POSITION_CAP = 20;

export type CoreServiceFreshnessV1 = {
  odometerObservedAt: string | null;
  scheduleFetchedAt: string | null;
  hmLastUpdatedAt: string | null;
  latestEventDate: string | null;
};

export type CoreServiceProvenanceV1 = MaintenanceProvenance;

export type CoreServiceComputedComparisonV1 = {
  source: Exclude<ServiceNextSource, 'HM_OEM' | null>;
  positionId: string;
  remainingKm: number | null;
  remainingDays: number | null;
  projectedDueDate: string | null;
};

export type CoreServiceNextHeadlineV1 = {
  trackingStatus: ServiceTrackingStatus;
  source: ServiceNextSource;
  remainingKm: number | null;
  remainingDays: number | null;
  projectedDueDate: string | null;
  positionKind: MaintenancePositionKind | null;
  positionId: string | null;
  severity: ServiceComplianceSeverity;
  provenance: CoreServiceProvenanceV1 | null;
  headlineDataQuality: MaintenanceDataQualityFlag[];
  computedComparison: CoreServiceComputedComparisonV1 | null;
};

export type CoreServiceMaintenancePositionV1 = {
  positionId: string;
  kind: MaintenancePositionKind;
  dueState: MaintenanceDueState;
  severity: MaintenanceSeverity;
  intervalMode: MaintenanceIntervalMode;
  intervalKm: number | null;
  intervalMonths: number | null;
  dueAtKm: number | null;
  dueAtDate: string | null;
  remainingKm: number | null;
  remainingDays: number | null;
  remainingMonths: number | null;
  computationMode: MaintenanceComputationMode;
  provenance: CoreServiceProvenanceV1;
  dataQuality: MaintenanceDataQualityFlag[];
};

export type CoreServiceIntelligenceReadV1 = {
  version: typeof CORE_SERVICE_INTELLIGENCE_READ_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  productSlug: ProductSlug;
  nextServiceHeadline: CoreServiceNextHeadlineV1;
  maintenancePositions: CoreServiceMaintenancePositionV1[];
  positionsTotal: number;
  positionsTruncated: boolean;
  forecastComputedAt: string | null;
  freshness: CoreServiceFreshnessV1;
  forecastDataQuality: MaintenanceDataQualityFlag[];
  conflicts: MaintenanceConflict[];
};
