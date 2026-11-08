import { randomUUID } from 'node:crypto';
import { FSD_P6C_FLEET_VEHICLE_LABELS_V1, type FsdP6cFleetManifestV1 } from '../fsd-p6c-fleet-manifest.v1';
import { assertProductionFleetManifestV1 } from '../fsd-p6c-production-manifest-guard.v1';

function productionManifest(
  vehicles: FsdP6cFleetManifestV1['vehicles'],
): FsdP6cFleetManifestV1 {
  return {
    schemaVersion: 'FSD_P6C_FLEET_MANIFEST_V1',
    productionManifest: true,
    organizationId: randomUUID(),
    historicalWindow: { fromUtc: '2026-11-04T04:32:00.000Z', toUtc: '2026-11-04T04:57:37.477Z' },
    budget: {
      maxRequestsPerRun: 64,
      maxHistoricalWindowSeconds: 3600,
      maxSnapshotFieldsPerDocument: 26,
      maxHistoricalFloatFieldsPerChunk: 8,
      maxResponseBytes: 524288,
    },
    vehicles,
  };
}

describe('FSD P6C production manifest identity', () => {
  it('accepts four unique vehicles, links, and stream keys with verified catalog', () => {
    const manifest = productionManifest(
      FSD_P6C_FLEET_VEHICLE_LABELS_V1.map((label, i) => ({
        label,
        vehicleId: randomUUID(),
        providerSourceLinkId: randomUUID(),
        discoveryRequestKey: `prod-discovery-${label}-${i}`,
        historicalRequestKey: `prod-historical-${label}-${i}`,
        declaredFieldNames: ['speed'],
        catalogProvenance: 'VERIFIED_LIVE_CATALOG' as const,
      })),
    );
    expect(() => assertProductionFleetManifestV1(manifest)).not.toThrow();
  });

  it('rejects duplicate vehicle ids and cross-stream request key collision', () => {
    const vid = randomUUID();
    const linkA = randomUUID();
    const linkB = randomUUID();
    const sharedKey = 'shared-request-key';
    const base = FSD_P6C_FLEET_VEHICLE_LABELS_V1.map((label, i) => ({
      label,
      vehicleId: i === 1 ? vid : randomUUID(),
      providerSourceLinkId: i === 1 ? linkA : i === 2 ? linkB : randomUUID(),
      discoveryRequestKey: i === 3 ? sharedKey : `d-${i}`,
      historicalRequestKey: i === 2 ? sharedKey : `h-${i}`,
      declaredFieldNames: ['speed'],
      catalogProvenance: 'VERIFIED_LIVE_CATALOG' as const,
    }));
    base[0]!.vehicleId = vid;
    expect(() => assertProductionFleetManifestV1(productionManifest(base))).toThrow(
      /DUPLICATE_VEHICLE_ID/,
    );

    const streamCollision = productionManifest([
      {
        label: 'tesla_model_3',
        vehicleId: randomUUID(),
        providerSourceLinkId: randomUUID(),
        discoveryRequestKey: 'collision-key',
        historicalRequestKey: 'other',
        declaredFieldNames: ['speed'],
        catalogProvenance: 'VERIFIED_LIVE_CATALOG',
      },
      {
        label: 'vw_tiguan',
        vehicleId: randomUUID(),
        providerSourceLinkId: randomUUID(),
        discoveryRequestKey: 'another',
        historicalRequestKey: 'collision-key',
        declaredFieldNames: ['speed'],
        catalogProvenance: 'VERIFIED_LIVE_CATALOG',
      },
    ]);
    expect(() => assertProductionFleetManifestV1(streamCollision)).toThrow(
      /DUPLICATE_STREAM_REQUEST_KEY/,
    );
  });

  it('rejects non-empty declared fields without verified catalog provenance', () => {
    const manifest = productionManifest([
      {
        label: 'tesla_model_3',
        vehicleId: randomUUID(),
        providerSourceLinkId: randomUUID(),
        discoveryRequestKey: 'd1',
        historicalRequestKey: 'h1',
        declaredFieldNames: ['speed', 'exteriorAirTemperature'],
        catalogProvenance: undefined,
      },
    ]);
    expect(() => assertProductionFleetManifestV1(manifest)).toThrow(/CATALOG_NOT_VERIFIED/);
  });
});
