import type { OneAutoJobResultResponse } from './oneauto-api.types';

export type ParsedServiceHistoryEvent = {
  dateOfService: string | null;
  mileageLabel: string | null;
  workshop: string | null;
  serviceType: string | null;
  serviceActions: string[];
  raw: Record<string, unknown>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function unwrapEnvelope(body: unknown): Record<string, unknown> | null {
  if (!isPlainObject(body)) return null;
  if (body.success === true && isPlainObject(body.result)) {
    return body.result;
  }
  const inner = body.result;
  if (isPlainObject(inner) && inner.success === true && isPlainObject(inner.result)) {
    return inner.result;
  }
  return null;
}

function formatMileage(event: Record<string, unknown>): string | null {
  const mileage = event.mileage_observed;
  const unit = event.mileage_unit;
  if (mileage == null || mileage === '') return null;
  const unitStr = typeof unit === 'string' && unit.trim() ? ` ${unit}` : '';
  return `${String(mileage)}${unitStr}`;
}

function parseEvent(raw: unknown): ParsedServiceHistoryEvent | null {
  if (!isPlainObject(raw)) return null;
  const actionsRaw = raw.service_actions;
  const actions = Array.isArray(actionsRaw)
    ? actionsRaw.map((a) => String(a)).filter(Boolean)
    : [];
  return {
    dateOfService:
      typeof raw.date_of_service_event === 'string' ? raw.date_of_service_event : null,
    mileageLabel: formatMileage(raw),
    workshop: typeof raw.service_provider === 'string' ? raw.service_provider : null,
    serviceType: typeof raw.service_type === 'string' ? raw.service_type : null,
    serviceActions: actions,
    raw,
  };
}

export function parseServiceHistoryFromJobResult(
  result: OneAutoJobResultResponse | null | undefined,
): {
  events: ParsedServiceHistoryEvent[];
  vin: string | null;
  providerStatus: number | null;
  verifiedEmptyHistory: boolean;
} {
  const body = result?.latestResponse?.responseBodyJson;
  const providerStatus = result?.latestResponse?.httpStatus ?? null;
  const unwrapped = unwrapEnvelope(body);
  if (!unwrapped) {
    return { events: [], vin: null, providerStatus, verifiedEmptyHistory: false };
  }
  const vin =
    typeof unwrapped.vehicle_identification_number === 'string'
      ? unwrapped.vehicle_identification_number
      : null;
  if (!Object.prototype.hasOwnProperty.call(unwrapped, 'service_events')) {
    return { events: [], vin, providerStatus, verifiedEmptyHistory: false };
  }
  const eventsRaw = unwrapped.service_events;
  if (!Array.isArray(eventsRaw)) {
    return { events: [], vin, providerStatus, verifiedEmptyHistory: false };
  }
  if (eventsRaw.length === 0) {
    return { events: [], vin, providerStatus, verifiedEmptyHistory: true };
  }
  const events = eventsRaw
    .map(parseEvent)
    .filter((e): e is ParsedServiceHistoryEvent => e != null)
    .sort((a, b) => {
      const da = a.dateOfService ?? '';
      const db = b.dateOfService ?? '';
      return db.localeCompare(da);
    });
  return { events, vin, providerStatus, verifiedEmptyHistory: false };
}
