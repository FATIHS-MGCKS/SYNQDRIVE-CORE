import type { OneAutoJobResultResponse } from './oneauto-api.types';
import {
  normalizeVinForScheduleCompare,
  validateScheduleResultShape,
  validateScheduleService,
} from './oneauto-service-schedule-field-validation.util';

export type ServiceScheduleResultIntegrity =
  | 'VALID_WITH_SERVICES'
  | 'VALID_EMPTY'
  | 'MALFORMED_OR_PARTIAL'
  | 'VIN_MISMATCH'
  | 'RESPONSE_UNAVAILABLE';

export type ParsedScheduleService = {
  serviceId: string | null;
  intervalLabel: string | null;
  description: string | null;
  workTimeHours: number | null;
  serviceMonths: number | null;
  serviceKms: number | null;
  serviceMiles: number | null;
  tasks: Array<{
    taskId: string | null;
    description: string | null;
    action: string | null;
    vehiclePosition: string | null;
  }>;
  parts: Array<{
    partNumber: string | null;
    description: string | null;
    supplier: string | null;
    grade: string | null;
    oePartNumber: string | null;
    attributes: Array<{ name: string; value: string }>;
  }>;
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

function readOptionalNonNegativeInteger(raw: Record<string, unknown>, key: string): number | null {
  if (!Object.prototype.hasOwnProperty.call(raw, key)) return null;
  const value = raw[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function readOptionalNonNegativeNumber(raw: Record<string, unknown>, key: string): number | null {
  if (!Object.prototype.hasOwnProperty.call(raw, key)) return null;
  const value = raw[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function mapService(raw: Record<string, unknown>): ParsedScheduleService {
  const tasksRaw = raw.service_tasks;
  const tasks = Array.isArray(tasksRaw)
    ? tasksRaw
        .filter(isPlainObject)
        .map((t) => ({
          taskId: typeof t.task_id === 'string' ? t.task_id : null,
          description: typeof t.task_description === 'string' ? t.task_description : null,
          action: typeof t.task_action === 'string' ? t.task_action : null,
          vehiclePosition: typeof t.vehicle_position === 'string' ? t.vehicle_position : null,
        }))
    : [];

  const partsRaw = raw.service_parts;
  const parts = Array.isArray(partsRaw)
    ? partsRaw
        .filter(isPlainObject)
        .map((p) => {
          const attrsRaw = p.part_attributes;
          const attributes = Array.isArray(attrsRaw)
            ? attrsRaw
                .filter(isPlainObject)
                .map((a) => {
                  const name = typeof a.name === 'string' ? a.name : null;
                  const value = typeof a.value === 'string' ? a.value : null;
                  if (!name || value == null) return null;
                  return { name, value };
                })
                .filter((a): a is { name: string; value: string } => a != null)
            : [];
          return {
            partNumber: typeof p.part_number === 'string' ? p.part_number : null,
            description: typeof p.part_desc === 'string' ? p.part_desc : null,
            supplier: typeof p.supplier_desc === 'string' ? p.supplier_desc : null,
            grade: typeof p.part_grade === 'string' ? p.part_grade : null,
            oePartNumber: typeof p.oe_part_number === 'string' ? p.oe_part_number : null,
            attributes,
          };
        })
    : [];

  return {
    serviceId: typeof raw.service_id === 'string' ? raw.service_id : null,
    intervalLabel:
      typeof raw.service_interval_desc === 'string' ? raw.service_interval_desc : null,
    description: typeof raw.service_description === 'string' ? raw.service_description : null,
    workTimeHours: readOptionalNonNegativeNumber(raw, 'service_time_hours'),
    serviceMonths: readOptionalNonNegativeInteger(raw, 'service_months'),
    serviceKms: readOptionalNonNegativeInteger(raw, 'service_kms'),
    serviceMiles: readOptionalNonNegativeInteger(raw, 'service_miles'),
    tasks,
    parts,
    raw,
  };
}

function mapValidatedServiceList(raw: unknown): ParsedScheduleService[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedScheduleService[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    if (validateScheduleService(item)) continue;
    out.push(mapService(item));
  }
  return out;
}

export function parseServiceScheduleFromJobResult(
  result: OneAutoJobResultResponse | null | undefined,
): {
  integrity: ServiceScheduleResultIntegrity;
  integrityReason: string | null;
  normalServices: ParsedScheduleService[];
  extraServices: ParsedScheduleService[];
  vin: string | null;
  providerStatus: number | null;
} {
  const body = result?.latestResponse?.responseBodyJson;
  const providerStatus = result?.latestResponse?.httpStatus ?? null;
  const jobVin = normalizeVinForScheduleCompare(result?.job.vinSnapshot);

  if (!result?.latestResponse || body == null) {
    return {
      integrity: 'RESPONSE_UNAVAILABLE',
      integrityReason: 'no_response',
      normalServices: [],
      extraServices: [],
      vin: null,
      providerStatus,
    };
  }

  const unwrapped = unwrapEnvelope(body);
  if (!unwrapped) {
    return {
      integrity: 'RESPONSE_UNAVAILABLE',
      integrityReason: 'envelope_unreadable',
      normalServices: [],
      extraServices: [],
      vin: null,
      providerStatus,
    };
  }

  const resultVin = normalizeVinForScheduleCompare(
    typeof unwrapped.vehicle_identification_number === 'string'
      ? unwrapped.vehicle_identification_number
      : null,
  );
  if (!resultVin || !jobVin || resultVin !== jobVin) {
    return {
      integrity: 'VIN_MISMATCH',
      integrityReason: 'result_vin_mismatch',
      normalServices: [],
      extraServices: [],
      vin: typeof unwrapped.vehicle_identification_number === 'string'
        ? unwrapped.vehicle_identification_number
        : null,
      providerStatus,
    };
  }

  const shapeErr = validateScheduleResultShape(unwrapped);
  if (shapeErr) {
    return {
      integrity: 'MALFORMED_OR_PARTIAL',
      integrityReason: shapeErr,
      normalServices: [],
      extraServices: [],
      vin: resultVin,
      providerStatus,
    };
  }

  const normalRaw = unwrapped.normal_services;
  const extraRaw = unwrapped.extra_services;
  if (
    Array.isArray(normalRaw) &&
    Array.isArray(extraRaw) &&
    normalRaw.length === 0 &&
    extraRaw.length === 0
  ) {
    return {
      integrity: 'VALID_EMPTY',
      integrityReason: null,
      normalServices: [],
      extraServices: [],
      vin: resultVin,
      providerStatus,
    };
  }

  return {
    integrity: 'VALID_WITH_SERVICES',
    integrityReason: null,
    normalServices: mapValidatedServiceList(normalRaw),
    extraServices: mapValidatedServiceList(extraRaw),
    vin: resultVin,
    providerStatus,
  };
}
