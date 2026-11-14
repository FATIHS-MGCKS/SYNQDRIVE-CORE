import { ProductSlug } from '@prisma/client';
import type { MaintenanceProvenance } from '@modules/vehicle-intelligence/service-compliance/maintenance-forecast/maintenance-forecast.types';
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

const PROVENANCE_KEYS = ['scheduleSource', 'eventSource', 'odometerSource', 'calculationMethod'] as const;

const COMPUTED_COMPARISON_KEYS = [
  'source',
  'positionId',
  'remainingKm',
  'remainingDays',
  'projectedDueDate',
] as const;

const FRESHNESS_KEYS = [
  'odometerObservedAt',
  'scheduleFetchedAt',
  'hmLastUpdatedAt',
  'latestEventDate',
] as const;

const CONFLICT_KEYS = [
  'code',
  'positionId',
  'hmRemainingKm',
  'computedRemainingKm',
  'hmRemainingDays',
  'computedRemainingDays',
] as const;

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

  it('nested key allowlists and strips injected unknown properties on serialize', () => {
    const polluted: ServiceComplianceDetailedForCore = {
      nextService: {
        ...detailed.nextService,
        provenance: {
          ...detailed.nextService.provenance!,
          injectedProvenance: 'must-not-leak',
        } as unknown as NextServiceComplianceDto['provenance'],
        computedComparison: {
          source: 'COMPUTED_ONEAUTO_SCHEDULE',
          positionId: 'pos-0',
          remainingKm: 1,
          remainingDays: 2,
          projectedDueDate: '2026-08-01T00:00:00.000Z',
          injectedComparison: 'must-not-leak',
        } as unknown as NextServiceComplianceDto['computedComparison'],
        conflicts: [
          {
            code: 'CONFLICT_HM_VS_COMPUTED',
            positionId: 'pos-0',
            hmRemainingKm: 1,
            computedRemainingKm: 2,
            hmRemainingDays: null,
            computedRemainingDays: null,
            injectedConflict: 'must-not-leak',
          } as never,
        ],
      },
      forecast: {
        ...detailed.forecast!,
        freshness: {
          odometerObservedAt: '2026-06-01T09:00:00.000Z',
          scheduleFetchedAt: null,
          hmLastUpdatedAt: null,
          latestEventDate: null,
          injectedFreshness: 'must-not-leak',
        } as never,
        conflicts: [
          {
            code: 'ODOMETER_BELOW_BASELINE',
            positionId: 'pos-0',
            hmRemainingKm: null,
            computedRemainingKm: null,
            hmRemainingDays: null,
            computedRemainingDays: null,
            injectedConflictTop: 'must-not-leak',
          } as never,
        ],
        positions: [
          {
            ...detailed.forecast!.positions[0],
            provenance: {
              ...detailed.forecast!.positions[0].provenance,
              injectedPositionProv: 'must-not-leak',
            } as unknown as MaintenanceProvenance,
          },
        ],
      },
    };

    const dto = toCoreServiceIntelligenceReadV1({
      organizationId: 'org',
      vehicleId: 'veh',
      productSlug: ProductSlug.RENTAL,
      detailed: polluted,
    });

    const headlineProv = dto.nextServiceHeadline.provenance;
    expect(headlineProv).not.toBeNull();
    expect(Object.keys(headlineProv!).sort()).toEqual([...PROVENANCE_KEYS].sort());

    const comparison = dto.nextServiceHeadline.computedComparison;
    expect(comparison).not.toBeNull();
    expect(Object.keys(comparison!).sort()).toEqual([...COMPUTED_COMPARISON_KEYS].sort());

    expect(Object.keys(dto.freshness).sort()).toEqual([...FRESHNESS_KEYS].sort());
    expect(dto.conflicts[0]).toBeDefined();
    expect(Object.keys(dto.conflicts[0]).sort()).toEqual([...CONFLICT_KEYS].sort());
    expect(Object.keys(dto.maintenancePositions[0].provenance).sort()).toEqual([...PROVENANCE_KEYS].sort());

    const serialized = JSON.parse(JSON.stringify(dto)) as typeof dto;
    expect(serialized.nextServiceHeadline.provenance).not.toHaveProperty('injectedProvenance');
    expect(serialized.nextServiceHeadline.computedComparison).not.toHaveProperty('injectedComparison');
    expect(serialized.freshness).not.toHaveProperty('injectedFreshness');
    expect(serialized.conflicts[0]).not.toHaveProperty('injectedConflictTop');
    expect(serialized.maintenancePositions[0].provenance).not.toHaveProperty('injectedPositionProv');
  });
});
