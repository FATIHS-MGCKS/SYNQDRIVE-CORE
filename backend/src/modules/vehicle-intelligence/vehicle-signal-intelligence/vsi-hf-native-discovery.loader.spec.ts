import type { ClickHouseHfService } from '@modules/clickhouse/clickhouse-hf.service';
import { VsiEvidenceAxisEvaluationState } from './vsi-native-signal-discovery-evaluation-state';
import { buildHfNativeDiscoveryInventoryUpdate } from './vsi-hf-native-discovery.loader';

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

  it('ICE — discovers six mirrored native signal names with EVALUATED_OBSERVED', async () => {
    const signals = [
      'powertrainCombustionEngineSpeed',
      'powertrainCombustionEngineECT',
      'powertrainTransmissionCurrentGear',
      'chassisAxleRow1WheelLeftTirePressure',
      'chassisAxleRow1WheelRightTirePressure',
      'lowVoltageBatteryCurrentVoltage',
    ];
    const clickHouseHf = {
      getVsiDiscoveryTripHfSignalAggregates: jest.fn().mockResolvedValue({
        status: 'SUCCESS',
        signals: signals.map((name, i) => ({
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
    expect(inv.entries).toHaveLength(6);
    for (const entry of inv.entries) {
      expect(entry.historical.evaluation.state).toBe(
        VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED,
      );
    }
    const unknown = inv.entries.filter((e) => e.aliasVerdict === 'UNKNOWN_SIGNAL');
    expect(unknown.length).toBeGreaterThanOrEqual(1);
  });

  it('Tesla — speed and traction power only', async () => {
    const clickHouseHf = {
      getVsiDiscoveryTripHfSignalAggregates: jest.fn().mockResolvedValue({
        status: 'SUCCESS',
        signals: [
          {
            signalName: 'speed',
            pointCount: 500,
            firstSeenAtIso: '2026-10-27T10:00:01.000Z',
            lastSeenAtIso: '2026-10-27T10:59:00.000Z',
          },
          {
            signalName: 'powertrainTractionBatteryPower',
            pointCount: 500,
            firstSeenAtIso: '2026-10-27T10:00:01.000Z',
            lastSeenAtIso: '2026-10-27T10:59:00.000Z',
          },
        ],
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
    expect(inv.entries.map((e) => e.providerNativeSignalName).sort()).toEqual([
      'powertrainTractionBatteryPower',
      'speed',
    ]);
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

  it('evaluated window with no qualifying points → EVALUATED_NOT_OBSERVED', async () => {
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

  it('query failure marks HF_READ_FAILED when a signal aggregate fails', async () => {
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
    expect(inv.profileLimitations).toContain('HF_MIRROR_DISABLED_OR_EMPTY');
  });
});
