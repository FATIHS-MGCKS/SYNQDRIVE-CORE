import type { WheelPos } from '../tire-evidence-provenance';
import type {
  TireWearV3PriorSetupResult,
  TireWearV3WheelProjection,
} from '../wear-v3-prior/tire-wear-v3-prior.types';

export const TIRE_WEAR_V3_CALIBRATION_SNAPSHOT_SCHEMA_VERSION = 'v1';

export type TireWearV3CalibrationAvailability =
  | 'AVAILABLE'
  | 'NOT_AVAILABLE'
  | 'UNKNOWN';

export interface TireWearV3CalibrationSnapshotPayload {
  schemaVersion: typeof TIRE_WEAR_V3_CALIBRATION_SNAPSHOT_SCHEMA_VERSION;
  identity: {
    organizationId: string;
    vehicleId: string;
    tireSetupId: string;
    mountPeriodId: string | null;
    wheelPosition: WheelPos;
    physicalTireId: string | null;
  };
  prediction: {
    predictionCreatedAt: string;
    sourceComputedAt: string;
    sourceOdometerKm: number | null;
    modelVersion: string;
    modelConfigHash: string;
    inputFingerprint: string;
    calibrationEligibilityDigest: string;
    latestSourceMeasurementAt: string | null;
    sourceDataCutoffAt: string;
    measurementIdsUsed: string[];
    pairingEligible: boolean;
    physicalIdentityAmbiguous: boolean;
    predictedTreadMm: { lo: number; hi: number } | null;
    displayTreadMm: { lo: number; hi: number } | null;
    remainingKm: { lo: number; hi: number } | null;
    anchor: {
      initialTreadMm: number;
      odometerAnchorKm: number | null;
      distanceSinceAnchorKm: number;
      measurementUncertaintyAssumption: TireWearV3CalibrationAvailability;
    };
    rate: TireWearV3WheelProjection['wearRate'] | null;
    treadEvidenceClass: TireWearV3WheelProjection['treadEvidenceClass'];
    evidenceLevel: TireWearV3WheelProjection['evidenceLevel'];
    flags: string[];
  };
  dataQuality: {
    dynamicBeta: number;
    dynamicFactor: number;
    ds4SeverityCoverage: number;
    ds4SeveritySRel: number | null;
    setupFlags: string[];
    wheelFlags: string[];
    temporalQuality: TireWearV3CalibrationAvailability;
  };
  provenance: {
    rated: boolean;
    ledgerDistanceKm: number;
    ledgerRowCount: number;
    odometerAnchorStatus: string | null;
    rotationDuringMountPeriod: boolean;
  };
}

export interface TireWearV3CalibrationSnapshotInsertRow {
  organizationId: string;
  vehicleId: string;
  tireSetupId: string;
  mountPeriodId: string | null;
  wheelPosition: WheelPos;
  physicalTireId: string | null;
  predictionCreatedAt: Date;
  sourceComputedAt: Date;
  sourceOdometerKm: number | null;
  modelVersion: string;
  modelConfigHash: string;
  inputFingerprint: string;
  calibrationEligibilityDigest: string;
  snapshotSchemaVersion: string;
  idempotencyKey: string;
  latestSourceMeasurementAt: Date | null;
  sourceDataCutoffAt: Date;
  pairingEligible: boolean;
  measurementIdsUsed: string[];
  snapshotPayload: TireWearV3CalibrationSnapshotPayload;
}

export type TireWearV3CalibrationPairingRejectionReason =
  | 'NO_ELIGIBLE_SNAPSHOT'
  | 'SNAPSHOT_NOT_BEFORE_MEASUREMENT'
  | 'ORGANIZATION_MISMATCH'
  | 'VEHICLE_MISMATCH'
  | 'SETUP_MISMATCH'
  | 'MOUNT_PERIOD_MISMATCH'
  | 'MOUNT_PERIOD_UNKNOWN'
  | 'ROTATION_DURING_MOUNT'
  | 'MEASUREMENT_OUTSIDE_MOUNT'
  | 'ODOMETER_CHRONOLOGY_INVALID'
  | 'MEASUREMENT_VALUE_MISSING'
  | 'INSUFFICIENT_MEASUREMENT_EVIDENCE'
  | 'POST_MEASUREMENT_DATA_LEAKAGE'
  | 'TARGET_MEASUREMENT_IN_PREDICTION_INPUT'
  | 'PAIRING_OBSERVATIONAL_ONLY'
  | 'PHYSICAL_IDENTITY_AMBIGUOUS'
  | 'PHYSICAL_TIRE_MISMATCH';

