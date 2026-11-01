import { createHash } from 'crypto';
import {
  TIRE_WEAR_V3_PRIOR_MODEL_VERSION,
  computeTireWearV3PriorConfigHash,
} from './tire-wear-v3-prior.config';

function stableSortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableSortObject);
  }
  if (value != null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableSortObject((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(stableSortObject(value));
}

export interface TireWearV3PriorFingerprintInput {
  tireSetupId: string;
  vehicleId: string;
  organizationId: string | null;
  setupRevision: {
    installedOdometerKm: number | null;
    odometerAnchorStatus: string | null;
    initialTreadFrontMm: number | null;
    initialTreadRearMm: number | null;
    initialTreadDepthMm: number | null;
    expectedLifeKm: number | null;
    tireSeason: string;
  };
  mountPeriod: {
    id: string | null;
    installedAtIso: string | null;
    removedAtIso: string | null;
    installedOdometerKm: number | null;
  };
  ledger: {
    activeRowCount: number;
    totalDistanceKm: number;
    contentDigest: string;
  };
  measurements: Array<{
    id: string;
    measuredAt: string;
    odometerAtMeasurement: number | null;
    frontLeftMm: number | null;
    frontRightMm: number | null;
    rearLeftMm: number | null;
    rearRightMm: number | null;
  }>;
  currentOdometerKm: number | null;
  /** Optional explicit data cutoff (e.g. replay); omit for live compute. */
  dataCutoffIso?: string | null;
}

export function computeTireWearV3PriorInputFingerprint(
  input: TireWearV3PriorFingerprintInput,
): string {
  const payload = {
    modelVersion: TIRE_WEAR_V3_PRIOR_MODEL_VERSION,
    modelConfigHash: computeTireWearV3PriorConfigHash(),
    ...input,
  };
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

/**
 * Calibration-shadow eligibility digest — same prediction-relevant inputs as the V3 prior
 * fingerprint except live `currentOdometerKm` / optional replay cutoff (telemetry-only churn).
 * Does not replace or alter the canonical customer V3 inputFingerprint.
 */
export function computeTireWearV3CalibrationEligibilityDigest(
  input: TireWearV3PriorFingerprintInput,
): string {
  const payload = {
    kind: 'TIRE_WEAR_V3_CALIBRATION_ELIGIBILITY_V1',
    modelVersion: TIRE_WEAR_V3_PRIOR_MODEL_VERSION,
    modelConfigHash: computeTireWearV3PriorConfigHash(),
    tireSetupId: input.tireSetupId,
    vehicleId: input.vehicleId,
    organizationId: input.organizationId,
    setupRevision: input.setupRevision,
    mountPeriod: input.mountPeriod,
    ledger: input.ledger,
    measurements: input.measurements,
  };
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}
