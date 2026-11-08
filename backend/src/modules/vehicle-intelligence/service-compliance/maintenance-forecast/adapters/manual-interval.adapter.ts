import type { MaintenanceMasterDataBaselines, MaintenanceSchedulePosition } from '../maintenance-forecast.types';

export interface ManualIntervalVehicleFields {
  serviceIntervalManufacturerKm: number | null;
  serviceIntervalManufacturerMonths: number | null;
  serviceIntervalKm: number | null;
  serviceIntervalMonths: number | null;
  oilChangeIntervalKm: number | null;
  oilChangeIntervalMonths: number | null;
  lastServiceDate: Date | null;
  lastServiceOdometerKm: number | null;
  lastOilChangeDate: Date | null;
  lastOilChangeOdometerKm: number | null;
}

export const MANUAL_INSPECTION_POSITION_ID = 'manual:inspection';
export const MANUAL_OIL_CHANGE_POSITION_ID = 'manual:oil_change';

function positive(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

/**
 * User-maintained intervals on the vehicle record → canonical positions.
 * Manufacturer interval fields take precedence over the generic fields.
 * Positions whose kind is already covered by `excludeKinds` (e.g. an OneAuto plan) are skipped.
 */
export function mapManualIntervalsToPositions(
  vehicle: ManualIntervalVehicleFields,
  excludeKinds: ReadonlySet<string> = new Set(),
): MaintenanceSchedulePosition[] {
  const out: MaintenanceSchedulePosition[] = [];

  const inspectionKm = positive(vehicle.serviceIntervalManufacturerKm) ?? positive(vehicle.serviceIntervalKm);
  const inspectionMonths =
    positive(vehicle.serviceIntervalManufacturerMonths) ?? positive(vehicle.serviceIntervalMonths);
  if ((inspectionKm != null || inspectionMonths != null) && !excludeKinds.has('INSPECTION')) {
    out.push({
      positionId: MANUAL_INSPECTION_POSITION_ID,
      kind: 'INSPECTION',
      label: 'INSPECTION',
      intervalMode: 'RECURRING',
      intervalKm: inspectionKm,
      intervalMonths: inspectionMonths,
      componentTerms: [],
      scheduleSource: 'MANUAL_INTERVAL',
      rawIntervalDescription: null,
    });
  }

  const oilKm = positive(vehicle.oilChangeIntervalKm);
  const oilMonths = positive(vehicle.oilChangeIntervalMonths);
  if ((oilKm != null || oilMonths != null) && !excludeKinds.has('OIL_CHANGE')) {
    out.push({
      positionId: MANUAL_OIL_CHANGE_POSITION_ID,
      kind: 'OIL_CHANGE',
      label: 'OIL_CHANGE',
      intervalMode: 'RECURRING',
      intervalKm: oilKm,
      intervalMonths: oilMonths,
      componentTerms: [],
      scheduleSource: 'MANUAL_INTERVAL',
      rawIntervalDescription: null,
    });
  }

  return out;
}

export function masterDataBaselinesFromVehicle(
  vehicle: ManualIntervalVehicleFields,
): MaintenanceMasterDataBaselines | null {
  const inspection = { date: vehicle.lastServiceDate ?? null, odometerKm: vehicle.lastServiceOdometerKm ?? null };
  const oilChange = { date: vehicle.lastOilChangeDate ?? null, odometerKm: vehicle.lastOilChangeOdometerKm ?? null };
  const any =
    inspection.date || inspection.odometerKm != null || oilChange.date || oilChange.odometerKm != null;
  return any ? { inspection, oilChange } : null;
}
