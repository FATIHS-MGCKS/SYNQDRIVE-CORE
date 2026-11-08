import type { MaintenanceEventSource, MaintenanceEvidenceEvent } from '../maintenance-forecast.types';

export interface ServiceEventEvidenceRow {
  id: string;
  eventType: string;
  eventDate: Date;
  odometerKm: number | null;
  origin: string;
  sourcePayloadJson: unknown;
}

/** Key under which structured performed work is stored for every origin (OneAuto mapper + manual/OCR). */
export const SERVICE_ACTIONS_PAYLOAD_KEY = 'service_actions';
/** Key under which a confirmed inspection kind is stored (manual/OCR). */
export const SERVICE_KIND_PAYLOAD_KEY = 'service_kind';

export function readServiceActions(sourcePayloadJson: unknown): string[] {
  if (!sourcePayloadJson || typeof sourcePayloadJson !== 'object' || Array.isArray(sourcePayloadJson)) return [];
  const raw = (sourcePayloadJson as Record<string, unknown>)[SERVICE_ACTIONS_PAYLOAD_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x).trim()).filter(Boolean);
}

export function readServiceKind(sourcePayloadJson: unknown): 'INSPECTION_SMALL' | 'INSPECTION_LARGE' | null {
  if (!sourcePayloadJson || typeof sourcePayloadJson !== 'object' || Array.isArray(sourcePayloadJson)) return null;
  const raw = (sourcePayloadJson as Record<string, unknown>)[SERVICE_KIND_PAYLOAD_KEY];
  return raw === 'INSPECTION_SMALL' || raw === 'INSPECTION_LARGE' ? raw : null;
}

export function eventSourceFromOrigin(origin: string): MaintenanceEventSource {
  switch (origin) {
    case 'ONEAUTO':
      return 'SERVICE_EVENT_ONEAUTO';
    case 'AI_UPLOAD':
      return 'SERVICE_EVENT_OCR';
    case 'WORKSHOP_DOCUMENT':
      return 'SERVICE_EVENT_WORKSHOP';
    default:
      return 'SERVICE_EVENT_MANUAL';
  }
}

export function mapServiceEventsToEvidence(rows: ServiceEventEvidenceRow[]): MaintenanceEvidenceEvent[] {
  return rows.map((row) => ({
    eventId: row.id,
    eventType: row.eventType,
    eventDate: row.eventDate,
    odometerKm: row.odometerKm,
    performedWork: readServiceActions(row.sourcePayloadJson),
    serviceKind: readServiceKind(row.sourcePayloadJson),
    eventSource: eventSourceFromOrigin(row.origin),
  }));
}
