import { ProductSlug } from '@prisma/client';
import { toCoreServiceIntelligenceReadV1 } from './core-service-intelligence-read.v1.mapper';
import type { ServiceComplianceDetailedForCore } from './core-service-intelligence-read.v1.mapper';
import type { NextServiceComplianceDto } from '@modules/vehicle-intelligence/service-compliance/service-compliance.types';

const TOP_LEVEL_KEYS = [
  'version',
  'organizationId',
  'vehicleId',
  'productSlug',
  'nextServiceHeadline',
  'maintenancePositions',
  'positionsTotal',
  'positionsTruncated',
  'forecastComputedAt',
  'freshness',
  'forecastDataQuality',
  'conflicts',
] as const;

const HEADLINE_KEYS = [
  'trackingStatus',
  'source',
  'remainingKm',
  'remainingDays',
  'projectedDueDate',
  'positionKind',
  'positionId',
  'severity',
  'provenance',
  'headlineDataQuality',
  'computedComparison',
] as const;

const POSITION_KEYS = [
  'positionId',
  'kind',
  'dueState',
  'severity',
  'intervalMode',
  'intervalKm',
  'intervalMonths',
  'dueAtKm',
  'dueAtDate',
  'remainingKm',
  'remainingDays',
  'remainingMonths',
  'computationMode',
  'provenance',
  'dataQuality',
] as const;

const FORBIDDEN_TOP = [
  'blocksRental',
  'taskSignals',
  'history',
  'vin',
  'tuvValidTill',
  'bokraftValidTill',
  'message',
  'title',
  'serviceHistory',
];

describe('Core service intelligence — DTO allowlist', () => {
  const detailed: ServiceComplianceDetailedForCore = {
    nextService: {
      trackingStatus: 'TRACKED',
      source: 'COMPUTED_ONEAUTO_SCHEDULE',
      distanceToNextServiceKm: 100,
      timeToNextServiceDays: 10,
      lastUpdatedAt: '2026-06-01T10:00:00.000Z',
      serviceSourceLabel: 'hidden',
      severity: 'GOOD',
      blocksRental: true,
      title: 'hidden',
      description: 'hidden',
      message: 'hidden',
      hmDistanceFromOem: false,
      hmTimeFromOem: false,
      hmDerivedDueDate: null,
      projectedDueDate: null,
      positionKind: 'INSPECTION',
      positionId: 'pos-0',
      provenance: {
        scheduleSource: 'ONEAUTO_SCHEDULE',
        eventSource: 'SERVICE_EVENT_MANUAL',
        odometerSource: 'VEHICLE_LATEST_STATE',
        calculationMethod: 'COMPUTED_FROM_SCHEDULE_AND_HISTORY',
      },
      dataQuality: [],
      conflicts: [],
      computedComparison: null,
    } as NextServiceComplianceDto,
    forecast: {
      computedAt: '2026-06-01T12:00:00.000Z',
      positions: [
        {
          positionId: 'pos-0',
          kind: 'INSPECTION',
          label: 'hidden',
          intervalMode: 'RECURRING',
          intervalKm: 15000,
          intervalMonths: 12,
          rawIntervalDescription: 'hidden',
          baseline: {
            date: '2025-01-01T00:00:00.000Z',
            odometerKm: 10000,
            eventId: 'evt-hidden',
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
        },
      ],
      unscheduledPositions: [],
      nextDue: null,
      lastRelevantMaintenance: null,
      hmOem: null,
      odometer: null,
      conflicts: [],
      dataQuality: [],
      freshness: {
        odometerObservedAt: null,
        scheduleFetchedAt: null,
        hmLastUpdatedAt: null,
        latestEventDate: null,
      },
      scheduleSources: [],
      eventSources: [],
    },
  };

  it('matches literal allowlists and omits forbidden fields', () => {
    const dto = toCoreServiceIntelligenceReadV1({
      organizationId: 'org',
      vehicleId: 'veh',
      productSlug: ProductSlug.RENTAL,
      detailed,
    });

    expect(Object.keys(dto).sort()).toEqual([...TOP_LEVEL_KEYS].sort());
    expect(Object.keys(dto.nextServiceHeadline).sort()).toEqual([...HEADLINE_KEYS].sort());
    expect(Object.keys(dto.maintenancePositions[0]).sort()).toEqual([...POSITION_KEYS].sort());

    for (const key of FORBIDDEN_TOP) {
      expect(dto).not.toHaveProperty(key);
    }
    expect(dto.nextServiceHeadline).not.toHaveProperty('blocksRental');
    expect(dto.nextServiceHeadline).not.toHaveProperty('message');
  });
});
