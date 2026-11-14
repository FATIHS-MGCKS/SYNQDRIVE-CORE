import type { ProductSlug } from '@prisma/client';
import type { BrakeHealthSummaryDto } from '@modules/vehicle-intelligence/brakes/brake-health.service';
import { BRAKE_WEAR_MODEL_VERSION } from '@modules/vehicle-intelligence/brakes/brake-wear-model-version';
import {
  CORE_BRAKE_READ_CONTRACT_VERSION,
  type CoreBrakeReadAvailabilityV1,
  type CoreBrakeReadV1,
  type CoreBrakeRemainingV1,
  type CoreBrakeSafetyAlertV1,
} from './core-brake-read.v1.types';

export type BrakeHealthSummaryForCoreRead = BrakeHealthSummaryDto;

const SAFETY_ALERT_CAP = 5;

function resolveBrakeAvailability(
  stateClass: BrakeHealthSummaryDto['stateClass'],
  isInitialized: boolean,
): CoreBrakeReadAvailabilityV1 {
  if (stateClass === 'WARNING_ONLY') {
    return 'WARNING_ONLY';
  }
  if (!isInitialized || stateClass === 'NO_BASELINE') {
    return 'NO_BASELINE';
  }
  return 'AVAILABLE';
}

function resolveResolvedAt(summary: BrakeHealthSummaryForCoreRead): string | null {
  if (summary.isInitialized && summary.updatedAt) {
    return summary.updatedAt;
  }
  return summary.lastMeasurementAt ?? null;
}

function mapRemaining(summary: BrakeHealthSummaryForCoreRead): CoreBrakeRemainingV1 {
  const pres = summary.evidencePresentation?.overallRemainingKm;
  if (!pres) {
    return {
      reliable: false,
      exactRemainingKm: null,
      bandMinRemainingKm: null,
      bandMaxRemainingKm: null,
    };
  }
  const reliable = pres.reliable === true;
  return {
    reliable,
    exactRemainingKm: reliable ? (pres.exactKm ?? null) : null,
    bandMinRemainingKm: pres.bandMinKm ?? null,
    bandMaxRemainingKm: pres.bandMaxKm ?? null,
  };
}

export function mapSafetyAlertsFromSummary(
  summary: BrakeHealthSummaryForCoreRead,
): {
  alerts: CoreBrakeSafetyAlertV1[];
  hasActiveSafetyAlert: boolean;
} {
  const safetyOnly = (summary.openAlerts ?? []).filter(
    (alert) => alert.displayMode === 'SAFETY_EVIDENCE',
  );
  return {
    hasActiveSafetyAlert: safetyOnly.length > 0,
    alerts: safetyOnly.slice(0, SAFETY_ALERT_CAP).map((alert) => ({
      code: alert.code,
      severity: alert.severity,
      ...(alert.axle != null ? { axle: alert.axle } : {}),
      displayMode: alert.displayMode,
    })),
  };
}

export function toCoreBrakeReadV1(args: {
  organizationId: string;
  vehicleId: string;
  productSlug: ProductSlug;
  summary: BrakeHealthSummaryForCoreRead;
}): CoreBrakeReadV1 {
  const { organizationId, vehicleId, productSlug, summary } = args;
  const { alerts, hasActiveSafetyAlert } = mapSafetyAlertsFromSummary(summary);

  return {
    version: CORE_BRAKE_READ_CONTRACT_VERSION,
    organizationId,
    vehicleId,
    productSlug,
    brakeAvailability: resolveBrakeAvailability(summary.stateClass, summary.isInitialized),
    resolvedAt: resolveResolvedAt(summary),
    productiveWearModelVersion:
      summary.evidencePresentation?.modelVersion ?? BRAKE_WEAR_MODEL_VERSION,
    trackingState: {
      isInitialized: summary.isInitialized,
      stateClass: summary.stateClass,
    },
    overall: {
      condition: summary.overallCondition,
      dataBasis: summary.dataBasis,
      confidenceLevel: summary.confidenceLevel,
    },
    frontAxle: {
      condition: summary.frontAxle.condition,
      dataBasis: summary.frontAxle.dataBasis,
      confidenceLevel: summary.frontAxle.confidence,
    },
    rearAxle: {
      condition: summary.rearAxle.condition,
      dataBasis: summary.rearAxle.dataBasis,
      confidenceLevel: summary.rearAxle.confidence,
    },
    modeledComponents: {
      frontPads: summary.modeledComponents.frontPads,
      rearPads: summary.modeledComponents.rearPads,
      frontDiscs: summary.modeledComponents.frontDiscs,
      rearDiscs: summary.modeledComponents.rearDiscs,
      hasAnyModeled: summary.modeledComponents.hasAnyModeled,
    },
    modelCoverage: {
      coverageStatus: summary.modelCoverage.coverageStatus,
      hasGap: summary.modelCoverage.hasGap,
      reconciliationRequired: summary.modelCoverage.reconciliationRequired,
      modeledTripCount: summary.modelCoverage.modeledTripCount,
    },
    remaining: mapRemaining(summary),
    timestamps: {
      lastMeasurementAt: summary.lastMeasurementAt,
      lastServiceAt: summary.lastServiceAt,
      lastRecalculatedAt: summary.lastRecalculatedAt ?? null,
    },
    safetySignals: {
      hasActiveSafetyAlert,
      alerts,
    },
  };
}