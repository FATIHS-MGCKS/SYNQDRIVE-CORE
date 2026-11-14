import type { ProductSlug } from '@prisma/client';
import type { TireHealthSummary } from '@modules/vehicle-intelligence/tires/tire-health.service';
import type { TirePressureContext, TirePressureWheelPosition } from '@modules/vehicle-intelligence/tires/tire-pressure-context.types';
import type {
  TireHealthV3CustomerReadModel,
  TireHealthV3WheelReadModel,
} from '@modules/vehicle-intelligence/tires/tire-health-v3-read.types';
import type { TireWearV3TreadEvidenceClass } from '@modules/vehicle-intelligence/tires/wear-v3-prior/tire-wear-v3-prior.types';
import { TIRE_WEAR_V3_UNAVAILABLE_MODEL_VERSION } from '@modules/vehicle-intelligence/tires/tire-health-v3-read.adapter';
import { TIRE_WEAR_MODEL_VERSION } from '@modules/vehicle-intelligence/tires/tire-wear-model-version';
import type { TireDisplayMode, TireStatus } from '@modules/vehicle-intelligence/tires/tire-status';
import {
  CORE_TIRE_READ_CONTRACT_VERSION,
  type CoreTirePressureV1,
  type CoreTirePressureWheelV1,
  type CoreTireReadV1,
  type CoreTireRemainingV2V1,
  type CoreTireRemainingV3V1,
  type CoreTireTreadHeadlineV1,
  type CoreTireTreadProvenanceV1,
  type CoreTireV3CustomerStateV1,
  type CoreTireV3MetaV1,
  type CoreTireWearReadModelV1,
} from './core-tire-read.v1.types';

export type TireHealthSummaryForCoreRead = TireHealthSummary;

const PRESSURE_WHEEL_ORDER: TirePressureWheelPosition[] = [
  'frontLeft',
  'frontRight',
  'rearLeft',
  'rearRight',
];

export function isV3UnavailableRead(wearV3: TireHealthV3CustomerReadModel): boolean {
  return (
    wearV3.modelVersion === TIRE_WEAR_V3_UNAVAILABLE_MODEL_VERSION ||
    (wearV3.insufficientEvidence && wearV3.wheels.length === 0 && wearV3.lowestTreadMm == null)
  );
}

/**
 * True when cutover requires authoritative V3 but upstream summary is not an authoritative V3 result.
 */
export function isAuthoritativeV3WearResultMissing(
  summary: TireHealthSummaryForCoreRead,
  v3AuthoritativeConfigured: boolean,
): boolean {
  if (!v3AuthoritativeConfigured) {
    return false;
  }
  if (summary.wearReadModel !== 'v3') {
    return true;
  }
  const wearV3 = summary.wearV3;
  if (!wearV3 || isV3UnavailableRead(wearV3)) {
    return true;
  }
  return false;
}

function mapTreadProvenanceFromV3Class(
  treadEvidenceClass: TireWearV3TreadEvidenceClass | undefined,
): CoreTireTreadProvenanceV1 {
  switch (treadEvidenceClass) {
    case 'MEASURED':
      return 'MEASURED';
    case 'CALIBRATED_ESTIMATE':
      return 'ESTIMATED';
    case 'BASELINE_ESTIMATE':
      return 'DEFAULT_ASSUMPTION';
    case 'INSUFFICIENT':
    default:
      return 'UNKNOWN';
  }
}

function resolveLowestV3Wheel(
  wearV3: TireHealthV3CustomerReadModel,
): TireHealthV3WheelReadModel | null {
  const position = wearV3.lowestTreadPosition;
  if (!position) {
    return null;
  }
  return wearV3.wheels.find((w) => w.position === position) ?? null;
}

function resolveLowestWheelEvidenceClass(
  wearV3: TireHealthV3CustomerReadModel,
): TireWearV3TreadEvidenceClass | undefined {
  return resolveLowestV3Wheel(wearV3)?.treadEvidenceClass;
}

/** Conservative public display bound — interval lower bound, not necessarily exact physical measurement. */
function resolveAuthoritativeLowestTreadMm(
  wheel: TireHealthV3WheelReadModel | null,
): number | null {
  if (!wheel?.treadDepthMm) {
    return null;
  }
  return wheel.treadDepthMm.lo;
}

function measurementAgeDaysFrom(iso: string | null): number | null {
  if (!iso) {
    return null;
  }
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) {
    return null;
  }
  return Math.floor(ms / 86400000);
}

