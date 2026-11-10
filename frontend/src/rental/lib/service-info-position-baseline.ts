import type { MaintenanceBaselineRef, MaintenanceDataQualityFlag, MaintenanceEventSource } from '../../lib/api';

/** Mirrors backend maintenance-forecast semantics (read-only). */
const VERIFIED_EVENT_SOURCES: ReadonlySet<MaintenanceEventSource> = new Set([
  'SERVICE_EVENT_ONEAUTO',
  'SERVICE_EVENT_MANUAL',
  'SERVICE_EVENT_OCR',
  'SERVICE_EVENT_WORKSHOP',
]);

export type PositionBaselineEvidenceClass =
  | 'verified_service'
  | 'calculation_basis'
  | 'missing';

export interface PositionBaselinePresentation {
  evidenceClass: PositionBaselineEvidenceClass;
  hasDate: boolean;
  hasOdometer: boolean;
}

export function classifyPositionBaseline(
  baseline: MaintenanceBaselineRef | null | undefined,
  dataQuality?: MaintenanceDataQualityFlag[] | null,
): PositionBaselinePresentation {
  if (!baseline) {
    return { evidenceClass: 'missing', hasDate: false, hasOdometer: false };
  }

  const hasDate = Boolean(baseline.date);
  const hasOdometer = baseline.odometerKm != null;
  const flags = dataQuality ?? [];

  if (baseline.eventSource === 'VEHICLE_MASTER_DATA' || flags.includes('BASELINE_FROM_MASTER_DATA')) {
    return {
      evidenceClass: hasDate || hasOdometer ? 'calculation_basis' : 'missing',
      hasDate,
      hasOdometer,
    };
  }

  if (
    baseline.eventId &&
    VERIFIED_EVENT_SOURCES.has(baseline.eventSource) &&
    baseline.eventSource !== 'NONE'
  ) {
    return { evidenceClass: 'verified_service', hasDate, hasOdometer };
  }

  if (hasDate || hasOdometer) {
    return { evidenceClass: 'calculation_basis', hasDate, hasOdometer };
  }

  return { evidenceClass: 'missing', hasDate: false, hasOdometer: false };
}

export function concisePlanSourceKey(
  eventSource: MaintenanceEventSource,
): `health.serviceInfo.v2.eventSource.${MaintenanceEventSource}` {
  return `health.serviceInfo.v2.eventSource.${eventSource}`;
}
