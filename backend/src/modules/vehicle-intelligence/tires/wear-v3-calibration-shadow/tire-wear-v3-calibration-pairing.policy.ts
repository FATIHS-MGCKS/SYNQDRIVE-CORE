import type { TireEvidenceSource } from '@prisma/client';
import type { WheelPos } from '../tire-evidence-provenance';
import {
  isInstantInMountPeriod,
  type MountPeriodWindow,
} from '../wear-v3-prior/tire-wear-v3-prior.lifecycle';
import type {
  TireWearV3CalibrationPairingCandidate,
  TireWearV3CalibrationPairingRejectionReason,
} from './tire-wear-v3-calibration-snapshot.types';

export type TireWearV3CalibrationSnapshotRef = {
  id: string;
  organizationId: string;
  vehicleId: string;
  tireSetupId: string;
  mountPeriodId: string | null;
  wheelPosition: string;
  physicalTireId: string | null;
  predictionCreatedAt: Date;
  sourceComputedAt: Date;
  sourceDataCutoffAt: Date;
  sourceOdometerKm: number | null;
  latestSourceMeasurementAt: Date | null;
  measurementIdsUsed: string[];
  pairingEligible: boolean;
};

export type TireWearV3CalibrationMeasurementRef = {
  id: string;
  organizationId: string | null;
  vehicleId: string;
  tireSetupId: string;
  measuredAt: Date;
  odometerAtMeasurement: number | null;
  evidenceSource: TireEvidenceSource | null;
  treadMmByWheel: Partial<Record<WheelPos, number | null>>;
};

function wheelTreadMm(
  measurement: TireWearV3CalibrationMeasurementRef,
  wheel: WheelPos,
): number | null {
  const value = measurement.treadMmByWheel[wheel];
  return value != null && Number.isFinite(value) ? value : null;
}

