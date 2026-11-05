import { isValidVin, normalizeVin } from '../client/oneauto-vin.util';
import { extractProviderResultVin } from '../attestation/oneauto-sandbox-attestation-result-capture.util';
import {
  validateOeServiceScheduleService,
  validateOeServiceScheduleServiceArray,
} from './oneauto-oe-service-schedule-field-validation.util';
import {
  ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
  type OneAutoOeServiceScheduleParseOutcome,
  type OneAutoOeServiceScheduleService,
} from './oneauto-service-schedule-eu.types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export type OeServiceScheduleEuBindingValidation =
  | { ok: true; normalizedVin: string }
  | { ok: false; code: string };

export function assertOeServiceScheduleEuJobBinding(input: {
  serviceSku: string;
  jobVinSnapshot: string;
  vehicleVin: string | null;
  providerResponseBody: unknown;
}): OeServiceScheduleEuBindingValidation {
  if (input.serviceSku !== ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU) {
    return { ok: false, code: 'ONEAUTO_SERVICE_SCHEDULE_SKU_MISMATCH' };
  }

  const jobVin = normalizeVin(input.jobVinSnapshot);
  const vehicleVin = normalizeVin(input.vehicleVin);
  if (!isValidVin(jobVin) || !isValidVin(vehicleVin) || jobVin !== vehicleVin) {
    return { ok: false, code: 'ONEAUTO_SERVICE_SCHEDULE_VIN_BINDING_MISMATCH' };
  }

  const providerVin = extractProviderResultVin(input.providerResponseBody);
  if (providerVin != null) {
    const normalizedProviderVin = normalizeVin(providerVin);
    if (!isValidVin(normalizedProviderVin) || normalizedProviderVin !== jobVin) {
      return { ok: false, code: 'ONEAUTO_SERVICE_SCHEDULE_PROVIDER_VIN_MISMATCH' };
    }
  }

  return { ok: true, normalizedVin: jobVin! };
}

export function extractOeServiceScheduleEuProviderResult(body: unknown): Record<string, unknown> | null {
  if (!isPlainObject(body) || body.success !== true) return null;
  if (!isPlainObject(body.result)) return null;
  return body.result;
}

function normalizeService(raw: unknown): OneAutoOeServiceScheduleService | null {
  const shapeErr = validateOeServiceScheduleService(raw);
  if (shapeErr || !isPlainObject(raw)) return null;
  return raw as OneAutoOeServiceScheduleService;
}

function parseServiceArray(
  result: Record<string, unknown>,
  key: 'normal_services' | 'extra_services',
): OneAutoOeServiceScheduleService[] | { invalid: true; reason: string } {
  if (!Object.prototype.hasOwnProperty.call(result, key)) {
    return { invalid: true, reason: `${key}_missing` };
  }
  const raw = result[key];
  const arrayErr = validateOeServiceScheduleServiceArray(raw, key);
  if (arrayErr) {
    return { invalid: true, reason: arrayErr };
  }
  const out: OneAutoOeServiceScheduleService[] = [];
  for (const item of raw as unknown[]) {
    const normalized = normalizeService(item);
    if (!normalized) {
      return { invalid: true, reason: `${key}_item_invalid` };
    }
    out.push(normalized);
  }
  return out;
}

/**
 * Validates attested schedule fields while preserving the full provider result object.
 */
export function parseOeServiceScheduleEuProviderResult(
  result: Record<string, unknown>,
): OneAutoOeServiceScheduleParseOutcome {
  const vinRaw = result.vehicle_identification_number;
  if (typeof vinRaw !== 'string' || !isValidVin(normalizeVin(vinRaw))) {
    return { kind: 'INVALID_SHAPE', reason: 'missing_or_invalid_vehicle_identification_number' };
  }
  const vehicleIdentificationNumber = normalizeVin(vinRaw)!;

  const normal = parseServiceArray(result, 'normal_services');
  if ('invalid' in normal) {
    return { kind: 'INVALID_SHAPE', reason: normal.reason };
  }
  const extra = parseServiceArray(result, 'extra_services');
  if ('invalid' in extra) {
    return { kind: 'INVALID_SHAPE', reason: extra.reason };
  }

  if (normal.length === 0 && extra.length === 0) {
    return {
      kind: 'SUCCESS_EMPTY_SCHEDULE',
      vehicleIdentificationNumber,
      rawResult: result,
    };
  }

  return {
    kind: 'SUCCESS_WITH_SERVICES',
    vehicleIdentificationNumber,
    normalServices: normal,
    extraServices: extra,
    rawResult: result,
  };
}
