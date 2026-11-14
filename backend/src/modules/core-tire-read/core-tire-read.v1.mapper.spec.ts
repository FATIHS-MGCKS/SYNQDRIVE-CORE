import { ProductSlug } from '@prisma/client';
import { buildTireEvidencePresentation } from '@modules/vehicle-intelligence/tires/tire-health-presentation';
import type { TireHealthSummary } from '@modules/vehicle-intelligence/tires/tire-health.service';
import { buildAuthoritativeV3UnavailableRead } from '@modules/vehicle-intelligence/tires/tire-health-v3-read.adapter';
import type { TireHealthV3CustomerReadModel } from '@modules/vehicle-intelligence/tires/tire-health-v3-read.types';
import { emptyTirePressureContext } from '@modules/vehicle-intelligence/tires/tire-pressure-context.builder';
import { resolveRecommendedTirePressure } from '@modules/vehicle-intelligence/tires/tire-recommended-pressure';
import { buildTireDimoContext } from '@modules/vehicle-intelligence/tires/tire-dimo-context.builder';
import { TIRE_WEAR_MODEL_VERSION } from '@modules/vehicle-intelligence/tires/tire-wear-model-version';
import { toCoreTireReadV1 } from './core-tire-read.v1.mapper';

const ORG = 'org-a';
const VEH = 'veh-a';
const PRODUCT = ProductSlug.RENTAL;

function baseSummary(overrides: Partial<TireHealthSummary> = {}): TireHealthSummary {
  const recommended = resolveRecommendedTirePressure({
    recommendedPressureFrontBar: 2.5,
    pressureSpecSource: 'DOOR_PLACARD',
  });
  const pressureContext = emptyTirePressureContext();

  const core: Omit<TireHealthSummary, 'evidencePresentation'> = {
    overallPercent: 70,
    overallRemainingKm: 12000,
    healthStatus: 'GOOD',
    confidenceScore: 80,
    confidenceLabel: 'High',
    worstTirePosition: null,
    worstTirePercent: null,
    activeSetupName: 'Summer',
    activeSetupId: 'setup-1',
    tireSeason: 'SUMMER',
    installedAt: '2026-01-01T00:00:00.000Z',
    totalKmOnSet: 5000,
    wearRateMmPer1000km: 0.2,
    alerts: [],
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
    lastActualMeasurementAt: '2026-07-10T10:00:00.000Z',
    baselineSource: null,
    operationalReplacementMm: 3,
    topWearDrivers: ['pressure'],
    actionState: 'OBSERVE',
    actionReasons: [],
    measurementState: 'measured',
    dataQualityWarnings: [],
    pressureContext,
    recommendedPressure: recommended,
    pressureSpecMissingLabel: null,
    latestMeasurementAt: '2026-07-10T10:00:00.000Z',
    overallStatus: 'GOOD',
    displayMode: 'MEASURED',
    confidence: 'HIGH',
    lowestTreadMm: 6,
    lowestTreadPosition: 'FL',
    measuredTreadMm: 6,
    estimatedTreadMm: null,
    displayTreadMm: 6,
    lastMeasurementAt: '2026-07-10T10:00:00.000Z',
    measurementAgeDays: 6,
    estimatedRemainingKm: 12000,
    pressureStatus: 'GOOD',
    seasonStatus: 'GOOD',
    unevenWearStatus: 'GOOD',
    recommendations: ['Check rotation'],
    predictionCapable: true,
    odometerAnchorStatus: 'ANCHORED',
    odometerAnchorConfidence: 90,
    installedOdometerSource: null,
    hasActiveSet: true,
    hasSetups: true,
    hasMeasurements: true,
    dimoContext: buildTireDimoContext({
      asOf: new Date('2026-07-16T12:00:00.000Z'),
      ambientSamples: [],
    }),
    ...overrides,
  };

  return {
    ...core,
    evidencePresentation: buildTireEvidencePresentation({ summary: core }),
  };
}

function wearV3Ok(overrides: Partial<TireHealthV3CustomerReadModel> = {}): TireHealthV3CustomerReadModel {
  return {
    modelVersion: 'tire-wear-v3-prior-0.2.0',
    computedAt: '2026-07-20T10:00:00.000Z',
    inputFingerprint: 'fp-test',
    rated: true,
    setupFlags: [],
    verificationStatus: 'CURRENT',
    verificationQualityFlags: [],
    wheels: [
      {
        position: 'FL',
        treadDepthMm: { lo: 5.8, hi: 6.2 },
        pointEstimateTreadMm: 6,
        treadEvidenceClass: 'MEASURED',
        remainingKm: { lo: 8000, hi: 12000 },
        replacementThresholdMm: 3,
        evidenceLevel: 'L2',
        uncertaintyFlags: [],
        verificationStatus: 'CURRENT',
        lastAcceptedMeasurementAt: '2026-07-10T10:00:00.000Z',
        kmSinceAcceptedMeasurement: 500,
        nextDueOdometerKm: null,
        mountPeriodQualityFlags: [],
      },
      {
        position: 'FR',
        treadDepthMm: { lo: 5.5, hi: 5.9 },
        pointEstimateTreadMm: 5.7,
        treadEvidenceClass: 'CALIBRATED_ESTIMATE',
        remainingKm: { lo: 7000, hi: 11000 },
        replacementThresholdMm: 3,
        evidenceLevel: 'L2',
        uncertaintyFlags: [],
        verificationStatus: 'CURRENT',
        lastAcceptedMeasurementAt: null,
        kmSinceAcceptedMeasurement: null,
        nextDueOdometerKm: null,
        mountPeriodQualityFlags: [],
      },
    ],
    lowestTreadPosition: 'FR',
    lowestTreadMm: { lo: 5.5, hi: 5.9 },
    insufficientEvidence: false,
    ...overrides,
  };
}

