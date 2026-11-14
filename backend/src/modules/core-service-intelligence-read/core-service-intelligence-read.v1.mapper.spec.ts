import { ProductSlug } from '@prisma/client';
import {
  toCoreServiceIntelligenceReadV1,
  type ServiceComplianceDetailedForCore,
} from './core-service-intelligence-read.v1.mapper';
import { CORE_SERVICE_INTELLIGENCE_POSITION_CAP } from './core-service-intelligence-read.v1.types';
import type { NextServiceComplianceDto } from '@modules/vehicle-intelligence/service-compliance/service-compliance.types';
import type {
  MaintenanceForecastResult,
  MaintenancePositionForecast,
} from '@modules/vehicle-intelligence/service-compliance/maintenance-forecast/maintenance-forecast.types';

const ORG = 'org-a';
const VEH = 'veh-a';
const PRODUCT = ProductSlug.RENTAL;

function baseNext(overrides: Partial<NextServiceComplianceDto> = {}): NextServiceComplianceDto {
  return {
    trackingStatus: 'TRACKED',
    source: 'HM_OEM',
    distanceToNextServiceKm: 1200,
    timeToNextServiceDays: 30,
    lastUpdatedAt: '2026-06-01T10:00:00.000Z',
    serviceSourceLabel: 'HM/OEM',
    severity: 'GOOD',
    blocksRental: false,
    title: 'hidden',
    description: 'hidden',
    message: 'hidden',
    hmDistanceFromOem: true,
    hmTimeFromOem: true,
    hmDerivedDueDate: null,
    projectedDueDate: '2026-07-01T00:00:00.000Z',
    positionKind: 'INSPECTION',
    positionId: null,
    provenance: {
      scheduleSource: 'HM_OEM',
      eventSource: 'NONE',
      odometerSource: 'HM_OEM',
      calculationMethod: 'OEM_REMAINING',
    },
    dataQuality: [],
    conflicts: [],
    computedComparison: null,
    ...overrides,
  };
}

function positionAt(index: number): MaintenancePositionForecast {
  return {
    positionId: `pos-${index}`,
    kind: 'INSPECTION',
    label: 'should not leak',
    intervalMode: 'RECURRING',
    intervalKm: 15000,
    intervalMonths: 12,
    rawIntervalDescription: 'hidden',
    baseline: {
      date: '2025-01-01T00:00:00.000Z',
      odometerKm: 10000,
      eventId: 'event-hidden',
      eventType: 'FULL_SERVICE',
      eventSource: 'SERVICE_EVENT_MANUAL',
    },
    dueAtKm: 25000,
    dueAtDate: '2026-12-01T00:00:00.000Z',
    remainingKm: 5000,
    remainingDays: 90,
    remainingMonths: 3,
    dueState: 'OK',
    computationMode: 'KM_AND_TIME',
    severity: 'GOOD',
    provenance: {
      scheduleSource: 'ONEAUTO_SCHEDULE',
      eventSource: 'SERVICE_EVENT_MANUAL',
      odometerSource: 'VEHICLE_LATEST_STATE',
      calculationMethod: 'COMPUTED_FROM_SCHEDULE_AND_HISTORY',
    },
    dataQuality: [],
  };
}

function baseForecast(
  overrides: Partial<MaintenanceForecastResult> = {},
  positionCount = 1,
): MaintenanceForecastResult {
  return {
    computedAt: '2026-06-01T12:00:00.000Z',
    positions: Array.from({ length: positionCount }, (_, i) => positionAt(i)),
    unscheduledPositions: [],
    nextDue: positionAt(0),
    lastRelevantMaintenance: null,
    hmOem: null,
    odometer: { km: 20000, observedAt: '2026-06-01T09:00:00.000Z', source: 'VEHICLE_LATEST_STATE' },
    conflicts: [],
    dataQuality: ['ODOMETER_STALE'],
    freshness: {
      odometerObservedAt: '2026-06-01T09:00:00.000Z',
      scheduleFetchedAt: '2026-05-01T00:00:00.000Z',
      hmLastUpdatedAt: '2026-06-01T10:00:00.000Z',
      latestEventDate: '2026-04-01T00:00:00.000Z',
    },
    scheduleSources: ['ONEAUTO_SCHEDULE'],
    eventSources: ['SERVICE_EVENT_MANUAL'],
    ...overrides,
  };
}

function map(detailed: ServiceComplianceDetailedForCore) {
  return toCoreServiceIntelligenceReadV1({
    organizationId: ORG,
    vehicleId: VEH,
    productSlug: PRODUCT,
    detailed,
  });
}

