import { buildTirePressureContext } from '../vehicle-intelligence/tires/tire-pressure-context.builder';
import { resolveRecommendedTirePressure } from '../vehicle-intelligence/tires/tire-recommended-pressure';
import type { TireHealthSummary } from '../vehicle-intelligence/tires/tire-health.service';
import { buildTireEvidencePresentation } from '../vehicle-intelligence/tires/tire-health-presentation';
import { buildTireDimoContext } from '../vehicle-intelligence/tires/tire-dimo-context.builder';
import {
  buildTireRentalHealthReadModel,
  isTireRentalHardBlocked,
  mapPressureSourceLabel,
} from './tire-rental-health.policy';

const AS_OF = new Date('2026-07-16T14:00:00.000Z');

function pressureContext(
  input: Parameters<typeof buildTirePressureContext>[0],
) {
  return buildTirePressureContext(input);
}

function baseSummary(
  overrides: Partial<TireHealthSummary> = {},
): TireHealthSummary {
  const recommended = resolveRecommendedTirePressure({
    recommendedPressureFrontBar: 2.5,
    pressureSpecSource: 'DOOR_PLACARD',
  });
  const ctx = pressureContext({
    asOf: AS_OF,
    recommendedPressure: recommended,
    dimo: {
      tirePressureFl: 2.5,
      tirePressureFr: 2.5,
      tirePressureRl: 2.5,
      tirePressureRr: 2.5,
      providerSource: 'DIMO',
      sourceTimestamp: new Date('2026-07-16T13:00:00.000Z'),
      providerFetchedAt: new Date('2026-07-16T13:00:00.000Z'),
      lastSeenAt: new Date('2026-07-16T13:00:00.000Z'),
    },
  });

  const { evidencePresentation: overridePresentation, ...restOverrides } = overrides;
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
    tireSpecMatched: false,
    tireSpecConfidence: null,
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
    topWearDrivers: [],
    actionState: 'OBSERVE',
    actionReasons: [],
    measurementState: 'measured',
    dataQualityWarnings: [],
    pressureContext: ctx,
    recommendedPressure: recommended,
    pressureSpecMissingLabel: null,
    latestMeasurementAt: '2026-07-10T10:00:00.000Z',
    overallStatus: 'GOOD',
    displayMode: 'MEASURED',
    confidence: 'HIGH',
    lowestTreadMm: 6,
    lowestTreadPosition: 'front_left',
    measuredTreadMm: 6,
    estimatedTreadMm: null,
    displayTreadMm: 6,
    lastMeasurementAt: '2026-07-10T10:00:00.000Z',
    measurementAgeDays: 6,
    estimatedRemainingKm: 12000,
    pressureStatus: 'GOOD',
    seasonStatus: 'GOOD',
    unevenWearStatus: 'GOOD',
    recommendations: [],
    predictionCapable: true,
    odometerAnchorStatus: null,
    odometerAnchorConfidence: null,
    installedOdometerSource: null,
    hasActiveSet: true,
    hasSetups: true,
    hasMeasurements: true,
    dimoContext: buildTireDimoContext({ asOf: new Date('2026-07-16T12:00:00.000Z'), ambientSamples: [] }),
    ...restOverrides,
  };
  return {
    ...core,
    evidencePresentation:
      overridePresentation ?? buildTireEvidencePresentation({ summary: core }),
  };
}

