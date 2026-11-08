import { ServiceComplianceService } from './service-compliance.service';
import { MaintenanceForecastService } from './maintenance-forecast/maintenance-forecast.service';
import { buildOeServiceScheduleSuccessEnvelope, ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN } from '../../oneauto-provider/service-schedule/oneauto-oe-service-schedule.fixtures';
import {
  HM_OEM_SERVICE_FRESHNESS_MS,
  NEXT_SERVICE_WARNING_DAYS,
  NEXT_SERVICE_WARNING_KM,
} from './service-compliance.config';

const NOW = new Date('2026-06-16T12:00:00Z');
const FRESH_AT = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
const STALE_AT = new Date(NOW.getTime() - HM_OEM_SERVICE_FRESHNESS_MS - 1000).toISOString();

const mockPrisma = {
  vehicle: { findUnique: jest.fn() },
  vehicleServiceEvent: { findMany: jest.fn().mockResolvedValue([]) },
} as any;

function makeSvc(hm: Partial<{
  isActive: boolean;
  distanceKm: number | null;
  timeDays: number | null;
  lastUpdatedAt: string | null;
}>) {
  const mockHm = {
    isHmHealthActive: jest.fn().mockResolvedValue(hm.isActive ?? true),
    getServiceInfoSignals: jest.fn().mockResolvedValue(
      hm.isActive === false
        ? null
        : {
            distanceToNextServiceKm: hm.distanceKm ?? null,
            timeToNextServiceDays: hm.timeDays ?? null,
            lastUpdatedAt: hm.lastUpdatedAt ?? FRESH_AT,
          },
    ),
  };
  return new ServiceComplianceService(mockPrisma, mockHm as any, new MaintenanceForecastService(mockPrisma));
}

describe('ServiceComplianceService.evaluateNextService', () => {
  it('returns NO_TRACKING when HM health is inactive', async () => {
    const svc = makeSvc({ isActive: false });
    const r = await svc.evaluateNextService('v1', NOW);
    expect(r.trackingStatus).toBe('NO_TRACKING');
    expect(r.severity).toBe('INFO');
    expect(r.blocksRental).toBe(false);
  });

  it('returns NO_TRACKING when OEM sends no remaining values', async () => {
    const svc = makeSvc({ distanceKm: null, timeDays: null });
    const r = await svc.evaluateNextService('v1', NOW);
    expect(r.trackingStatus).toBe('NO_TRACKING');
    expect(r.blocksRental).toBe(false);
  });

  it('returns STALE when HM values are older than freshness window', async () => {
    const svc = makeSvc({ timeDays: 100, lastUpdatedAt: STALE_AT });
    const r = await svc.evaluateNextService('v1', NOW);
    expect(r.trackingStatus).toBe('STALE');
    expect(r.blocksRental).toBe(false);
    expect(r.distanceToNextServiceKm).toBeNull();
    expect(r.timeToNextServiceDays).toBeNull();
  });

  it('returns TRACKED GOOD when values are outside warning thresholds', async () => {
    const svc = makeSvc({
      distanceKm: NEXT_SERVICE_WARNING_KM + 500,
      timeDays: NEXT_SERVICE_WARNING_DAYS + 10,
    });
    const r = await svc.evaluateNextService('v1', NOW);
    expect(r.trackingStatus).toBe('TRACKED');
    expect(r.severity).toBe('GOOD');
    expect(r.blocksRental).toBe(false);
    expect(r.hmDistanceFromOem).toBe(true);
    expect(r.hmTimeFromOem).toBe(true);
  });

  it('returns WARNING when days within threshold', async () => {
    const svc = makeSvc({ timeDays: 20, distanceKm: null });
    const r = await svc.evaluateNextService('v1', NOW);
    expect(r.trackingStatus).toBe('TRACKED');
    expect(r.severity).toBe('WARNING');
  });

  it('returns CRITICAL when km is negative', async () => {
    const svc = makeSvc({ distanceKm: -200, timeDays: 50 });
    const r = await svc.evaluateNextService('v1', NOW);
    expect(r.trackingStatus).toBe('TRACKED');
    expect(r.severity).toBe('CRITICAL');
    expect(r.blocksRental).toBe(false);
  });

  it('uses stricter severity when both channels present', async () => {
    const svc = makeSvc({ distanceKm: 5000, timeDays: -3 });
    const r = await svc.evaluateNextService('v1', NOW);
    expect(r.severity).toBe('CRITICAL');
  });
});

