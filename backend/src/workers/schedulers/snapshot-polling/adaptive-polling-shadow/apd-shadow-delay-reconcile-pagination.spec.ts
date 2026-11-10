import { DimoPollJobType, DimoPollStatus } from '@prisma/client';
import { ApdShadowBaselinePollEvidenceService } from './apd-shadow-baseline-poll-evidence.service';
import { P25_APD_B4_V1, P25_APD_B2_V1 } from '../adaptive-polling-policy/p25-apd-policy-versions';

describe('reconcilePriorSkipDiscoveryDelay pagination and budget (H3)', () => {
  it('processes 101 opportunities without omitting split policy pairs', async () => {
    const opportunityIds = Array.from({ length: 101 }, (_, i) =>
      `opp-${String(i).padStart(4, '0')}`,
    );
    let distinctCursor = 0;
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findFirst = jest
      .fn()
      .mockResolvedValue({ id: 'observing-poll', startedAt: new Date() });

    const findMany = jest.fn(async (args: { distinct?: string[]; take?: number; where?: { opportunityId?: { gt?: string } } }) => {
      if (args.distinct) {
        const gt = args.where?.opportunityId?.gt;
        const start = gt
          ? opportunityIds.indexOf(gt) + 1
          : 0;
        const slice = opportunityIds.slice(start, start + (args.take ?? 25));
        return slice.map((opportunityId) => ({ opportunityId }));
      }
      const opportunityId =
        typeof args.where?.opportunityId === 'string'
          ? args.where.opportunityId
          : undefined;
      if (!opportunityId) return [];
      const completed = new Date('2026-10-25T10:29:05.000Z');
      return [
        {
          opportunityId,
          policyVersion: P25_APD_B2_V1,
          realPollCompletedAt: completed,
        },
        {
          opportunityId,
          policyVersion: P25_APD_B4_V1,
          realPollCompletedAt: completed,
        },
      ];
    });

    const service = new ApdShadowBaselinePollEvidenceService({
      apdShadowReconciliationDecision: { findMany, updateMany },
      dimoPollLog: { findFirst },
    } as never);

    const result = await service.reconcilePriorSkipDiscoveryDelayFromObservingPoll({
      organizationId: 'org',
      vehicleId: 'veh',
      activationEpochId: 'epoch',
      observingPollId: 'observing-poll',
      observingPollStartedAtMs: Date.parse('2026-10-25T10:30:02.808Z'),
      observingPollCompletedAtMs: Date.parse('2026-10-25T10:30:08.000Z'),
      maxOpportunitiesPerRun: 500,
    });

    expect(result.processedOpportunities).toBe(101);
    expect(result.budgetExhausted).toBe(false);
    expect(updateMany).toHaveBeenCalledTimes(101 * 2);
  });

  it('stops at budget with continuation signal', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ opportunityId: 'opp-1' }, { opportunityId: 'opp-2' }])
      .mockResolvedValue([]);
    const findFirst = jest.fn().mockResolvedValue(null);
    const updateMany = jest.fn();
    const service = new ApdShadowBaselinePollEvidenceService({
      apdShadowReconciliationDecision: { findMany, updateMany },
      dimoPollLog: { findFirst },
    } as never);

    const result = await service.reconcilePriorSkipDiscoveryDelayFromObservingPoll({
      organizationId: 'org',
      vehicleId: 'veh',
      activationEpochId: 'epoch',
      observingPollId: 'observing',
      observingPollStartedAtMs: 1,
      observingPollCompletedAtMs: 2,
      maxOpportunitiesPerRun: 1,
    });

    expect(result.processedOpportunities).toBe(1);
    expect(result.budgetExhausted).toBe(true);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('uses ascending startedAt then id for immediate-next SUCCESS poll', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ opportunityId: 'opp-1' }])
      .mockResolvedValueOnce([
        {
          opportunityId: 'opp-1',
          policyVersion: P25_APD_B2_V1,
          realPollCompletedAt: new Date('2026-10-25T10:29:05.000Z'),
        },
      ]);
    const findFirst = jest.fn().mockResolvedValue({ id: 'p-next', startedAt: new Date() });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = new ApdShadowBaselinePollEvidenceService({
      apdShadowReconciliationDecision: { findMany, updateMany },
      dimoPollLog: { findFirst },
    } as never);

    await service.reconcilePriorSkipDiscoveryDelayFromObservingPoll({
      organizationId: 'org',
      vehicleId: 'veh',
      activationEpochId: 'epoch',
      observingPollId: 'p-next',
      observingPollStartedAtMs: Date.parse('2026-10-25T10:30:00.000Z'),
      observingPollCompletedAtMs: Date.parse('2026-10-25T10:30:05.000Z'),
    });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          jobType: DimoPollJobType.SNAPSHOT,
          status: DimoPollStatus.SUCCESS,
        }),
        orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      }),
    );
  });
});
