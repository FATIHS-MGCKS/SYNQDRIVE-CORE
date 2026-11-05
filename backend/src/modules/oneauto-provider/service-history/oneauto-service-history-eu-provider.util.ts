import { isValidVin, normalizeVin } from '../client/oneauto-vin.util';
import { extractProviderResultVin } from '../attestation/oneauto-sandbox-attestation-result-capture.util';
import {
  ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU,
  type OneAutoServiceHistoryEuEvent,
  type OneAutoServiceHistoryEuParseOutcome,
} from './oneauto-service-history-eu.types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export type OeServiceHistoryEuBindingValidation =
  | { ok: true; normalizedVin: string }
  | { ok: false; code: string };

export function assertOeServiceHistoryEuJobBinding(input: {
  serviceSku: string;
  jobVinSnapshot: string;
  vehicleVin: string | null;
  providerResponseBody: unknown;
}): OeServiceHistoryEuBindingValidation {
  if (input.serviceSku !== ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU) {
    return { ok: false, code: 'ONEAUTO_SERVICE_HISTORY_SKU_MISMATCH' };
  }

  const jobVin = normalizeVin(input.jobVinSnapshot);
  const vehicleVin = normalizeVin(input.vehicleVin);
  if (!isValidVin(jobVin) || !isValidVin(vehicleVin) || jobVin !== vehicleVin) {
    return { ok: false, code: 'ONEAUTO_SERVICE_HISTORY_VIN_BINDING_MISMATCH' };
  }

  const providerVin = extractProviderResultVin(input.providerResponseBody);
  if (providerVin != null) {
    const normalizedProviderVin = normalizeVin(providerVin);
    if (!isValidVin(normalizedProviderVin) || normalizedProviderVin !== jobVin) {
      return { ok: false, code: 'ONEAUTO_SERVICE_HISTORY_PROVIDER_VIN_MISMATCH' };
    }
  }

  return { ok: true, normalizedVin: jobVin! };
}

export function extractOeServiceHistoryEuProviderResult(body: unknown): Record<string, unknown> | null {
  if (!isPlainObject(body) || body.success !== true) return null;
  if (!isPlainObject(body.result)) return null;
  return body.result;
}

function normalizeServiceEvent(raw: unknown): OneAutoServiceHistoryEuEvent | null {
  if (!isPlainObject(raw)) return null;
  return raw as OneAutoServiceHistoryEuEvent;
}

/**
 * Validates attested service-history fields while preserving the full provider result object.
 */
export function parseOeServiceHistoryEuProviderResult(
  result: Record<string, unknown>,
): OneAutoServiceHistoryEuParseOutcome {
  const vinRaw = result.vehicle_identification_number;
  if (typeof vinRaw !== 'string' || !isValidVin(normalizeVin(vinRaw))) {
    return { kind: 'INVALID_SHAPE', reason: 'missing_or_invalid_vehicle_identification_number' };
  }
  const vehicleIdentificationNumber = normalizeVin(vinRaw)!;

  if (!Object.prototype.hasOwnProperty.call(result, 'service_events')) {
    return {
      kind: 'SUCCESS_EMPTY_HISTORY',
      vehicleIdentificationNumber,
      rawResult: result,
    };
  }

  const eventsRaw = result.service_events;
  if (!Array.isArray(eventsRaw)) {
    return { kind: 'INVALID_SHAPE', reason: 'service_events_not_array' };
  }

  const serviceEvents: OneAutoServiceHistoryEuEvent[] = [];
  for (const item of eventsRaw) {
    const normalized = normalizeServiceEvent(item);
    if (!normalized) {
      return { kind: 'INVALID_SHAPE', reason: 'service_event_not_object' };
    }
    serviceEvents.push(normalized);
  }

  if (serviceEvents.length === 0) {
    return {
      kind: 'SUCCESS_EMPTY_HISTORY',
      vehicleIdentificationNumber,
      rawResult: result,
    };
  }

  return {
    kind: 'SUCCESS_WITH_EVENTS',
    vehicleIdentificationNumber,
    serviceEvents,
    rawResult: result,
  };
}