describe('ServiceComplianceService.evaluateTuvBokraft', () => {
  const svc = makeSvc({});

  it('flags overdue TÜV as critical input for rental module', () => {
    const tuv = svc.evaluateTuvBokraft(
      {
        lastTuvDate: null,
        nextTuvDate: new Date('2026-01-01'),
        lastBokraftDate: null,
        nextBokraftDate: new Date('2027-01-01'),
      },
      NOW,
    );
    expect(tuv.tuvOverdue).toBe(true);
    expect(tuv.bokraftOverdue).toBe(false);
  });

  it('maps fresh HM critical next-service to rental critical state without block flag', () => {
    const evaluation = {
      nextService: {
        trackingStatus: 'TRACKED' as const,
        source: 'HM_OEM' as const,
        distanceToNextServiceKm: -100,
        timeToNextServiceDays: 10,
        lastUpdatedAt: FRESH_AT,
        serviceSourceLabel: 'HM/OEM',
        severity: 'CRITICAL' as const,
        blocksRental: false,
        title: 'Service überfällig',
        description: '',
        message: 'Service überfällig',
        hmDistanceFromOem: true,
        hmTimeFromOem: true,
        hmDerivedDueDate: null,
      },
      tuvBokraft: svc.evaluateTuvBokraft(
        {
          lastTuvDate: null,
          nextTuvDate: new Date('2027-01-01'),
          lastBokraftDate: null,
          nextBokraftDate: new Date('2027-01-01'),
        },
        NOW,
      ),
    };
    const module = svc.toRentalModuleHealth(
      evaluation,
      null,
      new Date('2027-01-01'),
      new Date('2027-01-01'),
      null,
      null,
    );
    expect(module.state).toBe('critical');
    expect(module.reason).toContain('Service');
  });

  it('does not elevate NO_TRACKING to warning or critical', () => {
    const evaluation = {
      nextService: {
        trackingStatus: 'NO_TRACKING' as const,
        source: null,
        distanceToNextServiceKm: null,
        timeToNextServiceDays: null,
        lastUpdatedAt: null,
        serviceSourceLabel: null,
        severity: 'INFO' as const,
        blocksRental: false,
        title: 'Kein Service-Tracking',
        description: '',
        message: 'Kein HM/OEM',
        hmDistanceFromOem: false,
        hmTimeFromOem: false,
        hmDerivedDueDate: null,
      },
      tuvBokraft: svc.evaluateTuvBokraft(
        {
          lastTuvDate: null,
          nextTuvDate: new Date('2027-01-01'),
          lastBokraftDate: null,
          nextBokraftDate: new Date('2027-01-01'),
        },
        NOW,
      ),
    };
    const module = svc.toRentalModuleHealth(
      evaluation,
      null,
      new Date('2027-01-01'),
      new Date('2027-01-01'),
      null,
      null,
    );
    expect(module.state).toBe('good');
  });
});

describe('ServiceComplianceService.isHmServiceFresh', () => {
  const svc = makeSvc({});

  it('treats values within 7 days as fresh', () => {
    expect(svc.isHmServiceFresh(FRESH_AT, NOW.getTime())).toBe(true);
  });

  it('treats values beyond 7 days as stale', () => {
    expect(svc.isHmServiceFresh(STALE_AT, NOW.getTime())).toBe(false);
  });
});

