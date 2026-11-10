import { ApdShadowBaselinePollEvidenceService } from './apd-shadow-baseline-poll-evidence.service';

describe('ApdShadowBaselinePollEvidenceService idempotency', () => {
  const metrics = {
    recordSkippedInformative: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deferred reconcile updates only when newLvSourceObserved was false', async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const findMany = jest.fn().mockResolvedValue([
      {
        opportunityId: 'opp',
        policyVersion: 'P25_APD_B2_V1',
        decision: 'WOULD_SKIP',
        newLvSourceObserved: false,
        newTopLevelSourceObserved: false,
        additionalDiscoveryDelayMs: null,
        simulatedNextPollAt: null,
        simulatedDiscoveryAt: null,
        activationEpochId: 'epoch',
      },
    ]);
    const findFirst = jest.fn().mockResolvedValue({
      id: 'poll-1',
      startedAt: new Date('2026-10-25T10:29:02.655Z'),
      finishedAt: new Date('2026-10-25T10:29:05.000Z'),
    });
    const service = new ApdShadowBaselinePollEvidenceService(
      {
        dimoPollLog: { findFirst },
        apdShadowReconciliationDecision: { findMany, updateMany },
      } as never,
      metrics as never,
    );

    await service.reconcileDeferredLvAfterSnapshotPersistence({
      organizationId: 'org',
      vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
      providerTimestampMs: Date.parse('2026-10-25T10:28:56.000Z'),
      snapshotCorrelationId:
        'snapshot:19fedd4b-c4e8-4de8-a125-dab293326e7e:2026-10-25T10:29:02.655Z',
      previousLvProviderSourceMsBeforePersist: Date.parse('2026-10-25T10:28:51.000Z'),
    });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ newLvSourceObserved: false }),
      }),
    );
    expect(metrics.recordSkippedInformative).toHaveBeenCalledTimes(1);

    await service.reconcileDeferredLvAfterSnapshotPersistence({
      organizationId: 'org',
      vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
      providerTimestampMs: Date.parse('2026-10-25T10:28:56.000Z'),
      snapshotCorrelationId:
        'snapshot:19fedd4b-c4e8-4de8-a125-dab293326e7e:2026-10-25T10:29:02.655Z',
      previousLvProviderSourceMsBeforePersist: Date.parse('2026-10-25T10:28:51.000Z'),
    });
    expect(metrics.recordSkippedInformative).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0][0].data).toEqual({
      newLvSourceObserved: true,
      newLvSourceAt: expect.any(Date),
    });
    expect(updateMany.mock.calls[0][0].data.simulatedDiscoveryAt).toBeUndefined();
  });

  it('WOULD_SKIP deferred LV on same realPollId: informative loss, simulatedDiscoveryAt stays null', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findMany = jest.fn().mockResolvedValue([
      {
        opportunityId: 'opp',
        policyVersion: 'P25_APD_B2_V1',
        decision: 'WOULD_SKIP',
        newLvSourceObserved: false,
        newTopLevelSourceObserved: false,
        additionalDiscoveryDelayMs: null,
        simulatedNextPollAt: null,
        simulatedDiscoveryAt: null,
        activationEpochId: 'epoch',
      },
    ]);
    const findFirst = jest.fn().mockResolvedValue({
      id: 'poll-1',
      startedAt: new Date('2026-10-25T10:29:02.655Z'),
      finishedAt: new Date('2026-10-25T10:29:05.000Z'),
    });
    const service = new ApdShadowBaselinePollEvidenceService(
      {
        dimoPollLog: { findFirst },
        apdShadowReconciliationDecision: { findMany, updateMany },
      } as never,
      { recordSkippedInformative: jest.fn() } as never,
    );

    await service.reconcileDeferredLvAfterSnapshotPersistence({
      organizationId: 'org',
      vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
      providerTimestampMs: Date.parse('2026-10-25T10:28:56.000Z'),
      snapshotCorrelationId:
        'snapshot:19fedd4b-c4e8-4de8-a125-dab293326e7e:2026-10-25T10:29:02.655Z',
      previousLvProviderSourceMsBeforePersist: Date.parse('2026-10-25T10:28:51.000Z'),
    });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          newLvSourceObserved: true,
          newLvSourceAt: new Date('2026-10-25T10:28:56.000Z'),
        },
      }),
    );
  });

  it('discovery delay reconcile is idempotent on additionalDiscoveryDelayMs null guard', async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ opportunityId: 'opp-prior' }])
      .mockResolvedValueOnce([
        {
          opportunityId: 'opp-prior',
          policyVersion: 'P25_APD_B2_V1',
          realPollCompletedAt: new Date('2026-10-25T10:29:05.000Z'),
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ opportunityId: 'opp-prior' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const findFirst = jest.fn().mockResolvedValue({
      id: 'observing-poll-id',
      startedAt: new Date('2026-10-25T10:30:02.808Z'),
    });
    const count = jest.fn().mockResolvedValue(1);
    const service = new ApdShadowBaselinePollEvidenceService(
      {
        apdShadowReconciliationDecision: { findMany, updateMany, count },
        dimoPollLog: { findFirst },
      } as never,
    );

    const input = {
      organizationId: 'org',
      vehicleId: 'veh',
      activationEpochId: 'epoch',
      observingPollId: 'observing-poll-id',
      observingPollStartedAtMs: Date.parse('2026-10-25T10:30:02.808Z'),
      observingPollCompletedAtMs: Date.parse('2026-10-25T10:30:08.000Z'),
    };
    await service.reconcilePriorSkipDiscoveryDelayFromObservingPoll(input);
    await service.reconcilePriorSkipDiscoveryDelayFromObservingPoll(input);

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0][0].where.additionalDiscoveryDelayMs).toBeNull();
    expect(updateMany.mock.calls[0][0].where.discoveryDelayEvidenceVersion).toBeNull();
  });

  it('recordSkippedInformativeAfterDurableTransition only counts explicit transitions', () => {
    const service = new ApdShadowBaselinePollEvidenceService({} as never, metrics as never);
    service.recordSkippedInformativeAfterDurableTransition({
      policyVersion: 'P25_APD_B2_V1',
      prePollDecision: 'WOULD_SKIP',
      lvTransitioned: false,
      topLevelTransitioned: false,
    });
    expect(metrics.recordSkippedInformative).not.toHaveBeenCalled();

    service.recordSkippedInformativeAfterDurableTransition({
      policyVersion: 'P25_APD_B2_V1',
      prePollDecision: 'WOULD_SKIP',
      lvTransitioned: true,
      topLevelTransitioned: false,
    });
    expect(metrics.recordSkippedInformative).toHaveBeenCalledTimes(1);
  });
});
