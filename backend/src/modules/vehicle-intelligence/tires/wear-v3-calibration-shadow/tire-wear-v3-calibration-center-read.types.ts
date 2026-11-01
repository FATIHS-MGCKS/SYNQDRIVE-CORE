import type { TireWearV3CalibrationSnapshotPayload } from './tire-wear-v3-calibration-snapshot.types';
import type { TireWearV3CalibrationPairingRejectionReason } from './tire-wear-v3-calibration-snapshot.types';

export const TIRE_CALIBRATION_CENTER_MAX_PAGE_SIZE = 100;
export const TIRE_CALIBRATION_CENTER_DEFAULT_PAGE_SIZE = 25;

export type TireCalibrationWriterHealthDto = {
  writeEnabled: boolean;
  telemetryScope: 'REPLICA_LOCAL';
  lastTickAt: string | null;
  lastResult: string;
  lastError: string | null;
  lastCandidateSetups: number;
  lastSnapshotsInserted: number;
  lastSnapshotsExisting: number;
  lastSetupsSkipped: number;
};

export type TireCalibrationGlobalSummaryDto = {
  snapshotRowCount: number;
  setupCountWithSnapshots: number;
  latestSnapshotAt: string | null;
  latestSnapshotSetupId: string | null;
  latestSnapshotOrganizationId: string | null;
  writer: TireCalibrationWriterHealthDto;
};

export type TireCalibrationOrgRollupRowDto = {
  organizationId: string;
  snapshotCount: number;
  setupCount: number;
  latestSnapshotAt: string | null;
};

export type TireCalibrationOrgRollupPageDto = {
  items: TireCalibrationOrgRollupRowDto[];
  total: number;
  limit: number;
  offset: number;
};

export type TireCalibrationVehicleRollupRowDto = {
  vehicleId: string;
  snapshotCount: number;
  setupCount: number;
  latestSnapshotAt: string | null;
};

export type TireCalibrationVehicleRollupPageDto = {
  organizationId: string;
  items: TireCalibrationVehicleRollupRowDto[];
  total: number;
  limit: number;
  offset: number;
};

export type TireCalibrationSetupSummaryRowDto = {
  tireSetupId: string;
  snapshotCount: number;
  latestSnapshotAt: string | null;
  wheelPositions: string[];
  mountPeriodIds: string[];
};

export type TireCalibrationSetupListDto = {
  organizationId: string;
  vehicleId: string;
  items: TireCalibrationSetupSummaryRowDto[];
};

export type TireCalibrationSnapshotListItemDto = {
  id: string;
  wheelPosition: string;
  mountPeriodId: string | null;
  physicalTireId: string | null;
  predictionCreatedAt: string;
  sourceComputedAt: string;
  pairingEligible: boolean;
  modelVersion: string;
  snapshotSchemaVersion: string;
  sourceOdometerKm: number | null;
};

export type TireCalibrationSnapshotListPageDto = {
  organizationId: string;
  vehicleId: string;
  tireSetupId: string;
  items: TireCalibrationSnapshotListItemDto[];
  nextCursor: string | null;
  limit: number;
};

export type TireCalibrationSnapshotDetailDto = {
  id: string;
  organizationId: string;
  vehicleId: string;
  tireSetupId: string;
  mountPeriodId: string | null;
  wheelPosition: string;
  physicalTireId: string | null;
  physicalIdentityStatus: 'CONFIRMED' | 'UNCONFIRMED';
  predictionCreatedAt: string;
  sourceComputedAt: string;
  sourceDataCutoffAt: string;
  sourceOdometerKm: number | null;
  latestSourceMeasurementAt: string | null;
  modelVersion: string;
  modelConfigHash: string;
  snapshotSchemaVersion: string;
  calibrationEligibilityDigestPrefix: string;
  inputFingerprintPrefix: string;
  pairingEligible: boolean;
  measurementIdsUsed: string[];
  payload: TireWearV3CalibrationSnapshotPayload;
};

export type TireCalibrationSetupInspectionDto = {
  organizationId: string;
  vehicleId: string;
  tireSetupId: string;
  snapshotCount: number;
  latestSnapshotAt: string | null;
  pairing: {
    pairableCount: number;
    rejectionCounts: Partial<Record<TireWearV3CalibrationPairingRejectionReason, number>>;
    sampledMeasurements: number;
    scope: 'SAMPLED_POLICY_REEVALUATION';
  };
  writer: TireCalibrationWriterHealthDto;
};
