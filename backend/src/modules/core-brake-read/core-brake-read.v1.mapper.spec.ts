import { ProductSlug } from '@prisma/client';
import type { BrakeHealthSummaryDto } from '@modules/vehicle-intelligence/brakes/brake-health.service';
import { buildBrakeEvidencePresentation } from '@modules/vehicle-intelligence/brakes/brake-health-presentation';
import { BRAKE_WEAR_MODEL_VERSION } from '@modules/vehicle-intelligence/brakes/brake-wear-model-version';
import { toCoreBrakeReadV1 } from './core-brake-read.v1.mapper';

const ORG = 'org-a';
const VEH = 'veh-a';
const PRODUCT = ProductSlug.RENTAL;

function baseSummary(overrides: Partial<BrakeHealthSummaryDto> = {}): BrakeHealthSummaryDto {
  const core: BrakeHealthSummaryDto = {
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
      distanceSinceAnchorKm: 8000,
      modeledDistanceKm: 7500,
      modeledTripCount: 10,
      coverageRatio: 0.9,
      coverageRatioRaw: 0.9,
      underCoverageKm: 0,
      overCoverageKm: 0,
      coverageStatus: 'FULL',
      hasGap: false,
      reconciliationRequired: false,
      source: 'OBSERVED',
    },
    baselineWarnings: [],
    provenanceWarnings: [],
    overallCondition: 'GOOD',
    dataBasis: 'ESTIMATED',
    confidenceLevel: 'MEDIUM',
    frontAxle: {
      condition: 'GOOD',
      dataBasis: 'ESTIMATED',
      confidence: 'MEDIUM',
      estimatedRemainingKmMin: 20000,
      estimatedRemainingKmMax: 28000,
    },
    rearAxle: {
      condition: 'GOOD',
      dataBasis: 'ESTIMATED',
      confidence: 'MEDIUM',
      estimatedRemainingKmMin: 18000,
      estimatedRemainingKmMax: 26000,
    },
    frontAxleCondition: 'GOOD',
    rearAxleCondition: 'GOOD',
    frontDataBasis: 'ESTIMATED',
    rearDataBasis: 'ESTIMATED',
    frontConfidence: 'MEDIUM',
    rearConfidence: 'MEDIUM',
    estimatedFrontRemainingKmMin: 20000,
    estimatedFrontRemainingKmMax: 28000,
    estimatedRearRemainingKmMin: 18000,
    estimatedRearRemainingKmMax: 26000,
    nextInspectionRecommendedInKm: null,
    estimatedReplacementDueInKm: 20000,
    reasons: ['hidden'],
    recommendations: ['hidden'],
    alerts: [],
    openAlerts: [],
    lastMeasurementAt: '2026-06-01T00:00:00.000Z',
    lastMeasurementMileageKm: 40000,
    lastServiceAt: '2026-01-01T00:00:00.000Z',
    lastServiceMileageKm: 35000,
    updatedAt: '2026-07-01T12:00:00.000Z',
    lastRecalculatedAt: '2026-07-01T12:00:00.000Z',
    legacy: {
      padsHealthPct: 80,
      discsHealthPct: 90,
      padsRemainingKm: 20000,
      discsRemainingKm: 50000,
      status: 'good',
      remainingKm: 20000,
    },
    componentThresholds: [],
    confidence: { score: 77, label: 'Medium' },
    ...overrides,
  };

  core.evidencePresentation = buildBrakeEvidencePresentation({
    isInitialized: core.isInitialized,
    stateClass: core.stateClass,
    overallCondition: core.overallCondition,
    modeledComponents: core.modeledComponents,
    modelCoverage: { hasGap: core.modelCoverage.hasGap, coverageStatus: core.modelCoverage.coverageStatus },
    componentThresholds: [],
    limitingComponent: null,
    openAlerts: core.openAlerts,
    componentStates: [],
    dataQualityFlags: {
      missingBaseline: !core.isInitialized,
      specUnconfirmed: false,
      coverageGap: core.modelCoverage.hasGap,
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
    predictionCapable: !core.modelCoverage.hasGap && core.modelCoverage.modeledTripCount > 0,
    overallRemainingKmMin: 18000,
    overallRemainingKmMax: 26000,
    overallRemainingKmPoint: 22000,
    overallConfidence: core.confidenceLevel,
    modelCalculatedAt: core.updatedAt,
    hasOdometerGap: false,
  });

  return core;
}

