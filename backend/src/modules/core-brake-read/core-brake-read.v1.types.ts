import type { ProductSlug } from '@prisma/client';
import type {
  BrakeCondition,
  BrakeConfidenceLevel,
  BrakeDataBasis,
} from '@modules/vehicle-intelligence/brakes/brake-status';
import type { BrakeStateClass } from '@modules/vehicle-intelligence/brakes/brake-health-presentation';

/**
 * Contract `core.brakes.read.v1` — fail-closed technical brake summary read (vehicle-level).
 *
 * Source: `BrakeHealthService.getSummary(vehicleId, { syncAlerts: false })`.
 * No rental blocking, no raw `BrakeHealthSummaryDto`, no wear-model factors, no legacy heuristics.
 *
 * Authorization: user JWT + ACTIVE org membership + `fleet.read` + ACTIVE product license.
 * Not authorized for M2M.
 */
export const CORE_BRAKE_READ_CONTRACT_VERSION = 'core.brakes.read.v1' as const;

export type CoreBrakeReadAvailabilityV1 = 'AVAILABLE' | 'NO_BASELINE' | 'WARNING_ONLY';

export type CoreBrakeTrackingStateV1 = {
  isInitialized: boolean;
  stateClass: BrakeStateClass;
};

export type CoreBrakeConditionHeadlineV1 = {
  condition: BrakeCondition;
  dataBasis: BrakeDataBasis;
  confidenceLevel: BrakeConfidenceLevel;
};

export type CoreBrakeAxleHeadlineV1 = CoreBrakeConditionHeadlineV1;

export type CoreBrakeModeledComponentsV1 = {
  frontPads: boolean;
  rearPads: boolean;
  frontDiscs: boolean;
  rearDiscs: boolean;
  hasAnyModeled: boolean;
};

export type CoreBrakeModelCoverageV1 = {
  coverageStatus: string | null;
  hasGap: boolean;
  reconciliationRequired: boolean;
  modeledTripCount: number;
};

export type CoreBrakeRemainingV1 = {
  reliable: boolean;
  exactRemainingKm: number | null;
  bandMinRemainingKm: number | null;
  bandMaxRemainingKm: number | null;
};

export type CoreBrakeSafetyAlertV1 = {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  axle?: 'FRONT' | 'REAR' | 'UNKNOWN';
  displayMode: 'MEASURED' | 'ESTIMATED' | 'SAFETY_EVIDENCE' | 'DATA_GAP';
};

export type CoreBrakeSafetySignalsV1 = {
  hasActiveSafetyAlert: boolean;
  alerts: CoreBrakeSafetyAlertV1[];
};

export type CoreBrakeTimestampsV1 = {
  lastMeasurementAt: string | null;
  lastServiceAt: string | null;
  lastRecalculatedAt: string | null;
};

export type CoreBrakeReadV1 = {
  version: typeof CORE_BRAKE_READ_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  productSlug: ProductSlug;
  brakeAvailability: CoreBrakeReadAvailabilityV1;
  /** Model refresh when initialized; else latest measurement time when present. */
  resolvedAt: string | null;
  productiveWearModelVersion: string;
  trackingState: CoreBrakeTrackingStateV1;
  overall: CoreBrakeConditionHeadlineV1;
  frontAxle: CoreBrakeAxleHeadlineV1;
  rearAxle: CoreBrakeAxleHeadlineV1;
  modeledComponents: CoreBrakeModeledComponentsV1;
  modelCoverage: CoreBrakeModelCoverageV1;
  remaining: CoreBrakeRemainingV1;
  timestamps: CoreBrakeTimestampsV1;
  safetySignals: CoreBrakeSafetySignalsV1;
};