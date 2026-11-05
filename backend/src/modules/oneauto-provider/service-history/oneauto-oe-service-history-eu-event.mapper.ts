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

function parseEventDate(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const d = new Date(`${raw.trim()}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseOdometerKm(raw: unknown, unitRaw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw).replace(/[^\d-]/g, ''), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  const unit = typeof unitRaw === 'string' ? unitRaw.trim().toLowerCase() : 'km';
  if (unit === 'mi' || unit === 'mile' || unit === 'miles') {
    return Math.round(n * 1.60934);
  }
  return Math.round(n);
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
      odometerKm: parseOdometerKm(event.mileage_observed, event.mileage_unit),
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
