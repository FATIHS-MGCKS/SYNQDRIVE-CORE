export type TireCalibrationSnapshotPayload = {
  schemaVersion: string;
  identity: {
    organizationId: string;
    vehicleId: string;
    tireSetupId: string;
    mountPeriodId: string | null;
    wheelPosition: string;
    physicalTireId: string | null;
  };
  prediction: Record<string, unknown>;
  dataQuality: Record<string, unknown>;
  provenance: Record<string, unknown>;
};

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

export type TireCalibrationSetupInspectionDto = {
  organizationId: string;
  vehicleId: string;
  tireSetupId: string;
  snapshotCount: number;
  latestSnapshotAt: string | null;
  pairing: {
    pairableCount: number;
    rejectionCounts: Record<string, number>;
    sampledMeasurements: number;
    scope: 'SAMPLED_POLICY_REEVALUATION';
  };
  writer: TireCalibrationWriterHealthDto;
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
  payload: TireCalibrationSnapshotPayload;
};

export type TireCalibrationCenterTab = 'overview' | 'snapshots' | 'accuracy' | 'quality';
