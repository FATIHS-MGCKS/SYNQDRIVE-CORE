/**
 * Provider-agnostic deterministic maintenance forecast — domain contract.
 *
 * Pure data types shared by the engine, the source adapters and the API read model.
 * No provider- or framework-specific imports allowed here.
 */

export type MaintenancePositionKind =
  | 'INSPECTION'
  | 'INSPECTION_SMALL'
  | 'INSPECTION_LARGE'
  | 'OIL_CHANGE'
  | 'OTHER';

/** RECURRING: due = baseline + interval. ABSOLUTE_MILESTONE: due = fixed manufacturer milestone. */
export type MaintenanceIntervalMode = 'RECURRING' | 'ABSOLUTE_MILESTONE';

export type MaintenanceScheduleSource = 'HM_OEM' | 'ONEAUTO_SCHEDULE' | 'MANUAL_INTERVAL' | 'NONE';

export type MaintenanceEventSource =
  | 'SERVICE_EVENT_MANUAL'
  | 'SERVICE_EVENT_OCR'
  | 'SERVICE_EVENT_ONEAUTO'
  | 'SERVICE_EVENT_WORKSHOP'
  | 'VEHICLE_MASTER_DATA'
  | 'NONE';

export type MaintenanceOdometerSource =
  | 'HM_OEM'
  | 'VEHICLE_LATEST_STATE'
  | 'VEHICLE_MASTER_DATA'
  | 'NONE';

export type MaintenanceCalculationMethod =
  | 'OEM_REMAINING'
  | 'COMPUTED_FROM_SCHEDULE_AND_HISTORY'
  | 'NOT_COMPUTABLE';

export type MaintenanceDueState = 'OK' | 'DUE_SOON' | 'OVERDUE' | 'NO_BASELINE' | 'NO_INTERVAL';

export type MaintenanceComputationMode = 'KM_AND_TIME' | 'TIME_ONLY' | 'KM_ONLY' | 'NONE';

export type MaintenanceSeverity = 'GOOD' | 'WARNING' | 'CRITICAL' | 'INFO';

export type MaintenanceDataQualityFlag =
  | 'ODOMETER_MISSING'
  | 'ODOMETER_STALE'
  | 'ODOMETER_TIMESTAMP_UNKNOWN'
  | 'ODOMETER_BELOW_BASELINE'
  | 'BASELINE_ODOMETER_MISSING'
  | 'BASELINE_FROM_MASTER_DATA'
  | 'SCHEDULE_POSITION_UNSCHEDULED'
  | 'SCHEDULE_VARIANTS_COLLAPSED'
  | 'SCHEDULE_MISSING'
  | 'HISTORY_MISSING'
  | 'CONFLICT_HM_VS_COMPUTED';

export interface MaintenanceSchedulePosition {
  /** Stable id, e.g. `oneauto:SID1002`, `manual:inspection`. */
  positionId: string;
  kind: MaintenancePositionKind;
  /** Human label from the source (provider description) — UI may override via kind. */
  label: string;
  intervalMode: MaintenanceIntervalMode;
  /** RECURRING: interval; ABSOLUTE_MILESTONE: milestone odometer. */
  intervalKm: number | null;
  /** RECURRING: interval; ABSOLUTE_MILESTONE: months after `absoluteReferenceDate`. */
  intervalMonths: number | null;
  /** Reference date for ABSOLUTE_MILESTONE time axis (e.g. first registration). */
  absoluteReferenceDate?: Date | null;
  /** Lower-cased component vocabulary used to match proven work items (OTHER positions). */
  componentTerms: string[];
  scheduleSource: MaintenanceScheduleSource;
  rawIntervalDescription: string | null;
}

export interface MaintenanceEvidenceEvent {
  eventId: string | null;
  /** Prisma `ServiceEventType` string. */
  eventType: string;
  eventDate: Date;
  odometerKm: number | null;
  /** Structured, proven work items (never free-text notes). */
  performedWork: string[];
  /** Confirmed service kind when the source provides it (manual / OCR). */
  serviceKind: 'INSPECTION_SMALL' | 'INSPECTION_LARGE' | null;
  eventSource: MaintenanceEventSource;
}

