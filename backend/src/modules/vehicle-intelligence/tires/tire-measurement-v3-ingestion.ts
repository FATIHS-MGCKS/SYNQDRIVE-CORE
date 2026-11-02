import { TireEvidenceSource } from '@prisma/client';
import { isGroundTruthEvidenceSource } from './tire-evidence-source';
import {
  isVerificationExcludedLegacySource,
  isAcceptedVerificationMeasurement,
  type RawTreadMeasurementRow,
} from './wear-v3-prior/tire-wear-v3-verification.accepted';
import { isInstantInMountPeriod, type MountPeriodWindow } from './wear-v3-prior/tire-wear-v3-prior.lifecycle';
import {
  resolveOdometerAnchor,
  toFiniteOdometerKm,
  type ResolvedOdometerAnchor,
  type VehicleOdometerContext,
} from './tire-odometer-anchor';
import type { RecordTireMeasurementCommand } from './tire-lifecycle.service';
import type { TireWearV3PriorSetupResult } from './wear-v3-prior/tire-wear-v3-prior.types';
import { assessPosteriorCalibrationEligibleFromPrior } from './wear-v3-prior/tire-wear-v3-numerical-evidence';

export const TIRE_MEASUREMENT_TREAD_MIN_MM = 0;
export const TIRE_MEASUREMENT_TREAD_MAX_MM = 20;

export type TireMeasurementV3WarningCode =
  | 'V3_RECOMPUTE_FAILED'
  | 'V3_ODOMETER_NOT_EXPLICIT'
  | 'V3_ODOMETER_INFERRED_NOT_USED'
  | 'V3_MEASUREMENT_OUTSIDE_MOUNT_PERIOD'
  | 'V3_NOT_GROUND_TRUTH_SOURCE'
  | 'V3_VERIFICATION_SOURCE_EXCLUDED'
  | 'V3_REGISTRATION_BASELINE_NOT_VERIFICATION_ANCHOR'
  | 'V3_NO_TREAD_VALUES'
  | 'V3_POSTERIOR_INSUFFICIENT_EVIDENCE'
  | 'V3_MEASUREMENT_RECORDED_UNVERIFIED'
  | 'V3_VERIFICATION_ANCHOR_ONE_POINT'
  | 'V3_RATE_CALIBRATION_REQUIRES_TWO_POINTS'
  | 'V3_WORKSHOP_ODOMETER_MISSING'
  | 'V3_WORKSHOP_PROVENANCE_INCOMPLETE';

export type TireMeasurementV3EvidenceClass =
  | 'VERIFICATION_ELIGIBLE'
  | 'UNVERIFIED_GROUND_TRUTH'
  | 'EXCLUDED_SOURCE'
  | 'NON_GROUND_TRUTH';

export interface TireMeasurementV3IngestionAssessment {
  verificationEligible: boolean;
  posteriorCalibrationEligible: boolean;
  evidenceClass: TireMeasurementV3EvidenceClass;
  warnings: Array<{ code: TireMeasurementV3WarningCode; message: string }>;
  verificationStatus: string | null;
}

export type TireMeasurementV3RecomputeStatus = 'ok' | 'failed' | 'skipped';

export interface TireMeasurementV3RecomputeResult {
  status: TireMeasurementV3RecomputeStatus;
  code?: 'V3_RECOMPUTE_FAILED';
  message?: string;
}

export function isOdometerExplicitlyConfirmed(command: RecordTireMeasurementCommand): boolean {
  if (command.manualConfirmOdometer === true) return true;
  const src = String(command.source ?? '').trim().toLowerCase();
  return src === 'workshop';
}

export function resolveExplicitMeasurementOdometerKm(
  command: RecordTireMeasurementCommand,
): number | null {
  if (!isOdometerExplicitlyConfirmed(command)) return null;
  const km = toFiniteOdometerKm(command.odometerKm);
  if (km == null) return null;
  return km;
}

export function isRegistrationBaselineLegacySource(source: string | null | undefined): boolean {
  const normalized = String(source ?? '').trim().toLowerCase();
  return (
    normalized === 'manual_registration' ||
    normalized === 'documented_registration' ||
    normalized === 'registration'
  );
}

export function resolveInferredMeasurementOdometerKm(
  command: RecordTireMeasurementCommand,
  context: VehicleOdometerContext,
): ResolvedOdometerAnchor {
  return resolveOdometerAnchor({
    clientOdometerKm: command.odometerKm,
    manualConfirmed: isOdometerExplicitlyConfirmed(command),
    documentEvidenceId: command.documentExtractionId ?? command.linkedExtractionId ?? null,
    context,
  });
}

