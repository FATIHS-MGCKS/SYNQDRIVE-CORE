import { createHash } from 'crypto';
import type { WheelPos } from '../tire-evidence-provenance';
import { TIRE_WEAR_V3_CALIBRATION_SNAPSHOT_SCHEMA_VERSION } from './tire-wear-v3-calibration-snapshot.types';

export function buildTireWearV3CalibrationSnapshotIdempotencyKey(args: {
  organizationId: string;
  tireSetupId: string;
  mountPeriodId: string | null;
  wheelPosition: WheelPos;
  modelVersion: string;
  calibrationEligibilityDigest: string;
  snapshotSchemaVersion?: string;
}): string {
  const material = [
    args.organizationId,
    args.tireSetupId,
    args.mountPeriodId ?? 'NO_MOUNT_PERIOD',
    args.wheelPosition,
    args.modelVersion,
    args.calibrationEligibilityDigest,
    args.snapshotSchemaVersion ?? TIRE_WEAR_V3_CALIBRATION_SNAPSHOT_SCHEMA_VERSION,
  ].join('|');
  return createHash('sha256').update(material).digest('hex');
}
