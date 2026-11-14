import { ProductSlug } from '@prisma/client';
import { buildTireEvidencePresentation } from '@modules/vehicle-intelligence/tires/tire-health-presentation';
import type { TireHealthSummary } from '@modules/vehicle-intelligence/tires/tire-health.service';
import { emptyTirePressureContext } from '@modules/vehicle-intelligence/tires/tire-pressure-context.builder';
import { resolveRecommendedTirePressure } from '@modules/vehicle-intelligence/tires/tire-recommended-pressure';
import { buildTireDimoContext } from '@modules/vehicle-intelligence/tires/tire-dimo-context.builder';
import { toCoreTireReadV1 } from './core-tire-read.v1.mapper';

const TOP_LEVEL_KEYS = [
  'version',
  'organizationId',
  'vehicleId',
  'productSlug',
  'tireAvailability',
  'resolvedAt',
  'productiveWearModelVersion',
  'customerWearReadModel',
  'activeSetup',
  'tread',
  'remainingV2',
  'remainingV3',
  'overallStatus',
  'pressureStatus',
  'seasonStatus',
  'unevenWearStatus',
  'confidence',
  'measurement',
  'pressure',
  'inventory',
  'v3',
] as const;

const PRESSURE_WHEEL_KEYS = ['position', 'valueBar', 'sourceProvider', 'sourceObservedAt', 'freshness'] as const;

const FORBIDDEN_TOP = [
  'overallPercent',
  'overallRemainingKm',
  'confidenceScore',
  'alerts',
  'recommendations',
  'evidencePresentation',
  'wearRateMmPer1000km',
  'dimoContext',
  'blocksRental',
  'rental_blocked',
  'topWearDrivers',
  'inputFingerprint',
  'factors',
  'explainability',
] as const;

function pollutedSummary(): TireHealthSummary {
  const recommended = resolveRecommendedTirePressure({
    recommendedPressureFrontBar: 2.5,
    pressureSpecSource: 'DOOR_PLACARD',
  });
  const core = {
    overallPercent: 99,
    overallRemainingKm: 5000,
    healthStatus: 'GOOD',
    confidenceScore: 88,
    confidenceLabel: 'High',
    worstTirePosition: null,
    worstTirePercent: null,
    activeSetupName: 'Summer',
    activeSetupId: 'setup-1',
    tireSeason: 'SUMMER',
    installedAt: '2026-01-01T00:00:00.000Z',
    totalKmOnSet: 5000,
    wearRateMmPer1000km: 0.3,
    alerts: [{ type: 'x', severity: 'warning', message: 'hidden' }],
    tireCondition: 'USED',
    tireArchetype: 'default',
    tireSpecMatched: true,
    tireSpecConfidence: 90,
    dataCompletenessConfidence: 80,
    modelConfidence: 70,
    referenceNewTreadSource: null,
    replacementThresholdSource: null,
    currentTreadSource: null,
    currentTreadValue: 6,
    currentTreadEvidenceSource: null,
    isMeasured: true,
    isEstimated: false,
    isDefaultAssumption: false,
    lastActualMeasurementAt: null,
    baselineSource: null,
    operationalReplacementMm: 3,
    topWearDrivers: ['secret'],
    actionState: 'OBSERVE',
    actionReasons: [],
    measurementState: 'measured' as const,
    dataQualityWarnings: [],
    pressureContext: emptyTirePressureContext(),
    recommendedPressure: recommended,
    pressureSpecMissingLabel: null,
    latestMeasurementAt: null,
    overallStatus: 'GOOD' as const,
    displayMode: 'MEASURED' as const,
    confidence: 'HIGH' as const,
    lowestTreadMm: 6,
    lowestTreadPosition: 'FL',
    measuredTreadMm: 6,
    estimatedTreadMm: null,
    displayTreadMm: 6,
    lastMeasurementAt: '2026-07-10T10:00:00.000Z',
    measurementAgeDays: 6,
    estimatedRemainingKm: 12000,
    pressureStatus: 'GOOD' as const,
    seasonStatus: 'GOOD' as const,
    unevenWearStatus: 'GOOD' as const,
    recommendations: ['hidden'],
    predictionCapable: true,
    odometerAnchorStatus: null,
    odometerAnchorConfidence: null,
    installedOdometerSource: null,
    hasActiveSet: true,
    hasSetups: true,
    hasMeasurements: true,
    dimoContext: buildTireDimoContext({ asOf: new Date(), ambientSamples: [] }),
    rental_blocked: true,
  } as unknown as TireHealthSummary;

  return {
    ...core,
    evidencePresentation: buildTireEvidencePresentation({ summary: core }),
  };
}

describe('Core tire read — DTO allowlist', () => {
  it('AVAILABLE path keys match literal allowlists', () => {
    const dto = toCoreTireReadV1({
      organizationId: 'org',
      vehicleId: 'veh',
      productSlug: ProductSlug.RENTAL,
      summary: pollutedSummary(),
    });

    expect(Object.keys(dto).sort()).toEqual([...TOP_LEVEL_KEYS].sort());
    for (const key of FORBIDDEN_TOP) {
      expect(dto).not.toHaveProperty(key);
    }
    expect(dto.pressure?.wheels[0]).toBeDefined();
    expect(Object.keys(dto.pressure!.wheels[0]).sort()).toEqual([...PRESSURE_WHEEL_KEYS].sort());
  });

  it('NO_ACTIVE_SETUP path matches allowlist', () => {
    const dto = toCoreTireReadV1({
      organizationId: 'org',
      vehicleId: 'veh',
      productSlug: ProductSlug.RENTAL,
      summary: null,
    });
    expect(Object.keys(dto).sort()).toEqual([...TOP_LEVEL_KEYS].sort());
    for (const key of FORBIDDEN_TOP) {
      expect(dto).not.toHaveProperty(key);
    }
  });
});