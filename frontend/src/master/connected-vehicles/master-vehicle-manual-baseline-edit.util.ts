import { api } from '../../lib/api';
import { normalizeLvBatteryTypeInput } from './vehicle-specification-canonical.util';

export type ManualBatteryPayload = {
  batteryType?: string | null;
  batteryAmpere?: number | null;
  batteryVolt?: number | null;
};

export type ManualBrakeReferencePayload = {
  frontPadThickness?: number | null;
  rearPadThickness?: number | null;
  frontRotorDiameter?: number | null;
  rearRotorDiameter?: number | null;
  frontRotorWidth?: number | null;
  rearRotorWidth?: number | null;
};

type BatterySpecRow = {
  id?: string;
  sourceType?: string | null;
  createdAt?: string | Date | null;
};

type BrakeSpecRow = {
  id?: string;
  userConfirmedAt?: string | Date | null;
  createdAt?: string | Date | null;
};

function createdAtMs(value: string | Date | null | undefined): number {
  if (value == null) return 0;
  const t = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(t) ? t : 0;
}

/** Picks the LV spec row Master edit should update (prefer MANUAL, then newest). */
export function pickLvBatterySpecRowForEdit(rows: BatterySpecRow[]): BatterySpecRow | null {
  if (!rows.length) return null;
  const manual = rows.filter((r) => String(r.sourceType ?? '').toUpperCase() === 'MANUAL');
  const pool = manual.length > 0 ? manual : rows;
  return [...pool].sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt))[0] ?? null;
}

/** Picks brake reference row to update (prefer user-confirmed, then newest). */
export function pickBrakeReferenceSpecRowForEdit(rows: BrakeSpecRow[]): BrakeSpecRow | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => {
    const aConfirmed = a.userConfirmedAt != null ? 1 : 0;
    const bConfirmed = b.userConfirmedAt != null ? 1 : 0;
    if (bConfirmed !== aConfirmed) return bConfirmed - aConfirmed;
    return createdAtMs(b.createdAt) - createdAtMs(a.createdAt);
  })[0] ?? null;
}

function normalizeBatteryList(raw: unknown): BatterySpecRow[] {
  return Array.isArray(raw) ? (raw as BatterySpecRow[]) : [];
}

function normalizeBrakeList(raw: unknown): BrakeSpecRow[] {
  return Array.isArray(raw) ? (raw as BrakeSpecRow[]) : [];
}

export async function upsertLvBatterySpecOnEdit(
  vehicleId: string,
  battery: ManualBatteryPayload,
): Promise<void> {
  const normalizedType = normalizeLvBatteryTypeInput(battery.batteryType);
  const hasNumbers =
    battery.batteryAmpere != null ||
    battery.batteryVolt != null ||
    String(battery.batteryAmpere ?? '').trim() !== '' ||
    String(battery.batteryVolt ?? '').trim() !== '';
  if (hasNumbers && !normalizedType) {
    return;
  }
  if (!normalizedType) {
    return;
  }
  const payload = {
    batteryType: normalizedType,
    batteryAmpere: battery.batteryAmpere ?? null,
    batteryVolt: battery.batteryVolt ?? null,
    sourceType: 'MANUAL' as const,
    sourceConfidence: 1,
  };
  const existingRows = normalizeBatteryList(await api.vehicleIntelligence.battery(vehicleId));
  const existing = pickLvBatterySpecRowForEdit(existingRows);
  if (existing?.id) {
    await api.vehicleIntelligence.updateBatterySpec(vehicleId, existing.id, payload);
    return;
  }
  await api.vehicleIntelligence.createBatterySpec(vehicleId, payload);
}

export async function upsertBrakeReferenceSpecOnEdit(
  vehicleId: string,
  brakes: ManualBrakeReferencePayload,
): Promise<void> {
  const dimensionPayload = {
    frontPadThickness: brakes.frontPadThickness ?? undefined,
    rearPadThickness: brakes.rearPadThickness ?? undefined,
    frontRotorDiameter: brakes.frontRotorDiameter ?? undefined,
    rearRotorDiameter: brakes.rearRotorDiameter ?? undefined,
    frontRotorWidth: brakes.frontRotorWidth ?? undefined,
    rearRotorWidth: brakes.rearRotorWidth ?? undefined,
    sourceConfidence: 1,
  };
  const existingRows = normalizeBrakeList(await api.vehicleIntelligence.brakes(vehicleId));
  const existing = pickBrakeReferenceSpecRowForEdit(existingRows);
  if (existing?.id) {
    const body =
      existing.userConfirmedAt != null
        ? dimensionPayload
        : { ...dimensionPayload, sourceType: 'manual_edit' };
    await api.vehicleIntelligence.updateBrakeSpec(vehicleId, existing.id, body);
    return;
  }
  await api.vehicleIntelligence.createBrakeSpec(vehicleId, {
    ...dimensionPayload,
    sourceType: 'manual_edit',
  });
}
