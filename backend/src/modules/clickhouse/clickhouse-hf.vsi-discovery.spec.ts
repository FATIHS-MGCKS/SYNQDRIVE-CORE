import type { ClickHouseService } from './clickhouse.service';
import { ClickHouseHfService } from './clickhouse-hf.service';

describe('ClickHouseHfService.getVsiDiscoveryTripHfSignalAggregates', () => {
  function makeService(queryImpl: (query: string) => Promise<{ json: () => Promise<unknown[]> }>) {
    const ch = {
      isAvailable: true,
      getClient: () => ({
        query: jest.fn(async ({ query }: { query: string }) => queryImpl(query)),
      }),
    } as unknown as ClickHouseService;
    return new ClickHouseHfService(ch);
  }

  it('scopes SQL to org_id and vehicle_id', async () => {
    const captured: string[] = [];
    const svc = makeService(async (query) => {
      captured.push(query);
      return { json: async () => [] };
    });
    await svc.getVsiDiscoveryTripHfSignalAggregates({
      orgId: 'org-a',
      vehicleId: 'veh-b',
      tripId: 'trip-c',
      tripStart: new Date('2026-10-27T10:00:00.000Z'),
      tripEnd: new Date('2026-10-27T11:00:00.000Z'),
    });
    expect(captured.some((q) => q.includes('org_id'))).toBe(true);
    expect(captured.some((q) => q.includes('vehicle_id'))).toBe(true);
    expect(captured.some((q) => q.includes('trip_id'))).toBe(true);
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
  });
});
