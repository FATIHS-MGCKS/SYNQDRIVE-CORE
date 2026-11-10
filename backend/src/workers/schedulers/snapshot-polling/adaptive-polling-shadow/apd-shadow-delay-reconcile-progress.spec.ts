import { PrismaService } from '@shared/database/prisma.service';
import { ApdShadowBaselinePollEvidenceService } from './apd-shadow-baseline-poll-evidence.service';
import { P25_APD_DELAY_EVIDENCE_V1_1_IMMEDIATE_NEXT } from './p25-apd-shadow-baseline-poll-evidence';

describe('reconcilePriorSkipDiscoveryDelay progress (H3-R)', () => {
  const makeOppId = (n: number) => `opp-${String(n).padStart(5, '0')}`;

  function buildPrismaMock(sequence: {
    pendingCount: number;
    opportunityPages: string[][];
    priorRows: (id: string) => unknown[];
    immediateNext: (id: string) => { id: string; startedAt: Date } | null;
  }) {
    let findManyCalls = 0;
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findMany = jest.fn(async (args: {
      distinct?: string[];
      where?: { opportunityId?: string | { gt?: string } };
    }) => {
      findManyCalls += 1;
      if (args.distinct?.includes('opportunityId')) {
        const page = sequence.opportunityPages.shift() ?? [];
        return page.map((opportunityId) => ({ opportunityId }));
      }
      const raw = args.where?.opportunityId;
      const oppId = typeof raw === 'string' ? raw : '';
      return sequence.priorRows(oppId);
    });
    const dimoFindFirst = jest.fn(async () => {
      const opp = findMany.mock.calls
        .filter((c) => !c[0]?.distinct)
        .map((c) => c[0]?.where?.opportunityId)
        .filter(Boolean)
        .at(-1) as string;
      return sequence.immediateNext(opp);
    });
    return {
      apdShadowReconciliationDecision: {
        count: jest.fn().mockResolvedValue(sequence.pendingCount),
        findMany,
        updateMany,
      },
      dimoPollLog: { findFirst: dimoFindFirst },
    };
  }

  it('processes >200 stale opportunities then a matchable candidate within budget', async () => {
    const staleIds = Array.from({ length: 201 }, (_, i) => makeOppId(i + 1));
    const validId = makeOppId(999);
    const observingPollId = 'poll-valid';
    const prisma = buildPrismaMock({
      pendingCount: 202,
      opportunityPages: [staleIds.slice(0, 25), staleIds.slice(25, 50)],
      priorRows: (id) => [
        {
          opportunityId: id,
          policyVersion: 'P25_APD_B2_V1',
          realPollCompletedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ],
      immediateNext: (id) =>
        id === validId
          ? { id: observingPollId, startedAt: new Date('2026-01-02T00:00:00Z') }
          : { id: 'poll-other', startedAt: new Date('2026-01-02T00:00:00Z') },
    });

    const redis = {
      get: jest
        .fn()
        .mockResolvedValueOnce(makeOppId(10))
        .mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    const service = new ApdShadowBaselinePollEvidenceService(
      prisma as unknown as PrismaService,
      undefined,
      redis as never,
    );

    const first = await service.reconcilePriorSkipDiscoveryDelayFromObservingPoll({
      organizationId: 'org',
      vehicleId: 'veh',
      activationEpochId: 'epoch',
      observingPollId,
      observingPollStartedAtMs: new Date('2026-01-02T00:00:00Z').getTime(),
      observingPollCompletedAtMs: new Date('2026-01-02T00:01:00Z').getTime(),
      maxOpportunitiesPerRun: 30,
    });
    expect(first.budgetExhausted).toBe(true);
    expect(first.processedOpportunities).toBe(30);
    expect(redis.set).toHaveBeenCalled();

    prisma.apdShadowReconciliationDecision.findMany.mockImplementation(
      async (args: { distinct?: string[] }) => {
        if (args.distinct?.includes('opportunityId')) {
          return [{ opportunityId: validId }];
        }
        return [
          {
            opportunityId: validId,
            policyVersion: 'P25_APD_B2_V1',
            realPollCompletedAt: new Date('2026-01-01T00:00:00Z'),
          },
          {
            opportunityId: validId,
            policyVersion: 'P25_APD_B4_V1',
            realPollCompletedAt: new Date('2026-01-01T00:00:00Z'),
          },
        ];
      },
    );

    const second = await service.reconcilePriorSkipDiscoveryDelayFromObservingPoll({
      organizationId: 'org',
      vehicleId: 'veh',
      activationEpochId: 'epoch',
      observingPollId,
      observingPollStartedAtMs: new Date('2026-01-02T00:00:00Z').getTime(),
      observingPollCompletedAtMs: new Date('2026-01-02T00:01:00Z').getTime(),
      maxOpportunitiesPerRun: 5,
    });

    expect(second.processedOpportunities).toBe(1);
    const wroteV11 = prisma.apdShadowReconciliationDecision.updateMany.mock.calls.some(
      (c) =>
        c[0]?.data?.discoveryDelayEvidenceVersion ===
        P25_APD_DELAY_EVIDENCE_V1_1_IMMEDIATE_NEXT,
    );
    expect(wroteV11).toBe(true);
  });
});
