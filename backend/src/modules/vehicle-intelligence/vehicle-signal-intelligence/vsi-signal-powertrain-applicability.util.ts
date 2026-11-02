import type { VsiCanonicalSignalKey } from './canonical-signal-keys';
import { getVsiCanonicalSignalDefinition } from './canonical-signal-keys';
import type { VsiProfileMaterializationKey } from './vsi-profile.types';
import {
  VsiEmpiricalObservationStatus,
} from './vehicle-signal-evidence.contract';

export type VsiSignalPowertrainApplicability = 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';

export function normalizeVehicleFuelType(fuelType: string | null | undefined): string | null {
  if (!fuelType) return null;
  return fuelType.toUpperCase();
}

export function isBatteryElectricOnlyFuelType(fuelType: string | null | undefined): boolean {
  const normalized = normalizeVehicleFuelType(fuelType);
  if (!normalized) return false;
  return normalized === 'ELECTRIC' || normalized === 'BEV' || normalized === 'EV';
}

/** HV-pack signals apply to BEV and hybrid classes — not pure ICE. */
export function hasHighVoltagePackApplicability(fuelType: string | null | undefined): boolean {
  if (isBatteryElectricOnlyFuelType(fuelType)) return true;
  const normalized = normalizeVehicleFuelType(fuelType);
  if (!normalized) return false;
  return (
    normalized === 'PLUGIN_HYBRID' ||
    normalized === 'HYBRID' ||
    normalized === 'PHEV'
  );
}

/** ICE-centric signals apply when fuel type is not a confirmed BEV-only class. */
export function hasIceFuelApplicability(fuelType: string | null | undefined): boolean {
  const normalized = normalizeVehicleFuelType(fuelType);
  if (!normalized) return false;
  if (isBatteryElectricOnlyFuelType(normalized)) return false;
  return true;
}

/**
 * Vehicle Spec V3 / registry `fuelType` axis (Prisma FuelType string values).
 * Fail-closed UNKNOWN when fuel type is missing — never infer NOT_APPLICABLE without fuel evidence.
 */
export function resolveVsiSignalPowertrainApplicability(
  key: VsiCanonicalSignalKey,
  fuelType: string | null | undefined,
): VsiSignalPowertrainApplicability {
  const def = getVsiCanonicalSignalDefinition(key);
  if (!def.evOnly && !def.iceOnly) {
    return 'APPLICABLE';
  }
  const normalized = normalizeVehicleFuelType(fuelType);
  if (!normalized) {
    return 'UNKNOWN';
  }
  if ((def.evOnly || def.iceOnly) && normalized === 'OTHER') {
    return 'UNKNOWN';
  }
  if (def.evOnly) {
    return hasHighVoltagePackApplicability(normalized) ? 'APPLICABLE' : 'NOT_APPLICABLE';
  }
  if (def.iceOnly) {
    return hasIceFuelApplicability(normalized) ? 'APPLICABLE' : 'NOT_APPLICABLE';
  }
  return 'APPLICABLE';
}

export const VSI_LIMITATION_POWERTRAIN_SIGNAL_NOT_APPLICABLE =
  'POWERTRAIN_SIGNAL_NOT_APPLICABLE';

export function applyVsiProfileSignalPowertrainApplicability<
  T extends {
    canonicalSignalKey: VsiProfileMaterializationKey;
    empiricalObservation: (typeof VsiEmpiricalObservationStatus)[keyof typeof VsiEmpiricalObservationStatus];
    lastValidObservationAt: string | null;
    lastSourceTimestamp: string | null;
    freshnessClassification: 'FRESH' | 'STALE' | 'UNKNOWN';
    limitations: string[];
    powertrainApplicability?: VsiSignalPowertrainApplicability;
  },
>(row: T, fuelType: string | null | undefined): T {
  const applicability = resolveVsiSignalPowertrainApplicability(row.canonicalSignalKey, fuelType);
  if (applicability === 'APPLICABLE') {
    return { ...row, powertrainApplicability: 'APPLICABLE' };
  }
  if (applicability === 'UNKNOWN') {
    return { ...row, powertrainApplicability: 'UNKNOWN' };
  }
  const provenEmpiricalObservation =
    row.empiricalObservation === VsiEmpiricalObservationStatus.OBSERVED ||
    row.empiricalObservation === VsiEmpiricalObservationStatus.OBSERVED_STALE;
  if (applicability === 'NOT_APPLICABLE' && provenEmpiricalObservation) {
    return { ...row, powertrainApplicability: 'UNKNOWN' };
  }
  return {
    ...row,
    powertrainApplicability: 'NOT_APPLICABLE',
    empiricalObservation: VsiEmpiricalObservationStatus.NOT_APPLICABLE,
    lastValidObservationAt: null,
    lastSourceTimestamp: null,
    freshnessClassification: 'UNKNOWN',
    limitations: [
      ...new Set([...row.limitations, VSI_LIMITATION_POWERTRAIN_SIGNAL_NOT_APPLICABLE]),
    ],
  };
}