describe('tire-rental-health.policy', () => {
  it('hard-blocks measured tread at or below legal minimum', () => {
    const model = buildTireRentalHealthReadModel({
      summary: baseSummary({
        displayMode: 'MEASURED',
        lowestTreadMm: 1.5,
        overallStatus: 'CRITICAL',
      }),
    });
    expect(model.rentalBlockingEvidence?.action).toBe('HARD_BLOCK');
    expect(model.rentalBlockingEvidence?.reasonCode).toBe(
      'TREAD_MEASURED_BELOW_LEGAL_MIN',
    );
    expect(isTireRentalHardBlocked(model)).toBe(true);
    expect(model.evidenceType).toBe('measured');
  });

  it('does not hard-block measured tread above legal minimum', () => {
    const model = buildTireRentalHealthReadModel({
      summary: baseSummary({
        displayMode: 'MEASURED',
        lowestTreadMm: 3.5,
        overallStatus: 'WARNING',
      }),
    });
    expect(model.rentalBlockingEvidence).toBeNull();
    expect(isTireRentalHardBlocked(model)).toBe(false);
  });

  it('requires measurement for estimated critical with high confidence', () => {
    const model = buildTireRentalHealthReadModel({
      summary: baseSummary({
        displayMode: 'ESTIMATED',
        overallStatus: 'CRITICAL',
        lowestTreadMm: 1.4,
        confidence: 'HIGH',
        measurementAgeDays: null,
        lastMeasurementAt: null,
        latestMeasurementAt: null,
      }),
    });
    expect(model.reviewRequirement).toBe('REVIEW_REQUIRED');
    expect(model.structuredReasonCodes).toContain(
      'TREAD_ESTIMATED_CRITICAL_HIGH_CONF',
    );
    expect(isTireRentalHardBlocked(model)).toBe(false);
    expect(model.overallStatus).toBe('warning');
    expect(model.evidenceType).toBe('estimated');
  });

  it('requires measurement only for estimated critical with low confidence', () => {
    const model = buildTireRentalHealthReadModel({
      summary: baseSummary({
        displayMode: 'ESTIMATED',
        overallStatus: 'CRITICAL',
        lowestTreadMm: 1.4,
        confidence: 'LOW',
        isDefaultAssumption: false,
      }),
    });
    expect(model.reviewRequirement).toBe('MEASUREMENT_REQUIRED');
    expect(model.structuredReasonCodes).toContain(
      'TREAD_ESTIMATED_CRITICAL_LOW_CONF',
    );
    expect(isTireRentalHardBlocked(model)).toBe(false);
  });

  it('never hard-blocks default 8 mm assumption alone', () => {
    const model = buildTireRentalHealthReadModel({
      summary: baseSummary({
        isDefaultAssumption: true,
        displayMode: 'ESTIMATED',
        overallStatus: 'GOOD',
        lowestTreadMm: 8,
        confidence: 'LOW',
      }),
    });
    expect(model.structuredReasonCodes).toContain('TREAD_DEFAULT_ASSUMPTION');
    expect(isTireRentalHardBlocked(model)).toBe(false);
    expect(model.overallStatus).not.toBe('good');
    expect(model.overallStatus).toBe('unknown');
  });

  it('marks stale measurement as unknown review — never good', () => {
    const model = buildTireRentalHealthReadModel({
      summary: baseSummary({
        measurementAgeDays: 400,
        overallStatus: 'GOOD',
        displayMode: 'MEASURED',
      }),
    });
    expect(model.structuredReasonCodes).toContain('TREAD_STALE');
    expect(model.overallStatus).not.toBe('good');
  });

  it('unknown tread status is not good', () => {
    const model = buildTireRentalHealthReadModel({
      summary: baseSummary({
        overallStatus: 'UNKNOWN',
        displayMode: 'UNKNOWN',
        lowestTreadMm: null,
      }),
    });
    expect(model.overallStatus).toBe('unknown');
    expect(model.structuredReasonCodes).toContain('TREAD_UNKNOWN');
  });

  it('hard-blocks fresh TPMS warning with structured evidence', () => {
    const recommended = resolveRecommendedTirePressure({ pressureSpecSource: 'UNKNOWN' });
    const ctx = pressureContext({
      asOf: AS_OF,
      recommendedPressure: recommended,
      dimo: {
        tirePressureFl: null,
        tirePressureFr: null,
        tirePressureRl: null,
        tirePressureRr: null,
        providerSource: 'DIMO',
        sourceTimestamp: new Date('2026-07-16T13:00:00.000Z'),
        providerFetchedAt: null,
        lastSeenAt: null,
        tpmsWarning: {
          signalPresent: true,
          value: true,
          sourceTimestamp: new Date('2026-07-16T13:00:00.000Z'),
        },
      },
    });
    const model = buildTireRentalHealthReadModel({
      summary: baseSummary({
        pressureContext: ctx,
        overallStatus: 'GOOD',
      }),
    });
    expect(model.rentalBlockingEvidence?.reasonCode).toBe('PRESSURE_TPMS_CRITICAL');
    expect(model.pressureEvidence.sourceLabel).toBe('dimo');
    expect(isTireRentalHardBlocked(model)).toBe(true);
  });

  it('labels MIXED pressure source as mixed — not hm_oem', () => {
    const recommended = resolveRecommendedTirePressure({ pressureSpecSource: 'UNKNOWN' });
    const ctx = pressureContext({
      asOf: AS_OF,
      recommendedPressure: recommended,
      dimo: {
        tirePressureFl: 2.5,
        tirePressureFr: 2.5,
        tirePressureRl: null,
        tirePressureRr: null,
        providerSource: 'DIMO',
        sourceTimestamp: new Date('2026-07-16T13:00:00.000Z'),
        providerFetchedAt: null,
        lastSeenAt: null,
      },
      hm: {
        frontLeft: 2.5,
        frontRight: 2.5,
        rearLeft: 2.55,
        rearRight: 2.58,
        unit: 'bar',
        lastUpdatedAt: '2026-07-16T12:00:00.000Z',
        freshnessStatus: 'fresh',
      },
    });
    expect(mapPressureSourceLabel(ctx.sourceType, ctx.tpmsWarningSource)).toBe('mixed');
    const model = buildTireRentalHealthReadModel({
      summary: baseSummary({ pressureContext: ctx }),
    });
    expect(model.source).toBe('mixed');
  });

  it('separates tread and pressure timestamps', () => {
    const model = buildTireRentalHealthReadModel({
      summary: baseSummary({
        lastMeasurementAt: '2026-06-01T10:00:00.000Z',
        latestMeasurementAt: '2026-06-01T10:00:00.000Z',
      }),
    });
    expect(model.wearEvidence.measuredAt).toBe('2026-06-01T10:00:00.000Z');
    expect(model.pressureEvidence.lastUpdatedAt).toContain('2026-07-16');
  });

  it('active review override suppresses hard block', () => {
    const model = buildTireRentalHealthReadModel({
      summary: baseSummary({
        displayMode: 'MEASURED',
        lowestTreadMm: 1.4,
        overallStatus: 'CRITICAL',
      }),
      activeReviewOverride: {
        id: 'ov-1',
        reason: 'Workshop inspection completed',
        grantedByUserId: 'user-1',
        expiresAt: '2026-07-20T00:00:00.000Z',
        createdAt: '2026-07-16T10:00:00.000Z',
      },
    });
    expect(isTireRentalHardBlocked(model)).toBe(false);
    expect(model.structuredReasonCodes).toContain('REVIEW_OVERRIDE_ACTIVE');
    expect(model.overallStatus).toBe('warning');
  });

  it('returns unknown when no summary', () => {
    const model = buildTireRentalHealthReadModel({ summary: null });
    expect(model.overallStatus).toBe('unknown');
    expect(model.structuredReasonCodes).toContain('NO_TIRE_DATA');
  });

  it('distinguishes V3 insufficient evidence from overdue verification', () => {
    const insufficient = buildTireRentalHealthReadModel({
      summary: baseSummary({
        wearV3: {
          modelVersion: '0.2.0',
          computedAt: '2026-10-27T12:00:00.000Z',
          inputFingerprint: 'fp',
          rated: false,
          setupFlags: [],
          verificationStatus: 'INSUFFICIENT_EVIDENCE',
          verificationQualityFlags: [],
          wheels: [],
          lowestTreadPosition: null,
          lowestTreadMm: null,
          insufficientEvidence: true,
        },
      }),
    });
    expect(insufficient.structuredReasonCodes).toContain('V3_VERIFICATION_INSUFFICIENT_EVIDENCE');
    expect(isTireRentalHardBlocked(insufficient)).toBe(false);

    const overdue = buildTireRentalHealthReadModel({
      summary: baseSummary({
        wearV3: {
          modelVersion: '0.2.0',
          computedAt: '2026-10-27T12:00:00.000Z',
          inputFingerprint: 'fp',
          rated: true,
          setupFlags: [],
          verificationStatus: 'OVERDUE',
          verificationQualityFlags: [],
          wheels: [],
          lowestTreadPosition: 'FL',
          lowestTreadMm: { lo: 5, hi: 5.2 },
          insufficientEvidence: false,
        },
      }),
    });
    expect(overdue.structuredReasonCodes).toContain('V3_VERIFICATION_OVERDUE');
    expect(overdue.structuredReasonCodes).not.toContain('V3_VERIFICATION_INSUFFICIENT_EVIDENCE');
  });

  it('blocks legacy GOOD rental clearance when V3 authoritative payload missing', () => {
    const model = buildTireRentalHealthReadModel({
      summary: baseSummary({
        wearReadModel: 'v3',
        overallStatus: 'GOOD',
        displayMode: 'ESTIMATED',
        wearV3: undefined,
      }),
    });
    expect(model.structuredReasonCodes).toContain('V3_READ_UNAVAILABLE');
    expect(model.overallStatus).not.toBe('good');
  });

  it('blocks GOOD clearance for authoritative unavailable V3 stub', () => {
    const model = buildTireRentalHealthReadModel({
      summary: baseSummary({
        wearReadModel: 'v3',
        overallStatus: 'GOOD',
        displayMode: 'UNKNOWN',
        wearV3: {
          modelVersion: 'tire-wear-v3-read-unavailable',
          computedAt: '2026-10-28T12:00:00.000Z',
          inputFingerprint: 'unavailable:compute_failed',
          rated: false,
          setupFlags: [],
          verificationStatus: 'INSUFFICIENT_EVIDENCE',
          verificationQualityFlags: ['V3_READ_COMPUTE_FAILED'],
          wheels: [],
          lowestTreadPosition: null,
          lowestTreadMm: null,
          insufficientEvidence: true,
        },
      }),
    });
    expect(model.structuredReasonCodes).toContain('V3_VERIFICATION_INSUFFICIENT_EVIDENCE');
    expect(model.overallStatus).not.toBe('good');
  });
});
