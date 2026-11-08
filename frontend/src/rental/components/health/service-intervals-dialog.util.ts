/** Vehicle maintenance interval fields (org vehicle PATCH). */
export type VehicleIntervalSnapshot = {
  serviceIntervalManufacturerKm: number | null;
  serviceIntervalManufacturerMonths: number | null;
  serviceIntervalKm: number | null;
  serviceIntervalMonths: number | null;
  oilChangeIntervalKm: number | null;
  oilChangeIntervalMonths: number | null;
};

export type IntervalFormValues = {
  serviceIntervalKm: string;
  serviceIntervalMonths: string;
  oilChangeIntervalKm: string;
  oilChangeIntervalMonths: string;
};

export type IntervalFormField = keyof IntervalFormValues;

function positiveInt(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function numOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

export function snapshotFromVehicle(raw: Record<string, unknown>): VehicleIntervalSnapshot {
  return {
    serviceIntervalManufacturerKm: numOrNull(raw.serviceIntervalManufacturerKm),
    serviceIntervalManufacturerMonths: numOrNull(raw.serviceIntervalManufacturerMonths),
    serviceIntervalKm: numOrNull(raw.serviceIntervalKm),
    serviceIntervalMonths: numOrNull(raw.serviceIntervalMonths),
    oilChangeIntervalKm: numOrNull(raw.oilChangeIntervalKm),
    oilChangeIntervalMonths: numOrNull(raw.oilChangeIntervalMonths),
  };
}

/** Effective inspection interval for display (manufacturer overrides generic). */
export function inspectionIntervalLane(snapshot: VehicleIntervalSnapshot): {
  usesManufacturer: boolean;
  km: number | null;
  months: number | null;
} {
  const usesManufacturer =
    snapshot.serviceIntervalManufacturerKm != null || snapshot.serviceIntervalManufacturerMonths != null;
  return {
    usesManufacturer,
    km: snapshot.serviceIntervalManufacturerKm ?? snapshot.serviceIntervalKm,
    months: snapshot.serviceIntervalManufacturerMonths ?? snapshot.serviceIntervalMonths,
  };
}

export function formValuesFromSnapshot(snapshot: VehicleIntervalSnapshot): IntervalFormValues {
  const inspection = inspectionIntervalLane(snapshot);
  return {
    serviceIntervalKm: inspection.km != null ? String(inspection.km) : '',
    serviceIntervalMonths: inspection.months != null ? String(inspection.months) : '',
    oilChangeIntervalKm: snapshot.oilChangeIntervalKm != null ? String(snapshot.oilChangeIntervalKm) : '',
    oilChangeIntervalMonths: snapshot.oilChangeIntervalMonths != null ? String(snapshot.oilChangeIntervalMonths) : '',
  };
}

/**
 * Builds a partial vehicle PATCH: only keys the user changed (`dirty`), never untouched
 * manufacturer or oil fields.
 */
export function buildPartialIntervalPatch(
  loaded: VehicleIntervalSnapshot,
  values: IntervalFormValues,
  dirty: ReadonlySet<IntervalFormField>,
): Record<string, number | null> {
  const patch: Record<string, number | null> = {};
  const inspection = inspectionIntervalLane(loaded);

  if (dirty.has('serviceIntervalKm')) {
    const key = inspection.usesManufacturer ? 'serviceIntervalManufacturerKm' : 'serviceIntervalKm';
    patch[key] = positiveInt(values.serviceIntervalKm);
  }
  if (dirty.has('serviceIntervalMonths')) {
    const key = inspection.usesManufacturer ? 'serviceIntervalManufacturerMonths' : 'serviceIntervalMonths';
    patch[key] = positiveInt(values.serviceIntervalMonths);
  }
  if (dirty.has('oilChangeIntervalKm')) {
    patch.oilChangeIntervalKm = positiveInt(values.oilChangeIntervalKm);
  }
  if (dirty.has('oilChangeIntervalMonths')) {
    patch.oilChangeIntervalMonths = positiveInt(values.oilChangeIntervalMonths);
  }
  return patch;
}