describe('ServiceComplianceService.buildServiceInfoStatus — history vs HM next service', () => {
  const hmFreshAt = () => new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  const hmMock = {
    isHmHealthActive: jest.fn().mockResolvedValue(true),
    getServiceInfoSignals: jest.fn().mockImplementation(() =>
      Promise.resolve({
        distanceToNextServiceKm: 4000,
        timeToNextServiceDays: 60,
        lastUpdatedAt: hmFreshAt(),
      }),
    ),
  };

  function makeBuildSvc(events: Array<{ eventType: string; eventDate: Date; odometerKm?: number }>) {
    const prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          serviceIntervalManufacturerKm: 15000,
          serviceIntervalManufacturerMonths: 12,
          lastServiceDate: null,
          lastServiceOdometerKm: null,
          lastTuvDate: null,
          nextTuvDate: new Date('2027-01-01'),
          lastBokraftDate: null,
          nextBokraftDate: new Date('2027-01-01'),
        }),
      },
      vehicleServiceEvent: {
        findMany: jest.fn().mockImplementation(({ where }: { where: { eventType?: { in?: string[] } } }) => {
          if (where.eventType?.in?.includes('FULL_SERVICE')) {
            return Promise.resolve(
              events.filter((e) =>
                ['FULL_SERVICE', 'GENERAL_INSPECTION'].includes(e.eventType),
              ),
            );
          }
          if (where.eventType?.in) {
            return Promise.resolve(events);
          }
          return Promise.resolve([]);
        }),
        count: jest.fn().mockImplementation(({ where }: { where: { eventType?: { in?: string[] } } }) => {
          const types = where.eventType?.in ?? [];
          const baselineOnly =
            types.length > 0 &&
            types.every((t) => ['FULL_SERVICE', 'GENERAL_INSPECTION'].includes(t));
          if (baselineOnly) {
            return Promise.resolve(
              events.filter((e) =>
                ['FULL_SERVICE', 'GENERAL_INSPECTION'].includes(e.eventType),
              ).length,
            );
          }
          return Promise.resolve(events.length);
        }),
      },
    } as any;
    return new ServiceComplianceService(prisma, hmMock as any, new MaintenanceForecastService(prisma));
  }

  it('does not use REPAIR as last full service date', async () => {
    const svc = makeBuildSvc([
      {
        eventType: 'REPAIR',
        eventDate: new Date('2026-06-10'),
        odometerKm: 10000,
      },
    ]);
    const status = await svc.buildServiceInfoStatus('v1');
    expect(status.lastServiceDate).toBeNull();
    expect(status.hasServiceHistory).toBe(true);
    expect(status.nextService.trackingStatus).toBe('TRACKED');
    expect(status.nextService.distanceToNextServiceKm).toBe(4000);
  });

  it('does not change next service when only OIL_CHANGE exists in history', async () => {
    const svc = makeBuildSvc([
      {
        eventType: 'OIL_CHANGE',
        eventDate: new Date('2026-06-10'),
        odometerKm: 10000,
      },
    ]);
    const status = await svc.buildServiceInfoStatus('v1');
    expect(status.lastServiceDate).toBeNull();
    expect(status.hasServiceHistory).toBe(true);
    expect(status.hasServiceBaseline).toBe(false);
    expect(status.nextService.trackingStatus).toBe('TRACKED');
  });
});

