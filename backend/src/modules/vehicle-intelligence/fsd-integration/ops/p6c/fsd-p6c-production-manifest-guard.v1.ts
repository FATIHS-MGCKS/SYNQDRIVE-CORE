import type { FsdP6cFleetManifestV1, FsdP6cFleetVehicleManifestEntryV1 } from './fsd-p6c-fleet-manifest.v1';

const PLACEHOLDER_UUID_RE =
  /^00000000-0000-4000-8000-00000000p6c[0-9a-f]*$/i;

function assertNonPlaceholderUuid(field: string, value: string): void {
  if (PLACEHOLDER_UUID_RE.test(value)) {
    throw new Error(`FSD_P6C_PRODUCTION_MANIFEST_PLACEHOLDER_${field}`);
  }
}

function assertRequestKeyProductionSafe(field: string, value: string): void {
  const lower = value.toLowerCase();
  if (lower.includes('offline') || lower.includes('p6c-offline') || lower.startsWith('p6c-pg-')) {
    throw new Error(`FSD_P6C_PRODUCTION_MANIFEST_TEST_KEY_${field}`);
  }
}

function assertVehicleProductionReady(entry: FsdP6cFleetVehicleManifestEntryV1, index: number): void {
  if (entry.catalogProvenance !== 'VERIFIED_LIVE_CATALOG') {
    throw new Error(`FSD_P6C_PRODUCTION_CATALOG_NOT_VERIFIED_${index}`);
  }
  if (entry.declaredFieldNames.length === 0) {
    throw new Error(`FSD_P6C_PRODUCTION_CATALOG_PENDING_VEHICLE_${index}`);
  }
  assertNonPlaceholderUuid('vehicleId', entry.vehicleId);
  assertNonPlaceholderUuid('providerSourceLinkId', entry.providerSourceLinkId);
  assertRequestKeyProductionSafe('discoveryRequestKey', entry.discoveryRequestKey);
  assertRequestKeyProductionSafe('historicalRequestKey', entry.historicalRequestKey);
}

/**
 * Production preflight/execute manifests must not use CI placeholders, test keys, or unverified catalog lists.
 */
export function assertProductionFleetManifestV1(manifest: FsdP6cFleetManifestV1): void {
  if (manifest.offlineFixtureHydration === true) {
    throw new Error('FSD_P6C_PRODUCTION_MANIFEST_OFFLINE_FIXTURE_FLAG');
  }
  if (manifest.productionManifest !== true) {
    throw new Error('FSD_P6C_PRODUCTION_MANIFEST_FLAG_REQUIRED');
  }
  assertNonPlaceholderUuid('organizationId', manifest.organizationId);

  const discoveryKeys = new Set<string>();
  const historicalKeys = new Set<string>();
  const streamKeys = new Set<string>();
  const vehicleIds = new Set<string>();
  const sourceLinkIds = new Set<string>();
  const vehicleIdToLinkId = new Map<string, string>();

  manifest.vehicles.forEach((v, i) => {
    assertVehicleProductionReady(v, i);

    if (vehicleIds.has(v.vehicleId)) {
      throw new Error('FSD_P6C_PRODUCTION_DUPLICATE_VEHICLE_ID');
    }
    if (sourceLinkIds.has(v.providerSourceLinkId)) {
      throw new Error('FSD_P6C_PRODUCTION_DUPLICATE_SOURCE_LINK_ID');
    }
    const priorLink = vehicleIdToLinkId.get(v.vehicleId);
    if (priorLink != null && priorLink !== v.providerSourceLinkId) {
      throw new Error('FSD_P6C_PRODUCTION_VEHICLE_ID_COLLISION');
    }
    vehicleIdToLinkId.set(v.vehicleId, v.providerSourceLinkId);

    if (discoveryKeys.has(v.discoveryRequestKey)) {
      throw new Error('FSD_P6C_PRODUCTION_DUPLICATE_DISCOVERY_REQUEST_KEY');
    }
    if (historicalKeys.has(v.historicalRequestKey)) {
      throw new Error('FSD_P6C_PRODUCTION_DUPLICATE_HISTORICAL_REQUEST_KEY');
    }
    if (streamKeys.has(v.discoveryRequestKey) || streamKeys.has(v.historicalRequestKey)) {
      throw new Error('FSD_P6C_PRODUCTION_DUPLICATE_STREAM_REQUEST_KEY');
    }

    vehicleIds.add(v.vehicleId);
    sourceLinkIds.add(v.providerSourceLinkId);
    discoveryKeys.add(v.discoveryRequestKey);
    historicalKeys.add(v.historicalRequestKey);
    streamKeys.add(v.discoveryRequestKey);
    streamKeys.add(v.historicalRequestKey);
  });
}
