import { createHash } from 'node:crypto';
import type { OneAutoServiceHistoryEuEvent } from './oneauto-service-history-eu.types';

function normalizeToken(value: unknown): string {
  if (value == null) return '';
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeVin(vin: string): string {
  return vin.trim().toUpperCase();
}

function normalizeActions(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((item) => normalizeToken(item))
    .filter(Boolean)
    .sort()
    .join(';');
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function semanticFingerprint(event: OneAutoServiceHistoryEuEvent): string {
  return [
    normalizeToken(event.date_of_service_event),
    normalizeToken(event.mileage_observed),
    normalizeToken(event.mileage_unit),
    normalizeToken(event.service_provider),
    normalizeToken(event.service_type),
    normalizeActions(event.service_actions),
  ].join('|');
}

function providerStableEventId(event: OneAutoServiceHistoryEuEvent): string | null {
  if (typeof event.service_event_id === 'string' && event.service_event_id.trim()) {
    return event.service_event_id.trim();
  }
  if (typeof event.id === 'string' && event.id.trim()) {
    return event.id.trim();
  }
  return null;
}

/** Idempotency within one provider job (replays / concurrent workers on same job). */
export function buildOneAutoOeServiceHistoryEuJobSourceEventKey(input: {
  providerJobId: string;
  event: OneAutoServiceHistoryEuEvent;
  eventIndex: number;
}): string {
  const providerEventId = providerStableEventId(input.event);
  if (providerEventId) {
    return sha256Hex(`oneauto:job:${input.providerJobId}:provider_event_id:${providerEventId}`);
  }
  return sha256Hex(
    `oneauto:job:${input.providerJobId}:fp:${semanticFingerprint(input.event)}:ordinal:${input.eventIndex}`,
  );
}

/**
 * Cross-job vehicle identity — same historical workshop event from two paid lookups dedupes.
 * Never date-only; includes mileage, workshop, type, and actions.
 */
export function buildOneAutoOeServiceHistoryEuVehicleHistoricalEventKey(input: {
  normalizedVin: string;
  event: OneAutoServiceHistoryEuEvent;
}): string {
  const vin = normalizeVin(input.normalizedVin);
  const providerEventId = providerStableEventId(input.event);
  if (providerEventId) {
    return sha256Hex(`oneauto:vin:${vin}:provider_event_id:${providerEventId}`);
  }
  return sha256Hex(`oneauto:vin:${vin}:fp:${semanticFingerprint(input.event)}`);
}

/** @deprecated use buildOneAutoOeServiceHistoryEuJobSourceEventKey */
export function buildOneAutoOeServiceHistoryEuSourceEventKey(input: {
  providerJobId: string;
  event: OneAutoServiceHistoryEuEvent;
  eventIndex: number;
}): string {
  return buildOneAutoOeServiceHistoryEuJobSourceEventKey(input);
}
