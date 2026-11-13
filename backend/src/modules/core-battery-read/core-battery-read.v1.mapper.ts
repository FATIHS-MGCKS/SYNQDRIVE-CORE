import type { FuelType, ProductSlug } from '@prisma/client';
import type { CanonicalBatteryHealthService } from '@modules/vehicle-intelligence/battery-health/canonical-battery-health.service';
import { observationFreshnessIsDecisionFresh } from '@modules/vehicle-intelligence/battery-health/battery-freshness.policy';
import { isLvPublishedSohCustomerVisible } from '@modules/vehicle-intelligence/battery-health/battery-v2-user-facing-lv.policy';
import {
  CORE_BATTERY_READ_CONTRACT_VERSION,
  type CoreBatteryHvReadV1,
  type CoreBatteryLvReadV1,
  type CoreBatteryReadV1,
} from './core-battery-read.v1.types';

export type CanonicalBatterySummaryForCoreRead = NonNullable<
  Awaited<ReturnType<CanonicalBatteryHealthService['getSummary']>>
>;

function resolveLvPublicationCustomerVisible(summary: CanonicalBatterySummaryForCoreRead): boolean {
  const safety =
    summary.lv?.legacyPublicationSafety ??
    summary.lv?.estimatedHealth?.legacyPublicationSafety ??
    null;
  if (!safety) return false;
  return isLvPublishedSohCustomerVisible(safety);
}

function resolveCurrentTelemetryFreshness(summary: CanonicalBatterySummaryForCoreRead): {
  telemetryDecisionFresh: boolean | null;
  telemetryObservedAt: string | null;
  liveTelemetryUsable: boolean;
} {
  const observation = summary.currentTelemetry?.observationFreshness ?? null;
  const telemetryObservedAt = observation?.observedAt ?? null;
  if (!observation) {
    return {
      telemetryDecisionFresh: null,
      telemetryObservedAt: null,
      liveTelemetryUsable: false,
    };
  }
  const telemetryDecisionFresh = observationFreshnessIsDecisionFresh(observation);
  return {
    telemetryDecisionFresh,
    telemetryObservedAt,
    liveTelemetryUsable: telemetryDecisionFresh,
  };
}

function mapLvSection(
  summary: CanonicalBatterySummaryForCoreRead,
  lvPublicationCustomerVisible: boolean,
): CoreBatteryLvReadV1 {
  const canonicalLv = summary.canonical?.lv;
  const profile = canonicalLv?.profile;

  return {
    supported: profile?.supported ?? false,
    profile: profile?.profile ?? null,
    driveProfile: profile?.driveProfile ?? null,
    liveStatus: summary.lv?.status ?? null,
    primaryTruthSource: canonicalLv?.canonical?.primaryTruth?.source ?? null,
    restingVoltageV: summary.lv?.restingVoltage?.valueV ?? null,
    restingVoltageStatus: summary.lv?.restingVoltage?.status ?? null,
    displayVoltageV: summary.lv?.telemetry?.voltageV ?? null,
    voltageSource: summary.lv?.telemetry?.voltageSource ?? null,
    voltageObservedAt: summary.lv?.telemetry?.voltageObservedAt ?? null,
    lvPublicationCustomerVisible,
    dataQualityStatus: summary.canonical?.dataQuality?.aggregate?.status ?? null,
    observationDecisionFresh: summary.lv?.freshness?.isFresh ?? null,
    observationObservedAt: summary.lv?.freshness?.observedAt ?? null,
  };
}

function emptyHvMetricsV1(supported: boolean): CoreBatteryHvReadV1 {
  return {
    supported,
    healthStatus: null,
    selectedTractionSohPercent: null,
    selectedTractionSohSource: null,
    socPercent: null,
    rangeKm: null,
    chargingState: null,
    chargingPowerKw: null,
    dataQualityStatus: null,
    observationDecisionFresh: null,
    observationObservedAt: null,
    telemetryDecisionFresh: null,
    telemetryObservedAt: null,
  };
}