describe('ServiceComplianceService rental blocking — TÜV/BOKraft only', () => {
  const svc = makeSvc({});

  it('blocks rental module reason only for expired TÜV', () => {
    const evaluation = {
      nextService: {
        trackingStatus: 'NO_TRACKING' as const,
        source: null,
        distanceToNextServiceKm: null,
        timeToNextServiceDays: null,
        lastUpdatedAt: null,
        serviceSourceLabel: null,
        severity: 'INFO' as const,
        blocksRental: false,
        title: '',
        description: '',
        message: '',
        hmDistanceFromOem: false,
        hmTimeFromOem: false,
        hmDerivedDueDate: null,
      },
      tuvBokraft: svc.evaluateTuvBokraft(
        {
          lastTuvDate: null,
          nextTuvDate: new Date('2026-01-01'),
          lastBokraftDate: null,
          nextBokraftDate: new Date('2027-01-01'),
        },
        NOW,
      ),
    };
    const module = svc.toRentalModuleHealth(
      evaluation,
      null,
      new Date('2026-01-01'),
      new Date('2027-01-01'),
      null,
      null,
    );
    expect(module.state).toBe('critical');
    expect(module.reason).toMatch(/TÜV abgelaufen/);
  });

  it('blocks rental module reason for expired BOKraft', () => {
    const evaluation = {
      nextService: {
        trackingStatus: 'STALE' as const,
        source: 'HM_OEM' as const,
        distanceToNextServiceKm: null,
        timeToNextServiceDays: null,
        lastUpdatedAt: STALE_AT,
        serviceSourceLabel: null,
        severity: 'INFO' as const,
        blocksRental: false,
        title: '',
        description: '',
        message: 'stale',
        hmDistanceFromOem: false,
        hmTimeFromOem: false,
        hmDerivedDueDate: null,
      },
      tuvBokraft: svc.evaluateTuvBokraft(
        {
          lastTuvDate: null,
          nextTuvDate: new Date('2027-01-01'),
          lastBokraftDate: null,
          nextBokraftDate: new Date('2026-01-01'),
        },
        NOW,
      ),
    };
    const module = svc.toRentalModuleHealth(
      evaluation,
      null,
      new Date('2027-01-01'),
      new Date('2026-01-01'),
      null,
      null,
    );
    expect(module.state).toBe('critical');
    expect(module.reason).toMatch(/BOKraft abgelaufen/);
  });

  it('STALE HM next service does not produce rental-critical module state alone', () => {
    const evaluation = {
      nextService: {
        trackingStatus: 'STALE' as const,
        source: 'HM_OEM' as const,
        distanceToNextServiceKm: null,
        timeToNextServiceDays: null,
        lastUpdatedAt: STALE_AT,
        serviceSourceLabel: null,
        severity: 'INFO' as const,
        blocksRental: false,
        title: '',
        description: '',
        message: 'stale',
        hmDistanceFromOem: false,
        hmTimeFromOem: false,
        hmDerivedDueDate: null,
      },
      tuvBokraft: svc.evaluateTuvBokraft(
        {
          lastTuvDate: null,
          nextTuvDate: new Date('2027-01-01'),
          lastBokraftDate: null,
          nextBokraftDate: new Date('2027-01-01'),
        },
        NOW,
      ),
    };
    const module = svc.toRentalModuleHealth(
      evaluation,
      null,
      new Date('2027-01-01'),
      new Date('2027-01-01'),
      null,
      null,
    );
    expect(module.state).not.toBe('critical');
    expect(module.data_stale).toBe(true);
  });
});

