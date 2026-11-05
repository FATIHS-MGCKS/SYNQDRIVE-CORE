import type { OneAutoJobResultResponse } from './oneauto-api.types';

export type ParsedScheduleService = {
  serviceId: string | null;
  intervalLabel: string | null;
  description: string | null;
  workTimeHours: number | null;
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

function parseService(raw: unknown): ParsedScheduleService | null {
  if (!isPlainObject(raw)) return null;
  const tasksRaw = raw.service_tasks;
  const tasks = Array.isArray(tasksRaw)
    ? tasksRaw
        .map((t) => {
          if (!isPlainObject(t)) return null;
          return {
            taskId: typeof t.task_id === 'string' ? t.task_id : null,
            description: typeof t.task_description === 'string' ? t.task_description : null,
            action: typeof t.task_action === 'string' ? t.task_action : null,
            vehiclePosition: typeof t.vehicle_position === 'string' ? t.vehicle_position : null,
          };
        })
        .filter((t): t is NonNullable<typeof t> => t != null)
    : [];

  const partsRaw = raw.service_parts;
  const parts = Array.isArray(partsRaw)
    ? partsRaw
        .map((p) => {
          if (!isPlainObject(p)) return null;
          const attrsRaw = p.part_attributes;
          const attributes = Array.isArray(attrsRaw)
            ? attrsRaw
                .map((a) => {
                  if (!isPlainObject(a)) return null;
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
        .filter((p): p is NonNullable<typeof p> => p != null)
    : [];

  const workTime =
    typeof raw.service_time_hours === 'number' && Number.isFinite(raw.service_time_hours)
      ? raw.service_time_hours
      : null;

  return {
    serviceId: typeof raw.service_id === 'string' ? raw.service_id : null,
    intervalLabel:
      typeof raw.service_interval_desc === 'string' ? raw.service_interval_desc : null,
    description: typeof raw.service_description === 'string' ? raw.service_description : null,
    workTimeHours: workTime,
    tasks,
    parts,
    raw,
  };
}

function parseServiceList(raw: unknown): ParsedScheduleService[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseService).filter((s): s is ParsedScheduleService => s != null);
}

export function parseServiceScheduleFromJobResult(
  result: OneAutoJobResultResponse | null | undefined,
): {
  normalServices: ParsedScheduleService[];
  extraServices: ParsedScheduleService[];
  vin: string | null;
  providerStatus: number | null;
  verifiedEmptySchedule: boolean;
} {
  const body = result?.latestResponse?.responseBodyJson;
  const providerStatus = result?.latestResponse?.httpStatus ?? null;
  const unwrapped = unwrapEnvelope(body);
  if (!unwrapped) {
    return {
      normalServices: [],
      extraServices: [],
      vin: null,
      providerStatus,
      verifiedEmptySchedule: false,
    };
  }
  const vin =
    typeof unwrapped.vehicle_identification_number === 'string'
      ? unwrapped.vehicle_identification_number
      : null;
  if (
    !Object.prototype.hasOwnProperty.call(unwrapped, 'normal_services') ||
    !Object.prototype.hasOwnProperty.call(unwrapped, 'extra_services')
  ) {
    return {
      normalServices: [],
      extraServices: [],
      vin,
      providerStatus,
      verifiedEmptySchedule: false,
    };
  }
  const normalServices = parseServiceList(unwrapped.normal_services);
  const extraServices = parseServiceList(unwrapped.extra_services);
  const verifiedEmptySchedule =
    Array.isArray(unwrapped.normal_services) &&
    Array.isArray(unwrapped.extra_services) &&
    unwrapped.normal_services.length === 0 &&
    unwrapped.extra_services.length === 0;
  return { normalServices, extraServices, vin, providerStatus, verifiedEmptySchedule };
}