function resolveV3CustomerState(
  customerWearReadModel: CoreTireWearReadModelV1,
  wearV3: TireHealthV3CustomerReadModel | undefined,
): CoreTireV3CustomerStateV1 {
  if (customerWearReadModel === 'v3' && !wearV3) {
    return 'UNAVAILABLE';
  }
  if (!wearV3) {
    return 'INACTIVE';
  }
  if (isV3UnavailableRead(wearV3)) {
    return 'UNAVAILABLE';
  }
  if (customerWearReadModel === 'v3') {
    return 'AUTHORITATIVE';
  }
  return 'ATTACHED';
}

function mapPressure(pressureContext: TirePressureContext): CoreTirePressureV1 {
  const wheels: CoreTirePressureWheelV1[] = PRESSURE_WHEEL_ORDER.map((position) => {
    const reading = pressureContext.wheels[position];
    return {
      position,
      valueBar: reading.value,
      sourceProvider: reading.sourceProvider,
      sourceObservedAt: reading.sourceTimestamp,
      freshness: reading.freshness,
    };
  });

  return {
    overallStatus: pressureContext.overallStatus,
    overallFreshness: pressureContext.overallFreshness,
    sourceType: pressureContext.sourceType,
    wheels,
  };
}

function mapRemainingV2(summary: TireHealthSummaryForCoreRead): CoreTireRemainingV2V1 {
  const presentation = summary.evidencePresentation?.remainingKm;
  if (presentation) {
    return {
      reliable: presentation.reliable,
      exactRemainingKm: presentation.reliable ? presentation.exactKm : null,
      bandMinRemainingKm: presentation.bandMinKm,
      bandMaxRemainingKm: presentation.bandMaxKm,
    };
  }

  return {
    reliable: false,
    exactRemainingKm: null,
    bandMinRemainingKm: null,
    bandMaxRemainingKm: null,
  };
}

function mapRemainingV3FromWearV3(
  wearV3: TireHealthV3CustomerReadModel,
): CoreTireRemainingV3V1 | null {
  if (wearV3.insufficientEvidence || isV3UnavailableRead(wearV3)) {
    return null;
  }
  const wheel = resolveLowestV3Wheel(wearV3);
  const interval = wheel?.remainingKm ?? null;
  if (!interval) {
    return null;
  }
  return {
    intervalMinRemainingKm: interval.lo,
    intervalMaxRemainingKm: interval.hi,
  };
}

function resolveAuthoritativeDisplayMode(
  treadProvenance: CoreTireTreadProvenanceV1,
  insufficientEvidence: boolean,
): TireDisplayMode {
  if (insufficientEvidence || treadProvenance === 'UNKNOWN') {
    return 'UNKNOWN';
  }
  if (treadProvenance === 'MEASURED') {
    return 'MEASURED';
  }
  return 'ESTIMATED';
}

function failClosedTreadHeadline(): CoreTireTreadHeadlineV1 {
  return {
    lowestTreadMm: null,
    lowestTreadPosition: null,
    displayMode: 'UNKNOWN',
    treadProvenance: 'UNKNOWN',
    lastMeasurementAt: null,
    measurementAgeDays: null,
  };
}

function mapTreadHeadline(
  summary: TireHealthSummaryForCoreRead,
  v3State: CoreTireV3CustomerStateV1,
  wearV3: TireHealthV3CustomerReadModel | undefined,
): CoreTireTreadHeadlineV1 {
  if (v3State === 'UNAVAILABLE' || (v3State === 'AUTHORITATIVE' && wearV3?.insufficientEvidence)) {
    return failClosedTreadHeadline();
  }

  if (v3State === 'AUTHORITATIVE' && wearV3 && !isV3UnavailableRead(wearV3)) {
    const lowestWheel = resolveLowestV3Wheel(wearV3);
    const treadProvenance = mapTreadProvenanceFromV3Class(lowestWheel?.treadEvidenceClass);
    const displayMode = resolveAuthoritativeDisplayMode(
      treadProvenance,
      wearV3.insufficientEvidence,
    );
    const lowestTreadMm = resolveAuthoritativeLowestTreadMm(lowestWheel);
    if (lowestTreadMm == null && treadProvenance === 'UNKNOWN') {
      return failClosedTreadHeadline();
    }

    const lastMeasurementAt = lowestWheel?.lastAcceptedMeasurementAt ?? null;
    return {
      lowestTreadMm,
      lowestTreadPosition: wearV3.lowestTreadPosition,
      displayMode,
      treadProvenance,
      lastMeasurementAt,
      measurementAgeDays: measurementAgeDaysFrom(lastMeasurementAt),
    };
  }

  if (v3State === 'AUTHORITATIVE' && !wearV3) {
    return failClosedTreadHeadline();
  }

  const treadProvenance: CoreTireTreadProvenanceV1 = summary.isMeasured
    ? 'MEASURED'
    : summary.isDefaultAssumption
      ? 'DEFAULT_ASSUMPTION'
      : summary.isEstimated
        ? 'ESTIMATED'
        : 'UNKNOWN';

  return {
    lowestTreadMm: summary.displayTreadMm,
    lowestTreadPosition: summary.lowestTreadPosition,
    displayMode: summary.displayMode,
    treadProvenance,
    lastMeasurementAt: summary.lastMeasurementAt,
    measurementAgeDays: summary.measurementAgeDays,
  };
}

