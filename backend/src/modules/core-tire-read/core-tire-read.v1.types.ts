import type { ProductSlug } from '@prisma/client';
import type { TireConfidenceLevel, TireDisplayMode, TireStatus } from '@modules/vehicle-intelligence/tires/tire-status';
import type {
  TirePressureFreshness,
  TirePressureOverallStatus,
  TirePressureSourceType,
  TirePressureWheelPosition,
} from '@modules/vehicle-intelligence/tires/tire-pressure-context.types';

/**
 * Contract `core.tire.read.v1` — fail-closed technical tire summary read (vehicle-level).
 *
 * Source: `TireHealthService.getSummary(vehicleId, { hmTirePressure })` with HM prefetch parity.
 * No rental blocking, no raw `TireHealthSummary`, no wear-model factors, no shadow diagnostics.
 *
 * Authorization: user JWT + ACTIVE org membership + `fleet.read` + ACTIVE product license.
 * Not authorized for M2M.
 */
export const CORE_TIRE_READ_CONTRACT_VERSION = 'core.tire.read.v1' as const;

export type CoreTireReadAvailabilityV1 = 'AVAILABLE' | 'NO_ACTIVE_SETUP';

export type CoreTireWearReadModelV1 = 'v2' | 'v3';

export type CoreTireTreadProvenanceV1 =
  | 'MEASURED'
  | 'ESTIMATED'
  | 'DEFAULT_ASSUMPTION'
  | 'UNKNOWN';

export type CoreTireV3CustomerStateV1 =
  | 'INACTIVE'
  | 'ATTACHED'
  | 'AUTHORITATIVE'
  | 'UNAVAILABLE';

export type CoreTirePressureWheelV1 = {
  position: TirePressureWheelPosition;
  valueBar: number | null;
  sourceProvider: string | null;
  sourceObservedAt: string | null;
  freshness: TirePressureFreshness;
};

export type CoreTirePressureV1 = {
  overallStatus: TirePressureOverallStatus;
  overallFreshness: TirePressureFreshness;
  sourceType: TirePressureSourceType;
  wheels: CoreTirePressureWheelV1[];
};

export type CoreTireRemainingV2V1 = {
  reliable: boolean;
  exactRemainingKm: number | null;
  bandMinRemainingKm: number | null;
  bandMaxRemainingKm: number | null;
};

export type CoreTireRemainingV3V1 = {
  intervalMinRemainingKm: number | null;
  intervalMaxRemainingKm: number | null;
};

export type CoreTireV3MetaV1 = {
  customerState: CoreTireV3CustomerStateV1;
  modelVersion: string | null;
  computedAt: string | null;
  verificationStatus: string | null;
  insufficientEvidence: boolean | null;
};

export type CoreTireActiveSetupV1 = {
  setupId: string;
  setupName: string | null;
  tireSeason: string | null;
  installedAt: string | null;
};

export type CoreTireTreadHeadlineV1 = {
  lowestTreadMm: number | null;
  lowestTreadPosition: string | null;
  displayMode: TireDisplayMode;
  treadProvenance: CoreTireTreadProvenanceV1;
  lastMeasurementAt: string | null;
  measurementAgeDays: number | null;
};

export type CoreTireMeasurementFlagsV1 = {
  isMeasured: boolean;
  isEstimated: boolean;
  isDefaultAssumption: boolean;
  measurementState: 'measured' | 'estimated' | 'mixed' | null;
};

export type CoreTireInventoryV1 = {
  hasActiveSet: boolean;
  hasSetups: boolean;
  hasMeasurements: boolean;
};

export type CoreTireReadV1 = {
  version: typeof CORE_TIRE_READ_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  productSlug: ProductSlug;
  tireAvailability: CoreTireReadAvailabilityV1;
  /** Best-effort freshness anchor (V3 computedAt when authoritative and valid; else last tread measurement). */
  resolvedAt: string | null;
  productiveWearModelVersion: string;
  customerWearReadModel: CoreTireWearReadModelV1;
  activeSetup: CoreTireActiveSetupV1 | null;
  tread: CoreTireTreadHeadlineV1 | null;
  remainingV2: CoreTireRemainingV2V1 | null;
  remainingV3: CoreTireRemainingV3V1 | null;
  overallStatus: TireStatus | null;
  pressureStatus: TireStatus | null;
  seasonStatus: TireStatus | null;
  unevenWearStatus: TireStatus | null;
  confidence: TireConfidenceLevel | null;
  measurement: CoreTireMeasurementFlagsV1 | null;
  pressure: CoreTirePressureV1 | null;
  inventory: CoreTireInventoryV1 | null;
  v3: CoreTireV3MetaV1 | null;
};