export function isGroundTruthMeasurementCommand(
  legacySource: string,
  evidenceSource: TireEvidenceSource,
): boolean {
  if (!isGroundTruthEvidenceSource(evidenceSource)) return false;
  if (isRegistrationBaselineLegacySource(legacySource)) return true;
  if (isVerificationExcludedLegacySource(legacySource)) return false;
  return true;
}

export function validateTreadMmValues(values: {
  frontLeftMm: number | null;
  frontRightMm: number | null;
  rearLeftMm: number | null;
  rearRightMm: number | null;
}): string | null {
  for (const v of [
    values.frontLeftMm,
    values.frontRightMm,
    values.rearLeftMm,
    values.rearRightMm,
  ]) {
    if (v == null) continue;
    if (!Number.isFinite(v) || v < TIRE_MEASUREMENT_TREAD_MIN_MM || v > TIRE_MEASUREMENT_TREAD_MAX_MM) {
      return `Tread depth must be between ${TIRE_MEASUREMENT_TREAD_MIN_MM} and ${TIRE_MEASUREMENT_TREAD_MAX_MM} mm.`;
    }
  }
  return null;
}

export function assertMeasuredAtInMountPeriod(
  measuredAt: Date,
  mountPeriod: MountPeriodWindow | null,
): boolean {
  if (!mountPeriod) return false;
  return isInstantInMountPeriod(measuredAt, mountPeriod);
}

function buildMeasurementRowForV3Assessment(args: {
  measuredAt: Date;
  odometerAtMeasurement: number | null;
  source: string;
  evidenceSource: TireEvidenceSource;
  frontLeftMm: number | null;
  frontRightMm: number | null;
  rearLeftMm: number | null;
  rearRightMm: number | null;
}): RawTreadMeasurementRow {
  return {
    id: 'pending',
    measuredAt: args.measuredAt,
    odometerAtMeasurement: args.odometerAtMeasurement,
    frontLeftMm: args.frontLeftMm,
    frontRightMm: args.frontRightMm,
    rearLeftMm: args.rearLeftMm,
    rearRightMm: args.rearRightMm,
    source: args.source,
    evidenceSource: args.evidenceSource,
  };
}

export function assessPosteriorCalibrationEligible(
  prior: TireWearV3PriorSetupResult | null | undefined,
): boolean {
  return assessPosteriorCalibrationEligibleFromPrior(prior);
}

