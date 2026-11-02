import { VehiclesOperationalService } from './vehicles-operational.service';
import type { PrismaService } from '@shared/database/prisma.service';
import type { PlatformAdminService } from '@modules/platform-admin/platform-admin.service';
import type { PlatformConnectivitySummaryService } from '@modules/platform-admin/platform-dashboard.service';
import type { VehiclesService } from './vehicles.service';

describe('VehiclesOperationalService overview freshness (ACTIVE fleet cohort)', () => {
  const findMany = jest.fn();
  const count = jest.fn().mockResolvedValue(0);
  const prisma = {
    vehicle: { findMany, count },
    dimoVehicle: { findMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    organization: { findUnique: jest.fn() },
  } as unknown as PrismaService;

  const getPlatformSummary = jest.fn().mockResolvedValue({
    freshness: {
      live: 0,
      standby: 0,
      signal_delayed: 99,
      offline: 99,
      no_signal: 0,
    },
  });

  const connectivitySummary = {
    getPlatformSummary,
  } as unknown as PlatformConnectivitySummaryService;

  let svc: VehiclesOperationalService;

  beforeEach(() => {
    findMany.mockReset();
    count.mockReset();
    count.mockResolvedValue(0);
    getPlatformSummary.mockClear();
    svc = new VehiclesOperationalService(
      prisma,
      {} as PlatformAdminService,
      connectivitySummary,
      {} as VehiclesService,
    );
    jest.spyOn(svc as unknown as { loadPlatformDimoContext: () => Promise<unknown> }, 'loadPlatformDimoContext').mockResolvedValue({
      degraded: false,
      message: null,
    });
    jest
      .spyOn(svc as unknown as { loadPollLogsForVehicles: () => Promise<Map<string, unknown>> }, 'loadPollLogsForVehicles')
      .mockResolvedValue(new Map());
  });

  function mockOverviewCounts(activeRegistered: number, offboarded = 0) {
    count
      .mockResolvedValueOnce(activeRegistered)
      .mockResolvedValueOnce(offboarded)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
  }

  function mockActiveFreshnessFindMany(
    rows: Array<{
      latestState: { lastSeenAt: Date; updatedAt: null } | null;
      dimoVehicle: { lastSignal: Date } | null;
    }>,
  ) {
    findMany.mockImplementation(async (args: { select?: unknown; include?: unknown; where?: { registryLifecycle?: string } }) => {
      if (args.select) return rows;
      if (args.include) return [];
      return [];
    });
  }

  it('does not use platform-wide connectivity summary for overview freshness', async () => {
    findMany.mockImplementation(async (args: { select?: unknown; include?: unknown }) =>
      args.include ? [] : [],
    );
    mockOverviewCounts(0);
    await svc.getOverview();
    expect(getPlatformSummary).not.toHaveBeenCalled();
  });

  it('aggregates freshness only for ACTIVE registered vehicles', async () => {
    const nowMs = Date.parse('2026-10-29T12:00:00.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(nowMs);
    const recent = new Date(nowMs - 5 * 60_000);
    mockActiveFreshnessFindMany([
      { latestState: { lastSeenAt: recent, updatedAt: null }, dimoVehicle: { lastSignal: recent } },
      { latestState: null, dimoVehicle: { lastSignal: recent } },
      { latestState: { lastSeenAt: recent, updatedAt: null }, dimoVehicle: null },
    ]);
    mockOverviewCounts(3);
    const overview = await svc.getOverview();
    const sum =
      overview.freshness.live +
      overview.freshness.standby +
      overview.freshness.signal_delayed +
      overview.freshness.offline +
      overview.freshness.no_signal;
    expect(sum).toBe(overview.counts.registered);
    expect(overview.freshness.live).toBe(3);
    jest.spyOn(Date, 'now').mockRestore();
  });

  it('scopes freshness query to organization when provided', async () => {
    findMany.mockImplementation(async (args: { select?: unknown; include?: unknown }) =>
      args.include ? [] : [],
    );
    mockOverviewCounts(0);
    await svc.getOverview({ organizationId: 'org-42' });
    const freshnessCall = findMany.mock.calls.find((c) => c[0]?.select != null);
    expect(freshnessCall?.[0].where).toMatchObject({
      registryLifecycle: 'ACTIVE',
      organizationId: 'org-42',
    });
  });

  it('excludes OFFBOARDED vehicles from overview freshness (platform summary would differ)', async () => {
    const nowMs = Date.parse('2026-10-29T12:00:00.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(nowMs);
    const stale = new Date(nowMs - 7 * 86_400_000);
    mockActiveFreshnessFindMany([{ latestState: null, dimoVehicle: { lastSignal: stale } }]);
    mockOverviewCounts(1, 2);
    const overview = await svc.getOverview();
    expect(overview.counts.registeredOffboarded).toBe(2);
    expect(overview.freshness.offline).toBe(1);
    expect(getPlatformSummary).not.toHaveBeenCalled();
    jest.spyOn(Date, 'now').mockRestore();
  });

  it('classifies active vehicles without DIMO binding via latestState only', async () => {
    const nowMs = Date.parse('2026-10-29T12:00:00.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(nowMs);
    const recent = new Date(nowMs - 5 * 60_000);
    mockActiveFreshnessFindMany([
      { latestState: { lastSeenAt: recent, updatedAt: null }, dimoVehicle: null },
    ]);
    mockOverviewCounts(1);
    const overview = await svc.getOverview();
    expect(overview.freshness.live).toBe(1);
    expect(overview.freshness.no_signal).toBe(0);
    jest.spyOn(Date, 'now').mockRestore();
  });

  it('active vehicle without DIMO and without state evidence counts as no_signal', async () => {
    mockActiveFreshnessFindMany([{ latestState: null, dimoVehicle: null }]);
    mockOverviewCounts(1);
    const overview = await svc.getOverview();
    expect(overview.freshness.no_signal).toBe(1);
  });
});
