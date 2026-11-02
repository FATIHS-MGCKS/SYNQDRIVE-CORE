import {
  VSI_DISCOVERY_CH_HISTORY_DAYS,
  VSI_DISCOVERY_CH_MAX_POINTS_PER_SIGNAL,
  assertClickHouseDiscoverySqlContainsTenantPredicates,
  linkAttributionAllowsPositiveHistoricalClaim,
  validateClickHouseDiscoveryQueryScope,
} from './vsi-clickhouse-discovery-safety.contract';

describe('vsi-clickhouse-discovery-safety.contract', () => {
  const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
  const VEH = 'c10351f8-b6a2-4258-947f-631aeaa6d359';

  it('requires org_id and vehicle_id in discovery SQL', () => {
    expect(() =>
      assertClickHouseDiscoverySqlContainsTenantPredicates(
        'SELECT count() FROM telemetry_hf_points WHERE vehicle_id = {vehicleId:String}',
      ),
    ).toThrow(/org_id/);
    expect(() =>
      assertClickHouseDiscoverySqlContainsTenantPredicates(
        'SELECT count() FROM telemetry_hf_points WHERE org_id = {orgId:String} AND vehicle_id = {vehicleId:String}',
      ),
    ).not.toThrow();
  });

  it('bounds time window and limit', () => {
    const start = new Date('2026-11-01T00:00:00.000Z');
    const end = new Date('2026-11-02T00:00:00.000Z');
    expect(
      validateClickHouseDiscoveryQueryScope({
        organizationId: ORG,
        vehicleId: VEH,
        windowStart: start,
        windowEnd: end,
        limit: 100,
      }).ok,
    ).toBe(true);

    const tooLongStart = new Date('2026-01-01T00:00:00.000Z');
    const fail = validateClickHouseDiscoveryQueryScope({
      organizationId: ORG,
      vehicleId: VEH,
      windowStart: tooLongStart,
      windowEnd: end,
      limit: 100,
    });
    expect(fail.ok).toBe(false);
    if (!fail.ok) {
      expect(fail.reason).toMatch(/window/);
    }

    expect(
      validateClickHouseDiscoveryQueryScope({
        organizationId: '',
        vehicleId: VEH,
        windowStart: start,
        windowEnd: end,
        limit: 100,
      }).ok,
    ).toBe(false);

    expect(
      validateClickHouseDiscoveryQueryScope({
        organizationId: ORG,
        vehicleId: VEH,
        windowStart: start,
        windowEnd: end,
        limit: VSI_DISCOVERY_CH_MAX_POINTS_PER_SIGNAL + 1,
      }).ok,
    ).toBe(false);
  });

  it('blocks positive historical claims when link attribution is ambiguous', () => {
    expect(
      linkAttributionAllowsPositiveHistoricalClaim({
        linkActive: true,
        linkIntervalStartMs: 0,
        linkIntervalEndMs: null,
        tripStartMs: 1000,
        tripEndMs: 2000,
        attributionLimitations: ['LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK'],
      }),
    ).toBe(false);
    expect(
      linkAttributionAllowsPositiveHistoricalClaim({
        linkActive: true,
        linkIntervalStartMs: 500,
        linkIntervalEndMs: null,
        tripStartMs: 1000,
        tripEndMs: 2000,
        attributionLimitations: [],
      }),
    ).toBe(true);
  });
});