export interface TireWearV3CalibrationPairingCandidate {
  eligible: boolean;
  rejectionReason: TireWearV3CalibrationPairingRejectionReason | null;
  snapshotId: string | null;
  measurementId: string;
  wheelPosition: WheelPos;
}

export interface TireWearV3CalibrationWriterTickStats {
  lastTickAt: string | null;
  lastResult: 'IDLE' | 'FLAG_OFF' | 'NOT_LEADER' | 'OVERLAP' | 'COMPLETED' | 'FAILED';
  lastError: string | null;
  lastCandidateSetups: number;
  lastSnapshotsInserted: number;
  lastSnapshotsExisting: number;
  lastSetupsSkipped: number;
}

export function buildCalibrationSnapshotPayload(args: {
  result: TireWearV3PriorSetupResult;
  wheel: TireWearV3WheelProjection;
  mountPeriodId: string | null;
  physicalTireId: string | null;
  predictionCreatedAt: Date;
  rotationDuringMountPeriod: boolean;
  calibrationEligibilityDigest: string;
  latestSourceMeasurementAt: Date | null;
  sourceDataCutoffAt: Date;
  measurementIdsUsed: string[];
  pairingEligible: boolean;
  physicalIdentityAmbiguous: boolean;
}): TireWearV3CalibrationSnapshotPayload {
  const { result, wheel } = args;
  return {
    schemaVersion: TIRE_WEAR_V3_CALIBRATION_SNAPSHOT_SCHEMA_VERSION,
    identity: {
      organizationId: result.organizationId ?? 'UNKNOWN',
      vehicleId: result.vehicleId,
      tireSetupId: result.tireSetupId,
      mountPeriodId: args.mountPeriodId,
      wheelPosition: wheel.position,
      physicalTireId: args.physicalTireId,
    },
    prediction: {
      predictionCreatedAt: args.predictionCreatedAt.toISOString(),
      sourceComputedAt: result.computedAt,
      sourceOdometerKm: result.currentOdometerKm,
      modelVersion: result.modelVersion,
      modelConfigHash: result.modelConfigHash,
      inputFingerprint: result.inputFingerprint,
      calibrationEligibilityDigest: args.calibrationEligibilityDigest,
      latestSourceMeasurementAt: args.latestSourceMeasurementAt?.toISOString() ?? null,
      sourceDataCutoffAt: args.sourceDataCutoffAt.toISOString(),
      measurementIdsUsed: args.measurementIdsUsed,
      pairingEligible: args.pairingEligible,
      physicalIdentityAmbiguous: args.physicalIdentityAmbiguous,
      predictedTreadMm: wheel.estimatedTreadMm ?? null,
      displayTreadMm: wheel.displayTreadMm,
      remainingKm: wheel.remainingKm ?? null,
      anchor: {
        initialTreadMm: wheel.initialTreadMm,
        odometerAnchorKm: result.odometerAnchorKm,
        distanceSinceAnchorKm: wheel.distanceSinceAnchorKm,
        measurementUncertaintyAssumption:
          wheel.wearRate.measurementUncertaintyMmPerKm != null
            ? 'AVAILABLE'
            : 'NOT_AVAILABLE',
      },
      rate: wheel.wearRate,
      treadEvidenceClass: wheel.treadEvidenceClass,
      evidenceLevel: wheel.evidenceLevel,
      flags: wheel.flags,
    },
    dataQuality: {
      dynamicBeta: result.dynamicBeta,
      dynamicFactor: wheel.dynamicFactor.factor,
      ds4SeverityCoverage: result.ds4SeverityCoverage,
      ds4SeveritySRel: result.ds4SeveritySRel,
      setupFlags: result.setupFlags,
      wheelFlags: wheel.flags,
      temporalQuality:
        result.ds4SeverityCoverage > 0 ? 'AVAILABLE' : 'NOT_AVAILABLE',
    },
    provenance: {
      rated: result.rated,
      ledgerDistanceKm: result.ledgerDistanceKm,
      ledgerRowCount: result.ledgerRowCount,
      odometerAnchorStatus: result.odometerAnchorStatus,
      rotationDuringMountPeriod: args.rotationDuringMountPeriod,
    },
  };
}
