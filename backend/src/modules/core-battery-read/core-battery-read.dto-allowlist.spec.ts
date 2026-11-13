import { FuelType, ProductSlug } from '@prisma/client';
import type { LegacyPublicationSafetyResult } from '@modules/vehicle-intelligence/battery-health/battery-legacy-publication-safety';
import { toCoreBatteryReadV1 } from './core-battery-read.v1.mapper';
import type { CanonicalBatterySummaryForCoreRead } from './core-battery-read.v1.mapper';

const TOP_LEVEL_KEYS = [
  'version',
  'organizationId',
  'vehicleId',
  'productSlug',
  'fuelType',
  'isEv',
  'resolvedAt',
  'batteryAvailability',
  'lv',
  'hv',
] as const;

const LV_KEYS = [
  'supported',
  'profile',
  'driveProfile',
  'liveStatus',
  'primaryTruthSource',
  'restingVoltageV',
  'restingVoltageStatus',
  'displayVoltageV',
  'voltageSource',
  'voltageObservedAt',
  'lvPublicationCustomerVisible',
  'dataQualityStatus',
  'observationDecisionFresh',
  'observationObservedAt',
] as const;

const HV_KEYS = [
  'supported',
  'healthStatus',
  'selectedTractionSohPercent',
  'selectedTractionSohSource',
  'socPercent',
  'rangeKm',
  'chargingState',
  'chargingPowerKw',
  'dataQualityStatus',
  'observationDecisionFresh',
  'observationObservedAt',
  'telemetryDecisionFresh',
  'telemetryObservedAt',
] as const;

const FORBIDDEN_TOP_LEVEL = [
  'rental_blocked',
  'rental_readiness',
  'blocking_reasons',
  'canonical',
  'watchpoints',
  'recommendations',
  'estimatedHealthScore',
  'displayBars',
  'condition',
  'trend7',
  'trend30',
  'lvPublishedHealthPercent',
  'aggregateHealthStatus',
];

const FORBIDDEN_LV_KEYS = ['lvPublishedHealthPercent', 'aggregateHealthStatus', 'estimatedHealthScore'];

function populatedSummary(): CanonicalBatterySummaryForCoreRead {
  return {
    generatedAt: '2026-06-01T12:00:00.000Z',
    lv: {
      status: 'ready',
      healthStatus: 'GOOD',
      healthPercent: 88,
      legacyPublicationSafety: {
        decisionCapable: true,
        diagnosticLabelDe: 'ok',
        displayMode: 'DECISION_CAPABLE',
        reasons: [],
      } as unknown as LegacyPublicationSafetyResult,
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
      observationFreshness: {
        observedAt: '2026-06-01T11:00:00.000Z',
        observationAgeMs: 0,
        observationState: 'FRESH',
      },
    },
  } as unknown as CanonicalBatterySummaryForCoreRead;
}

function assertAllowlist(dto: ReturnType<typeof toCoreBatteryReadV1>): void {
  expect(Object.keys(dto).sort()).toEqual([...TOP_LEVEL_KEYS].sort());
  expect(Object.keys(dto.lv).sort()).toEqual([...LV_KEYS].sort());
  expect(Object.keys(dto.hv).sort()).toEqual([...HV_KEYS].sort());

  for (const key of FORBIDDEN_TOP_LEVEL) {
    expect(dto).not.toHaveProperty(key);
  }
  for (const key of FORBIDDEN_LV_KEYS) {
    expect(dto.lv).not.toHaveProperty(key);
  }
}

describe('Core battery read — DTO allowlist', () => {
  it('NOT_AVAILABLE path keys match explicit allowlists', () => {
    const dto = toCoreBatteryReadV1({
      organizationId: 'org',
      vehicleId: 'veh',
      productSlug: ProductSlug.RENTAL,
      fuelType: FuelType.ELECTRIC,
      summary: null,
    });

    assertAllowlist(dto);
    expect(dto.resolvedAt).toBeNull();
  });

  it('AVAILABLE path keys match explicit allowlists on populated summary', () => {
    const dto = toCoreBatteryReadV1({
      organizationId: 'org',
      vehicleId: 'veh',
      productSlug: ProductSlug.RENTAL,
      fuelType: FuelType.ELECTRIC,
      summary: populatedSummary(),
    });

    assertAllowlist(dto);
    expect(dto.batteryAvailability).toBe('AVAILABLE');
    expect(dto.resolvedAt).toBe('2026-06-01T12:00:00.000Z');
  });
});
