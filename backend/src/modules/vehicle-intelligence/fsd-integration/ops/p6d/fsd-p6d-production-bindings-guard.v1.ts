import type { FsdP6cFleetManifestV1, FsdP6cFleetVehicleManifestEntryV1 } from '../p6c/fsd-p6c-fleet-manifest.v1';

const PLACEHOLDER_UUID_RE =
  /^00000000-0000-4000-8000-00000000p6c[0-9a-f]*$/i;

function assertNonPlaceholderUuid(field: string, value: string): void {
  if (PLACEHOLDER_UUID_RE.test(value)) {
    throw new Error(`FSD_P6D_PRODUCTION_MANIFEST_PLACEHOLDER_${field}`);
  }
}

function assertRequestKeyProductionSafe(field: string, value: string): void {
  const lower = value.toLowerCase();
  if (lower.includes('offline') || lower.includes('p6c-offline') || lower.startsWith('p6c-pg-')) {
    throw new Error(`FSD_P6D_PRODUCTION_MANIFEST_TEST_KEY_${field}`);
  }
}

function assertVehicleBindings(entry: FsdP6cFleetVehicleManifestEntryV1): void {
  assertNonPlaceholderUuid('vehicleId', entry.vehicleId);
  assertNonPlaceholderUuid('providerSourceLinkId', entry.providerSourceLinkId);
  assertRequestKeyProductionSafe('discoveryRequestKey', entry.discoveryRequestKey);
  assertRequestKeyProductionSafe('historicalRequestKey', entry.historicalRequestKey);
}

/**
 * P6D live paths validate vehicle/stream bindings only — catalog provenance is resolved from evidence, not manifest flags.
 */
export function assertProductionFleetBindingsForLiveV1(manifest: FsdP6cFleetManifestV1): void {
  if (manifest.productionManifest !== true) {
    throw new Error('FSD_P6D_PRODUCTION_MANIFEST_FLAG_REQUIRED');
  }
  assertNonPlaceholderUuid('organizationId', manifest.organizationId);

  const discoveryKeys = new Set<string>();
  const historicalKeys = new Set<string>();
  const vehicleIds = new Set<string>();
  const sourceLinkIds = new Set<string>();

  for (const v of manifest.vehicles) {
    assertVehicleBindings(v);
    if (vehicleIds.has(v.vehicleId)) {
      throw new Error('FSD_P6D_PRODUCTION_DUPLICATE_VEHICLE_ID');
    }
    if (sourceLinkIds.has(v.providerSourceLinkId)) {
      throw new Error('FSD_P6D_PRODUCTION_DUPLICATE_SOURCE_LINK_ID');
    }
    if (discoveryKeys.has(v.discoveryRequestKey) || historicalKeys.has(v.historicalRequestKey)) {
      throw new Error('FSD_P6D_PRODUCTION_DUPLICATE_STREAM_KEY');
    }
    vehicleIds.add(v.vehicleId);
    sourceLinkIds.add(v.providerSourceLinkId);
    discoveryKeys.add(v.discoveryRequestKey);
    historicalKeys.add(v.historicalRequestKey);
  }
}
