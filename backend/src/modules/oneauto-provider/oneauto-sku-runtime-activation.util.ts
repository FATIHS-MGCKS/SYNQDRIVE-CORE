import { ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU } from './service-history/oneauto-service-history-eu.types';
import { ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU } from './oem-specification/oneauto-vin-lookup-oem-suggestion.types';

export const ONEAUTO_SKU_RUNTIME_ENV_SUFFIX = '_RUNTIME_ENABLED' as const;

/** Explicit opt-in for paid OE Service History EU (default OFF). */
export const ONEAUTO_OE_SERVICE_HISTORY_EU_RUNTIME_ENABLED_ENV =
  `ONEAUTO_SKU_${ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU}${ONEAUTO_SKU_RUNTIME_ENV_SUFFIX}` as const;

/**
 * When unset, VIN lookup retains legacy behaviour (global One Auto gates only).
 * Set to `0` to hard-disable VIN lookup even when other gates pass.
 */
export const ONEAUTO_OE_VIN_LOOKUP_EU_RUNTIME_ENABLED_ENV =
  `ONEAUTO_SKU_${ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU}${ONEAUTO_SKU_RUNTIME_ENV_SUFFIX}` as const;

function envTruthy(name: string): boolean {
  return (process.env[name] ?? '').trim() === '1';
}

function envExplicitlyFalse(name: string): boolean {
  const v = (process.env[name] ?? '').trim();
  return v === '0' || v.toLowerCase() === 'false';
}

export function isOneAutoSkuRuntimeExecutionEnabled(serviceSku: string): boolean {
  if (serviceSku === ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU) {
    return envTruthy(ONEAUTO_OE_SERVICE_HISTORY_EU_RUNTIME_ENABLED_ENV);
  }
  if (serviceSku === ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU) {
    if (envExplicitlyFalse(ONEAUTO_OE_VIN_LOOKUP_EU_RUNTIME_ENABLED_ENV)) {
      return false;
    }
    return true;
  }
  return true;
}

export function oneAutoSkuRuntimeDisabledAvailabilityReason(serviceSku: string): string | null {
  if (isOneAutoSkuRuntimeExecutionEnabled(serviceSku)) return null;
  if (serviceSku === ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU) {
    return 'SKU_RUNTIME_DISABLED';
  }
  return 'SKU_RUNTIME_DISABLED';
}
