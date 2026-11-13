import { FuelType, ProductSlug } from '@prisma/client';
import type { LegacyPublicationSafetyResult } from '@modules/vehicle-intelligence/battery-health/battery-legacy-publication-safety';
import { toCoreBatteryReadV1, type CanonicalBatterySummaryForCoreRead } from './core-battery-read.v1.mapper';
import { CORE_BATTERY_READ_CONTRACT_VERSION } from './core-battery-read.v1.types';

const publicationGateMock = jest.fn(() => false);
jest.mock('@config/battery-health-v2.config', () => ({
  isBatteryV2PublicationEnabled: () => publicationGateMock(),
}));

const ORG = 'org-a';
const VEH = 'veh-a';
const PRODUCT = ProductSlug.RENTAL;

const capableSafety = {
  decisionCapable: true,
  diagnosticLabelDe: 'ok',
  displayMode: 'CUSTOMER_SAFE',
  reasons: [],
} as unknown as LegacyPublicationSafetyResult;

const freshTelemetryObservation = {
  observedAt: '2026-06-01T11:00:00.000Z',
  observationAgeMs: 0,
  observationState: 'FRESH' as const,
};

const staleTelemetryObservation = {
  observedAt: '2025-01-01T00:00:00.000Z',
  observationAgeMs: 999_999,
  observationState: 'STALE' as const,
};

function baseSummary(overrides: Partial<CanonicalBatterySummaryForCoreRead> = {}): CanonicalBatterySummaryForCoreRead {
  return {
    generatedAt: '2026-06-01T12:00:00.000Z',
    lv: {
      status: 'ready',
      healthStatus: 'GOOD',
      healthPercent: 88,
      legacyPublicationSafety: capableSafety,
      restingVoltage: { valueV: 12.4, status: 'GOOD' },
      telemetry: {
        voltageV: 12.5,
        voltageSource: 'live_telemetry',
        voltageObservedAt: '2026-06-01T11:00:00.000Z',
      },
      freshness: { isFresh: true, observedAt: '2026-06-01T11:00:00.000Z', ageMs: 0, isStale: false },
    },
    hv: {
      healthStatus: 'GOOD',
      sohPct: 91,
      sohSource: 'PROVIDER',
      freshness: { isFresh: true, observedAt: '2026-06-01T10:00:00.000Z', ageMs: 0, isStale: false },
      telemetry: { socPercent: 80, rangeKm: 220, chargingPowerKw: null },
      dataQualityStatus: 'ESTIMATED',
    },
    canonical: {
      isEv: true,
      lv: {
        profile: { profile: 'ICE_LEAD_ACID', driveProfile: 'UNKNOWN', lvAssessmentAllowed: true, supported: true },
        canonical: {
          primaryTruth: {
            source: 'V2_PUBLICATION_STABLE',
            estimatedHealthScore: 88,
            decisionCapable: true,
          },
        },
      },
      hv: { supported: true },
      dataQuality: { aggregate: { status: 'ESTIMATED' } },
    },
    currentTelemetry: {
      chargingState: 'not_charging',
      socPercent: 80,
      rangeKm: 220,
      chargingPowerKw: null,
      observedAt: '2026-06-01T11:00:00.000Z',
      observationFreshness: freshTelemetryObservation,
    },
    currentState: { publishedSohPct: 88 },
    ...overrides,
  } as unknown as CanonicalBatterySummaryForCoreRead;
}