function mapHvSection(summary: CanonicalBatterySummaryForCoreRead): CoreBatteryHvReadV1 {
  const isEv = summary.canonical?.isEv ?? false;
  const hvSupported = summary.canonical?.hv?.supported ?? isEv;

  if (!hvSupported) {
    return emptyHvMetricsV1(false);
  }

  const decisionFresh = summary.hv?.freshness?.isFresh ?? null;
  const sohPct =
    decisionFresh === true && summary.hv?.sohPct != null && Number.isFinite(summary.hv.sohPct)
      ? summary.hv.sohPct
      : null;

  const { telemetryDecisionFresh, telemetryObservedAt, liveTelemetryUsable } =
    resolveCurrentTelemetryFreshness(summary);

  const chargingStateRaw = summary.currentTelemetry?.chargingState;
  const chargingState =
    liveTelemetryUsable &&
    (chargingStateRaw === 'charging' || chargingStateRaw === 'not_charging')
      ? chargingStateRaw
      : null;

  return {
    supported: true,
    healthStatus: decisionFresh === true ? (summary.hv?.healthStatus ?? null) : null,
    selectedTractionSohPercent: sohPct,
    selectedTractionSohSource: sohPct != null ? (summary.hv?.sohSource ?? null) : null,
    socPercent: liveTelemetryUsable
      ? (summary.currentTelemetry?.socPercent ?? summary.hv?.telemetry?.socPercent ?? null)
      : null,
    rangeKm: liveTelemetryUsable
      ? (summary.currentTelemetry?.rangeKm ?? summary.hv?.telemetry?.rangeKm ?? null)
      : null,
    chargingState,
    chargingPowerKw: liveTelemetryUsable
      ? (summary.currentTelemetry?.chargingPowerKw ?? summary.hv?.telemetry?.chargingPowerKw ?? null)
      : null,
    dataQualityStatus: summary.hv?.dataQualityStatus ?? null,
    observationDecisionFresh: decisionFresh,
    observationObservedAt: summary.hv?.freshness?.observedAt ?? null,
    telemetryDecisionFresh,
    telemetryObservedAt,
  };
}

export function toCoreBatteryReadV1(input: {
  organizationId: string;
  vehicleId: string;
  productSlug: ProductSlug;
  fuelType: FuelType;
  summary: CanonicalBatterySummaryForCoreRead | null;
}): CoreBatteryReadV1 {
  if (!input.summary) {
    return emptyCoreBatteryReadV1(input);
  }

  const lvPublicationCustomerVisible = resolveLvPublicationCustomerVisible(input.summary);

  return {
    version: CORE_BATTERY_READ_CONTRACT_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    productSlug: input.productSlug,
    fuelType: input.fuelType,
    isEv: input.summary.canonical?.isEv ?? false,
    resolvedAt: input.summary.generatedAt,
    batteryAvailability: 'AVAILABLE',
    lv: mapLvSection(input.summary, lvPublicationCustomerVisible),
    hv: mapHvSection(input.summary),
  };
}

function emptyCoreBatteryReadV1(input: {
  organizationId: string;
  vehicleId: string;
  productSlug: ProductSlug;
  fuelType: FuelType;
}): CoreBatteryReadV1 {
  const emptyLv: CoreBatteryLvReadV1 = {
    supported: false,
    profile: null,
    driveProfile: null,
    liveStatus: null,
    primaryTruthSource: null,
    restingVoltageV: null,
    restingVoltageStatus: null,
    displayVoltageV: null,
    voltageSource: null,
    voltageObservedAt: null,
    lvPublicationCustomerVisible: false,
    dataQualityStatus: null,
    observationDecisionFresh: null,
    observationObservedAt: null,
  };

  const emptyHv = emptyHvMetricsV1(false);

  return {
    version: CORE_BATTERY_READ_CONTRACT_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    productSlug: input.productSlug,
    fuelType: input.fuelType,
    isEv: false,
    resolvedAt: null,
    batteryAvailability: 'NOT_AVAILABLE',
    lv: emptyLv,
    hv: emptyHv,
  };
}
