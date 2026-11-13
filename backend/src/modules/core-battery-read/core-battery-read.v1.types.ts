import type { FuelType, ProductSlug } from '@prisma/client';
import type { LvCanonicalTruthSource } from '@modules/vehicle-intelligence/battery-health/lv-canonical/lv-canonical-battery.types';
import type {
  BatteryHealthStatus,
  LvAggregateStatus,
} from '@modules/vehicle-intelligence/battery-health/battery-status';
import type { BatteryStatus } from '@modules/vehicle-intelligence/battery-health/canonical-battery-health.service';
import type { HvSohSource } from '@modules/vehicle-intelligence/battery-health/canonical-battery-health.service';

/**
 * Contract `core.battery.read.v1` — read-only technical battery summary for one vehicle.
 *
 * Does not expose rental readiness/blocking, ModuleHealth, shadow assessments as scores,
 * raw CanonicalBatteryDto, or LV/HV publication numerics unless the existing
 * `isLvPublishedSohCustomerVisible` gate already allows customer LV publication percent.
 * Does not expose `estimatedHealthScore`, `displayBars`, or primary-truth scores.
 * Authorization: user JWT + ACTIVE org membership + `fleet.read` + ACTIVE product license.
 * Not authorized for M2M or production publication activation.
 */
export const CORE_BATTERY_READ_CONTRACT_VERSION = 'core.battery.read.v1' as const;

export type CoreBatteryReadAvailabilityV1 = 'AVAILABLE' | 'NOT_AVAILABLE';

export type CoreBatteryLvReadV1 = {
  supported: boolean;
  profile: string | null;
  driveProfile: string | null;
  liveStatus: BatteryStatus | null;
  aggregateHealthStatus: LvAggregateStatus | null;
  primaryTruthSource: LvCanonicalTruthSource | null;
  restingVoltageV: number | null;
  restingVoltageStatus: string | null;
  displayVoltageV: number | null;
  voltageSource: 'live_telemetry' | 'resting_snapshot' | null;
  voltageObservedAt: string | null;
  /** Runtime LV customer-publication gate (BATTERY_V2_PUBLICATION_ENABLED + legacy safety). */
  lvPublicationCustomerVisible: boolean;
  /** Only populated when `lvPublicationCustomerVisible`; never from primaryTruth alone. */
  lvPublishedHealthPercent: number | null;
  dataQualityStatus: string | null;
  observationDecisionFresh: boolean | null;
  observationObservedAt: string | null;
};

export type CoreBatteryHvReadV1 = {
  supported: boolean;
  healthStatus: BatteryHealthStatus | null;
  selectedTractionSohPercent: number | null;
  selectedTractionSohSource: HvSohSource | null;
  socPercent: number | null;
  rangeKm: number | null;
  chargingState: 'charging' | 'not_charging' | null;
  chargingPowerKw: number | null;
  dataQualityStatus: string | null;
  observationDecisionFresh: boolean | null;
  observationObservedAt: string | null;
};

export type CoreBatteryReadV1 = {
  version: typeof CORE_BATTERY_READ_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  productSlug: ProductSlug;
  fuelType: FuelType;
  isEv: boolean;
  resolvedAt: string;
  batteryAvailability: CoreBatteryReadAvailabilityV1;
  lv: CoreBatteryLvReadV1;
  hv: CoreBatteryHvReadV1;
};
