import type {
  MaintenanceBaselineEvidenceClass,
  MaintenanceBaselineRef,
  MaintenanceEventSource,
  MaintenanceEvidenceEvent,
} from './maintenance-forecast.types';

/** Event sources that may participate in position-reset coverage matching. */
const FORECAST_AUTHORITATIVE_EVENT_SOURCES: ReadonlySet<MaintenanceEventSource> = new Set([
  'SERVICE_EVENT_MANUAL',
  'SERVICE_EVENT_ONEAUTO',
  'SERVICE_EVENT_OCR',
  'SERVICE_EVENT_WORKSHOP',
]);

export function isAuthoritativeForecastEventSource(source: MaintenanceEventSource): boolean {
  return FORECAST_AUTHORITATIVE_EVENT_SOURCES.has(source);
}

export function classifyBaselineEvidenceFromEvent(
  event: MaintenanceEvidenceEvent,
): MaintenanceBaselineEvidenceClass {
  switch (event.eventSource) {
    case 'SERVICE_EVENT_MANUAL':
      return 'USER_DECLARED';
    case 'SERVICE_EVENT_ONEAUTO':
    case 'SERVICE_EVENT_OCR':
    case 'SERVICE_EVENT_WORKSHOP':
      return 'DOCUMENTED';
    default:
      return 'UNSUPPORTED';
  }
}

export function baselineRefFromEvent(event: MaintenanceEvidenceEvent): MaintenanceBaselineRef {
  return {
    date: event.eventDate.toISOString(),
    odometerKm: event.odometerKm,
    eventId: event.eventId,
    eventType: event.eventType,
    eventSource: event.eventSource,
    evidenceClass: classifyBaselineEvidenceFromEvent(event),
  };
}

export function baselineRefFromMasterData(
  date: Date | null,
  odometerKm: number | null,
): MaintenanceBaselineRef {
  return {
    date: date ? date.toISOString() : null,
    odometerKm,
    eventId: null,
    eventType: null,
    eventSource: 'VEHICLE_MASTER_DATA',
    evidenceClass: 'CALCULATION_BASIS',
  };
}
