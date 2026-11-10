import type {
  MaintenanceBaselineEvidenceClass,
  MaintenanceBaselineRef,
  MaintenanceDataQualityFlag,
  MaintenanceEventSource,
} from '../../lib/api';

export type PositionBaselineEvidenceClass =
  | 'documented_service'
  | 'user_declared'
  | 'calculation_basis'
  | 'missing'
  | 'unsupported';

export interface PositionBaselinePresentation {
  evidenceClass: PositionBaselineEvidenceClass;
  hasDate: boolean;
  hasOdometer: boolean;
}

function mapBackendEvidenceClass(
  value: MaintenanceBaselineEvidenceClass,
): PositionBaselineEvidenceClass {
  switch (value) {
    case 'DOCUMENTED':
      return 'documented_service';
    case 'USER_DECLARED':
      return 'user_declared';
    case 'CALCULATION_BASIS':
      return 'calculation_basis';
    case 'UNSUPPORTED':
      return 'unsupported';
    default:
      return 'missing';
  }
}

/** Legacy fallback when API payload predates `evidenceClass` (fail-closed). */
function legacyClassify(
  baseline: MaintenanceBaselineRef,
  dataQuality?: MaintenanceDataQualityFlag[] | null,
): PositionBaselinePresentation {
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
    baseline.eventSource === 'SERVICE_EVENT_IMPORT' ||
    baseline.eventSource === 'SERVICE_EVENT_OEM' ||
    baseline.eventSource === 'SERVICE_EVENT_UNSUPPORTED'
  ) {
    return { evidenceClass: 'unsupported', hasDate, hasOdometer };
  }

  if (baseline.eventSource === 'SERVICE_EVENT_MANUAL' && baseline.eventId) {
    return { evidenceClass: 'user_declared', hasDate, hasOdometer };
  }

  if (
    baseline.eventId &&
    (baseline.eventSource === 'SERVICE_EVENT_ONEAUTO' ||
      baseline.eventSource === 'SERVICE_EVENT_OCR' ||
      baseline.eventSource === 'SERVICE_EVENT_WORKSHOP')
  ) {
    return { evidenceClass: 'documented_service', hasDate, hasOdometer };
  }

  if (hasDate || hasOdometer) {
    return { evidenceClass: 'calculation_basis', hasDate, hasOdometer };
  }

  return { evidenceClass: 'missing', hasDate: false, hasOdometer: false };
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

  if (baseline.evidenceClass) {
    const evidenceClass = mapBackendEvidenceClass(baseline.evidenceClass);
    if (evidenceClass === 'missing' && (hasDate || hasOdometer)) {
      return { evidenceClass: 'calculation_basis', hasDate, hasOdometer };
    }
    return { evidenceClass, hasDate, hasOdometer };
  }

  return legacyClassify(baseline, dataQuality);
}

export function concisePlanSourceKey(
  eventSource: MaintenanceEventSource,
): `health.serviceInfo.v2.eventSource.${MaintenanceEventSource}` {
  return `health.serviceInfo.v2.eventSource.${eventSource}`;
}
