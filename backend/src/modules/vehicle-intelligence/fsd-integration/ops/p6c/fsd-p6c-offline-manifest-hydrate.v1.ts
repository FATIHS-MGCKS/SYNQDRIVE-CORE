import type { FsdP6cFleetManifestV1 } from './fsd-p6c-fleet-manifest.v1';
import { resolveFsdP6cOfflineDeclaredFieldNamesV1 } from './fsd-p6c-fleet-vehicle-profiles.v1';

/** Fills empty declaredFieldNames from offline reference profiles (CI / OFFLINE_PLAN only). */
export function hydrateFsdP6cOfflineFleetManifestV1(manifest: FsdP6cFleetManifestV1): FsdP6cFleetManifestV1 {
  return {
    ...manifest,
    vehicles: manifest.vehicles.map((v) => ({
      ...v,
      declaredFieldNames:
        v.declaredFieldNames.length > 0 ?
          v.declaredFieldNames
        : [...resolveFsdP6cOfflineDeclaredFieldNamesV1(v.label)],
    })),
  };
}
