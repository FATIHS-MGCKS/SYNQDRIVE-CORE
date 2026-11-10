import { DimoPollJobType, DimoPollStatus } from '@prisma/client';
import { ApdShadowBaselinePollEvidenceService } from './apd-shadow-baseline-poll-evidence.service';
import { P25_APD_DELAY_EVIDENCE_V1_1_IMMEDIATE_NEXT } from './p25-apd-shadow-baseline-poll-evidence';
import { P25_APD_B2_V1, P25_APD_B4_V1 } from '../adaptive-polling-policy/p25-apd-policy-versions';

describe('ApdShadowBaselinePollEvidenceService immediate-next discovery delay (V3 P1A)', () => {
  const priorCompleted = new Date('2026-10-25T10:29:05.000Z');
  const poll2Start = Date.parse('2026-10-25T10:30:02.808Z');
  const poll2End = Date.parse('2026-10-25T10:30:08.000Z');
  const poll3Start = Date.parse('2026-10-25T10:35:02.808Z');
  const poll3End = Date.parse('2026-10-25T10:35:08.000Z');

  const skippedOpp = 'opp-skipped-informative';
  const poll2Id = 'poll-immediate-next';
  const poll3Id = 'poll-late-reconcile';

  function mockPrismaForOpp(immediatePollId: string) {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findFirst = jest.fn().mockResolvedValue({ id: immediatePollId });
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ opportunityId: skippedOpp }])
      .mockResolvedValueOnce([
        {
          opportunityId: skippedOpp,
          policyVersion: P25_APD_B2_V1,
          realPollCompletedAt: priorCompleted,
        },
        {
          opportunityId: skippedOpp,
          policyVersion: P25_APD_B4_V1,
          realPollCompletedAt: priorCompleted,
        },
      ])
      .mockResolvedValueOnce([]);
    return {
      service: new ApdShadowBaselinePollEvidenceService({
        apdShadowReconciliationDecision: { findMany, updateMany },
        dimoPollLog: { findFirst },
      } as never),
      findFirst,
      updateMany,
    };
  }

  it('reconciles delay only when observing poll is the immediate next SUCCESS baseline', async () => {
    const { service, findFirst, updateMany } = mockPrismaForOpp(poll2Id);

    await service.reconcilePriorSkipDiscoveryDelayFromObservingPoll({
      organizationId: 'org',
      vehicleId: 'veh',
      activationEpochId: 'epoch',
      observingPollId: poll2Id,
      observingPollStartedAtMs: poll2Start,
      observingPollCompletedAtMs: poll2End,
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
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        discoveryDelayEvidenceVersion: P25_APD_DELAY_EVIDENCE_V1_1_IMMEDIATE_NEXT,
        simulatedNextPollId: poll2Id,
        additionalDiscoveryDelayMs: poll2Start - priorCompleted.getTime(),
      }),
    );
  });

  it('does not bind a late poll after multiple intervening SUCCESS baselines', async () => {
    const { service, updateMany } = mockPrismaForOpp(poll2Id);

    await service.reconcilePriorSkipDiscoveryDelayFromObservingPoll({
      organizationId: 'org',
      vehicleId: 'veh',
      activationEpochId: 'epoch',
      observingPollId: poll3Id,
      observingPollStartedAtMs: poll3Start,
      observingPollCompletedAtMs: poll3End,
    });

    expect(updateMany).not.toHaveBeenCalled();
  });
});
