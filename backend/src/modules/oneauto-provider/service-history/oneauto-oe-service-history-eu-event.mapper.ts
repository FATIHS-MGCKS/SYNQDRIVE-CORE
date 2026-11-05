import { ServiceEventType } from '@prisma/client';
import type { OneAutoServiceHistoryEuEvent } from './oneauto-service-history-eu.types';

export type OneAutoMappedServiceHistoryEvent = {
  eventType: ServiceEventType;
  eventDate: Date;
  odometerKm: number | null;
  workshopName: string | null;
  notes: string | null;
  provider: string;
  providerServiceType: string | null;
  performedActions: string[];
  deliveryInspection: boolean;
  rawEvent: OneAutoServiceHistoryEuEvent;
};

export type MapOneAutoOeServiceHistoryEuEventResult =
  | { ok: true; value: OneAutoMappedServiceHistoryEvent }
  | { ok: false; reason: string };

const ONEAUTO_PROVIDER_LABEL = 'OneAuto OE_SERVICE_HISTORY_EU';

/** ISO calendar date YYYY-MM-DD with strict validity (no JS rollover). */
export function parseOeServiceHistoryEuEventDate(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const day = Number.parseInt(match[3]!, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function parseEventDate(raw: unknown): Date | null {
  return parseOeServiceHistoryEuEventDate(raw);
}

function parseOdometerKm(raw: unknown, unitRaw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return null;
    return convertOdometerToKm(Math.round(raw), unitRaw);
  }
  const cleaned = String(raw).trim();
  if (!cleaned) return null;
  if (!/^-?\d+(?:[.,]\d+)?$/.test(cleaned.replace(/\s/g, ''))) return null;
  const normalized = cleaned.replace(',', '.');
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return convertOdometerToKm(Math.round(n), unitRaw);
}

function convertOdometerToKm(value: number, unitRaw: unknown): number | null {
  if (value < 0) return null;
  const unit = typeof unitRaw === 'string' ? unitRaw.trim().toLowerCase() : 'km';
  if (unit === 'mi' || unit === 'mile' || unit === 'miles') {
    return Math.round(value * 1.60934);
  }
  if (unit !== 'km' && unit !== 'kilometer' && unit !== 'kilometers' && unit !== '') {
    return null;
  }
  return value;
}

function parseActions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item).trim()).filter(Boolean);
}

function isDeliveryInspection(serviceType: string, actions: string[]): boolean {
  const haystack = [serviceType, ...actions].join(' ').toLowerCase();
  return (
    haystack.includes('delivery inspection') ||
    haystack.includes('delivery-inspection') ||
    haystack.includes('auslieferungsinspektion') ||
    haystack.includes('übergabeinspektion')
  );
}

function classifyEventType(serviceType: string, actions: string[], deliveryInspection: boolean): ServiceEventType {
  if (deliveryInspection) return ServiceEventType.OTHER;
  const haystack = [serviceType, ...actions].join(' ').toLowerCase();
  if (haystack.includes('repair') || haystack.includes('reparatur')) {
    return ServiceEventType.REPAIR;
  }
  if (
    haystack.includes('oil') ||
    haystack.includes('öl') ||
    haystack.includes('olej')
  ) {
    return ServiceEventType.OIL_CHANGE;
  }
  if (haystack.includes('brake') || haystack.includes('brems')) {
    return ServiceEventType.BRAKE_SERVICE;
  }
  return ServiceEventType.OTHER;
}

function buildNotes(input: {
  providerServiceType: string | null;
  performedActions: string[];
  deliveryInspection: boolean;
}): string {
  const parts: string[] = ['[OneAuto OE_SERVICE_HISTORY_EU]'];
  if (input.deliveryInspection) {
    parts.push('category=delivery_inspection');
  }
  if (input.providerServiceType) {
    parts.push(`service_type=${input.providerServiceType}`);
  }
  if (input.performedActions.length > 0) {
    parts.push(`actions=${input.performedActions.join(' | ')}`);
  }
  parts.push('external_history_not_manufacturer_certified');
  return parts.join(' ');
}

export function mapOneAutoOeServiceHistoryEuEvent(
  event: OneAutoServiceHistoryEuEvent,
): MapOneAutoOeServiceHistoryEuEventResult {
  const eventDate = parseEventDate(event.date_of_service_event);
  if (!eventDate) {
    return { ok: false, reason: 'missing_or_invalid_date_of_service_event' };
  }

  if (
    typeof event.mileage_observed === 'number' &&
    (!Number.isFinite(event.mileage_observed) || event.mileage_observed < 0)
  ) {
    return { ok: false, reason: 'invalid_mileage_observed' };
  }

  const odometerKm = parseOdometerKm(event.mileage_observed, event.mileage_unit);
  if (event.mileage_observed != null && event.mileage_observed !== '' && odometerKm === null) {
    return { ok: false, reason: 'invalid_mileage_or_unit' };
  }

  const providerServiceType =
    typeof event.service_type === 'string' && event.service_type.trim()
      ? event.service_type.trim()
      : null;
  const performedActions = parseActions(event.service_actions);
  const deliveryInspection = isDeliveryInspection(providerServiceType ?? '', performedActions);
  const eventType = classifyEventType(providerServiceType ?? '', performedActions, deliveryInspection);

  const workshopName =
    typeof event.service_provider === 'string' && event.service_provider.trim()
      ? event.service_provider.trim()
      : null;

  return {
    ok: true,
    value: {
      eventType,
      eventDate,
      odometerKm,
      workshopName,
      notes: buildNotes({ providerServiceType, performedActions, deliveryInspection }),
      provider: ONEAUTO_PROVIDER_LABEL,
      providerServiceType,
      performedActions,
      deliveryInspection,
      rawEvent: event,
    },
  };
}
