import { ServiceComplianceService } from './service-compliance.service';
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
  return new ServiceComplianceService(mockPrisma, mockHm as any);
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
    return new ServiceComplianceService(prisma, hmMock as any);
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
