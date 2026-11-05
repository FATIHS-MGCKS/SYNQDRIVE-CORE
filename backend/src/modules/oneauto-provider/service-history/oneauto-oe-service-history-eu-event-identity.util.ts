import { createHash } from 'node:crypto';
import type { OneAutoServiceHistoryEuEvent } from './oneauto-service-history-eu.types';

function normalizeToken(value: unknown): string {
  if (value == null) return '';
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
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

/**
 * Stable per-event identity within one provider job — never date-only.
 */
export function buildOneAutoOeServiceHistoryEuSourceEventKey(input: {
  providerJobId: string;
  event: OneAutoServiceHistoryEuEvent;
  eventIndex: number;
}): string {
  const providerEventId =
    typeof input.event.service_event_id === 'string'
      ? input.event.service_event_id.trim()
      : typeof input.event.id === 'string'
        ? input.event.id.trim()
        : '';
  if (providerEventId) {
    return sha256Hex(`oneauto:job:${input.providerJobId}:provider_event_id:${providerEventId}`);
  }

  const fingerprint = [
    normalizeToken(input.event.date_of_service_event),
    normalizeToken(input.event.mileage_observed),
    normalizeToken(input.event.mileage_unit),
    normalizeToken(input.event.service_provider),
    normalizeToken(input.event.service_type),
    normalizeActions(input.event.service_actions),
  ].join('|');

  return sha256Hex(
    `oneauto:job:${input.providerJobId}:fp:${fingerprint}:ordinal:${input.eventIndex}`,
  );
}