export function assessV3Ingestion(args: {
  legacySource: string;
  evidenceSource: TireEvidenceSource;
  measuredAt: Date;
  mountPeriod: MountPeriodWindow | null;
  explicitOdometerKm: number | null;
  inferredAnchor: ResolvedOdometerAnchor;
  treadValues: {
    frontLeftMm: number | null;
    frontRightMm: number | null;
    rearLeftMm: number | null;
    rearRightMm: number | null;
  };
  priorResult: TireWearV3PriorSetupResult | null;
  workshopName?: string | null;
}): TireMeasurementV3IngestionAssessment {
  const warnings: TireMeasurementV3IngestionAssessment['warnings'] = [];
  const groundTruth = isGroundTruthMeasurementCommand(args.legacySource, args.evidenceSource);

  if (!groundTruth) {
    warnings.push({
      code: 'V3_NOT_GROUND_TRUTH_SOURCE',
      message: 'This measurement source is not eligible for Tire V3 verification cadence.',
    });
  }

  if (isVerificationExcludedLegacySource(args.legacySource)) {
    warnings.push({
      code: 'V3_VERIFICATION_SOURCE_EXCLUDED',
      message: 'This legacy source cannot anchor V3 verification.',
    });
    if (isRegistrationBaselineLegacySource(args.legacySource)) {
      warnings.push({
        code: 'V3_REGISTRATION_BASELINE_NOT_VERIFICATION_ANCHOR',
        message:
          'Registration baseline tread is stored for inventory only and does not create a V3 verification anchor.',
      });
    }
  }

  const legacyNormalized = args.legacySource.trim().toLowerCase();
  if (legacyNormalized === 'workshop') {
    const workshopName = String(args.workshopName ?? '').trim();
    if (!workshopName) {
      warnings.push({
        code: 'V3_WORKSHOP_PROVENANCE_INCOMPLETE',
        message: 'Workshop name is recommended for verifiable workshop odometer provenance.',
      });
    }
    if (args.explicitOdometerKm == null && groundTruth) {
      warnings.push({
        code: 'V3_WORKSHOP_ODOMETER_MISSING',
        message: 'Workshop measurements require an explicit odometer reading on the report for V3 evidence.',
      });
    }
  }

  if (!assertMeasuredAtInMountPeriod(args.measuredAt, args.mountPeriod)) {
    warnings.push({
      code: 'V3_MEASUREMENT_OUTSIDE_MOUNT_PERIOD',
      message: 'Measurement time is outside the active tire mount period.',
    });
  }

  const odometerForV3 = groundTruth ? args.explicitOdometerKm : args.inferredAnchor.odometerKm;

  if (groundTruth && args.explicitOdometerKm == null) {
    warnings.push({
      code: 'V3_ODOMETER_NOT_EXPLICIT',
      message:
        'V3 requires an explicitly confirmed odometer reading at measurement time (confirm odometer or use workshop source).',
    });
    if (args.inferredAnchor.odometerKm != null) {
      warnings.push({
        code: 'V3_ODOMETER_INFERRED_NOT_USED',
        message:
          'Vehicle telemetry odometer was not applied to V3 evidence (inference not accepted for verification).',
      });
    }
  }

  const row = buildMeasurementRowForV3Assessment({
    measuredAt: args.measuredAt,
    odometerAtMeasurement: odometerForV3,
    source: args.legacySource,
    evidenceSource: args.evidenceSource,
    ...args.treadValues,
  });

  const accepted = isAcceptedVerificationMeasurement(row);
  const verificationExcluded = isVerificationExcludedLegacySource(args.legacySource);
  const inMountPeriod = assertMeasuredAtInMountPeriod(args.measuredAt, args.mountPeriod);
  const verificationEligible =
    groundTruth &&
    !verificationExcluded &&
    accepted.accepted &&
    inMountPeriod;
  const posteriorCalibrationEligible = assessPosteriorCalibrationEligibleFromPrior(
    args.priorResult,
  );

  if (groundTruth && !accepted.accepted && accepted.flags.includes('VERIFICATION_NO_TREAD_VALUES')) {
    warnings.push({
      code: 'V3_NO_TREAD_VALUES',
      message: 'At least one wheel tread depth is required for V3 verification.',
    });
  }

  if (groundTruth && verificationEligible && !posteriorCalibrationEligible) {
    warnings.push({
      code: 'V3_POSTERIOR_INSUFFICIENT_EVIDENCE',
      message:
        'V3 rate calibration remains gated (insufficient odometer span, points, or rotation safety).',
    });
    warnings.push({
      code: 'V3_RATE_CALIBRATION_REQUIRES_TWO_POINTS',
      message:
        'Empirical wear-rate calibration requires at least two spaced measurements with explicit odometer — a single point can anchor verification only.',
    });
    warnings.push({
      code: 'V3_VERIFICATION_ANCHOR_ONE_POINT',
      message:
        'This measurement can anchor V3 verification cadence; empirical rate calibration requires additional spaced points.',
    });
  }

  let evidenceClass: TireMeasurementV3EvidenceClass = 'NON_GROUND_TRUTH';
  if (!groundTruth) {
    evidenceClass = 'NON_GROUND_TRUTH';
  } else if (verificationExcluded) {
    evidenceClass = 'EXCLUDED_SOURCE';
  } else if (verificationEligible) {
    evidenceClass = 'VERIFICATION_ELIGIBLE';
  } else {
    evidenceClass = 'UNVERIFIED_GROUND_TRUTH';
    if (!verificationExcluded) {
      warnings.push({
        code: 'V3_MEASUREMENT_RECORDED_UNVERIFIED',
        message:
          'Tread was saved but this measurement is not V3 verification evidence until odometer and source rules are satisfied.',
      });
    }
  }

  return {
    verificationEligible,
    posteriorCalibrationEligible,
    evidenceClass,
    warnings,
    verificationStatus: args.priorResult?.verification?.status ?? null,
  };
}

export function resolvePersistedMeasurementOdometerKm(args: {
  groundTruth: boolean;
  explicitOdometerKm: number | null;
  inferredOdometerKm: number | null;
}): number | null {
  if (args.groundTruth) {
    return args.explicitOdometerKm;
  }
  return args.inferredOdometerKm;
}
