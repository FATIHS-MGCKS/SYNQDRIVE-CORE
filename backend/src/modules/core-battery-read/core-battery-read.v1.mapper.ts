import type { FuelType, ProductSlug } from '@prisma/client';
import type { CanonicalBatteryHealthService } from '@modules/vehicle-intelligence/battery-health/canonical-battery-health.service';
import { isLvPublishedSohCustomerVisible } from '@modules/vehicle-intelligence/battery-health/battery-v2-user-facing-lv.policy';
import {
  LV_CANONICAL_TRUTH_SOURCES,
  type LvCanonicalTruthSource,
} from '@modules/vehicle-intelligence/battery-health/lv-canonical/lv-canonical-battery.types';
import {
  CORE_BATTERY_READ_CONTRACT_VERSION,
  type CoreBatteryHvReadV1,
  type CoreBatteryLvReadV1,
  type CoreBatteryReadV1,
} from './core-battery-read.v1.types';

/** Authority-verified LV sources that may surface customer publication percent (v1 allowlist). */
const PUBLISHABLE_LV_TRUTH_SOURCES: ReadonlySet<LvCanonicalTruthSource> = new Set([
  'WORKSHOP_MANUAL_EVIDENCE',
  'V2_PUBLICATION_STABLE',
  'V2_PUBLICATION_PROVISIONAL',
]);

function isKnownLvPrimaryTruthSource(
  source: string | null | undefined,
): source is LvCanonicalTruthSource {
  return source != null && (LV_CANONICAL_TRUTH_SOURCES as readonly string[]).includes(source);
}

function isPublishableLvPrimaryTruthSource(source: LvCanonicalTruthSource | null | undefined): boolean {
  return source != null && PUBLISHABLE_LV_TRUTH_SOURCES.has(source);
}

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

/**
 * LV percent may only surface when the existing customer publication gate passes.
 * Never use primaryTruth.decisionCapable or primaryTruth.estimatedHealthScore.
 */
function resolveLvPublishedHealthPercent(
  summary: CanonicalBatterySummaryForCoreRead,
  lvPublicationCustomerVisible: boolean,
): number | null {
  if (!lvPublicationCustomerVisible) return null;

  const rawSource = summary.canonical?.lv?.canonical?.primaryTruth?.source ?? null;
  if (!isKnownLvPrimaryTruthSource(rawSource) || !isPublishableLvPrimaryTruthSource(rawSource)) {
    return null;
  }

  const percent = summary.lv?.healthPercent ?? summary.currentState?.publishedSohPct ?? null;
  if (percent == null || !Number.isFinite(percent)) return null;
  return percent;
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
    aggregateHealthStatus: summary.lv?.healthStatus ?? null,
    primaryTruthSource: canonicalLv?.canonical?.primaryTruth?.source ?? null,
    restingVoltageV: summary.lv?.restingVoltage?.valueV ?? null,
    restingVoltageStatus: summary.lv?.restingVoltage?.status ?? null,
    displayVoltageV: summary.lv?.telemetry?.voltageV ?? null,
    voltageSource: summary.lv?.telemetry?.voltageSource ?? null,
    voltageObservedAt: summary.lv?.telemetry?.voltageObservedAt ?? null,
    lvPublicationCustomerVisible,
    lvPublishedHealthPercent: resolveLvPublishedHealthPercent(summary, lvPublicationCustomerVisible),
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

  const chargingStateRaw = summary.currentTelemetry?.chargingState;
  const chargingState =
    chargingStateRaw === 'charging' || chargingStateRaw === 'not_charging'
      ? chargingStateRaw
      : null;

  return {
    supported: true,
    healthStatus: summary.hv?.healthStatus ?? null,
    selectedTractionSohPercent: sohPct,
    selectedTractionSohSource: sohPct != null ? (summary.hv?.sohSource ?? null) : null,
    socPercent: summary.hv?.telemetry?.socPercent ?? summary.currentTelemetry?.socPercent ?? null,
    rangeKm: summary.hv?.telemetry?.rangeKm ?? summary.currentTelemetry?.rangeKm ?? null,
    chargingState,
    chargingPowerKw:
      summary.hv?.telemetry?.chargingPowerKw ?? summary.currentTelemetry?.chargingPowerKw ?? null,
    dataQualityStatus: summary.hv?.dataQualityStatus ?? null,
    observationDecisionFresh: decisionFresh,
    observationObservedAt: summary.hv?.freshness?.observedAt ?? null,
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
    aggregateHealthStatus: null,
    primaryTruthSource: null,
    restingVoltageV: null,
    restingVoltageStatus: null,
    displayVoltageV: null,
    voltageSource: null,
    voltageObservedAt: null,
    lvPublicationCustomerVisible: false,
    lvPublishedHealthPercent: null,
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
    resolvedAt: new Date(0).toISOString(),
    batteryAvailability: 'NOT_AVAILABLE',
    lv: emptyLv,
    hv: emptyHv,
  };
}