describe('toCoreServiceIntelligenceReadV1', () => {
  it('fresh HM/OEM headline', () => {
    const dto = map({
      nextService: baseNext(),
      forecast: baseForecast(),
    });
    expect(dto.nextServiceHeadline.trackingStatus).toBe('TRACKED');
    expect(dto.nextServiceHeadline.source).toBe('HM_OEM');
    expect(dto.nextServiceHeadline.remainingKm).toBe(1200);
    expect(dto.nextServiceHeadline.provenance?.calculationMethod).toBe('OEM_REMAINING');
    expect(dto).not.toHaveProperty('blocksRental');
  });

  it('stale HM/OEM fail-closed numerics', () => {
    const dto = map({
      nextService: baseNext({
        trackingStatus: 'STALE',
        source: 'HM_OEM',
        distanceToNextServiceKm: 500,
        timeToNextServiceDays: 10,
        projectedDueDate: '2026-07-01T00:00:00.000Z',
        severity: 'INFO',
      }),
      forecast: baseForecast(),
    });
    expect(dto.nextServiceHeadline.trackingStatus).toBe('STALE');
    expect(dto.nextServiceHeadline.remainingKm).toBeNull();
    expect(dto.nextServiceHeadline.remainingDays).toBeNull();
    expect(dto.nextServiceHeadline.projectedDueDate).toBeNull();
  });

  it('computed OneAuto headline', () => {
    const dto = map({
      nextService: baseNext({
        source: 'COMPUTED_ONEAUTO_SCHEDULE',
        distanceToNextServiceKm: 800,
        timeToNextServiceDays: 45,
        provenance: {
          scheduleSource: 'ONEAUTO_SCHEDULE',
          eventSource: 'SERVICE_EVENT_MANUAL',
          odometerSource: 'VEHICLE_LATEST_STATE',
          calculationMethod: 'COMPUTED_FROM_SCHEDULE_AND_HISTORY',
        },
      }),
      forecast: baseForecast(),
    });
    expect(dto.nextServiceHeadline.source).toBe('COMPUTED_ONEAUTO_SCHEDULE');
    expect(dto.nextServiceHeadline.provenance?.calculationMethod).toBe('COMPUTED_FROM_SCHEDULE_AND_HISTORY');
  });

  it('computed manual headline', () => {
    const dto = map({
      nextService: baseNext({
        source: 'COMPUTED_MANUAL_INTERVAL',
        provenance: {
          scheduleSource: 'MANUAL_INTERVAL',
          eventSource: 'VEHICLE_MASTER_DATA',
          odometerSource: 'VEHICLE_MASTER_DATA',
          calculationMethod: 'COMPUTED_FROM_SCHEDULE_AND_HISTORY',
        },
      }),
      forecast: baseForecast(),
    });
    expect(dto.nextServiceHeadline.source).toBe('COMPUTED_MANUAL_INTERVAL');
  });

  it('passes upstream computedComparison without recomputation', () => {
    const comparison = {
      source: 'COMPUTED_ONEAUTO_SCHEDULE' as const,
      positionId: 'pos-0',
      remainingKm: 700,
      remainingDays: 20,
      projectedDueDate: '2026-08-01T00:00:00.000Z',
    };
    const dto = map({
      nextService: baseNext({ computedComparison: comparison }),
      forecast: baseForecast(),
    });
    expect(dto.nextServiceHeadline.computedComparison).toEqual(comparison);
  });

  it('missing forecast null semantics', () => {
    const dto = map({
      nextService: baseNext({
        conflicts: [
          {
            code: 'CONFLICT_HM_VS_COMPUTED',
            positionId: null,
            hmRemainingKm: null,
            computedRemainingKm: null,
            hmRemainingDays: null,
            computedRemainingDays: null,
          },
        ],
      }),
      forecast: null,
    });
    expect(dto.maintenancePositions).toEqual([]);
    expect(dto.positionsTotal).toBe(0);
    expect(dto.positionsTruncated).toBe(false);
    expect(dto.forecastComputedAt).toBeNull();
    expect(dto.forecastDataQuality).toEqual([]);
    expect(dto.freshness).toEqual({
      odometerObservedAt: null,
      scheduleFetchedAt: null,
      hmLastUpdatedAt: null,
      latestEventDate: null,
    });
    expect(dto.conflicts).toHaveLength(1);
  });

  it('conflicts from forecast when present (no union)', () => {
    const forecastConflict = {
      code: 'ODOMETER_BELOW_BASELINE' as const,
      positionId: 'pos-1',
      hmRemainingKm: null,
      computedRemainingKm: null,
      hmRemainingDays: null,
      computedRemainingDays: null,
    };
    const dto = map({
      nextService: baseNext({
        conflicts: [
          {
            code: 'CONFLICT_HM_VS_COMPUTED',
            positionId: 'ignored',
            hmRemainingKm: 100,
            computedRemainingKm: 200,
            hmRemainingDays: null,
            computedRemainingDays: null,
          },
        ],
      }),
      forecast: baseForecast({ conflicts: [forecastConflict] }),
    });
    expect(dto.conflicts).toEqual([forecastConflict]);
  });

  it('positions > cap with accurate total and truncated flag', () => {
    const count = CORE_SERVICE_INTELLIGENCE_POSITION_CAP + 3;
    const dto = map({
      nextService: baseNext(),
      forecast: baseForecast({}, count),
    });
    expect(dto.maintenancePositions).toHaveLength(CORE_SERVICE_INTELLIGENCE_POSITION_CAP);
    expect(dto.positionsTotal).toBe(count);
    expect(dto.positionsTruncated).toBe(true);
    expect(dto.maintenancePositions[0]).not.toHaveProperty('label');
    expect(dto.maintenancePositions[0]).not.toHaveProperty('baseline');
  });

  it('stale odometer flag preserved in forecastDataQuality', () => {
    const dto = map({ nextService: baseNext(), forecast: baseForecast({ dataQuality: ['ODOMETER_STALE'] }) });
    expect(dto.forecastDataQuality).toContain('ODOMETER_STALE');
  });

  it('unknown tracking status fail-closed', () => {
    const dto = map({
      nextService: baseNext({
        trackingStatus: 'BOGUS' as NextServiceComplianceDto['trackingStatus'],
        distanceToNextServiceKm: 1,
      }),
      forecast: baseForecast(),
    });
    expect(dto.nextServiceHeadline.trackingStatus).toBe('NO_TRACKING');
    expect(dto.nextServiceHeadline.remainingKm).toBeNull();
    expect(dto.nextServiceHeadline.source).toBeNull();
  });

  it('does not fabricate freshness when forecast missing', () => {
    const dto = map({ nextService: baseNext(), forecast: null });
    expect(Object.values(dto.freshness).every((v) => v === null)).toBe(true);
  });

  it('preserves freshness from forecast only', () => {
    const dto = map({ nextService: baseNext(), forecast: baseForecast() });
    expect(dto.freshness.odometerObservedAt).toBe('2026-06-01T09:00:00.000Z');
    expect(dto.forecastComputedAt).toBe('2026-06-01T12:00:00.000Z');
  });

  it('NO_TRACKING with null source and null forecast — fail-closed Core contract', () => {
    const dto = map({
      nextService: baseNext({
        trackingStatus: 'NO_TRACKING',
        source: null,
        distanceToNextServiceKm: 999,
        timeToNextServiceDays: 99,
        projectedDueDate: '2026-12-01T00:00:00.000Z',
        severity: 'INFO',
        provenance: null,
        computedComparison: {
          source: 'COMPUTED_ONEAUTO_SCHEDULE',
          positionId: 'pos-0',
          remainingKm: 1,
          remainingDays: 2,
          projectedDueDate: '2026-08-01T00:00:00.000Z',
        },
      }),
      forecast: null,
    });

    expect(dto.nextServiceHeadline.trackingStatus).toBe('NO_TRACKING');
    expect(dto.nextServiceHeadline.source).toBeNull();
    expect(dto.nextServiceHeadline.remainingKm).toBeNull();
    expect(dto.nextServiceHeadline.remainingDays).toBeNull();
    expect(dto.nextServiceHeadline.projectedDueDate).toBeNull();
    expect(dto.nextServiceHeadline.computedComparison).toBeNull();
    expect(dto.maintenancePositions).toEqual([]);
    expect(dto.positionsTotal).toBe(0);
    expect(dto.positionsTruncated).toBe(false);
    expect(dto.forecastComputedAt).toBeNull();
    expect(dto.freshness).toEqual({
      odometerObservedAt: null,
      scheduleFetchedAt: null,
      hmLastUpdatedAt: null,
      latestEventDate: null,
    });
  });

  it('projects conflicts without forwarding unknown properties', () => {
    const dto = map({
      nextService: baseNext(),
      forecast: baseForecast({
        conflicts: [
          {
            code: 'CONFLICT_HM_VS_COMPUTED',
            positionId: 'pos-0',
            hmRemainingKm: 100,
            computedRemainingKm: 200,
            hmRemainingDays: null,
            computedRemainingDays: null,
            injected: true,
          } as unknown as import('@modules/vehicle-intelligence/service-compliance/maintenance-forecast/maintenance-forecast.types').MaintenanceConflict,
        ],
      }),
    });
    expect(dto.conflicts[0]).toEqual({
      code: 'CONFLICT_HM_VS_COMPUTED',
      positionId: 'pos-0',
      hmRemainingKm: 100,
      computedRemainingKm: 200,
      hmRemainingDays: null,
      computedRemainingDays: null,
    });
    expect(dto.conflicts[0]).not.toHaveProperty('injected');
  });
});
