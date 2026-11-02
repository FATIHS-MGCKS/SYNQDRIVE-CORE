import type { TireEvidenceSource } from '@prisma/client';
import type { WheelPos } from '../tire-evidence-provenance';
import {
  isGroundTruthEvidenceSource,
  mapLegacyMeasurementSourceToEvidence,
} from '../tire-evidence-source';
import {
  filterMeasurementsForMountPeriod,
  type MountPeriodWindow,
} from './tire-wear-v3-prior.lifecycle';
import type { TireWearV3WheelVerificationState } from './tire-wear-v3-verification.types';

export interface RawTreadMeasurementRow {
  id: string;
  measuredAt: Date;
  odometerAtMeasurement: number | null;
  frontLeftMm: number | null;
  frontRightMm: number | null;
  rearLeftMm: number | null;
  rearRightMm: number | null;
  source: string;
  evidenceSource: TireEvidenceSource | null;
  isCalibrationPoint?: boolean;
}

export interface AcceptedVerificationMeasurement {
  id: string;
  measuredAt: Date;
  odometerKm: number;
  wheelsWithTread: WheelPos[];
}

const WHEEL_FIELDS: { pos: WheelPos; field: keyof RawTreadMeasurementRow }[] = [
  { pos: 'FL', field: 'frontLeftMm' },
  { pos: 'FR', field: 'frontRightMm' },
  { pos: 'RL', field: 'rearLeftMm' },
  { pos: 'RR', field: 'rearRightMm' },
];

/**
 * Legacy sources that must never anchor V3 verification cadence.
 * V2 provenance mapping is unchanged; this gate is verification-only.
 */
export function isVerificationExcludedLegacySource(source: string): boolean {
  const normalized = source.trim().toLowerCase();
  return (
    normalized === 'calibration' ||
    normalized === 'ai_estimate' ||
    normalized === 'ai_agent' ||
    normalized === 'ai_confirmed' ||
    normalized === 'manual_registration' ||
    normalized === 'documented_registration' ||
    normalized === 'registration'
  );
}

export function resolveMeasurementEvidenceSource(
  row: RawTreadMeasurementRow,
): TireEvidenceSource | null {
  if (row.evidenceSource != null) {
    return row.evidenceSource;
  }
  return mapLegacyMeasurementSourceToEvidence(row.source);
}

export function isAcceptedVerificationMeasurement(
  row: RawTreadMeasurementRow,
): { accepted: boolean; flags: string[] } {
  const flags: string[] = [];
  if (isVerificationExcludedLegacySource(row.source)) {
    flags.push('VERIFICATION_SOURCE_EXCLUDED');
    return { accepted: false, flags };
  }

  const evidence = resolveMeasurementEvidenceSource(row);
  if (!isGroundTruthEvidenceSource(evidence)) {
    flags.push('VERIFICATION_NOT_GROUND_TRUTH');
    return { accepted: false, flags };
  }

  if (
    row.odometerAtMeasurement == null ||
    !Number.isFinite(row.odometerAtMeasurement)
  ) {
    flags.push('VERIFICATION_ODOMETER_MISSING');
    return { accepted: false, flags };
  }

  const wheels = wheelsWithTreadFromRow(row);
  if (wheels.length === 0) {
    flags.push('VERIFICATION_NO_TREAD_VALUES');
    return { accepted: false, flags };
  }

  return { accepted: true, flags };
}

export function wheelsWithTreadFromRow(row: RawTreadMeasurementRow): WheelPos[] {
  const out: WheelPos[] = [];
  for (const { pos, field } of WHEEL_FIELDS) {
    const v = row[field];
    if (v != null && Number.isFinite(v)) {
      out.push(pos);
    }
  }
  return out;
}

export function listAcceptedVerificationMeasurements(
  rows: RawTreadMeasurementRow[],
  mountPeriod: MountPeriodWindow | null,
): AcceptedVerificationMeasurement[] {
  const inPeriod = filterMeasurementsForMountPeriod(rows, mountPeriod);
  const accepted: AcceptedVerificationMeasurement[] = [];

  for (const row of inPeriod) {
    const check = isAcceptedVerificationMeasurement(row);
    if (!check.accepted) continue;
    accepted.push({
      id: row.id,
      measuredAt: row.measuredAt,
      odometerKm: row.odometerAtMeasurement!,
      wheelsWithTread: wheelsWithTreadFromRow(row),
    });
  }

  return accepted.sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
}

/** Latest accepted anchor per wheel (independent cadence authority). */
export function latestAcceptedVerificationAnchorPerWheel(
  accepted: AcceptedVerificationMeasurement[],
): Partial<Record<WheelPos, AcceptedVerificationMeasurement>> {
  const latest: Partial<Record<WheelPos, AcceptedVerificationMeasurement>> = {};
  for (const row of accepted) {
    for (const wheel of row.wheelsWithTread) {
      const prev = latest[wheel];
      if (!prev || row.measuredAt.getTime() > prev.measuredAt.getTime()) {
        latest[wheel] = row;
      }
    }
  }
  return latest;
}

export function emptyWheelVerificationState(
  position: WheelPos,
): TireWearV3WheelVerificationState {
  return {
    position,
    hasAcceptedVerification: false,
    verificationStatus: 'INSUFFICIENT_EVIDENCE',
    lastAcceptedMeasurementId: null,
    lastAcceptedMeasurementAt: null,
    lastAcceptedOdometerKm: null,
    kmSinceAcceptedMeasurement: null,
    daysSinceAcceptedMeasurement: null,
    nextDueOdometerKm: null,
    qualityFlags: ['VERIFICATION_NO_ACCEPTED_ANCHOR'],
  };
}
