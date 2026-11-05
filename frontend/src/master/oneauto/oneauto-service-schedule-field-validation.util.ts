/**
 * Keep aligned with backend `oneauto-oe-service-schedule-field-validation.util.ts`.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function validateOptionalString(obj: Record<string, unknown>, key: string): string | null {
  if (!hasOwn(obj, key)) return null;
  if (typeof obj[key] !== 'string') return `${key}_not_string`;
  return null;
}

function validateOptionalNonNegativeInteger(obj: Record<string, unknown>, key: string): string | null {
  if (!hasOwn(obj, key)) return null;
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return `${key}_invalid`;
  }
  return null;
}

function validateOptionalNonNegativeNumber(obj: Record<string, unknown>, key: string): string | null {
  if (!hasOwn(obj, key)) return null;
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return `${key}_invalid`;
  }
  return null;
}

function validatePartAttributes(raw: unknown): string | null {
  if (!Array.isArray(raw)) return 'part_attributes_not_array';
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (!isPlainObject(item)) return `part_attributes[${i}]_not_object`;
    if (hasOwn(item, 'name') && typeof item.name !== 'string') {
      return `part_attributes[${i}].name_not_string`;
    }
    if (hasOwn(item, 'value') && typeof item.value !== 'string') {
      return `part_attributes[${i}].value_not_string`;
    }
  }
  return null;
}

function validateTask(raw: unknown): string | null {
  if (!isPlainObject(raw)) return 'task_not_object';
  return (
    validateOptionalString(raw, 'task_id') ??
    validateOptionalString(raw, 'task_description') ??
    validateOptionalString(raw, 'task_action') ??
    validateOptionalString(raw, 'vehicle_position')
  );
}

function validatePart(raw: unknown): string | null {
  if (!isPlainObject(raw)) return 'part_not_object';
  for (const key of [
    'part_number',
    'part_desc',
    'supplier_desc',
    'part_grade',
    'oe_part_number',
    'service_id',
  ] as const) {
    const err = validateOptionalString(raw, key);
    if (err) return err;
  }
  if (hasOwn(raw, 'supplier_id')) {
    const sid = raw.supplier_id;
    if (typeof sid !== 'number' || !Number.isInteger(sid) || sid < 0) {
      return 'supplier_id_invalid';
    }
  }
  if (hasOwn(raw, 'part_attributes')) {
    const attrErr = validatePartAttributes(raw.part_attributes);
    if (attrErr) return attrErr;
  }
  return null;
}

export function validateScheduleService(raw: unknown): string | null {
  if (!isPlainObject(raw)) return 'service_not_object';
  const err =
    validateOptionalString(raw, 'service_id') ??
    validateOptionalString(raw, 'service_interval_desc') ??
    validateOptionalString(raw, 'service_description') ??
    validateOptionalNonNegativeInteger(raw, 'service_months') ??
    validateOptionalNonNegativeInteger(raw, 'service_kms') ??
    validateOptionalNonNegativeInteger(raw, 'service_miles') ??
    validateOptionalNonNegativeNumber(raw, 'service_time_hours');
  if (err) return err;

  if (hasOwn(raw, 'service_tasks')) {
    if (!Array.isArray(raw.service_tasks)) return 'service_tasks_not_array';
    for (let i = 0; i < raw.service_tasks.length; i += 1) {
      const taskErr = validateTask(raw.service_tasks[i]);
      if (taskErr) return `service_tasks[${i}].${taskErr}`;
    }
  }

  if (hasOwn(raw, 'service_parts')) {
    if (!Array.isArray(raw.service_parts)) return 'service_parts_not_array';
    for (let i = 0; i < raw.service_parts.length; i += 1) {
      const partErr = validatePart(raw.service_parts[i]);
      if (partErr) return `service_parts[${i}].${partErr}`;
    }
  }

  return null;
}

export function validateScheduleResultShape(result: Record<string, unknown>): string | null {
  if (!hasOwn(result, 'normal_services') || !hasOwn(result, 'extra_services')) {
    return 'missing_service_arrays';
  }
  const normalErr = validateScheduleServiceArray(result.normal_services, 'normal_services');
  if (normalErr) return normalErr;
  return validateScheduleServiceArray(result.extra_services, 'extra_services');
}

function validateScheduleServiceArray(raw: unknown, key: string): string | null {
  if (!Array.isArray(raw)) return `${key}_not_array`;
  for (let i = 0; i < raw.length; i += 1) {
    const serviceErr = validateScheduleService(raw[i]);
    if (serviceErr) return `${key}[${i}].${serviceErr}`;
  }
  return null;
}

export function normalizeVinForScheduleCompare(vin: string | null | undefined): string | null {
  const normalized = (vin ?? '').trim().toUpperCase();
  if (normalized.length !== 17) return null;
  if (/[IOQ]/.test(normalized)) return null;
  return normalized;
}
