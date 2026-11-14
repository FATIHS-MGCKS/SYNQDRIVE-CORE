import { ProductSlug } from '@prisma/client';
import type { BrakeHealthSummaryDto } from '@modules/vehicle-intelligence/brakes/brake-health.service';
import { buildBrakeEvidencePresentation } from '@modules/vehicle-intelligence/brakes/brake-health-presentation';
import { toCoreBrakeReadV1 } from './core-brake-read.v1.mapper';

const TOP_LEVEL_KEYS = [
  'version',
  'organizationId',
  'vehicleId',
  'productSlug',
  'brakeAvailability',
  'resolvedAt',
  'productiveWearModelVersion',
  'trackingState',
  'overall',
  'frontAxle',
  'rearAxle',
  'modeledComponents',
  'modelCoverage',
  'remaining',
  'timestamps',
  'safetySignals',
] as const;

const FORBIDDEN_TOP = [
  'legacy',
  'confidence',
  'reasons',
  'recommendations',
  'evidencePresentation',
  'componentThresholds',
  'baselineWarnings',
  'provenanceWarnings',
  'legacyHeuristic',
  'coverageRatio',
  'estimatedFrontRemainingKmMin',
  'blocksRental',
  'factors',
  'inputFingerprint',
  'message',
  'dedupeKey',
] as const;

function pollutedSummary(): BrakeHealthSummaryDto {
  return {
    isInitialized: true,
    stateClass: 'ESTIMATED',
    modeledComponents: {
      frontPads: true,
      rearPads: true,
      frontDiscs: true,
      rearDiscs: true,
      hasAnyPads: true,
      hasAnyDiscs: true,
      hasAnyModeled: true,
    },
    modelCoverage: {
      distanceSinceAnchorKm: 1,
      modeledDistanceKm: 1,
      modeledTripCount: 1,
      coverageRatio: 0.5,
      coverageRatioRaw: 0.5,
      underCoverageKm: 100,
      overCoverageKm: 0,
      coverageStatus: 'PARTIAL',
      hasGap: true,
      reconciliationRequired: false,
      source: 'OBSERVED',
    },
    baselineWarnings: ['hidden'],
    provenanceWarnings: ['hidden'],
    overallCondition: 'WARNING',
    dataBasis: 'ESTIMATED',
    confidenceLevel: 'LOW',
    frontAxle: {
      condition: 'WARNING',
      dataBasis: 'ESTIMATED',
      confidence: 'LOW',
      estimatedRemainingKmMin: 1000,
      estimatedRemainingKmMax: 2000,
    },
    rearAxle: {
      condition: 'WARNING',
      dataBasis: 'ESTIMATED',
      confidence: 'LOW',
      estimatedRemainingKmMin: 1000,
      estimatedRemainingKmMax: 2000,
    },
    frontAxleCondition: 'WARNING',
    rearAxleCondition: 'WARNING',
    frontDataBasis: 'ESTIMATED',
    rearDataBasis: 'ESTIMATED',
    frontConfidence: 'LOW',
    rearConfidence: 'LOW',
    estimatedFrontRemainingKmMin: 1000,
    estimatedFrontRemainingKmMax: 2000,
    estimatedRearRemainingKmMin: 1000,
    estimatedRearRemainingKmMax: 2000,
    nextInspectionRecommendedInKm: 500,
    estimatedReplacementDueInKm: 1000,
    reasons: ['Geheim'],
    recommendations: ['Geheim'],
    alerts: [{ code: 'BRAKE_COVERAGE_GAP', alertType: 'x', category: 'DATA_QUALITY', reasonCode: 'x', severity: 'warning', message: 'm', messageEn: 'm', displayMode: 'DATA_GAP' }],
    openAlerts: [{ code: 'BRAKE_COVERAGE_GAP', alertType: 'x', category: 'DATA_QUALITY', reasonCode: 'x', severity: 'warning', message: 'm', messageEn: 'm', displayMode: 'DATA_GAP' }],
    lastMeasurementAt: null,
    lastMeasurementMileageKm: null,
    lastServiceAt: null,
    lastServiceMileageKm: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastRecalculatedAt: '2026-01-01T00:00:00.000Z',
    legacy: {
      padsHealthPct: 12,
      discsHealthPct: 12,
      padsRemainingKm: 12,
      discsRemainingKm: 12,
      status: 'critical',
      remainingKm: 12,
    },
    componentThresholds: [{ component: 'FRONT_PADS', warningThresholdMm: 3, criticalThresholdMm: 2, source: 'x', confirmed: true, thresholdMissing: false }],
    confidence: { score: 11, label: 'Low' },
    evidencePresentation: buildBrakeEvidencePresentation({
      isInitialized: true,
      stateClass: 'ESTIMATED',
      overallCondition: 'WARNING',
      modeledComponents: {
        frontPads: true,
        rearPads: true,
        frontDiscs: true,
        rearDiscs: true,
        hasAnyPads: true,
        hasAnyDiscs: true,
        hasAnyModeled: true,
      },
      modelCoverage: { hasGap: true, coverageStatus: 'PARTIAL' },
      componentThresholds: [],
      limitingComponent: null,
      openAlerts: [],
      componentStates: [],
      dataQualityFlags: {
        missingBaseline: false,
        specUnconfirmed: false,
        coverageGap: true,
        distanceConflict: false,
        staleEvidence: false,
      },
      safetyFlags: {
        abs: false,
        dtc: false,
        dtcCode: null,
        wearSensor: false,
        immediateReplacement: false,
      },
      predictionCapable: false,
      overallRemainingKmMin: null,
      overallRemainingKmMax: null,
      overallRemainingKmPoint: null,
      overallConfidence: 'LOW',
      modelCalculatedAt: '2026-01-01T00:00:00.000Z',
      hasOdometerGap: false,
    }),
  };
}

describe('CoreBrakeReadV1 — DTO allowlist', () => {
  it('exposes only top-level contract keys', () => {
    const dto = toCoreBrakeReadV1({
      organizationId: 'org',
      vehicleId: 'veh',
      productSlug: ProductSlug.RENTAL,
      summary: pollutedSummary(),
    });
    expect(Object.keys(dto).sort()).toEqual([...TOP_LEVEL_KEYS].sort());
    for (const forbidden of FORBIDDEN_TOP) {
      expect(dto as Record<string, unknown>).not.toHaveProperty(forbidden);
    }
  });
});