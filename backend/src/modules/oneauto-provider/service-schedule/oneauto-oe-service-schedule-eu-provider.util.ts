import { isValidVin, normalizeVin } from '../client/oneauto-vin.util';
import { extractProviderResultVin } from '../attestation/oneauto-sandbox-attestation-result-capture.util';
import {
  ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
  type OneAutoOeServiceSchedulePart,
  type OneAutoOeServiceScheduleParseOutcome,
  type OneAutoOeServiceScheduleService,
  type OneAutoOeServiceScheduleTask,
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

function normalizeTask(raw: unknown): OneAutoOeServiceScheduleTask | null {
  if (!isPlainObject(raw)) return null;
  return raw as OneAutoOeServiceScheduleTask;
}

function normalizePart(raw: unknown): OneAutoOeServiceSchedulePart | null {
  if (!isPlainObject(raw)) return null;
  return raw as OneAutoOeServiceSchedulePart;
}

function normalizeService(raw: unknown): OneAutoOeServiceScheduleService | null {
  if (!isPlainObject(raw)) return null;
  const service = { ...raw } as OneAutoOeServiceScheduleService;

  if (Object.prototype.hasOwnProperty.call(raw, 'service_tasks')) {
    const tasksRaw = raw.service_tasks;
    if (!Array.isArray(tasksRaw)) {
      return null;
    }
    const tasks: OneAutoOeServiceScheduleTask[] = [];
    for (const item of tasksRaw) {
      const task = normalizeTask(item);
      if (!task) return null;
      tasks.push(task);
    }
    service.service_tasks = tasks;
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'service_parts')) {
    const partsRaw = raw.service_parts;
    if (!Array.isArray(partsRaw)) {
      return null;
    }
    const parts: OneAutoOeServiceSchedulePart[] = [];
    for (const item of partsRaw) {
      const part = normalizePart(item);
      if (!part) return null;
      parts.push(part);
    }
    service.service_parts = parts;
  }

  return service;
}

function parseServiceArray(
  result: Record<string, unknown>,
  key: 'normal_services' | 'extra_services',
): OneAutoOeServiceScheduleService[] | 'INVALID' {
  if (!Object.prototype.hasOwnProperty.call(result, key)) {
    return 'INVALID';
  }
  const raw = result[key];
  if (!Array.isArray(raw)) {
    return 'INVALID';
  }
  const out: OneAutoOeServiceScheduleService[] = [];
  for (const item of raw) {
    const normalized = normalizeService(item);
    if (!normalized) return 'INVALID';
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
  if (normal === 'INVALID') {
    return { kind: 'INVALID_SHAPE', reason: 'normal_services_not_array' };
  }
  const extra = parseServiceArray(result, 'extra_services');
  if (extra === 'INVALID') {
    return { kind: 'INVALID_SHAPE', reason: 'extra_services_not_array' };
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
