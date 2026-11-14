import type { ProductSlug } from '@prisma/client';
import type { TireHealthSummary } from '@modules/vehicle-intelligence/tires/tire-health.service';
import type { TirePressureContext, TirePressureWheelPosition } from '@modules/vehicle-intelligence/tires/tire-pressure-context.types';
import type { TireHealthV3CustomerReadModel } from '@modules/vehicle-intelligence/tires/tire-health-v3-read.types';
import type { TireWearV3TreadEvidenceClass } from '@modules/vehicle-intelligence/tires/wear-v3-prior/tire-wear-v3-prior.types';
import { TIRE_WEAR_V3_UNAVAILABLE_MODEL_VERSION } from '@modules/vehicle-intelligence/tires/tire-health-v3-read.adapter';
import { TIRE_WEAR_MODEL_VERSION } from '@modules/vehicle-intelligence/tires/tire-wear-model-version';
import type { TireDisplayMode } from '@modules/vehicle-intelligence/tires/tire-status';
import {
  CORE_TIRE_READ_CONTRACT_VERSION,
  type CoreTirePressureV1,
  type CoreTirePressureWheelV1,
  type CoreTireReadV1,
  type CoreTireRemainingV2V1,
  type CoreTireRemainingV3V1,
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

function isV3UnavailableRead(wearV3: TireHealthV3CustomerReadModel): boolean {
  return (
    wearV3.modelVersion === TIRE_WEAR_V3_UNAVAILABLE_MODEL_VERSION ||
    (wearV3.insufficientEvidence && wearV3.wheels.length === 0 && wearV3.lowestTreadMm == null)
  );
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

function resolveLowestWheelEvidenceClass(
  wearV3: TireHealthV3CustomerReadModel,
): TireWearV3TreadEvidenceClass | undefined {
  const position = wearV3.lowestTreadPosition;
  if (!position) return undefined;
  const wheel = wearV3.wheels.find((w) => w.position === position);
  return wheel?.treadEvidenceClass;
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
  const position = wearV3.lowestTreadPosition;
  if (!position) {
    return null;
  }
  const wheel = wearV3.wheels.find((w) => w.position === position);
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

function mapTreadHeadline(
  summary: TireHealthSummaryForCoreRead,
  v3State: CoreTireV3CustomerStateV1,
  wearV3: TireHealthV3CustomerReadModel | undefined,
): CoreTireReadV1['tread'] {
  if (v3State === 'UNAVAILABLE' || (v3State === 'AUTHORITATIVE' && wearV3?.insufficientEvidence)) {
    return {
      lowestTreadMm: null,
      lowestTreadPosition: null,
      displayMode: 'UNKNOWN',
      treadProvenance: 'UNKNOWN',
      lastMeasurementAt: summary.lastMeasurementAt,
      measurementAgeDays: summary.measurementAgeDays,
    };
  }

  if (v3State === 'AUTHORITATIVE' && wearV3 && !isV3UnavailableRead(wearV3)) {
    const treadProvenance = mapTreadProvenanceFromV3Class(resolveLowestWheelEvidenceClass(wearV3));
  const displayMode = resolveAuthoritativeDisplayMode(
      treadProvenance,
      wearV3.insufficientEvidence,
    );
    const lowestTreadMm =
      treadProvenance === 'MEASURED'
        ? summary.measuredTreadMm ?? summary.displayTreadMm
        : treadProvenance === 'ESTIMATED' || treadProvenance === 'DEFAULT_ASSUMPTION'
          ? summary.estimatedTreadMm ?? summary.displayTreadMm
          : null;

    return {
      lowestTreadMm,
      lowestTreadPosition: wearV3.lowestTreadPosition,
      displayMode,
      treadProvenance,
      lastMeasurementAt: summary.lastMeasurementAt,
      measurementAgeDays: summary.measurementAgeDays,
    };
  }

  if (v3State === 'AUTHORITATIVE' && !wearV3) {
    return {
      lowestTreadMm: null,
      lowestTreadPosition: null,
      displayMode: 'UNKNOWN',
      treadProvenance: 'UNKNOWN',
      lastMeasurementAt: summary.lastMeasurementAt,
      measurementAgeDays: summary.measurementAgeDays,
    };
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
): CoreTireV3MetaV1 | null {
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

function resolveResolvedAt(
  summary: TireHealthSummaryForCoreRead,
  v3Meta: CoreTireV3MetaV1 | null,
): string | null {
  if (v3Meta?.computedAt) {
    return v3Meta.computedAt;
  }
  return summary.lastMeasurementAt ?? summary.latestMeasurementAt ?? null;
}

export function toCoreTireReadV1(args: {
  organizationId: string;
  vehicleId: string;
  productSlug: ProductSlug;
  summary: TireHealthSummaryForCoreRead | null;
}): CoreTireReadV1 {
  const { organizationId, vehicleId, productSlug, summary } = args;

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

  const customerWearReadModel: CoreTireWearReadModelV1 =
    summary.wearReadModel === 'v3' ? 'v3' : 'v2';
  const wearV3 = summary.wearV3;
  const v3State = resolveV3CustomerState(customerWearReadModel, wearV3);
  const v3Meta = mapV3Meta(v3State, wearV3);

  const remainingV2 =
    v3State === 'AUTHORITATIVE' || v3State === 'UNAVAILABLE'
      ? null
      : mapRemainingV2(summary);

  const remainingV3 =
    v3State === 'AUTHORITATIVE' && wearV3 && !isV3UnavailableRead(wearV3)
      ? mapRemainingV3FromWearV3(wearV3)
      : null;

  return {
    version: CORE_TIRE_READ_CONTRACT_VERSION,
    organizationId,
    vehicleId,
    productSlug,
    tireAvailability: 'AVAILABLE',
    resolvedAt: resolveResolvedAt(summary, v3Meta),
    productiveWearModelVersion: TIRE_WEAR_MODEL_VERSION,
    customerWearReadModel,
    activeSetup: {
      setupId: summary.activeSetupId ?? '',
      setupName: summary.activeSetupName,
      tireSeason: summary.tireSeason,
      installedAt: summary.installedAt,
    },
    tread: mapTreadHeadline(summary, v3State, wearV3),
    remainingV2,
    remainingV3,
    overallStatus: summary.overallStatus,
    pressureStatus: summary.pressureStatus,
    seasonStatus: summary.seasonStatus,
    unevenWearStatus: summary.unevenWearStatus,
    confidence: summary.confidence,
    measurement: {
      isMeasured: summary.isMeasured,
      isEstimated: summary.isEstimated,
      isDefaultAssumption: summary.isDefaultAssumption,
      measurementState: summary.measurementState,
    },
    pressure: mapPressure(summary.pressureContext),
    inventory: {
      hasActiveSet: summary.hasActiveSet,
      hasSetups: summary.hasSetups,
      hasMeasurements: summary.hasMeasurements,
    },
    v3: v3Meta,
  };
}