describe('toCoreBatteryReadV1 — fail-closed disclosure', () => {
  beforeEach(() => {
    publicationGateMock.mockReturnValue(false);
  });

  it('never exposes LV publication numerics or aggregate score band fields', () => {
    publicationGateMock.mockReturnValue(true);

    const dto = toCoreBatteryReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      fuelType: FuelType.GASOLINE,
      summary: baseSummary(),
    });

    expect(dto.lv).not.toHaveProperty('lvPublishedHealthPercent');
    expect(dto.lv).not.toHaveProperty('aggregateHealthStatus');
    expect(dto).not.toHaveProperty('estimatedHealthScore');
    expect(dto).not.toHaveProperty('displayBars');
  });

  it('publication flag OFF keeps gate false without exposing score bands', () => {
    const dto = toCoreBatteryReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      fuelType: FuelType.GASOLINE,
      summary: baseSummary({
        lv: {
          ...baseSummary().lv!,
          healthStatus: 'WARNING',
          healthPercent: 42,
        },
      } as Partial<CanonicalBatterySummaryForCoreRead>),
    });

    expect(dto.lv.lvPublicationCustomerVisible).toBe(false);
    expect(dto.lv).not.toHaveProperty('aggregateHealthStatus');
    expect(dto.lv.liveStatus).toBe('ready');
    expect(dto.lv.restingVoltageStatus).toBe('GOOD');
  });

  it('WORKSHOP truth with mismatched legacy published value exposes no LV numerics', () => {
    publicationGateMock.mockReturnValue(true);

    const dto = toCoreBatteryReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      fuelType: FuelType.GASOLINE,
      summary: baseSummary({
        canonical: {
          isEv: false,
          lv: {
            profile: baseSummary().canonical!.lv.profile,
            canonical: {
              primaryTruth: {
                source: 'WORKSHOP_MANUAL_EVIDENCE',
                estimatedHealthScore: 60,
                decisionCapable: true,
              },
            },
          },
          hv: { supported: false },
          dataQuality: { aggregate: { status: 'VERIFIED' } },
        },
        lv: {
          ...baseSummary().lv!,
          healthPercent: 88,
          healthStatus: 'GOOD',
        },
      } as Partial<CanonicalBatterySummaryForCoreRead>),
    });

    expect(dto.lv.primaryTruthSource).toBe('WORKSHOP_MANUAL_EVIDENCE');
    expect(dto.lv).not.toHaveProperty('lvPublishedHealthPercent');
    expect(dto.lv).not.toHaveProperty('aggregateHealthStatus');
  });

  it('maps NOT_AVAILABLE with null resolvedAt and null technical fields', () => {
    const dto = toCoreBatteryReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      fuelType: FuelType.DIESEL,
      summary: null,
    });

    expect(dto.version).toBe(CORE_BATTERY_READ_CONTRACT_VERSION);
    expect(dto.batteryAvailability).toBe('NOT_AVAILABLE');
    expect(dto.resolvedAt).toBeNull();
    expect(dto.hv.selectedTractionSohPercent).toBeNull();
  });

  it('unsupported HV on ICE nulls all HV technical metrics despite populated upstream', () => {
    const dto = toCoreBatteryReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      fuelType: FuelType.DIESEL,
      summary: baseSummary({
        canonical: {
          isEv: false,
          lv: baseSummary().canonical!.lv,
          hv: { supported: false },
          dataQuality: { aggregate: { status: 'ESTIMATED' } },
        },
        hv: {
          ...baseSummary().hv!,
          sohPct: 70,
          healthStatus: 'WARNING',
          telemetry: { socPercent: 77, rangeKm: 300, chargingPowerKw: 11 },
        },
        currentTelemetry: {
          chargingState: 'charging',
          socPercent: 77,
          rangeKm: 300,
          chargingPowerKw: 11,
          observedAt: '2026-06-01T11:00:00.000Z',
          observationFreshness: freshTelemetryObservation,
        },
      } as Partial<CanonicalBatterySummaryForCoreRead>),
    });

    expect(dto.isEv).toBe(false);
    expect(dto.hv.supported).toBe(false);
    expect(dto.hv).toEqual({
      supported: false,
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
    });
  });

  it('stale HV SOH assessment nulls traction SOH and healthStatus', () => {
    const dto = toCoreBatteryReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      fuelType: FuelType.ELECTRIC,
      summary: baseSummary({
        hv: {
          ...baseSummary().hv!,
          healthStatus: 'WARNING',
          freshness: { isFresh: false, observedAt: '2025-01-01T00:00:00.000Z', ageMs: 999, isStale: true },
        },
      } as Partial<CanonicalBatterySummaryForCoreRead>),
    });

    expect(dto.hv.selectedTractionSohPercent).toBeNull();
    expect(dto.hv.selectedTractionSohSource).toBeNull();
    expect(dto.hv.healthStatus).toBeNull();
  });

  it('stale live telemetry nulls soc/range/charging despite populated upstream', () => {
    const dto = toCoreBatteryReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      fuelType: FuelType.ELECTRIC,
      summary: baseSummary({
        currentTelemetry: {
          chargingState: 'charging',
          socPercent: 77,
          rangeKm: 300,
          chargingPowerKw: 11,
          observedAt: '2025-01-01T00:00:00.000Z',
          observationFreshness: staleTelemetryObservation,
        },
      } as Partial<CanonicalBatterySummaryForCoreRead>),
    });

    expect(dto.hv.telemetryDecisionFresh).toBe(false);
    expect(dto.hv.telemetryObservedAt).toBe('2025-01-01T00:00:00.000Z');
    expect(dto.hv.socPercent).toBeNull();
    expect(dto.hv.rangeKm).toBeNull();
    expect(dto.hv.chargingState).toBeNull();
    expect(dto.hv.chargingPowerKw).toBeNull();
    expect(dto.hv.selectedTractionSohPercent).toBe(91);
  });

  it('maps telemetryObservedAt from observationFreshness not currentTelemetry last-seen', () => {
    const dto = toCoreBatteryReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      fuelType: FuelType.ELECTRIC,
      summary: baseSummary({
        currentTelemetry: {
          chargingState: 'not_charging',
          socPercent: 60,
          rangeKm: 200,
          chargingPowerKw: null,
          observedAt: '2026-06-01T12:30:00.000Z',
          observationFreshness: {
            observedAt: '2026-06-01T11:00:00.000Z',
            observationAgeMs: 0,
            observationState: 'FRESH',
          },
        },
      } as Partial<CanonicalBatterySummaryForCoreRead>),
    });

    expect(dto.hv.telemetryObservedAt).toBe('2026-06-01T11:00:00.000Z');
    expect(dto.hv.telemetryObservedAt).not.toBe('2026-06-01T12:30:00.000Z');
  });

  it('fresh live telemetry exposes soc/range/charging from currentTelemetry authority', () => {
    publicationGateMock.mockReturnValue(false);

    const dto = toCoreBatteryReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      fuelType: FuelType.ELECTRIC,
      summary: baseSummary({
        currentTelemetry: {
          chargingState: 'charging',
          socPercent: 55,
          rangeKm: 180,
          chargingPowerKw: 22,
          observedAt: '2026-06-01T11:00:00.000Z',
          observationFreshness: freshTelemetryObservation,
        },
      } as Partial<CanonicalBatterySummaryForCoreRead>),
    });

    expect(dto.hv.telemetryDecisionFresh).toBe(true);
    expect(dto.hv.socPercent).toBe(55);
    expect(dto.hv.rangeKm).toBe(180);
    expect(dto.hv.chargingState).toBe('charging');
    expect(dto.hv.chargingPowerKw).toBe(22);
  });
});
