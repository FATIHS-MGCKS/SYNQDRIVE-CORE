import type { ClickHouseService } from './clickhouse.service';
import { ClickHouseHfService } from './clickhouse-hf.service';
import { VSI_DISCOVERY_CH_MAX_EXECUTION_TIME_SEC } from '../vehicle-intelligence/vehicle-signal-intelligence/vsi-clickhouse-discovery-safety.contract';

describe('ClickHouseHfService.getVsiDiscoveryTripHfSignalAggregates', () => {
  function makeService(
    queryImpl: (query: string, params?: Record<string, unknown>) => Promise<{
      json: () => Promise<unknown[]>;
    }>,
    available = true,
  ) {
    const ch = {
      isAvailable: available,
      getClient: () => ({
        query: jest.fn(async (opts: { query: string; query_params?: Record<string, unknown> }) =>
          queryImpl(opts.query, opts.query_params),
        ),
      }),
    } as unknown as ClickHouseService;
    return new ClickHouseHfService(ch);
  }

  it('scopes SQL to org_id, vehicle_id, and trip_id with parameterized values', async () => {
    const captured: { query: string; params?: Record<string, unknown> }[] = [];
    const svc = makeService(async (query, params) => {
      captured.push({ query, params });
      return { json: async () => [] };
    });
    await svc.getVsiDiscoveryTripHfSignalAggregates({
      orgId: 'org-a',
      vehicleId: 'veh-b',
      tripId: 'trip-c',
      tripStart: new Date('2026-10-27T10:00:00.000Z'),
      tripEnd: new Date('2026-10-27T11:00:00.000Z'),
    });
    expect(captured[0].query.toLowerCase()).toContain('org_id');
    expect(captured[0].query.toLowerCase()).toContain('vehicle_id');
    expect(captured[0].query.toLowerCase()).toContain('trip_id');
    expect(captured[0].params?.orgId).toBe('org-a');
    expect(captured[0].params?.vehicleId).toBe('veh-b');
    expect(captured[0].params?.tripId).toBe('trip-c');
  });

  it('returns UNAVAILABLE when ClickHouse client is not available', async () => {
    const svc = makeService(async () => ({ json: async () => [] }), false);
    const res = await svc.getVsiDiscoveryTripHfSignalAggregates({
      orgId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tripStart: new Date('2026-10-27T10:00:00.000Z'),
      tripEnd: new Date('2026-10-27T11:00:00.000Z'),
    });
    expect(res.status).toBe('UNAVAILABLE');
    expect(res.signals).toHaveLength(0);
  });

  it('returns TENANT_SCOPE_VIOLATION on token mismatch when required', async () => {
    const svc = makeService(async () => ({
      json: async () => [
        {
          signal_name: 'speed',
          point_count: 3,
          first_seen_at: '2026-10-27 10:00:01.000',
          last_seen_at: '2026-10-27 10:00:02.000',
          sample_token_id: 99,
        },
      ],
    }));
    const res = await svc.getVsiDiscoveryTripHfSignalAggregates({
      orgId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tripStart: new Date('2026-10-27T10:00:00.000Z'),
      tripEnd: new Date('2026-10-27T11:00:00.000Z'),
      expectedTokenId: 42,
      requireTokenMatch: true,
    });
    expect(res.status).toBe('TENANT_SCOPE_VIOLATION');
    expect(res.signals).toHaveLength(0);
  });

  it('does not require token match when requireTokenMatch is false', async () => {
    const svc = makeService(async () => ({
      json: async () => [
        {
          signal_name: 'speed',
          point_count: 3,
          first_seen_at: '2026-10-27 10:00:01.000',
          last_seen_at: '2026-10-27 10:00:02.000',
          sample_token_id: 99,
        },
      ],
    }));
    const res = await svc.getVsiDiscoveryTripHfSignalAggregates({
      orgId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tripStart: new Date('2026-10-27T10:00:00.000Z'),
      tripEnd: new Date('2026-10-27T11:00:00.000Z'),
      expectedTokenId: 42,
      requireTokenMatch: false,
    });
    expect(res.status).toBe('SUCCESS');
    expect(res.signals[0]?.pointCount).toBe(3);
  });

  it('returns QUERY_FAILED without positive evidence on query error', async () => {
    const svc = makeService(async () => {
      throw new Error('timeout');
    });
    const res = await svc.getVsiDiscoveryTripHfSignalAggregates({
      orgId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tripStart: new Date('2026-10-27T10:00:00.000Z'),
      tripEnd: new Date('2026-10-27T11:00:00.000Z'),
    });
    expect(res.status).toBe('QUERY_FAILED');
    expect(res.signals).toHaveLength(0);
  });

  it('applies max_execution_time bound', async () => {
    const queryMock = jest.fn(async () => ({ json: async () => [] }));
    const ch = {
      isAvailable: true,
      getClient: () => ({ query: queryMock }),
    } as unknown as ClickHouseService;
    const svc = new ClickHouseHfService(ch);
    await svc.getVsiDiscoveryTripHfSignalAggregates({
      orgId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tripStart: new Date('2026-10-27T10:00:00.000Z'),
      tripEnd: new Date('2026-10-27T11:00:00.000Z'),
    });
    expect(queryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clickhouse_settings: {
          max_execution_time: VSI_DISCOVERY_CH_MAX_EXECUTION_TIME_SEC,
        },
      }),
    );
  });

  it('respects maxSignals LIMIT in SQL params', async () => {
    const queryMock = jest.fn(async () => ({ json: async () => [] }));
    const ch = {
      isAvailable: true,
      getClient: () => ({ query: queryMock }),
    } as unknown as ClickHouseService;
    const svc = new ClickHouseHfService(ch);
    await svc.getVsiDiscoveryTripHfSignalAggregates({
      orgId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tripStart: new Date('2026-10-27T10:00:00.000Z'),
      tripEnd: new Date('2026-10-27T11:00:00.000Z'),
      maxSignals: 32,
    });
    expect(queryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query_params: expect.objectContaining({ maxSignals: 32 }),
      }),
    );
  });
});
