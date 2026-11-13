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
    currentTelemetry: { chargingState: 'not_charging', socPercent: 80, rangeKm: 220, chargingPowerKw: null },
    currentState: { publishedSohPct: 88 },
    ...overrides,
  } as unknown as CanonicalBatterySummaryForCoreRead;
}

describe('toCoreBatteryReadV1 — publication safety (F1)', () => {
  beforeEach(() => {
    publicationGateMock.mockReturnValue(false);
  });

  it('does not expose LV percent when publication flag OFF despite persisted stable publication', () => {
    const dto = toCoreBatteryReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      fuelType: FuelType.GASOLINE,
      summary: baseSummary(),
    });

    expect(dto.lv.lvPublicationCustomerVisible).toBe(false);
    expect(dto.lv.lvPublishedHealthPercent).toBeNull();
    expect(dto).not.toHaveProperty('estimatedHealthScore');
    expect(dto).not.toHaveProperty('displayBars');
    expect(dto.lv).not.toHaveProperty('estimatedHealthScore');
  });

  it('exposes LV percent only when publication gate ON and source is publishable', () => {
    publicationGateMock.mockReturnValue(true);

    const dto = toCoreBatteryReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      fuelType: FuelType.GASOLINE,
      summary: baseSummary(),
    });

    expect(dto.lv.lvPublicationCustomerVisible).toBe(true);
    expect(dto.lv.lvPublishedHealthPercent).toBe(88);
  });

  it('nulls LV percent when primaryTruthSource is missing', () => {
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
            canonical: { primaryTruth: { source: undefined } },
          },
          hv: { supported: false },
          dataQuality: { aggregate: { status: 'ESTIMATED' } },
        },
      } as unknown as Partial<CanonicalBatterySummaryForCoreRead>),
    });

    expect(dto.lv.lvPublishedHealthPercent).toBeNull();
  });

  it('nulls LV percent for unknown primaryTruthSource even when gate ON', () => {
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
              primaryTruth: { source: 'FUTURE_UNKNOWN_SOURCE' },
            },
          },
          hv: { supported: false },
          dataQuality: { aggregate: { status: 'ESTIMATED' } },
        },
      } as unknown as Partial<CanonicalBatterySummaryForCoreRead>),
    });

    expect(dto.lv.lvPublishedHealthPercent).toBeNull();
  });

  it('never exposes LV percent for shadow primary truth even when gate ON', () => {
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
            profile: { profile: 'ICE_LEAD_ACID', driveProfile: 'UNKNOWN', lvAssessmentAllowed: true, supported: true },
            canonical: {
              primaryTruth: {
                source: 'V2_SHADOW_DIAGNOSTIC',
                estimatedHealthScore: 55,
                decisionCapable: false,
              },
            },
          },
          hv: { supported: false },
          dataQuality: { aggregate: { status: 'EXPERIMENTAL' } },
        },
      } as Partial<CanonicalBatterySummaryForCoreRead>),
    });

    expect(dto.lv.lvPublishedHealthPercent).toBeNull();
  });

  it('maps NOT_AVAILABLE with null technical fields', () => {
    const dto = toCoreBatteryReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      fuelType: FuelType.DIESEL,
      summary: null,
    });

    expect(dto.version).toBe(CORE_BATTERY_READ_CONTRACT_VERSION);
    expect(dto.batteryAvailability).toBe('NOT_AVAILABLE');
    expect(dto.lv.lvPublishedHealthPercent).toBeNull();
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
    });
  });

  it('stale HV telemetry nulls selected traction SOH', () => {
    const dto = toCoreBatteryReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      fuelType: FuelType.ELECTRIC,
      summary: baseSummary({
        hv: {
          ...baseSummary().hv!,
          freshness: { isFresh: false, observedAt: '2025-01-01T00:00:00.000Z', ageMs: 999, isStale: true },
        },
      } as Partial<CanonicalBatterySummaryForCoreRead>),
    });

    expect(dto.hv.selectedTractionSohPercent).toBeNull();
    expect(dto.hv.selectedTractionSohSource).toBeNull();
  });
});