describe('toCoreBrakeReadV1', () => {
  it('maps MEASURED vs ESTIMATED semantics from summary', () => {
    const measured = toCoreBrakeReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      summary: baseSummary({
        stateClass: 'MEASURED',
        dataBasis: 'MEASURED',
        frontAxle: {
          condition: 'GOOD',
          dataBasis: 'MEASURED',
          confidence: 'HIGH',
          estimatedRemainingKmMin: null,
          estimatedRemainingKmMax: null,
        },
      }),
    });
    expect(measured.overall.dataBasis).toBe('MEASURED');
    expect(measured.trackingState.stateClass).toBe('MEASURED');
  });

  it('NO_BASELINE fail-closed', () => {
    const dto = toCoreBrakeReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      summary: baseSummary({
        isInitialized: false,
        stateClass: 'NO_BASELINE',
        overallCondition: 'UNKNOWN',
        dataBasis: 'UNKNOWN',
        confidenceLevel: 'UNKNOWN',
        evidencePresentation: undefined,
      }),
    });
    expect(dto.brakeAvailability).toBe('NO_BASELINE');
    expect(dto.remaining.reliable).toBe(false);
    expect(dto.remaining.exactRemainingKm).toBeNull();
  });

  it('WARNING_ONLY availability', () => {
    const dto = toCoreBrakeReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      summary: baseSummary({
        isInitialized: false,
        stateClass: 'WARNING_ONLY',
        overallCondition: 'WARNING',
        dataBasis: 'UNKNOWN',
      }),
    });
    expect(dto.brakeAvailability).toBe('WARNING_ONLY');
  });

  it('reuses evidencePresentation.overallRemainingKm without per-axle remaining', () => {
    const dto = toCoreBrakeReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      summary: baseSummary(),
    });
    expect(dto.remaining.bandMinRemainingKm).toBe(18000);
    expect(dto.remaining.bandMaxRemainingKm).toBe(26000);
    expect(dto).not.toHaveProperty('frontRemaining');
    expect(dto).not.toHaveProperty('rearRemaining');
  });

  it('coverage gap presentation yields unreliable remaining', () => {
    const summary = baseSummary({
      modelCoverage: {
        ...baseSummary().modelCoverage,
        hasGap: true,
        coverageStatus: 'PARTIAL',
        modeledTripCount: 0,
      },
    });
    const dto = toCoreBrakeReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      summary,
    });
    expect(dto.modelCoverage.hasGap).toBe(true);
    expect(dto.remaining.reliable).toBe(false);
  });

  it('excludes non-safety displayMode from safetySignals.alerts', () => {
    const mixed = [
      ...Array.from({ length: 3 }, () => ({
        code: 'BRAKE_COVERAGE_GAP' as const,
        alertType: 'gap',
        category: 'DATA_QUALITY' as const,
        reasonCode: 'x',
        severity: 'warning' as const,
        message: 'hidden',
        messageEn: 'hidden',
        displayMode: 'DATA_GAP' as const,
      })),
      {
        code: 'BRAKE_SYSTEM_DTC' as const,
        alertType: 'dtc',
        category: 'SAFETY' as const,
        reasonCode: 'x',
        severity: 'critical' as const,
        message: 'hidden',
        messageEn: 'hidden',
        displayMode: 'SAFETY_EVIDENCE' as const,
      },
    ];
    const dto = toCoreBrakeReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      summary: baseSummary({ openAlerts: mixed, alerts: mixed }),
    });
    expect(dto.safetySignals.alerts).toHaveLength(1);
    expect(dto.safetySignals.alerts[0].code).toBe('BRAKE_SYSTEM_DTC');
    expect(dto.safetySignals.hasActiveSafetyAlert).toBe(true);
  });

  it('hasActiveSafetyAlert true when safety alert follows many non-safety alerts', () => {
    const alerts = [
      ...Array.from({ length: 5 }, () => ({
        code: 'BRAKE_PAD_WARNING' as const,
        alertType: 'wear',
        category: 'WEAR' as const,
        reasonCode: 'x',
        severity: 'warning' as const,
        message: 'hidden',
        messageEn: 'hidden',
        displayMode: 'ESTIMATED' as const,
      })),
      {
        code: 'BRAKE_ABS_WARNING' as const,
        alertType: 'abs',
        category: 'SAFETY' as const,
        reasonCode: 'x',
        severity: 'warning' as const,
        message: 'hidden',
        messageEn: 'hidden',
        displayMode: 'SAFETY_EVIDENCE' as const,
        axle: 'FRONT' as const,
      },
    ];
    const dto = toCoreBrakeReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      summary: baseSummary({ openAlerts: alerts, alerts }),
    });
    expect(dto.safetySignals.hasActiveSafetyAlert).toBe(true);
    expect(dto.safetySignals.alerts).toEqual([
      {
        code: 'BRAKE_ABS_WARNING',
        severity: 'warning',
        axle: 'FRONT',
        displayMode: 'SAFETY_EVIDENCE',
      },
    ]);
  });

  it('fail-closes exactRemainingKm when presentation is unreliable', () => {
    const summary = baseSummary();
    summary.evidencePresentation = {
      ...summary.evidencePresentation!,
      overallRemainingKm: {
        reliable: false,
        displayDe: 'x',
        displayEn: 'x',
        exactKm: 9999,
        bandMinKm: 5000,
        bandMaxKm: 9000,
        reasonDe: null,
        reasonEn: null,
      },
    };
    const dto = toCoreBrakeReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      summary,
    });
    expect(dto.remaining).toEqual({
      reliable: false,
      exactRemainingKm: null,
      bandMinRemainingKm: 5000,
      bandMaxRemainingKm: 9000,
    });
  });

  it('caps safety alerts at 5 and allowlists fields', () => {
    const alerts = Array.from({ length: 8 }, (_, i) => ({
      code: 'BRAKE_SYSTEM_DTC' as const,
      alertType: 'dtc',
      category: 'SAFETY' as const,
      reasonCode: 'x',
      severity: 'warning' as const,
      message: 'secret',
      messageEn: 'secret',
      displayMode: 'SAFETY_EVIDENCE' as const,
      dedupeKey: `k-${i}`,
      evidenceFingerprint: `fp-${i}`,
    }));
    const dto = toCoreBrakeReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      summary: baseSummary({ openAlerts: alerts, alerts }),
    });
    expect(dto.safetySignals.alerts).toHaveLength(5);
    expect(dto.safetySignals.alerts[0]).toMatchObject({
      code: 'BRAKE_SYSTEM_DTC',
      severity: 'warning',
      displayMode: 'SAFETY_EVIDENCE',
    });
    expect(dto.safetySignals.hasActiveSafetyAlert).toBe(true);
  });

  it('omits forbidden upstream fields', () => {
    const dto = toCoreBrakeReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      summary: baseSummary(),
    });
    expect(dto).not.toHaveProperty('legacy');
    expect(dto).not.toHaveProperty('confidenceScore');
    expect(dto).not.toHaveProperty('coverageRatio');
    expect(dto.productiveWearModelVersion).toBe(BRAKE_WEAR_MODEL_VERSION);
  });
});