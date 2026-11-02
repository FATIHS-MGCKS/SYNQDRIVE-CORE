import type { ClickHouseService } from './clickhouse.service';
import {
  ClickHouseHfService,
  HF_TRIP_RPM_DEFAULT_READ_LIMIT,
} from './clickhouse-hf.service';

describe('ClickHouseHfService.getTripRpmHfPoints', () => {
  function makeService(queryImpl: (query: string) => Promise<{ json: () => Promise<unknown[]> }>) {
    const ch = {
      isAvailable: true,
      getClient: () => ({
        query: jest.fn(async ({ query }: { query: string }) => queryImpl(query)),
      }),
    } as unknown as ClickHouseService;
    return new ClickHouseHfService(ch);
  }

  it('returns UNAVAILABLE when ClickHouse down', async () => {
    const ch = { isAvailable: false } as ClickHouseService;
    const svc = new ClickHouseHfService(ch);
    const res = await svc.getTripRpmHfPoints({
      orgId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tripStart: new Date('2026-10-27T10:00:00.000Z'),
      tripEnd: new Date('2026-10-27T11:00:00.000Z'),
    });
    expect(res.status).toBe('UNAVAILABLE');
    expect(res.available).toBe(false);
  });

  it('scopes query to org, vehicle, trip, signal', async () => {
    const captured: string[] = [];
    const svc = makeService(async (query) => {
      captured.push(query);
      if (query.includes('count()')) {
        return { json: async () => [{ cnt: 0 }] };
      }
      return { json: async () => [] };
    });
    await svc.getTripRpmHfPoints({
      orgId: 'org-a',
      vehicleId: 'veh-b',
      tripId: 'trip-c',
      tripStart: new Date('2026-10-27T10:00:00.000Z'),
      tripEnd: new Date('2026-10-27T11:00:00.000Z'),
    });
    expect(captured.some((q) => q.includes('org_id'))).toBe(true);
    expect(captured.some((q) => q.includes('trip_id'))).toBe(true);
    expect(captured.some((q) => q.includes('signal_name'))).toBe(true);
  });

  it('fail-closed tenant scope violation returns no points', async () => {
    const svc = makeService(async (query) => {
      if (query.includes('count()')) {
        return { json: async () => [{ cnt: 1 }] };
      }
      return {
        json: async () => [
          {
            org_id: 'wrong-org',
            vehicle_id: 'veh-1',
            trip_id: 'trip-1',
            token_id: 42,
            recorded_at: '2026-10-27 10:00:01.000',
            value_float: 1500,
            unit: 'rpm',
            quality: 'normalized',
          },
        ],
      };
    });
    const res = await svc.getTripRpmHfPoints({
      orgId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tripStart: new Date('2026-10-27T10:00:00.000Z'),
      tripEnd: new Date('2026-10-27T11:00:00.000Z'),
    });
    expect(res.status).toBe('TENANT_SCOPE_VIOLATION');
    expect(res.tenantScopeViolation).toBe(true);
    expect(res.points).toHaveLength(0);
    expect(res.returnedCount).toBe(0);
  });

  it('null trip_id triggers tenant fail-closed', async () => {
    const svc = makeService(async (query) => {
      if (query.includes('count()')) {
        return { json: async () => [{ cnt: 1 }] };
      }
      return {
        json: async () => [
          {
            org_id: 'org-1',
            vehicle_id: 'veh-1',
            trip_id: null,
            recorded_at: '2026-10-27 10:00:01.000',
            value_float: 1500,
            unit: 'rpm',
            quality: 'normalized',
          },
        ],
      };
    });
    const res = await svc.getTripRpmHfPoints({
      orgId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tripStart: new Date('2026-10-27T10:00:00.000Z'),
      tripEnd: new Date('2026-10-27T11:00:00.000Z'),
    });
    expect(res.status).toBe('TENANT_SCOPE_VIOLATION');
    expect(res.points).toHaveLength(0);
  });

  it('null value_float increments invalidValueCount and is not coerced to 0', async () => {
    const svc = makeService(async (query) => {
      if (query.includes('count()')) {
        return { json: async () => [{ cnt: 2 }] };
      }
      return {
        json: async () => [
          {
            org_id: 'org-1',
            vehicle_id: 'veh-1',
            trip_id: 'trip-1',
            recorded_at: '2026-10-27 10:00:01.000',
            value_float: null,
            unit: 'rpm',
            quality: 'normalized',
          },
          {
            org_id: 'org-1',
            vehicle_id: 'veh-1',
            trip_id: 'trip-1',
            recorded_at: '2026-10-27 10:00:02.000',
            value_float: 0,
            unit: 'rpm',
            quality: 'normalized',
          },
        ],
      };
    });
    const res = await svc.getTripRpmHfPoints({
      orgId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tripStart: new Date('2026-10-27T10:00:00.000Z'),
      tripEnd: new Date('2026-10-27T11:00:00.000Z'),
    });
    expect(res.invalidValueCount).toBe(1);
    expect(res.returnedCount).toBe(1);
    expect(res.points[0]!.valueRpm).toBe(0);
    expect(res.completenessStatus).toBe('COMPLETE');
  });

  it('marks incomplete when count exceeds page limit', async () => {
    const svc = makeService(async (query) => {
      if (query.includes('count()')) {
        return { json: async () => [{ cnt: HF_TRIP_RPM_DEFAULT_READ_LIMIT + 500 }] };
      }
      return {
        json: async () =>
          Array.from({ length: HF_TRIP_RPM_DEFAULT_READ_LIMIT }, (_, i) => ({
            org_id: 'org-1',
            vehicle_id: 'veh-1',
            trip_id: 'trip-1',
            recorded_at: `2026-10-27 10:00:${String(i % 60).padStart(2, '0')}.000`,
            value_float: 1200 + i,
            unit: 'rpm',
            quality: 'normalized',
          })),
      };
    });
    const res = await svc.getTripRpmHfPoints({
      orgId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tripStart: new Date('2026-10-27T10:00:00.000Z'),
      tripEnd: new Date('2026-10-27T12:00:00.000Z'),
    });
    expect(res.completenessStatus).toBe('INCOMPLETE_MORE_POINTS_AVAILABLE');
    expect(res.totalMatchingCount).toBe(HF_TRIP_RPM_DEFAULT_READ_LIMIT + 500);
    expect(res.returnedCount).toBe(HF_TRIP_RPM_DEFAULT_READ_LIMIT);
    expect(res.rawRowsReturned).toBe(HF_TRIP_RPM_DEFAULT_READ_LIMIT);
  });

  it('invalid rows on full page do not cause false INCOMPLETE', async () => {
    const svc = makeService(async (query) => {
      if (query.includes('count()')) {
        return { json: async () => [{ cnt: 3 }] };
      }
      return {
        json: async () => [
          {
            org_id: 'org-1',
            vehicle_id: 'veh-1',
            trip_id: 'trip-1',
            recorded_at: '2026-10-27 10:00:01.000',
            value_float: null,
            unit: 'rpm',
            quality: 'normalized',
          },
          {
            org_id: 'org-1',
            vehicle_id: 'veh-1',
            trip_id: 'trip-1',
            recorded_at: '2026-10-27 10:00:02.000',
            value_float: null,
            unit: 'rpm',
            quality: 'normalized',
          },
          {
            org_id: 'org-1',
            vehicle_id: 'veh-1',
            trip_id: 'trip-1',
            recorded_at: '2026-10-27 10:00:03.000',
            value_float: 900,
            unit: 'rpm',
            quality: 'normalized',
          },
        ],
      };
    });
    const res = await svc.getTripRpmHfPoints({
      orgId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tripStart: new Date('2026-10-27T10:00:00.000Z'),
      tripEnd: new Date('2026-10-27T11:00:00.000Z'),
    });
    expect(res.completenessStatus).toBe('COMPLETE');
    expect(res.rawRowsReturned).toBe(3);
    expect(res.returnedCount).toBe(1);
    expect(res.invalidValueCount).toBe(2);
  });
});