describe('ServiceComplianceService — computed forecast without HM (Service Info V2)', () => {
  const now = new Date('2026-11-08T12:00:00Z');
  const hmInactive = {
    isHmHealthActive: jest.fn().mockResolvedValue(false),
    getServiceInfoSignals: jest.fn().mockResolvedValue(null),
  };

  function makePrisma(opts: {
    vehicle: Record<string, unknown>;
    events?: Array<Record<string, unknown>>;
    latestState?: { odometerKm: number; lastSeenAt: Date | null; source: string } | null;
    scheduleBody?: unknown;
  }) {
    const events = opts.events ?? [];
    return {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'v1',
          organizationId: 'org1',
          vin: null,
          mileageKm: null,
          serviceIntervalManufacturerKm: null,
          serviceIntervalManufacturerMonths: null,
          serviceIntervalKm: null,
          serviceIntervalMonths: null,
          oilChangeIntervalKm: null,
          oilChangeIntervalMonths: null,
          lastServiceDate: null,
          lastServiceOdometerKm: null,
          lastOilChangeDate: null,
          lastOilChangeOdometerKm: null,
          lastTuvDate: null,
          nextTuvDate: null,
          lastBokraftDate: null,
          nextBokraftDate: null,
          ...opts.vehicle,
        }),
      },
      vehicleServiceEvent: {
        findMany: jest.fn().mockImplementation(({ where }: { where: { eventType?: { in?: string[] } | string } }) => {
          const types = typeof where.eventType === 'string' ? [where.eventType] : (where.eventType?.in ?? []);
          return Promise.resolve(events.filter((e) => types.includes(e.eventType as string)));
        }),
        count: jest.fn().mockImplementation(({ where }: { where: { eventType?: { in?: string[] } } }) => {
          const types = where.eventType?.in ?? [];
          return Promise.resolve(events.filter((e) => types.includes(e.eventType as string)).length);
        }),
      },
      vehicleLatestState: {
        findUnique: jest.fn().mockResolvedValue(opts.latestState ?? null),
      },
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue(opts.scheduleBody ? { id: 'job1' } : null),
      },
      oneAutoProviderResponse: {
        findMany: jest.fn().mockResolvedValue(
          opts.scheduleBody
            ? [{ responseBodyJson: opts.scheduleBody, fetchedAt: new Date('2026-10-01T00:00:00Z'), responsePhase: 'callback' }]
            : [],
        ),
      },
    } as any;
  }

  it('computes next service from manual intervals + proven FULL_SERVICE when HM is not connected', async () => {
    const prisma = makePrisma({
      vehicle: { serviceIntervalManufacturerKm: 20000, serviceIntervalManufacturerMonths: 12 },
      events: [
        {
          id: 'e1',
          eventType: 'FULL_SERVICE',
          eventDate: new Date('2025-12-08T10:00:00Z'),
          odometerKm: 80000,
          origin: 'MANUAL',
          sourcePayloadJson: null,
          workshopName: 'W',
          notes: null,
          provider: null,
        },
      ],
      latestState: { odometerKm: 99000, lastSeenAt: new Date('2026-11-07T08:00:00Z'), source: 'dimo' },
    });
    const svc = new ServiceComplianceService(prisma, hmInactive as any, new MaintenanceForecastService(prisma));
    const r = await svc.evaluateNextService('v1', now);
    expect(r.trackingStatus).toBe('TRACKED');
    expect(r.source).toBe('COMPUTED_MANUAL_INTERVAL');
    expect(r.distanceToNextServiceKm).toBe(1000);
    expect(r.timeToNextServiceDays).toBe(30);
    expect(r.severity).toBe('WARNING');
    expect(r.hmDistanceFromOem).toBe(false);
    expect(r.projectedDueDate).toBe('2026-12-08T10:00:00.000Z');
    expect(r.provenance).toEqual({
      scheduleSource: 'MANUAL_INTERVAL',
      eventSource: 'SERVICE_EVENT_MANUAL',
      odometerSource: 'VEHICLE_LATEST_STATE',
      calculationMethod: 'COMPUTED_FROM_SCHEDULE_AND_HISTORY',
    });
    expect(prisma.oneAutoProviderJob.findFirst).not.toHaveBeenCalled(); // no VIN → no schedule lookup
  });

  it('uses the stored OneAuto schedule (no provider call) and reports provenance', async () => {
    const prisma = makePrisma({
      vehicle: { vin: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN },
      events: [
        {
          id: 'e1',
          eventType: 'OIL_CHANGE',
          eventDate: new Date('2026-05-01T00:00:00Z'),
          odometerKm: 50000,
          origin: 'ONEAUTO',
          sourcePayloadJson: { service_type: 'service', service_actions: ['Engine: oil and filter change.'] },
          workshopName: null,
          notes: null,
          provider: 'oneauto',
        },
      ],
      latestState: { odometerKm: 79500, lastSeenAt: now, source: 'dimo' },
      scheduleBody: buildOeServiceScheduleSuccessEnvelope(),
    });
    const svc = new ServiceComplianceService(prisma, hmInactive as any, new MaintenanceForecastService(prisma));
    const status = await svc.buildServiceInfoStatus('v1');
    expect(status.nextService.trackingStatus).toBe('TRACKED');
    expect(status.nextService.source).toBe('COMPUTED_ONEAUTO_SCHEDULE');
    expect(status.nextService.positionKind).toBe('OIL_CHANGE');
    expect(status.nextService.distanceToNextServiceKm).toBe(500);
    expect(status.nextService.severity).toBe('WARNING');
    expect(status.maintenanceForecast?.scheduleSources).toEqual(['ONEAUTO_SCHEDULE']);
    expect(status.maintenanceForecast?.unscheduledPositions.map((p) => p.positionId)).toEqual(['oneauto:SID2001']);
    expect(prisma.oneAutoProviderJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org1',
          vehicleId: 'v1',
          serviceSku: 'OE_SERVICE_SCHEDULE',
          status: 'SUCCEEDED',
          vinSnapshot: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
        }),
      }),
    );
    // computed overdue/due signals are suggestion-only (no auto task materialization)
    const serviceSignals = status.taskSignals.filter((s) => s.kind.startsWith('SERVICE'));
    expect(serviceSignals).toHaveLength(1);
    expect(serviceSignals[0]!.suggestionOnly).toBe(true);
  });

  it('schedule without proven history → NO_TRACKING with forecast positions exposed (no invented last service)', async () => {
    const prisma = makePrisma({
      vehicle: { serviceIntervalManufacturerKm: 20000, serviceIntervalManufacturerMonths: 12 },
      latestState: { odometerKm: 99000, lastSeenAt: now, source: 'dimo' },
    });
    const svc = new ServiceComplianceService(prisma, hmInactive as any, new MaintenanceForecastService(prisma));
    const status = await svc.buildServiceInfoStatus('v1');
    expect(status.nextService.trackingStatus).toBe('NO_TRACKING');
    expect(status.nextService.source).toBeNull();
    expect(status.maintenanceForecast?.positions[0]?.dueState).toBe('NO_BASELINE');
    expect(status.maintenanceForecast?.positions[0]?.baseline).toBeNull();
    expect(status.taskSignals.filter((s) => s.kind.startsWith('SERVICE'))).toHaveLength(0);
  });

  it('fresh HM stays the headline; computed forecast attached as comparison with visible conflict', async () => {
    const prisma = makePrisma({
      vehicle: { serviceIntervalManufacturerKm: 20000, serviceIntervalManufacturerMonths: 12 },
      events: [
        {
          id: 'e1',
          eventType: 'FULL_SERVICE',
          eventDate: new Date('2025-12-08T10:00:00Z'),
          odometerKm: 80000,
          origin: 'MANUAL',
          sourcePayloadJson: null,
          workshopName: null,
          notes: null,
          provider: null,
        },
      ],
      latestState: { odometerKm: 99000, lastSeenAt: now, source: 'dimo' },
    });
    const hmFresh = {
      isHmHealthActive: jest.fn().mockResolvedValue(true),
      getServiceInfoSignals: jest.fn().mockResolvedValue({
        distanceToNextServiceKm: 8000,
        timeToNextServiceDays: 120,
        lastUpdatedAt: now.toISOString(),
      }),
    };
    const svc = new ServiceComplianceService(prisma, hmFresh as any, new MaintenanceForecastService(prisma));
    const r = await svc.evaluateNextService('v1', now);
    expect(r.source).toBe('HM_OEM');
    expect(r.distanceToNextServiceKm).toBe(8000);
    expect(r.computedComparison).toMatchObject({ source: 'COMPUTED_MANUAL_INTERVAL', remainingKm: 1000, remainingDays: 30 });
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts![0]!.code).toBe('CONFLICT_HM_VS_COMPUTED');
    expect(r.dataQuality).toContain('CONFLICT_HM_VS_COMPUTED');
  });
});
