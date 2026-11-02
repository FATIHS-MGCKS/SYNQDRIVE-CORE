import type { ClickHouseHfService } from '@modules/clickhouse/clickhouse-hf.service';
import { VsiEvidenceAxisEvaluationState } from './vsi-native-signal-discovery-evaluation-state';
import { buildHfNativeDiscoveryInventoryUpdate } from './vsi-hf-native-discovery.loader';
import {
  VSI_DISCOVERY_CH_MAX_FINALIZED_TRIPS,
  VSI_DISCOVERY_CH_MAX_INVENTORY_SIGNALS,
  VSI_DISCOVERY_CH_MAX_POINTS_PER_SIGNAL,
} from './vsi-clickhouse-discovery-safety.contract';
import { VsiNativeDiscoveryIngestionLimitation } from './vsi-native-signal-discovery-inventory.contract';
import {
  VSI_VERIFIED_PRODUCTION_ICE_CH_NATIVE_SIGNAL_NAMES,
  VSI_VERIFIED_PRODUCTION_TESLA_CH_NATIVE_SIGNAL_NAMES,
} from './vsi-verified-production-ch-signals.fixture';

describe('buildHfNativeDiscoveryInventoryUpdate', () => {
  const prisma = {
    vehicleTrip: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'trip-1',
          startTime: new Date('2026-10-27T10:00:00.000Z'),
          endTime: new Date('2026-10-27T11:00:00.000Z'),
        },
      ]),
    },
    vehicleDataSourceLink: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'link-a',
          activatedAt: new Date('2026-01-01T00:00:00.000Z'),
          deactivatedAt: null,
          provider: 'DIMO',
        },
      ]),
      findFirst: jest.fn().mockResolvedValue({
        dimoVehicle: { tokenId: 42 },
      }),
    },
  };

  it('ICE — verified production six-name subset with EVALUATED_OBSERVED where points exist', async () => {
    const clickHouseHf = {
      getVsiDiscoveryTripHfSignalAggregates: jest.fn().mockResolvedValue({
        status: 'SUCCESS',
        signals: VSI_VERIFIED_PRODUCTION_ICE_CH_NATIVE_SIGNAL_NAMES.map((name, i) => ({
          signalName: name,
          pointCount: 10 + i,
          firstSeenAtIso: '2026-10-27T10:00:01.000Z',
          lastSeenAtIso: '2026-10-27T10:59:00.000Z',
        })),
        tenantScopeViolation: false,
      }),
    } as unknown as ClickHouseHfService;

    const inv = await buildHfNativeDiscoveryInventoryUpdate(prisma as never, {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-a',
      providerIdentity: 'DIMO',
      projectionAsOf: new Date('2026-10-28T00:00:00.000Z'),
      linkActivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      linkDeactivatedAt: null,
      clickHouseHf,
    });
    expect(inv.entries).toHaveLength(VSI_VERIFIED_PRODUCTION_ICE_CH_NATIVE_SIGNAL_NAMES.length);
    for (const entry of inv.entries) {
      expect(entry.historical.evaluation.state).toBe(
        VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED,
      );
    }
  });

  it('Tesla — verified production speed + traction current power names', async () => {
    const clickHouseHf = {
      getVsiDiscoveryTripHfSignalAggregates: jest.fn().mockResolvedValue({
        status: 'SUCCESS',
        signals: VSI_VERIFIED_PRODUCTION_TESLA_CH_NATIVE_SIGNAL_NAMES.map((name) => ({
          signalName: name,
          pointCount: 500,
          firstSeenAtIso: '2026-10-27T10:00:01.000Z',
          lastSeenAtIso: '2026-10-27T10:59:00.000Z',
        })),
        tenantScopeViolation: false,
      }),
    } as unknown as ClickHouseHfService;

    const inv = await buildHfNativeDiscoveryInventoryUpdate(prisma as never, {
      organizationId: 'org-1',
      vehicleId: 'veh-tesla',
      providerSourceLinkId: 'link-a',
      providerIdentity: 'DIMO',
      projectionAsOf: new Date('2026-10-28T00:00:00.000Z'),
      linkActivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      linkDeactivatedAt: null,
      clickHouseHf,
    });
    expect(inv.entries.map((e) => e.providerNativeSignalName).sort()).toEqual(
      [...VSI_VERIFIED_PRODUCTION_TESLA_CH_NATIVE_SIGNAL_NAMES].sort(),
    );
  });

  it('ambiguous multi-link trip window fail-closes historical axis', async () => {
    const prismaMulti = {
      ...prisma,
      vehicleDataSourceLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'link-a',
            activatedAt: new Date('2026-01-01T00:00:00.000Z'),
            deactivatedAt: null,
            provider: 'DIMO',
          },
          {
            id: 'link-b',
            activatedAt: new Date('2026-01-01T00:00:00.000Z'),
            deactivatedAt: null,
            provider: 'DIMO',
          },
        ]),
        findFirst: prisma.vehicleDataSourceLink.findFirst,
      },
    };
    const clickHouseHf = {
      getVsiDiscoveryTripHfSignalAggregates: jest.fn(),
    } as unknown as ClickHouseHfService;

    const inv = await buildHfNativeDiscoveryInventoryUpdate(prismaMulti as never, {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-a',
      providerIdentity: 'DIMO',
      projectionAsOf: new Date('2026-10-28T00:00:00.000Z'),
      linkActivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      linkDeactivatedAt: null,
      clickHouseHf,
    });
    expect(clickHouseHf.getVsiDiscoveryTripHfSignalAggregates).not.toHaveBeenCalled();
    expect(inv.entries).toHaveLength(0);
  });

  it('evaluated window with no qualifying points → empty entries (no exhaustive absence)', async () => {
    const clickHouseHf = {
      getVsiDiscoveryTripHfSignalAggregates: jest.fn().mockResolvedValue({
        status: 'EMPTY',
        signals: [],
        tenantScopeViolation: false,
      }),
    } as unknown as ClickHouseHfService;

    const inv = await buildHfNativeDiscoveryInventoryUpdate(prisma as never, {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-a',
      providerIdentity: 'DIMO',
      projectionAsOf: new Date('2026-10-28T00:00:00.000Z'),
      linkActivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      linkDeactivatedAt: null,
      clickHouseHf,
    });
    expect(inv.entries).toHaveLength(0);
  });

  it('query failure without rows records limitation and does not invent entries', async () => {
    const clickHouseHf = {
      getVsiDiscoveryTripHfSignalAggregates: jest.fn().mockResolvedValue({
        status: 'QUERY_FAILED',
        signals: [],
        tenantScopeViolation: false,
      }),
    } as unknown as ClickHouseHfService;

    const inv = await buildHfNativeDiscoveryInventoryUpdate(prisma as never, {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-a',
      providerIdentity: 'DIMO',
      projectionAsOf: new Date('2026-10-28T00:00:00.000Z'),
      linkActivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      linkDeactivatedAt: null,
      clickHouseHf,
    });
    expect(inv.entries).toHaveLength(0);
    expect(inv.profileLimitations).toContain('HF_DISCOVERY_TRIP_QUERY_FAILED');
  });

  it('query failure on a known signal marks HF_READ_FAILED on that entry', async () => {
    const clickHouseHf = {
      getVsiDiscoveryTripHfSignalAggregates: jest.fn().mockResolvedValue({
        status: 'QUERY_FAILED',
        signals: [{ signalName: 'speed', pointCount: 0 }],
        tenantScopeViolation: false,
      }),
    } as unknown as ClickHouseHfService;

    const inv = await buildHfNativeDiscoveryInventoryUpdate(prisma as never, {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-a',
      providerIdentity: 'DIMO',
      projectionAsOf: new Date('2026-10-28T00:00:00.000Z'),
      linkActivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      linkDeactivatedAt: null,
      clickHouseHf,
    });
    expect(inv.entries).toHaveLength(1);
    expect(inv.entries[0].historical.evaluation.state).toBe(
      VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
    );
  });

  it('no finalized trips in window → empty inventory', async () => {
    const prismaEmpty = {
      ...prisma,
      vehicleTrip: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const clickHouseHf = {
      getVsiDiscoveryTripHfSignalAggregates: jest.fn(),
    } as unknown as ClickHouseHfService;
    const inv = await buildHfNativeDiscoveryInventoryUpdate(prismaEmpty as never, {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-a',
      providerIdentity: 'DIMO',
      projectionAsOf: new Date('2026-10-28T00:00:00.000Z'),
      linkActivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      linkDeactivatedAt: null,
      clickHouseHf,
    });
    expect(inv.entries).toHaveLength(0);
    expect(clickHouseHf.getVsiDiscoveryTripHfSignalAggregates).not.toHaveBeenCalled();
  });

  it('ClickHouse unavailable → HF_MIRROR_DISABLED_OR_EMPTY limitation', async () => {
    const inv = await buildHfNativeDiscoveryInventoryUpdate(prisma as never, {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-a',
      providerIdentity: 'DIMO',
      projectionAsOf: new Date('2026-10-28T00:00:00.000Z'),
      linkActivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      linkDeactivatedAt: null,
      clickHouseHf: undefined,
    });
    expect(inv.entries).toHaveLength(0);
    expect(inv.profileLimitations).toContain(
      VsiNativeDiscoveryIngestionLimitation.HF_MIRROR_DISABLED_OR_EMPTY,
    );
  });

  it('caps distinct native signals at 32 per bounded scan', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      signalName: `mock_signal_${i}`,
      pointCount: 1,
      firstSeenAtIso: '2026-10-27T10:00:01.000Z',
      lastSeenAtIso: '2026-10-27T10:02:00.000Z',
    }));
    const clickHouseHf = {
      getVsiDiscoveryTripHfSignalAggregates: jest.fn().mockResolvedValue({
        status: 'SUCCESS',
        signals: many,
        tenantScopeViolation: false,
      }),
    } as unknown as ClickHouseHfService;

    const inv = await buildHfNativeDiscoveryInventoryUpdate(prisma as never, {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-a',
      providerIdentity: 'DIMO',
      projectionAsOf: new Date('2026-10-28T00:00:00.000Z'),
      linkActivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      linkDeactivatedAt: null,
      clickHouseHf,
    });
    expect(inv.entries.length).toBeLessThanOrEqual(VSI_DISCOVERY_CH_MAX_INVENTORY_SIGNALS);
    expect(inv.profileLimitations).toContain(
      VsiNativeDiscoveryIngestionLimitation.HF_MIRROR_SIGNAL_SET_BOUNDED,
    );
  });

  it('applies 12k point cap per signal across trips', async () => {
    const clickHouseHf = {
      getVsiDiscoveryTripHfSignalAggregates: jest
        .fn()
        .mockResolvedValueOnce({
          status: 'SUCCESS',
          signals: [
            {
              signalName: 'speed',
              pointCount: VSI_DISCOVERY_CH_MAX_POINTS_PER_SIGNAL,
              firstSeenAtIso: '2026-10-27T10:00:01.000Z',
              lastSeenAtIso: '2026-10-27T10:59:00.000Z',
            },
          ],
          tenantScopeViolation: false,
        })
        .mockResolvedValueOnce({
          status: 'SUCCESS',
          signals: [
            {
              signalName: 'speed',
              pointCount: 500,
              firstSeenAtIso: '2026-10-26T10:00:01.000Z',
              lastSeenAtIso: '2026-10-26T10:59:00.000Z',
            },
          ],
          tenantScopeViolation: false,
        }),
    } as unknown as ClickHouseHfService;

    const prismaTwoTrips = {
      ...prisma,
      vehicleTrip: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'trip-1',
            startTime: new Date('2026-10-27T10:00:00.000Z'),
            endTime: new Date('2026-10-27T11:00:00.000Z'),
          },
          {
            id: 'trip-2',
            startTime: new Date('2026-10-26T10:00:00.000Z'),
            endTime: new Date('2026-10-26T11:00:00.000Z'),
          },
        ]),
      },
    };

    const inv = await buildHfNativeDiscoveryInventoryUpdate(prismaTwoTrips as never, {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-a',
      providerIdentity: 'DIMO',
      projectionAsOf: new Date('2026-10-28T00:00:00.000Z'),
      linkActivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      linkDeactivatedAt: null,
      clickHouseHf,
    });
    const speed = inv.entries.find((e) => e.providerNativeSignalName === 'speed');
    expect(speed?.historical.sampleMetadata.pointCount).toBe(
      VSI_DISCOVERY_CH_MAX_POINTS_PER_SIGNAL,
    );
    expect(inv.profileLimitations).toContain(
      VsiNativeDiscoveryIngestionLimitation.HF_MIRROR_BOUNDED_WINDOW,
    );
  });

  it('requests at most 20 finalized trips from prisma', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prismaMany = {
      ...prisma,
      vehicleTrip: { findMany },
    };
    const clickHouseHf = {
      getVsiDiscoveryTripHfSignalAggregates: jest.fn(),
    } as unknown as ClickHouseHfService;
    await buildHfNativeDiscoveryInventoryUpdate(prismaMany as never, {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-a',
      providerIdentity: 'DIMO',
      projectionAsOf: new Date('2026-10-28T00:00:00.000Z'),
      linkActivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      linkDeactivatedAt: null,
      clickHouseHf,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: VSI_DISCOVERY_CH_MAX_FINALIZED_TRIPS }),
    );
  });
});
