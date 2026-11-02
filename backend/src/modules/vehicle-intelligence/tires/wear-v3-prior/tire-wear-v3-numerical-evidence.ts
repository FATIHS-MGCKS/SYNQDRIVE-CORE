import type { TireWearV3PriorSetupResult, TireWearV3WheelProjection } from './tire-wear-v3-prior.types';
import {
  isAcceptedVerificationMeasurement,
  type RawTreadMeasurementRow,
} from './tire-wear-v3-verification.accepted';

/** Rows that may influence V3 wear-rate fitting, projection anchors, and measured tread display. */
export function filterTrustedV3NumericalMeasurementRows(
  rows: RawTreadMeasurementRow[],
): RawTreadMeasurementRow[] {
  return rows.filter((row) => isAcceptedVerificationMeasurement(row).accepted);
}

const EMPIRICAL_RATE_BLOCKED_FLAGS = new Set([
  'RATE_INSUFFICIENT_POINTS',
  'RATE_INSUFFICIENT_SPAN',
  'RATE_ROTATION_UNVERIFIED',
  'RATE_CALIBRATION_PRIOR_ONLY',
  'RATE_NEGATIVE_WEAR_REJECTED',
  'RATE_IMPLAUSIBLY_HIGH',
  'TREAD_JUMP_SUSPECT',
  'RATE_MEASUREMENT_SERIES_CONTRADICTORY',
  'RATE_SPAN_BELOW_3SIGMA_THRESHOLD',
]);

export function wheelEmpiricalRateCalibrated(wheel: TireWearV3WheelProjection): boolean {
  if (wheel.wearRate.source !== 'measurement_fused') return false;
  if (wheel.wearRate.measurementUncertaintyMmPerKm == null) return false;
  return !wheel.flags.some((flag) => EMPIRICAL_RATE_BLOCKED_FLAGS.has(flag));
}

/** True only when at least one wheel has a defensible empirical wear-rate fusion (≥2 trusted points). */
export function assessPosteriorCalibrationEligibleFromPrior(
  prior: TireWearV3PriorSetupResult | null | undefined,
): boolean {
  if (!prior?.rated) return false;
  const wheels = prior.wheels ?? [];
  return wheels.some((wheel) => wheelEmpiricalRateCalibrated(wheel));
}