function mapV3Meta(
  v3State: CoreTireV3CustomerStateV1,
  wearV3: TireHealthV3CustomerReadModel | undefined,
  options: { forceUnavailable: boolean },
): CoreTireV3MetaV1 | null {
  if (options.forceUnavailable) {
    return {
      customerState: 'UNAVAILABLE',
      modelVersion: wearV3?.modelVersion ?? null,
      computedAt: null,
      verificationStatus: wearV3?.verificationStatus ?? null,
      insufficientEvidence: wearV3?.insufficientEvidence ?? true,
    };
  }

  if (v3State === 'INACTIVE') {
    return {
      customerState: 'INACTIVE',
      modelVersion: null,
      computedAt: null,
      verificationStatus: null,
      insufficientEvidence: null,
    };
  }
  if (!wearV3 || v3State === 'UNAVAILABLE') {
    return {
      customerState: 'UNAVAILABLE',
      modelVersion: wearV3?.modelVersion ?? null,
      computedAt: null,
      verificationStatus: wearV3?.verificationStatus ?? null,
      insufficientEvidence: wearV3?.insufficientEvidence ?? true,
    };
  }

  const authoritativeUnavailable = isV3UnavailableRead(wearV3);
  return {
    customerState: v3State,
    modelVersion: wearV3.modelVersion,
    computedAt: authoritativeUnavailable ? null : wearV3.computedAt,
    verificationStatus: wearV3.verificationStatus,
    insufficientEvidence: wearV3.insufficientEvidence,
  };
}

function resolveResolvedAt(args: {
  summary: TireHealthSummaryForCoreRead;
  customerWearReadModel: CoreTireWearReadModelV1;
  v3State: CoreTireV3CustomerStateV1;
  v3Meta: CoreTireV3MetaV1 | null;
  authoritativeWearSuppressed: boolean;
  tread: CoreTireTreadHeadlineV1 | null;
}): string | null {
  const { summary, customerWearReadModel, v3State, v3Meta, authoritativeWearSuppressed, tread } =
    args;

  if (authoritativeWearSuppressed || v3State === 'UNAVAILABLE') {
    return null;
  }

  if (customerWearReadModel === 'v3' && v3State === 'AUTHORITATIVE' && v3Meta?.computedAt) {
    return v3Meta.computedAt;
  }

  if (tread?.lastMeasurementAt) {
    return tread.lastMeasurementAt;
  }

  return summary.lastMeasurementAt ?? summary.latestMeasurementAt ?? null;
}

function mapAuthoritativeWearSuppressedDto(args: {
  organizationId: string;
  vehicleId: string;
  productSlug: ProductSlug;
  summary: TireHealthSummaryForCoreRead;
  wearV3: TireHealthV3CustomerReadModel | undefined;
}): CoreTireReadV1 {
  const { organizationId, vehicleId, productSlug, summary, wearV3 } = args;

  return {
    version: CORE_TIRE_READ_CONTRACT_VERSION,
    organizationId,
    vehicleId,
    productSlug,
    tireAvailability: 'AVAILABLE',
    resolvedAt: null,
    productiveWearModelVersion: TIRE_WEAR_MODEL_VERSION,
    customerWearReadModel: 'v3',
    activeSetup: {
      setupId: summary.activeSetupId ?? '',
      setupName: summary.activeSetupName,
      tireSeason: summary.tireSeason,
      installedAt: summary.installedAt,
    },
    tread: failClosedTreadHeadline(),
    remainingV2: null,
    remainingV3: null,
    overallStatus: 'UNKNOWN' as TireStatus,
    pressureStatus: summary.pressureStatus,
    seasonStatus: summary.seasonStatus,
    unevenWearStatus: summary.unevenWearStatus,
    confidence: null,
    measurement: null,
    pressure: mapPressure(summary.pressureContext),
    inventory: {
      hasActiveSet: summary.hasActiveSet,
      hasSetups: summary.hasSetups,
      hasMeasurements: summary.hasMeasurements,
    },
    v3: mapV3Meta('UNAVAILABLE', wearV3, { forceUnavailable: true }),
  };
}