describe('CoreTireReadV1 mapper', () => {
  it('maps NO_ACTIVE_SETUP without fabricated values', () => {
    const dto = toCoreTireReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      summary: null,
    });
    expect(dto.tireAvailability).toBe('NO_ACTIVE_SETUP');
    expect(dto.tread).toBeNull();
    expect(dto.pressure).toBeNull();
    expect(dto.v3).toBeNull();
    expect('overallPercent' in dto).toBe(false);
  });

  it('V2 default uses presentation remaining and never overallRemainingKm', () => {
    const dto = toCoreTireReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      summary: baseSummary(),
    });
    expect(dto.customerWearReadModel).toBe('v2');
    expect(dto.productiveWearModelVersion).toBe(TIRE_WEAR_MODEL_VERSION);
    expect(dto.remainingV2?.reliable).toBe(true);
    expect(typeof dto.remainingV2?.exactRemainingKm).toBe('number');
    expect(dto.remainingV3).toBeNull();
    expect(dto).not.toHaveProperty('overallPercent');
    expect(dto).not.toHaveProperty('overallRemainingKm');
  });

  it('V3 attach-only keeps V2 remaining and exposes attached metadata', () => {
    const dto = toCoreTireReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      summary: baseSummary({
        wearReadModel: 'v2',
        wearV3: wearV3Ok(),
      }),
    });
    expect(dto.v3?.customerState).toBe('ATTACHED');
    expect(dto.remainingV2).not.toBeNull();
    expect(dto.remainingV3).toBeNull();
  });

  it('V3 authoritative uses wheel provenance for lowest tread (mixed wheels)', () => {
    const dto = toCoreTireReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      summary: baseSummary({
        wearReadModel: 'v3',
        wearV3: wearV3Ok(),
        isMeasured: true,
        displayMode: 'MEASURED',
      }),
    });
    expect(dto.customerWearReadModel).toBe('v3');
    expect(dto.tread?.treadProvenance).toBe('ESTIMATED');
    expect(dto.tread?.displayMode).toBe('ESTIMATED');
    expect(dto.remainingV2).toBeNull();
    expect(dto.remainingV3?.intervalMinRemainingKm).toBe(7000);
    expect(dto.v3?.computedAt).toBe('2026-07-20T10:00:00.000Z');
  });

  it('V3 unavailable sentinel fails closed without fabricated computedAt', () => {
    const unavailable = buildAuthoritativeV3UnavailableRead('no_result');
    const dto = toCoreTireReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      summary: baseSummary({
        wearReadModel: 'v3',
        wearV3: unavailable,
        displayMode: 'UNKNOWN',
      }),
    });
    expect(dto.v3?.customerState).toBe('UNAVAILABLE');
    expect(dto.v3?.computedAt).toBeNull();
    expect(dto.tread?.lowestTreadMm).toBeNull();
    expect(dto.remainingV3).toBeNull();
    expect(dto.remainingV2).toBeNull();
  });

  it('V3 authoritative without wearV3 payload fails closed', () => {
    const dto = toCoreTireReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      summary: baseSummary({
        wearReadModel: 'v3',
        wearV3: undefined,
      }),
    });
    expect(dto.tread?.treadProvenance).toBe('UNKNOWN');
    expect(dto.remainingV2).toBeNull();
    expect(dto.remainingV3).toBeNull();
  });

  it('maps bounded pressure wheels with freshness', () => {
    const pc = emptyTirePressureContext();
    pc.overallFreshness = 'stale';
    pc.overallStatus = 'STALE';
    pc.wheels.frontLeft = {
      ...pc.wheels.frontLeft,
      value: 2.1,
      sourceProvider: 'HIGH_MOBILITY',
      sourceTimestamp: '2026-06-01T09:00:00.000Z',
      freshness: 'stale',
    };
    const dto = toCoreTireReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      summary: baseSummary({ pressureContext: pc }),
    });
    expect(dto.pressure?.overallFreshness).toBe('stale');
    expect(dto.pressure?.wheels).toHaveLength(4);
    expect(dto.pressure?.wheels[0]).toEqual(
      expect.objectContaining({
        position: 'frontLeft',
        valueBar: 2.1,
        freshness: 'stale',
      }),
    );
    expect(dto.pressure).not.toHaveProperty('wearEligibility');
  });
});