export function evaluateTireWearV3CalibrationPairing(args: {
  snapshot: TireWearV3CalibrationSnapshotRef | null;
  measurement: TireWearV3CalibrationMeasurementRef;
  wheel: WheelPos;
  mountPeriod: MountPeriodWindow | null;
  rotationDuringMountPeriod: boolean;
  targetPhysicalTireId?: string | null;
}): TireWearV3CalibrationPairingCandidate {
  const base = {
    snapshotId: args.snapshot?.id ?? null,
    measurementId: args.measurement.id,
    wheelPosition: args.wheel,
    eligible: false,
    rejectionReason: null as TireWearV3CalibrationPairingRejectionReason | null,
  };

  if (!args.snapshot) {
    return { ...base, rejectionReason: 'NO_ELIGIBLE_SNAPSHOT' };
  }

  if (!args.snapshot.pairingEligible) {
    return { ...base, rejectionReason: 'PAIRING_OBSERVATIONAL_ONLY' };
  }

  if (args.snapshot.organizationId !== args.measurement.organizationId) {
    return { ...base, rejectionReason: 'ORGANIZATION_MISMATCH' };
  }
  if (args.snapshot.vehicleId !== args.measurement.vehicleId) {
    return { ...base, rejectionReason: 'VEHICLE_MISMATCH' };
  }
  if (args.snapshot.tireSetupId !== args.measurement.tireSetupId) {
    return { ...base, rejectionReason: 'SETUP_MISMATCH' };
  }
  if (args.snapshot.wheelPosition !== args.wheel) {
    return { ...base, rejectionReason: 'SETUP_MISMATCH' };
  }

  if (
    args.snapshot.predictionCreatedAt.getTime() >= args.measurement.measuredAt.getTime() ||
    args.snapshot.sourceComputedAt.getTime() >= args.measurement.measuredAt.getTime() ||
    args.snapshot.sourceDataCutoffAt.getTime() > args.measurement.measuredAt.getTime()
  ) {
    return { ...base, rejectionReason: 'SNAPSHOT_NOT_BEFORE_MEASUREMENT' };
  }

  if (args.snapshot.measurementIdsUsed.includes(args.measurement.id)) {
    return { ...base, rejectionReason: 'TARGET_MEASUREMENT_IN_PREDICTION_INPUT' };
  }

  if (
    args.snapshot.latestSourceMeasurementAt != null &&
    args.snapshot.latestSourceMeasurementAt.getTime() >=
      args.measurement.measuredAt.getTime()
  ) {
    return { ...base, rejectionReason: 'POST_MEASUREMENT_DATA_LEAKAGE' };
  }

  if (args.mountPeriod == null) {
    return { ...base, rejectionReason: 'MOUNT_PERIOD_UNKNOWN' };
  }

  if (
    args.snapshot.mountPeriodId != null &&
    args.mountPeriod.id != null &&
    args.snapshot.mountPeriodId !== args.mountPeriod.id
  ) {
    return { ...base, rejectionReason: 'MOUNT_PERIOD_MISMATCH' };
  }

  if (!isInstantInMountPeriod(args.measurement.measuredAt, args.mountPeriod)) {
    return { ...base, rejectionReason: 'MEASUREMENT_OUTSIDE_MOUNT' };
  }

  if (args.rotationDuringMountPeriod) {
    return { ...base, rejectionReason: 'ROTATION_DURING_MOUNT' };
  }

  const tread = wheelTreadMm(args.measurement, args.wheel);
  if (tread == null) {
    return { ...base, rejectionReason: 'MEASUREMENT_VALUE_MISSING' };
  }

  if (args.measurement.evidenceSource == null) {
    return { ...base, rejectionReason: 'INSUFFICIENT_MEASUREMENT_EVIDENCE' };
  }

  if (
    args.snapshot.physicalTireId != null &&
    args.targetPhysicalTireId != null &&
    args.snapshot.physicalTireId !== args.targetPhysicalTireId
  ) {
    return { ...base, rejectionReason: 'PHYSICAL_TIRE_MISMATCH' };
  }

  if (args.snapshot.physicalTireId == null) {
    return { ...base, rejectionReason: 'PHYSICAL_IDENTITY_AMBIGUOUS' };
  }

  const snapOdo = args.snapshot.sourceOdometerKm;
  const measOdo = args.measurement.odometerAtMeasurement;
  if (
    snapOdo != null &&
    measOdo != null &&
    Number.isFinite(snapOdo) &&
    Number.isFinite(measOdo) &&
    measOdo + 1e-6 < snapOdo
  ) {
    return { ...base, rejectionReason: 'ODOMETER_CHRONOLOGY_INVALID' };
  }

  if (Number.isNaN(args.measurement.measuredAt.getTime())) {
    return { ...base, rejectionReason: 'INSUFFICIENT_MEASUREMENT_EVIDENCE' };
  }

  return {
    ...base,
    eligible: true,
    rejectionReason: null,
  };
}

export function selectLatestProspectiveSnapshotBeforeMeasurement(
  snapshots: TireWearV3CalibrationSnapshotRef[],
  measurement: TireWearV3CalibrationMeasurementRef,
  wheel: WheelPos,
): TireWearV3CalibrationSnapshotRef | null {
  const filtered = snapshots
    .filter(
      (s) =>
        s.wheelPosition === wheel &&
        s.tireSetupId === measurement.tireSetupId &&
        s.pairingEligible &&
        s.predictionCreatedAt.getTime() < measurement.measuredAt.getTime() &&
        s.sourceComputedAt.getTime() < measurement.measuredAt.getTime() &&
        s.sourceDataCutoffAt.getTime() <= measurement.measuredAt.getTime() &&
        !s.measurementIdsUsed.includes(measurement.id),
    )
    .sort(
      (a, b) => b.predictionCreatedAt.getTime() - a.predictionCreatedAt.getTime(),
    );
  return filtered[0] ?? null;
}
