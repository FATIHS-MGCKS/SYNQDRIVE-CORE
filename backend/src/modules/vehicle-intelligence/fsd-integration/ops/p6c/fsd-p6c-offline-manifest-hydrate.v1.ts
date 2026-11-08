import type { FsdP6cFleetManifestV1 } from './fsd-p6c-fleet-manifest.v1';
import { resolveFsdP6cOfflineDeclaredFieldNamesV1 } from './fsd-p6c-fleet-vehicle-profiles.v1';

export const FSD_P6C_OFFLINE_FIXTURE_HYDRATION_ENV = 'FSD_P6C_OFFLINE_FIXTURE_HYDRATION' as const;

/**
 * Fills empty declaredFieldNames from offline reference profiles.
 * Allowed only when manifest.offlineFixtureHydration=true and caller opts in (OFFLINE_PLAN + test env).
 */
export function hydrateFsdP6cOfflineFleetManifestV1(
  manifest: FsdP6cFleetManifestV1,
  input: { allowHydration: boolean; env?: NodeJS.ProcessEnv },
): FsdP6cFleetManifestV1 {
  if (!input.allowHydration) {
    throw new Error('FSD_P6C_HYDRATION_FORBIDDEN_OUTSIDE_OFFLINE_PLAN');
  }
  if (manifest.offlineFixtureHydration !== true) {
    throw new Error('FSD_P6C_HYDRATION_FLAG_REQUIRED_ON_MANIFEST');
  }
  const env = input.env ?? process.env;
  if (env[FSD_P6C_OFFLINE_FIXTURE_HYDRATION_ENV] !== '1') {
    throw new Error('FSD_P6C_OFFLINE_FIXTURE_HYDRATION_ENV_REQUIRED');
  }

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