export function toCoreTireReadV1(args: {
  organizationId: string;
  vehicleId: string;
  productSlug: ProductSlug;
  summary: TireHealthSummaryForCoreRead | null;
  v3AuthoritativeConfigured?: boolean;
}): CoreTireReadV1 {
  const {
    organizationId,
    vehicleId,
    productSlug,
    summary,
    v3AuthoritativeConfigured = false,
  } = args;

  if (!summary) {
    return {
      version: CORE_TIRE_READ_CONTRACT_VERSION,
      organizationId,
      vehicleId,
      productSlug,
      tireAvailability: 'NO_ACTIVE_SETUP',
      resolvedAt: null,
      productiveWearModelVersion: TIRE_WEAR_MODEL_VERSION,
      customerWearReadModel: 'v2',
      activeSetup: null,
      tread: null,
      remainingV2: null,
      remainingV3: null,
      overallStatus: null,
      pressureStatus: null,
      seasonStatus: null,
      unevenWearStatus: null,
      confidence: null,
      measurement: null,
      pressure: null,
      inventory: null,
      v3: null,
    };
  }

  const wearV3 = summary.wearV3;
  if (isAuthoritativeV3WearResultMissing(summary, v3AuthoritativeConfigured)) {
    return mapAuthoritativeWearSuppressedDto({
      organizationId,
      vehicleId,
      productSlug,
      summary,
      wearV3,
    });
  }

  const customerWearReadModel: CoreTireWearReadModelV1 =
    summary.wearReadModel === 'v3' ? 'v3' : 'v2';
  const v3State = resolveV3CustomerState(customerWearReadModel, wearV3);
  const v3Meta = mapV3Meta(v3State, wearV3, { forceUnavailable: false });
  const tread = mapTreadHeadline(summary, v3State, wearV3);

  const remainingV2 =
    v3State === 'AUTHORITATIVE' || v3State === 'UNAVAILABLE'
      ? null
      : mapRemainingV2(summary);

  const remainingV3 =
    v3State === 'AUTHORITATIVE' && wearV3 && !isV3UnavailableRead(wearV3)
      ? mapRemainingV3FromWearV3(wearV3)
      : null;

  const measurement =
    v3State === 'AUTHORITATIVE' || v3State === 'UNAVAILABLE'
      ? null
      : {
          isMeasured: summary.isMeasured,
          isEstimated: summary.isEstimated,
          isDefaultAssumption: summary.isDefaultAssumption,
          measurementState: summary.measurementState,
        };

  return {
    version: CORE_TIRE_READ_CONTRACT_VERSION,
    organizationId,
    vehicleId,
    productSlug,
    tireAvailability: 'AVAILABLE',
    resolvedAt: resolveResolvedAt({
      summary,
      customerWearReadModel,
      v3State,
      v3Meta,
      authoritativeWearSuppressed: false,
      tread,
    }),
    productiveWearModelVersion: TIRE_WEAR_MODEL_VERSION,
    customerWearReadModel,
    activeSetup: {
      setupId: summary.activeSetupId ?? '',
      setupName: summary.activeSetupName,
      tireSeason: summary.tireSeason,
      installedAt: summary.installedAt,
    },
    tread,
    remainingV2,
    remainingV3,
    overallStatus: summary.overallStatus,
    pressureStatus: summary.pressureStatus,
    seasonStatus: summary.seasonStatus,
    unevenWearStatus: summary.unevenWearStatus,
    confidence: summary.confidence,
    measurement,
    pressure: mapPressure(summary.pressureContext),
    inventory: {
      hasActiveSet: summary.hasActiveSet,
      hasSetups: summary.hasSetups,
      hasMeasurements: summary.hasMeasurements,
    },
    v3: v3Meta,
  };
}