export interface MaintenanceOdometerReading {
  km: number;
  observedAt: Date | null;
  source: MaintenanceOdometerSource;
}

export interface MaintenanceHmSignal {
  distanceToNextServiceKm: number | null;
  timeToNextServiceDays: number | null;
  lastUpdatedAt: string | null;
  fresh: boolean;
}

export interface MaintenanceMasterDataBaselines {
  inspection: { date: Date | null; odometerKm: number | null };
  oilChange: { date: Date | null; odometerKm: number | null };
}

export interface MaintenanceForecastThresholds {
  warningKm: number;
  warningDays: number;
  odometerStaleDays: number;
  conflictKmTolerance: number;
  conflictDaysTolerance: number;
}

export interface MaintenanceForecastInput {
  now: Date;
  positions: MaintenanceSchedulePosition[];
  /** Positions listed by a schedule source without usable interval (informational). */
  unscheduledPositions?: Array<{ positionId: string; label: string; scheduleSource: MaintenanceScheduleSource }>;
  events: MaintenanceEvidenceEvent[];
  masterDataBaselines: MaintenanceMasterDataBaselines | null;
  odometer: MaintenanceOdometerReading | null;
  hm: MaintenanceHmSignal | null;
  scheduleFlags?: MaintenanceDataQualityFlag[];
  scheduleFetchedAt?: Date | null;
  thresholds: MaintenanceForecastThresholds;
}

export interface MaintenanceBaselineRef {
  date: string | null;
  odometerKm: number | null;
  eventId: string | null;
  eventType: string | null;
  eventSource: MaintenanceEventSource;
}

export interface MaintenanceProvenance {
  scheduleSource: MaintenanceScheduleSource;
  eventSource: MaintenanceEventSource;
  odometerSource: MaintenanceOdometerSource;
  calculationMethod: MaintenanceCalculationMethod;
}

export interface MaintenancePositionForecast {
  positionId: string;
  kind: MaintenancePositionKind;
  label: string;
  intervalMode: MaintenanceIntervalMode;
  intervalKm: number | null;
  intervalMonths: number | null;
  rawIntervalDescription: string | null;
  baseline: MaintenanceBaselineRef | null;
  dueAtKm: number | null;
  dueAtDate: string | null;
  remainingKm: number | null;
  remainingDays: number | null;
  /** Whole calendar months between now and due date (negative when overdue). */
  remainingMonths: number | null;
  dueState: MaintenanceDueState;
  computationMode: MaintenanceComputationMode;
  severity: MaintenanceSeverity;
  provenance: MaintenanceProvenance;
  dataQuality: MaintenanceDataQualityFlag[];
}

export interface MaintenanceConflict {
  code: 'CONFLICT_HM_VS_COMPUTED' | 'ODOMETER_BELOW_BASELINE';
  positionId: string | null;
  hmRemainingKm: number | null;
  computedRemainingKm: number | null;
  hmRemainingDays: number | null;
  computedRemainingDays: number | null;
}

export interface MaintenanceForecastFreshness {
  odometerObservedAt: string | null;
  scheduleFetchedAt: string | null;
  hmLastUpdatedAt: string | null;
  latestEventDate: string | null;
}

export interface MaintenanceForecastResult {
  computedAt: string;
  positions: MaintenancePositionForecast[];
  unscheduledPositions: Array<{ positionId: string; label: string; scheduleSource: MaintenanceScheduleSource }>;
  /** Earliest-due computable position (OVERDUE > DUE_SOON > OK). */
  nextDue: MaintenancePositionForecast | null;
  /** Last proven regular-service baseline (INSPECTION kinds, then OIL_CHANGE). */
  lastRelevantMaintenance: MaintenanceBaselineRef | null;
  hmOem: MaintenanceHmSignal | null;
  odometer: { km: number; observedAt: string | null; source: MaintenanceOdometerSource } | null;
  conflicts: MaintenanceConflict[];
  dataQuality: MaintenanceDataQualityFlag[];
  freshness: MaintenanceForecastFreshness;
  scheduleSources: MaintenanceScheduleSource[];
  eventSources: MaintenanceEventSource[];
}
