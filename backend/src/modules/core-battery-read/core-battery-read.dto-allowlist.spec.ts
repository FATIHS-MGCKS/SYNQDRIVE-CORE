import { FuelType, ProductSlug } from '@prisma/client';
import { toCoreBatteryReadV1 } from './core-battery-read.v1.mapper';

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
  'aggregateHealthStatus',
  'primaryTruthSource',
  'restingVoltageV',
  'restingVoltageStatus',
  'displayVoltageV',
  'voltageSource',
  'voltageObservedAt',
  'lvPublicationCustomerVisible',
  'lvPublishedHealthPercent',
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
];

describe('Core battery read — DTO allowlist', () => {
  it('top-level, lv, and hv keys match explicit allowlists', () => {
    const dto = toCoreBatteryReadV1({
      organizationId: 'org',
      vehicleId: 'veh',
      productSlug: ProductSlug.RENTAL,
      fuelType: FuelType.ELECTRIC,
      summary: null,
    });

    expect(Object.keys(dto).sort()).toEqual([...TOP_LEVEL_KEYS].sort());
    expect(Object.keys(dto.lv).sort()).toEqual([...LV_KEYS].sort());
    expect(Object.keys(dto.hv).sort()).toEqual([...HV_KEYS].sort());

    for (const key of FORBIDDEN_TOP_LEVEL) {
      expect(dto).not.toHaveProperty(key);
    }
  });
});
