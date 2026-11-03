import type { ClickHouseHfService } from '@modules/clickhouse/clickhouse-hf.service';
import {
  VsiEvidenceAxisEvaluationState,
  VsiEvidenceAxisNotEvaluatedReason,
} from './vsi-native-signal-discovery-evaluation-state';
import { buildHfNativeDiscoveryInventoryUpdate } from './vsi-hf-native-discovery.loader';
import {
  VSI_DISCOVERY_CH_MAX_FINALIZED_TRIPS,
  VSI_DISCOVERY_CH_MAX_INVENTORY_SIGNALS,
  VSI_DISCOVERY_CH_MAX_POINTS_PER_SIGNAL,
} from './vsi-clickhouse-discovery-safety.contract';
import {
  emptyNativeSignalDiscoveryInventory,
  VsiNativeDiscoveryIngestionLimitation,
} from './vsi-native-signal-discovery-inventory.contract';
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

  it('evaluated window with no qualifying points and persisted keys → EVALUATED_NOT_OBSERVED', async () => {
    const clickHouseHf = {
      getVsiDiscoveryTripHfSignalAggregates: jest.fn().mockResolvedValue({
        status: 'EMPTY',
        signals: [],
        tenantScopeViolation: false,
      }),
    } as unknown as ClickHouseHfService;

    const persistedInventory = emptyNativeSignalDiscoveryInventory(
      {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        providerSourceLinkId: 'link-a',
        providerIdentity: 'DIMO',
      },
      new Date('2026-10-28T00:00:00.000Z'),
    );
    persistedInventory.entries = [
      {
        providerNativeSignalName: 'speed',
        aliasVerdict: 'UNKNOWN_SIGNAL',
        canonicalSignalKey: null,
        snapshot: {
          evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED },
          lastObservedAt: '2026-10-27T12:00:00.000Z',
          lastSourceTimestamp: '2026-10-27T12:00:00.000Z',
        },
        historical: {
          evaluation: {
            state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
            notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.SNAPSHOT_EXTRACTOR_NOT_RUN,
          },
          firstSeenAt: null,
          lastSeenAt: null,
          sampleMetadata: {
            windowStartAt: null,
            windowEndAt: null,
            pointCount: null,
            tripCountWithPoints: null,
            readCapApplied: null,
          },
        },
        ingestionLimitations: [],
      },
    ];

    const inv = await buildHfNativeDiscoveryInventoryUpdate(prisma as never, {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-a',
      providerIdentity: 'DIMO',
      projectionAsOf: new Date('2026-10-28T00:00:00.000Z'),
      linkActivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      linkDeactivatedAt: null,
      clickHouseHf,
      persistedInventory,
    });
    expect(inv.entries).toHaveLength(1);
    expect(inv.entries[0].historical.evaluation.state).toBe(
      VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED,
    );
    expect(inv.entries[0].historical.evaluation.notEvaluatedReason).toBeUndefined();
  });

  it('evaluated window with no qualifying points → empty entries without persisted union', async () => {
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

  it('legacy historical SNAPSHOT placeholder migrates via union evaluation', async () => {
    const clickHouseHf = {
      getVsiDiscoveryTripHfSignalAggregates: jest.fn().mockResolvedValue({
        status: 'EMPTY',
        signals: [],
        tenantScopeViolation: false,
      }),
    } as unknown as ClickHouseHfService;
    const persistedInventory = emptyNativeSignalDiscoveryInventory(
      {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        providerSourceLinkId: 'link-a',
        providerIdentity: 'DIMO',
      },
      new Date('2026-10-28T00:00:00.000Z'),
    );
    persistedInventory.entries = Array.from({ length: 3 }, (_, i) => ({
      providerNativeSignalName: `signal_${i}`,
      aliasVerdict: 'UNKNOWN_SIGNAL' as const,
      canonicalSignalKey: null,
      snapshot: {
        evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED },
        lastObservedAt: '2026-10-27T12:00:00.000Z',
        lastSourceTimestamp: '2026-10-27T12:00:00.000Z',
      },
      historical: {
        evaluation: {
          state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
          notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.SNAPSHOT_EXTRACTOR_NOT_RUN,
        },
        firstSeenAt: null,
        lastSeenAt: null,
        sampleMetadata: {
          windowStartAt: null,
          windowEndAt: null,
          pointCount: null,
          tripCountWithPoints: null,
          readCapApplied: null,
        },
      },
      ingestionLimitations: [],
    }));

    const inv = await buildHfNativeDiscoveryInventoryUpdate(prisma as never, {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-a',
      providerIdentity: 'DIMO',
      projectionAsOf: new Date('2026-10-28T00:00:00.000Z'),
      linkActivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      linkDeactivatedAt: null,
      clickHouseHf,
      persistedInventory,
    });
    expect(inv.entries).toHaveLength(3);
    for (const entry of inv.entries) {
      expect(entry.historical.evaluation.notEvaluatedReason).not.toBe(
        VsiEvidenceAxisNotEvaluatedReason.SNAPSHOT_EXTRACTOR_NOT_RUN,
      );
    }
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
    expect(inv.entries[0].historical.evaluation.notEvaluatedReason).toBe(
      VsiEvidenceAxisNotEvaluatedReason.HF_READ_FAILED,
    );
  });

  it('mixed SUCCESS + EMPTY + QUERY_FAILED — no false EVALUATED_NOT_OBSERVED on union keys', async () => {
    const prismaThreeTrips = {
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
          {
            id: 'trip-3',
            startTime: new Date('2026-10-25T10:00:00.000Z'),
            endTime: new Date('2026-10-25T11:00:00.000Z'),
          },
        ]),
      },
    };
    let tripCall = 0;
    const getAggregates = jest.fn().mockImplementation(async () => {
        tripCall += 1;
        if (tripCall === 1) {
          return {
            status: 'SUCCESS',
            signals: [
              {
                signalName: 'speed',
                pointCount: 12,
                firstSeenAtIso: '2026-10-27T10:00:01.000Z',
                lastSeenAtIso: '2026-10-27T10:59:00.000Z',
              },
            ],
            tenantScopeViolation: false,
          };
        }
        if (tripCall === 2) {
          return { status: 'EMPTY', signals: [], tenantScopeViolation: false };
        }
        return {
          status: 'QUERY_FAILED',
          signals: [{ signalName: 'speed', pointCount: 0 }],
          tenantScopeViolation: false,
        };
      });
    const clickHouseHf = {
      getVsiDiscoveryTripHfSignalAggregates: getAggregates,
    } as unknown as ClickHouseHfService;

    const persistedInventory = emptyNativeSignalDiscoveryInventory(
      {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        providerSourceLinkId: 'link-a',
        providerIdentity: 'DIMO',
      },
      new Date('2026-10-28T00:00:00.000Z'),
    );
    persistedInventory.entries = [
      {
        providerNativeSignalName: 'speed',
        aliasVerdict: 'UNKNOWN_SIGNAL',
        canonicalSignalKey: null,
        snapshot: {
          evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED },
          lastObservedAt: '2026-10-27T12:00:00.000Z',
          lastSourceTimestamp: '2026-10-27T12:00:00.000Z',
        },
        historical: {
          evaluation: {
            state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
            notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.HF_HISTORICAL_NOT_ATTEMPTED,
          },
          firstSeenAt: null,
          lastSeenAt: null,
          sampleMetadata: {
            windowStartAt: null,
            windowEndAt: null,
            pointCount: null,
            tripCountWithPoints: null,
            readCapApplied: null,
          },
        },
        ingestionLimitations: [],
      },
      {
        providerNativeSignalName: 'only_in_snapshot',
        aliasVerdict: 'UNKNOWN_SIGNAL',
        canonicalSignalKey: null,
        snapshot: {
          evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED },
          lastObservedAt: '2026-10-27T12:00:00.000Z',
          lastSourceTimestamp: '2026-10-27T12:00:00.000Z',
        },
        historical: {
          evaluation: {
            state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
            notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.SNAPSHOT_EXTRACTOR_NOT_RUN,
          },
          firstSeenAt: null,
          lastSeenAt: null,
          sampleMetadata: {
            windowStartAt: null,
            windowEndAt: null,
            pointCount: null,
            tripCountWithPoints: null,
            readCapApplied: null,
          },
        },
        ingestionLimitations: [],
      },
    ];

    const inv = await buildHfNativeDiscoveryInventoryUpdate(prismaThreeTrips as never, {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-a',
      providerIdentity: 'DIMO',
      projectionAsOf: new Date('2026-10-28T00:00:00.000Z'),
      linkActivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      linkDeactivatedAt: null,
      clickHouseHf,
      persistedInventory,
    });

    expect(getAggregates).toHaveBeenCalledTimes(3);
    expect(
      getAggregates.mock.calls.every(
        (call: [{ orgId: string; vehicleId: string }]) =>
          call[0].orgId === 'org-1' && call[0].vehicleId === 'veh-1',
      ),
    ).toBe(true);

    const speed = inv.entries.find((e) => e.providerNativeSignalName === 'speed');
    expect(speed?.historical.evaluation.state).toBe(VsiEvidenceAxisEvaluationState.NOT_EVALUATED);
    expect(speed?.historical.evaluation.notEvaluatedReason).toBe(
      VsiEvidenceAxisNotEvaluatedReason.HF_READ_FAILED,
    );

    const snapshotOnly = inv.entries.find((e) => e.providerNativeSignalName === 'only_in_snapshot');
    expect(snapshotOnly?.historical.evaluation.state).toBe(
      VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
    );
    expect(snapshotOnly?.historical.evaluation.notEvaluatedReason).toBe(
      VsiEvidenceAxisNotEvaluatedReason.HF_MIRROR_INCOMPLETE,
    );
    expect(snapshotOnly?.historical.evaluation.state).not.toBe(
      VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED,
    );
  });

  it('scopes trip lookup to organization and skips CH when link not attributable', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'trip-1',
        startTime: new Date('2026-10-27T10:00:00.000Z'),
        endTime: new Date('2026-10-27T11:00:00.000Z'),
      },
    ]);
    const prismaScoped = {
      vehicleTrip: { findMany },
      vehicleDataSourceLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'link-other',
            activatedAt: new Date('2026-01-01T00:00:00.000Z'),
            deactivatedAt: null,
            provider: 'DIMO',
          },
        ]),
        findFirst: jest.fn(),
      },
    };
    const clickHouseHf = {
      getVsiDiscoveryTripHfSignalAggregates: jest.fn(),
    } as unknown as ClickHouseHfService;

    await buildHfNativeDiscoveryInventoryUpdate(prismaScoped as never, {
      organizationId: 'org-tenant-a',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-a',
      providerIdentity: 'DIMO',
      projectionAsOf: new Date('2026-10-28T00:00:00.000Z'),
      linkActivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      linkDeactivatedAt: null,
      clickHouseHf,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          vehicleId: 'veh-1',
          vehicle: { organizationId: 'org-tenant-a' },
        }),
      }),
    );
    expect(clickHouseHf.getVsiDiscoveryTripHfSignalAggregates).not.toHaveBeenCalled();
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
