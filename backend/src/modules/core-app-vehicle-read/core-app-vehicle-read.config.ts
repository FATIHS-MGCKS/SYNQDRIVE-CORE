import { isCoreAppM2mEnabled } from '@modules/core-app-m2m/core-app-m2m.config';

/**
 * Exposure gate for Core App product-bound vehicle identity read API (P3-PR11B).
 * Authorization remains enforced by M2M + ProductVehicleAccessService when enabled.
 */
export function isCoreAppVehicleReadV1Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CORE_APP_VEHICLE_READ_V1_ENABLED?.trim().toLowerCase() === 'true';
}

export function isCoreAppVehicleReadV1ModuleRegistered(env: NodeJS.ProcessEnv = process.env): boolean {
  return isCoreAppM2mEnabled(env) && isCoreAppVehicleReadV1Enabled(env);
}