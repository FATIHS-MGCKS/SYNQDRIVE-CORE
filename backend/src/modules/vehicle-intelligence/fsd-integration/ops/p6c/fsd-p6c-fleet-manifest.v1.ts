import {
  createDefaultFsdBudgetConfigV1,
  normalizeFsdBudgetConfigV1,
  type FsdBudgetConfigV1,
} from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';
import type { FsdHistoricalWindowV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-query-document.builder.v1';

export const FSD_P6C_FLEET_MANIFEST_SCHEMA_V1 = 'FSD_P6C_FLEET_MANIFEST_V1' as const;

export const FSD_P6C_FLEET_VEHICLE_LABELS_V1 = [
  'tesla_model_3',
  'vw_tiguan',
  'audi_a4',
  'vw_arteon',
] as const;

export type FsdP6cFleetVehicleLabelV1 = (typeof FSD_P6C_FLEET_VEHICLE_LABELS_V1)[number];

export type FsdP6cFleetVehicleManifestEntryV1 = {
  label: FsdP6cFleetVehicleLabelV1;
  vehicleId: string;
  providerSourceLinkId: string;
  declaredFieldNames: readonly string[];
  discoveryRequestKey: string;
  historicalRequestKey: string;
};

export type FsdP6cFleetManifestV1 = {
  schemaVersion: typeof FSD_P6C_FLEET_MANIFEST_SCHEMA_V1;
  organizationId: string;
  historicalWindow: FsdHistoricalWindowV1;
  budget: FsdBudgetConfigV1;
  vehicles: readonly FsdP6cFleetVehicleManifestEntryV1[];
  /** CI/offline only — enables reference profile hydration under OFFLINE_PLAN gates. */
  offlineFixtureHydration?: boolean;
  /** Required true for production preflight/execute paths. */
  productionManifest?: boolean;
  /**
   * Disclosure-only ceiling for sequential fleet planning (sum of per-vehicle planned requests).
   * Does not override per-run orchestration budgets.
   */
  fleetPlannedRequestDisclosureCap?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function parseHistoricalWindow(raw: unknown): FsdHistoricalWindowV1 {
  if (!isRecord(raw) || typeof raw.fromUtc !== 'string' || typeof raw.toUtc !== 'string') {
    throw new Error('FSD_P6C_MANIFEST_INVALID_HISTORICAL_WINDOW');
  }
  return { fromUtc: raw.fromUtc.trim(), toUtc: raw.toUtc.trim() };
}

function parseBudget(raw: unknown): FsdBudgetConfigV1 {
  if (!isRecord(raw)) {
    return createDefaultFsdBudgetConfigV1();
  }
  return normalizeFsdBudgetConfigV1({
    maxRequestsPerRun: Number(raw.maxRequestsPerRun),
    maxHistoricalWindowSeconds: Number(raw.maxHistoricalWindowSeconds),
    maxSnapshotFieldsPerDocument: Number(raw.maxSnapshotFieldsPerDocument),
    maxHistoricalFloatFieldsPerChunk: Number(raw.maxHistoricalFloatFieldsPerChunk),
    maxResponseBytes: Number(raw.maxResponseBytes),
  });
}

function parseVehicleLabel(raw: unknown): FsdP6cFleetVehicleLabelV1 {
  if (typeof raw !== 'string') {
    throw new Error('FSD_P6C_MANIFEST_INVALID_VEHICLE_LABEL');
  }
  if (!(FSD_P6C_FLEET_VEHICLE_LABELS_V1 as readonly string[]).includes(raw)) {
    throw new Error('FSD_P6C_MANIFEST_UNKNOWN_VEHICLE_LABEL');
  }
  return raw as FsdP6cFleetVehicleLabelV1;
}

function parseVehicleEntry(raw: unknown, index: number): FsdP6cFleetVehicleManifestEntryV1 {
  if (!isRecord(raw)) {
    throw new Error(`FSD_P6C_MANIFEST_INVALID_VEHICLE_${index}`);
  }
  const declared = raw.declaredFieldNames;
  if (!Array.isArray(declared)) {
    throw new Error(`FSD_P6C_MANIFEST_INVALID_DECLARED_FIELDS_${index}`);
  }
  const fields = declared.map((f) => {
    if (typeof f !== 'string' || !f.trim()) {
      throw new Error(`FSD_P6C_MANIFEST_INVALID_FIELD_NAME_${index}`);
    }
    return f.trim();
  });

  const discoveryRequestKey = raw.discoveryRequestKey;
  const historicalRequestKey = raw.historicalRequestKey;
  const vehicleId = raw.vehicleId;
  const providerSourceLinkId = raw.providerSourceLinkId;
  if (
    typeof discoveryRequestKey !== 'string' ||
    !discoveryRequestKey.trim() ||
    typeof historicalRequestKey !== 'string' ||
    !historicalRequestKey.trim() ||
    typeof vehicleId !== 'string' ||
    !vehicleId.trim() ||
    typeof providerSourceLinkId !== 'string' ||
    !providerSourceLinkId.trim()
  ) {
    throw new Error(`FSD_P6C_MANIFEST_INVALID_VEHICLE_SCOPE_${index}`);
  }

  return {
    label: parseVehicleLabel(raw.label),
    vehicleId: vehicleId.trim(),
    providerSourceLinkId: providerSourceLinkId.trim(),
    declaredFieldNames: fields,
    discoveryRequestKey: discoveryRequestKey.trim(),
    historicalRequestKey: historicalRequestKey.trim(),
  };
}

export function parseFsdP6cFleetManifestV1(raw: unknown): FsdP6cFleetManifestV1 {
  if (!isRecord(raw)) {
    throw new Error('FSD_P6C_MANIFEST_NOT_OBJECT');
  }
  if (raw.schemaVersion !== FSD_P6C_FLEET_MANIFEST_SCHEMA_V1) {
    throw new Error('FSD_P6C_MANIFEST_SCHEMA_MISMATCH');
  }
  const organizationId = raw.organizationId;
  if (typeof organizationId !== 'string' || !organizationId.trim()) {
    throw new Error('FSD_P6C_MANIFEST_INVALID_ORGANIZATION');
  }
  const vehiclesRaw = raw.vehicles;
  if (!Array.isArray(vehiclesRaw) || vehiclesRaw.length === 0) {
    throw new Error('FSD_P6C_MANIFEST_EMPTY_VEHICLES');
  }
  const vehicles = vehiclesRaw.map((v, i) => parseVehicleEntry(v, i));

  const labels = new Set(vehicles.map((v) => v.label));
  if (labels.size !== vehicles.length) {
    throw new Error('FSD_P6C_MANIFEST_DUPLICATE_VEHICLE_LABEL');
  }

  const fleetCap =
    raw.fleetPlannedRequestDisclosureCap != null
      ? Number(raw.fleetPlannedRequestDisclosureCap)
      : undefined;

  return {
    schemaVersion: FSD_P6C_FLEET_MANIFEST_SCHEMA_V1,
    organizationId: organizationId.trim(),
    historicalWindow: parseHistoricalWindow(raw.historicalWindow),
    budget: parseBudget(raw.budget),
    vehicles,
    offlineFixtureHydration: raw.offlineFixtureHydration === true ? true : undefined,
    productionManifest: raw.productionManifest === true ? true : undefined,
    fleetPlannedRequestDisclosureCap:
      fleetCap != null && Number.isFinite(fleetCap) && fleetCap > 0 ? Math.floor(fleetCap) : undefined,
  };
}

export function assertFsdP6cFleetManifestOrderV1(manifest: FsdP6cFleetManifestV1): void {
  const order = manifest.vehicles.map((v) => v.label);
  const expected = [...FSD_P6C_FLEET_VEHICLE_LABELS_V1];
  if (order.length !== expected.length) {
    throw new Error('FSD_P6C_MANIFEST_FLEET_SIZE_MISMATCH');
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (order[i] !== expected[i]) {
      throw new Error('FSD_P6C_MANIFEST_VEHICLE_ORDER_MISMATCH');
    }
  }
}
