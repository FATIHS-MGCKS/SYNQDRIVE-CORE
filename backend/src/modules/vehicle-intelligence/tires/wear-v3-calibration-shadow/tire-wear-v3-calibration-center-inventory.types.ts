import type { WheelPos } from '../tire-evidence-provenance';

export type TireInventoryPhysicalIdentityStatus = 'CONFIRMED' | 'UNCONFIRMED' | 'AMBIGUOUS';

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

export type TireInventoryOrgRollupRowDto = {
  organizationId: string;
  registeredSetupCount: number;
  vehicleCount: number;
  setupsWithMeasurements: number;
  setupsWithPriorShadow: number;
  setupsWithSnapshots: number;
};

export type TireInventoryOrgRollupPageDto = {
  items: TireInventoryOrgRollupRowDto[];
  total: number;
  limit: number;
  offset: number;
};

export type TireInventoryVehicleRollupRowDto = {
  vehicleId: string;
  registeredSetupCount: number;
  setupsWithMeasurements: number;
  setupsWithPriorShadow: number;
  snapshotCount: number;
};

export type TireInventoryVehicleRollupPageDto = {
  organizationId: string;
  items: TireInventoryVehicleRollupRowDto[];
  total: number;
  limit: number;
  offset: number;
};

export type TireInventorySetupSummaryRowDto = {
  tireSetupId: string;
  name: string | null;
  status: string;
  installedAt: string | null;
  removedAt: string | null;
  snapshotCount: number;
  measurementCount: number;
  hasPriorShadow: boolean;
  latestMeasurementAt: string | null;
};

export type TireInventorySetupListDto = {
  organizationId: string;
  vehicleId: string;
  items: TireInventorySetupSummaryRowDto[];
  total: number;
  limit: number;
  offset: number;
};

export type TireInventoryWheelMeasurementDto = {
  wheelPosition: WheelPos;
  treadDepthMm: number | null;
  measuredAt: string | null;
  measurementId: string | null;
  evidenceSource: string | null;
  source: string | null;
  availability: 'AVAILABLE' | 'NOT_RECORDED' | 'UNKNOWN';
};

export type TireInventoryWheelAssignmentDto = {
  wheelPosition: WheelPos;
  physicalTireId: string | null;
  physicalIdentityStatus: TireInventoryPhysicalIdentityStatus;
  tireBrand: string | null;
  tireModel: string | null;
  dotCode: string | null;
  latestMeasurement: TireInventoryWheelMeasurementDto;
};

export type TireInventoryPriorShadowReadDto = {
  availability: 'AVAILABLE' | 'NOT_PERSISTED';
  modelVersion: string | null;
  computedAt: string | null;
  inputFingerprintPrefix: string | null;
  wheelSummaries: Array<{
    wheelPosition: WheelPos;
    treadEvidenceClass: string | null;
    displayTreadMmLo: number | null;
    displayTreadMmHi: number | null;
    pointEstimateTreadMm: number | null;
    evidenceLevel: string | null;
  }>;
};

export type TireInventoryDs4ReadDto = {
  persistedRowCount: number;
  latestDs4ReadStatus: string | null;
  latestEventQualityCoverage: string | null;
  latestCreatedAt: string | null;
  availability: 'AVAILABLE' | 'NOT_PERSISTED';
};

export type TireInventoryCalibrationEligibilityReadDto = {
  evaluable: boolean;
  reason: string | null;
  calibrationEligibilityDigestPrefix: string | null;
  rotationDuringMountPeriod: boolean | null;
  physicalIdentityAmbiguous: boolean | null;
  latestSourceMeasurementAt: string | null;
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
  wheels: TireInventoryWheelAssignmentDto[];
  priorShadow: TireInventoryPriorShadowReadDto;
  ds4: TireInventoryDs4ReadDto;
  calibrationEligibility: TireInventoryCalibrationEligibilityReadDto;
};
