import type {
  MaintenanceConflict,
  MaintenanceDataQualityFlag,
  MaintenancePositionKind,
  MaintenanceProvenance,
} from './maintenance-forecast/maintenance-forecast.types';

export type ServiceTrackingStatus = 'TRACKED' | 'NO_TRACKING' | 'STALE';
export type ServiceComplianceSeverity = 'GOOD' | 'WARNING' | 'CRITICAL' | 'INFO';
/**
 * HM_OEM: measured OEM remaining values. COMPUTED_*: deterministic forecast from a schedule
 * source + proven history (SynqDrive calculation). Never mixed into one number.
 */
export type ServiceNextSource =
  | 'HM_OEM'
  | 'COMPUTED_ONEAUTO_SCHEDULE'
  | 'COMPUTED_MANUAL_INTERVAL'
  | null;

export function isComputedServiceSource(source: ServiceNextSource): boolean {
  return source === 'COMPUTED_ONEAUTO_SCHEDULE' || source === 'COMPUTED_MANUAL_INTERVAL';
}

/** Canonical next-service read model — single source for all consumers. */
export interface NextServiceComplianceDto {
  trackingStatus: ServiceTrackingStatus;
  source: ServiceNextSource;
  distanceToNextServiceKm: number | null;
  timeToNextServiceDays: number | null;
  lastUpdatedAt: string | null;
  serviceSourceLabel: string | null;
  severity: ServiceComplianceSeverity;
  blocksRental: boolean;
  title: string;
  description: string;
  message: string;
  hmDistanceFromOem: boolean;
  hmTimeFromOem: boolean;
  /** Projected due date derived from HM days — never a manual operator due date. */
  hmDerivedDueDate: string | null;
  /**
   * V2 provenance fields — always populated by ServiceComplianceService; optional only so that
   * legacy fixtures/literals remain valid.
   */
  /** Projected due date for any source (HM-derived or computed from schedule + baseline). */
  projectedDueDate?: string | null;
  /** Maintenance position kind the headline refers to (computed sources; HM = INSPECTION). */
  positionKind?: MaintenancePositionKind | null;
  /** Position id in `maintenanceForecast.positions` (computed sources only). */
  positionId?: string | null;
  provenance?: MaintenanceProvenance | null;
  dataQuality?: MaintenanceDataQualityFlag[];
  /** Visible conflicts between measured OEM values and computed values. */
  conflicts?: MaintenanceConflict[];
  /** Computed comparison when HM is the headline and a schedule-based forecast also exists. */
  computedComparison?: {
    source: Exclude<ServiceNextSource, 'HM_OEM' | null>;
    positionId: string;
    remainingKm: number | null;
    remainingDays: number | null;
    projectedDueDate: string | null;
  } | null;
}

export interface TuvBokraftComplianceDto {
  tuvValidTill: string | null;
  tuvRemainingMonths: number | null;
  tuvRemainingDays: number | null;
  tuvOverdue: boolean;
  tuvLastDate: string | null;
  bokraftValidTill: string | null;
  bokraftRemainingMonths: number | null;
  bokraftRemainingDays: number | null;
  bokraftOverdue: boolean;
  bokraftLastDate: string | null;
}

export interface ServiceComplianceEvaluation {
  nextService: NextServiceComplianceDto;
  tuvBokraft: TuvBokraftComplianceDto;
}

import type { ServiceOverdueTaskContext } from './service-overdue-task.util';

export type ComplianceTaskSignalKind =
  | 'SERVICE_SCHEDULE'
  | 'SERVICE_URGENT'
  | 'TUV_SCHEDULE'
  | 'TUV_URGENT'
  | 'BOKRAFT_SCHEDULE'
  | 'BOKRAFT_URGENT';

/** Actionable task signal for Health UI / manual materialization — from ServiceComplianceService only. */
export interface ComplianceTaskSignalDto {
  signalKey: string;
  dedupeKey: string;
  kind: ComplianceTaskSignalKind;
  insightType: string;
  title: string;
  message: string;
  actionLabel: string;
  severity: 'WARNING' | 'CRITICAL';
  suggestionOnly: boolean;
  blocksRental: boolean;
  dueDate: string | null;
  category: string;
  taskType: string;
  /** Structured overdue context for task materialization — single source with insights. */
  serviceOverdueContext?: ServiceOverdueTaskContext | null;
}
