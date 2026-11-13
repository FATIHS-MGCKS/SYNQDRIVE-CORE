import type { FuelType, ProductSlug } from '@prisma/client';
import type { LvCanonicalTruthSource } from '@modules/vehicle-intelligence/battery-health/lv-canonical/lv-canonical-battery.types';
import type { BatteryHealthStatus } from '@modules/vehicle-intelligence/battery-health/battery-status';
import type { BatteryStatus } from '@modules/vehicle-intelligence/battery-health/canonical-battery-health.service';
import type { HvSohSource } from '@modules/vehicle-intelligence/battery-health/canonical-battery-health.service';

/**
 * Contract `core.battery.read.v1` — read-only technical battery summary for one vehicle.
 *
 * Fail-closed technical read: no LV/HV publication numerics, no score bands, no
 * `estimatedHealthScore`, `displayBars`, primary-truth scores, rental readiness/blocking,
 * ModuleHealth, or raw `CanonicalBatteryDto`.
 *
 * `batteryAvailability`: `AVAILABLE` when `CanonicalBatteryHealthService.getSummary` returned
 * a summary for the vehicle; `NOT_AVAILABLE` when the summary is absent (`resolvedAt` null).
 *
 * Authorization: user JWT + ACTIVE org membership + `fleet.read` + ACTIVE product license.
 * Not authorized for M2M or production publication activation.
 */
export const CORE_BATTERY_READ_CONTRACT_VERSION = 'core.battery.read.v1' as const;

export type CoreBatteryReadAvailabilityV1 = 'AVAILABLE' | 'NOT_AVAILABLE';

export type CoreBatteryLvReadV1 = {
  supported: boolean;
  profile: string | null;
  driveProfile: string | null;
  /** Technical availability/lifecycle (ready/calibrating/…), not a publication score band. */
  liveStatus: BatteryStatus | null;
  /** LV primary-truth label only — never exposes `estimatedHealthScore`. */
  primaryTruthSource: LvCanonicalTruthSource | null;
  restingVoltageV: number | null;
  restingVoltageStatus: string | null;
  displayVoltageV: number | null;
  voltageSource: 'live_telemetry' | 'resting_snapshot' | null;
  voltageObservedAt: string | null;
  /** Runtime LV customer-publication gate (BATTERY_V2_PUBLICATION_ENABLED + legacy safety). */
  lvPublicationCustomerVisible: boolean;
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
  /** From `currentTelemetry.observationFreshness` (live telemetry authority). */
  telemetryDecisionFresh: boolean | null;
  telemetryObservedAt: string | null;
};

export type CoreBatteryReadV1 = {
  version: typeof CORE_BATTERY_READ_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  productSlug: ProductSlug;
  fuelType: FuelType;
  isEv: boolean;
  /** Summary `generatedAt` when available; null when `batteryAvailability` is NOT_AVAILABLE. */
  resolvedAt: string | null;
  batteryAvailability: CoreBatteryReadAvailabilityV1;
  lv: CoreBatteryLvReadV1;
  hv: CoreBatteryHvReadV1;
};
