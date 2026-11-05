function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function validateOptionalString(obj: Record<string, unknown>, key: string): string | null {
  if (!hasOwn(obj, key)) return null;
  const value = obj[key];
  if (typeof value !== 'string') return `${key}_not_string`;
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

export function validateOeServiceSchedulePartAttributes(raw: unknown): string | null {
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

export function validateOeServiceScheduleTask(raw: unknown): string | null {
  if (!isPlainObject(raw)) return 'task_not_object';
  return (
    validateOptionalString(raw, 'task_id') ??
    validateOptionalString(raw, 'task_description') ??
    validateOptionalString(raw, 'task_action') ??
    validateOptionalString(raw, 'vehicle_position')
  );
}

export function validateOeServiceSchedulePart(raw: unknown): string | null {
  if (!isPlainObject(raw)) return 'part_not_object';
  const stringFields = [
    'part_number',
    'part_desc',
    'supplier_desc',
    'part_grade',
    'oe_part_number',
    'service_id',
  ] as const;
  for (const key of stringFields) {
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
    const attrErr = validateOeServiceSchedulePartAttributes(raw.part_attributes);
    if (attrErr) return attrErr;
  }
  return null;
}

export function validateOeServiceScheduleService(raw: unknown): string | null {
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
    const tasks = raw.service_tasks;
    if (!Array.isArray(tasks)) return 'service_tasks_not_array';
    for (let i = 0; i < tasks.length; i += 1) {
      const taskErr = validateOeServiceScheduleTask(tasks[i]);
      if (taskErr) return `service_tasks[${i}].${taskErr}`;
    }
  }

  if (hasOwn(raw, 'service_parts')) {
    const parts = raw.service_parts;
    if (!Array.isArray(parts)) return 'service_parts_not_array';
    for (let i = 0; i < parts.length; i += 1) {
      const partErr = validateOeServiceSchedulePart(parts[i]);
      if (partErr) return `service_parts[${i}].${partErr}`;
    }
  }

  return null;
}

export function validateOeServiceScheduleServiceArray(
  raw: unknown,
  key: 'normal_services' | 'extra_services',
): string | null {
  if (!Array.isArray(raw)) return `${key}_not_array`;
  for (let i = 0; i < raw.length; i += 1) {
    const serviceErr = validateOeServiceScheduleService(raw[i]);
    if (serviceErr) return `${key}[${i}].${serviceErr}`;
  }
  return null;
}
