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

export type TireCalibrationCenterTab =
  | 'overview'
  | 'inventory'
  | 'snapshots'
  | 'accuracy'
  | 'quality';

export type TireInventoryGlobalSummaryDto = {
  organizationCountWithSetups: number;
  vehicleCountWithSetups: number;
  registeredSetupCount: number;
  setupsWithTreadMeasurements: number;
  setupsWithPriorShadowRows: number;
  setupsWithCalibrationSnapshots: number;
  confirmedPhysicalWheelSlots: number;
  unconfirmedPhysicalWheelSlots: number;
  ambiguousPhysicalWheelSlots: number;
  writer: { writeEnabled: boolean };
};

export type TireInventorySetupListDto = {
  organizationId: string;
  vehicleId: string;
  items: Array<{
    tireSetupId: string;
    name: string | null;
    status: string;
    installedAt: string | null;
    removedAt: string | null;
    snapshotCount: number;
    measurementCount: number;
    hasPriorShadow: boolean;
    latestMeasurementAt: string | null;
  }>;
  total: number;
  limit: number;
  offset: number;
};

export type TireInventorySetupDetailDto = {
  organizationId: string;
  vehicleId: string;
  tireSetupId: string;
  name: string | null;
  status: string;
  tireSeason: string;
  frontDimension: string | null;
  rearDimension: string | null;
  brandModelFront: string | null;
  brandModelRear: string | null;
  installedAt: string | null;
  removedAt: string | null;
  activeMountPeriodId: string | null;
  activeMountInstalledAt: string | null;
  activeMountRemovedAt: string | null;
  odometerAnchorStatus: string | null;
  snapshotCount: number;
  measurementCount: number;
  wheels: Array<{
    wheelPosition: string;
    physicalTireId: string | null;
    physicalIdentityStatus: 'CONFIRMED' | 'UNCONFIRMED' | 'AMBIGUOUS';
    tireBrand: string | null;
    tireModel: string | null;
    dotCode: string | null;
    latestMeasurement: {
      treadDepthMm: number | null;
      measuredAt: string | null;
      measurementId: string | null;
      evidenceSource: string | null;
      source: string | null;
      availability: string;
    };
  }>;
  priorShadow: {
    availability: 'AVAILABLE' | 'NOT_PERSISTED';
    modelVersion: string | null;
    computedAt: string | null;
    inputFingerprintPrefix: string | null;
    wheelSummaries: Array<{
      wheelPosition: string;
      treadEvidenceClass: string | null;
      displayTreadMmLo: number | null;
      displayTreadMmHi: number | null;
      pointEstimateTreadMm: number | null;
      evidenceLevel: string | null;
    }>;
  };
  ds4: {
    persistedRowCount: number;
    latestDs4ReadStatus: string | null;
    latestEventQualityCoverage: string | null;
    latestCreatedAt: string | null;
    availability: 'AVAILABLE' | 'NOT_PERSISTED';
  };
  calibrationEligibility: {
    evaluable: boolean;
    reason: string | null;
    calibrationEligibilityDigestPrefix: string | null;
    rotationDuringMountPeriod: boolean | null;
    physicalIdentityAmbiguous: boolean | null;
    latestSourceMeasurementAt: string | null;
  };
};
