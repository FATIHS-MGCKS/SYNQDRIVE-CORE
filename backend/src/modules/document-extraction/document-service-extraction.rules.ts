import { ServiceEventType } from '@prisma/client';

export const SERVICE_DOCUMENT_TYPES = {
  SERVICE: 'SERVICE',
  OIL_CHANGE: 'OIL_CHANGE',
} as const;

export type ServiceDocumentType =
  (typeof SERVICE_DOCUMENT_TYPES)[keyof typeof SERVICE_DOCUMENT_TYPES];

export type ServiceApplyGateBlocker = {
  code: string;
  message: string;
  fieldKeys?: string[];
};

export type ServiceApplyGateResult = {
  canApply: boolean;
  blockers: ServiceApplyGateBlocker[];
};

export type ServiceApplyPayload = {
  eventType: ServiceEventType;
  eventDate: string;
  odometerKm: number | null;
  workshopName: string | null;
  notes: string | null;
  costCents: number | null;
  /** Structured performed-work items confirmed by the user (never free-text notes). */
  performedWork: string[];
  serviceKind: 'INSPECTION_SMALL' | 'INSPECTION_LARGE' | null;
};

const PERFORMED_WORK_MAX_ITEMS = 40;
const PERFORMED_WORK_ITEM_MAX = 300;

function toStr(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

function toNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.trim().replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toInt(value: unknown): number | null {
  const n = toNum(value);
  return n != null ? Math.round(n) : null;
}

export function isServiceDocumentType(
  documentType: string | null | undefined,
): documentType is ServiceDocumentType {
  return (
    documentType === SERVICE_DOCUMENT_TYPES.SERVICE ||
    documentType === SERVICE_DOCUMENT_TYPES.OIL_CHANGE
  );
}

export function readServiceEventDate(data: Record<string, unknown>): string | null {
  return toStr(data.eventDate) ?? toStr(data.serviceDate) ?? toStr(data.inspectionDate);
}

export function readServiceOdometerKm(data: Record<string, unknown>): number | null {
  return toInt(data.odometerKm) ?? toInt(data.mileage);
}

export function readServiceWorkshopName(data: Record<string, unknown>): string | null {
  return toStr(data.workshopName) ?? toStr(data.supplier) ?? toStr(data.issuingOrganization);
}

export function readServiceCostCents(data: Record<string, unknown>): number | null {
  return toInt(data.costCents) ?? toInt(data.totalCents);
}

export function readServiceNotes(data: Record<string, unknown>): string | null {
  return toStr(data.notes) ?? toStr(data.description);
}

/** Accepts a JSON array, an array value, or newline/semicolon-separated lines. */
export function readServicePerformedWork(data: Record<string, unknown>): string[] {
  const raw = data.performedWork ?? data.serviceActions ?? data.workItems;
  let items: unknown[] = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    const text = raw.trim();
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) items = parsed;
      } catch {
        items = [];
      }
    }
    if (items.length === 0) {
      items = text.split(/\r?\n|;/);
    }
  }
  const out: string[] = [];
  for (const item of items) {
    const str = typeof item === 'string' ? item : item && typeof item === 'object' && 'label' in item ? String((item as { label: unknown }).label) : '';
    const trimmed = str.trim().replace(/^[-•*]\s*/, '').slice(0, PERFORMED_WORK_ITEM_MAX);
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
    if (out.length >= PERFORMED_WORK_MAX_ITEMS) break;
  }
  return out;
}

export function readServiceKind(data: Record<string, unknown>): 'INSPECTION_SMALL' | 'INSPECTION_LARGE' | null {
  const raw = toStr(data.serviceKind)?.toUpperCase();
  return raw === 'INSPECTION_SMALL' || raw === 'INSPECTION_LARGE' ? raw : null;
}

export function resolveServiceEventType(documentType: ServiceDocumentType): ServiceEventType {
  return documentType === SERVICE_DOCUMENT_TYPES.OIL_CHANGE ? 'OIL_CHANGE' : 'FULL_SERVICE';
}

export function assessServiceApplyGate(input: {
  documentType: ServiceDocumentType;
  fields: Record<string, unknown>;
}): ServiceApplyGateResult {
  const blockers: ServiceApplyGateBlocker[] = [];

  if (!readServiceEventDate(input.fields)) {
    blockers.push({
      code: 'MISSING_EVENT_DATE',
      message: 'Event date must be confirmed — no default date is applied.',
      fieldKeys: ['eventDate', 'serviceDate'],
    });
  }

  const odometerKm = readServiceOdometerKm(input.fields);
  if (odometerKm != null && odometerKm < 0) {
    blockers.push({
      code: 'SERVICE_ODOMETER_NEGATIVE',
      message: 'Odometer cannot be negative.',
      fieldKeys: ['odometerKm', 'mileage'],
    });
  }

  return {
    canApply: blockers.length === 0,
    blockers,
  };
}

export function buildServiceApplyPayload(
  documentType: ServiceDocumentType,
  fields: Record<string, unknown>,
): ServiceApplyPayload | null {
  const gate = assessServiceApplyGate({ documentType, fields });
  const eventDate = readServiceEventDate(fields);
  if (!gate.canApply || !eventDate) {
    return null;
  }

  return {
    eventType: resolveServiceEventType(documentType),
    eventDate,
    odometerKm: readServiceOdometerKm(fields),
    workshopName: readServiceWorkshopName(fields),
    notes: readServiceNotes(fields),
    costCents: readServiceCostCents(fields),
    performedWork: readServicePerformedWork(fields),
    serviceKind: documentType === SERVICE_DOCUMENT_TYPES.SERVICE ? readServiceKind(fields) : null,
  };
}
