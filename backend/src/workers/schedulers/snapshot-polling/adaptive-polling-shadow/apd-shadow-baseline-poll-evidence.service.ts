import { Injectable, Logger, Optional } from '@nestjs/common';
import { DimoPollJobType, DimoPollStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { AdaptivePollingShadowMetricsService } from './adaptive-polling-shadow-metrics.service';
import {
  baselineLvEvidenceIsSkipInformative,
  evaluateBaselineLvSourceEvidence,
  evaluateBaselineSkipDiscoveryDelay,
  evaluateBaselineTopLevelSourceAdvance,
  isImmediateNextBaselineSuccessPoll,
  parseSnapshotCorrelationId,
  P25_APD_DELAY_EVIDENCE_V1_0_LEGACY,
  P25_APD_DELAY_EVIDENCE_V1_1_IMMEDIATE_NEXT,
  P25_APD_DELAY_EVIDENCE_NOT_ASSESSABLE,
} from './p25-apd-shadow-baseline-poll-evidence';
import type { RedisService } from '@shared/redis/redis.service';
import {
  clearDelayReconcileOpportunityCursor,
  loadDelayReconcileOpportunityCursor,
  saveDelayReconcileOpportunityCursor,
} from './apd-shadow-delay-reconcile-cursor.redis';
import type { AdaptivePollingShadowPostPollContext } from './adaptive-polling-shadow.types';

export type BaselinePollObservationalPatch = {
  newLvSourceObserved: boolean;
  newLvSourceAt: Date | null;
  newTopLevelSourceObserved: boolean;
  simulatedNextPollAt: Date | null;
  simulatedDiscoveryAt: Date | null;
  additionalDiscoveryDelayMs: number | null;
};

export type ExistingObservationalOutcome = {
  newLvSourceObserved: boolean;
  newTopLevelSourceObserved: boolean;
  additionalDiscoveryDelayMs: number | null;
  simulatedNextPollAt: Date | null;
  simulatedDiscoveryAt: Date | null;
};

@Injectable()
export class ApdShadowBaselinePollEvidenceService {
  private readonly logger = new Logger(ApdShadowBaselinePollEvidenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly metrics?: AdaptivePollingShadowMetricsService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  buildObservationalPatch(input: {
    ctx: AdaptivePollingShadowPostPollContext;
    existing?: ExistingObservationalOutcome | null;
  }): BaselinePollObservationalPatch {
    const lvEvidence = evaluateBaselineLvSourceEvidence({
      previousLvProviderSourceMs: input.ctx.previousLvSourceMs,
      strictLvProviderSourceMs: input.ctx.baselineLvProviderSourceMs,
    });
    const top = evaluateBaselineTopLevelSourceAdvance({
      previousSourceTimestampMs: input.ctx.previousTopLevelSourceMs,
      newSourceTimestampMs: input.ctx.newTopLevelSourceMs,
    });

    const lvInformative = baselineLvEvidenceIsSkipInformative(lvEvidence);
    const lvAt =
      lvEvidence.kind === 'STRICT_LV_ADVANCE' ||
      lvEvidence.kind === 'FIRST_VALID_LV_OBSERVATION'
        ? new Date(lvEvidence.providerSourceMs)
        : null;

    const existing = input.existing;
    const preserveDiscovery =
      existing?.additionalDiscoveryDelayMs != null &&
      existing.simulatedNextPollAt != null;

    return {
      newLvSourceObserved: lvInformative,
      newLvSourceAt: lvInformative ? lvAt : null,
      newTopLevelSourceObserved: top.informative,
      simulatedNextPollAt: preserveDiscovery ? existing!.simulatedNextPollAt : null,
      simulatedDiscoveryAt: preserveDiscovery ? existing!.simulatedDiscoveryAt : null,
      additionalDiscoveryDelayMs: preserveDiscovery
        ? existing!.additionalDiscoveryDelayMs
        : null,
    };
  }

  /**
   * Prometheus loss counters — only after durable false→true promotion (count === 1).
   */
  recordSkippedInformativeAfterDurableTransition(input: {
    policyVersion: string;
    prePollDecision: string;
    lvTransitioned: boolean;
    topLevelTransitioned: boolean;
  }): void {
    if (input.prePollDecision !== 'WOULD_SKIP') {
      return;
    }
    if (input.lvTransitioned) {
      this.metrics?.recordSkippedInformative(input.policyVersion, 'lv');
    }
    if (input.topLevelTransitioned) {
      this.metrics?.recordSkippedInformative(input.policyVersion, 'top_level');
    }
  }

  /**
   * When a later baseline poll completes, backfill discovery delay for prior
   * WOULD_SKIP rows that already recorded informative LV/top evidence.
   */
  async reconcilePriorSkipDiscoveryDelayFromObservingPoll(input: {
    organizationId: string;
    vehicleId: string;
    activationEpochId: string;
    observingPollId: string;
    observingPollStartedAtMs: number;
    observingPollCompletedAtMs: number;
    maxOpportunitiesPerRun?: number;
    maxDbQueriesPerRun?: number;
  }): Promise<{ processedOpportunities: number; budgetExhausted: boolean }> {
    const OPPORTUNITY_PAGE_SIZE = 25;
    const maxOpportunities = input.maxOpportunitiesPerRun ?? 200;
    const maxDbQueries = input.maxDbQueriesPerRun ?? maxOpportunities * 4 + 8;
    let dbQueries = 0;

    const pendingCount = await this.prisma.apdShadowReconciliationDecision.count({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        activationEpochId: input.activationEpochId,
        decision: 'WOULD_SKIP',
        realPollStatus: 'SUCCESS',
        additionalDiscoveryDelayMs: null,
        discoveryDelayEvidenceVersion: null,
        OR: [{ newLvSourceObserved: true }, { newTopLevelSourceObserved: true }],
        realPollCompletedAt: {
          lt: new Date(input.observingPollStartedAtMs),
        },
      },
    });
    dbQueries += 1;
    if (pendingCount === 0) {
      return { processedOpportunities: 0, budgetExhausted: false };
    }

    const scope = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      activationEpochId: input.activationEpochId,
    };

    let opportunityCursor: string | undefined;
    if (this.redis) {
      opportunityCursor = await loadDelayReconcileOpportunityCursor(this.redis, scope);
      dbQueries += 0;
    }

    let processedOpportunities = 0;
    let budgetExhausted = false;
    let wrapped = false;

    while (processedOpportunities < maxOpportunities && dbQueries < maxDbQueries) {
      const opportunityBatch = await this.prisma.apdShadowReconciliationDecision.findMany({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          activationEpochId: input.activationEpochId,
          decision: 'WOULD_SKIP',
          realPollStatus: 'SUCCESS',
          additionalDiscoveryDelayMs: null,
          discoveryDelayEvidenceVersion: null,
          OR: [{ newLvSourceObserved: true }, { newTopLevelSourceObserved: true }],
          realPollCompletedAt: {
            lt: new Date(input.observingPollStartedAtMs),
          },
          ...(opportunityCursor ? { opportunityId: { gt: opportunityCursor } } : {}),
        },
        distinct: ['opportunityId'],
        orderBy: { opportunityId: 'asc' },
        take: OPPORTUNITY_PAGE_SIZE,
        select: { opportunityId: true },
      });
      dbQueries += 1;

      if (opportunityBatch.length === 0) {
        if (opportunityCursor && !wrapped) {
          opportunityCursor = undefined;
          if (this.redis) {
            await clearDelayReconcileOpportunityCursor(this.redis, scope);
          }
          wrapped = true;
          continue;
        }
        break;
      }

      for (const { opportunityId } of opportunityBatch) {
        if (processedOpportunities >= maxOpportunities) {
          budgetExhausted = true;
          break;
        }

        if (dbQueries >= maxDbQueries) {
          budgetExhausted = true;
          break;
        }

        const priorRows = await this.prisma.apdShadowReconciliationDecision.findMany({
          where: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            activationEpochId: input.activationEpochId,
            opportunityId,
            decision: 'WOULD_SKIP',
            realPollStatus: 'SUCCESS',
            additionalDiscoveryDelayMs: null,
            discoveryDelayEvidenceVersion: null,
            OR: [{ newLvSourceObserved: true }, { newTopLevelSourceObserved: true }],
            realPollCompletedAt: {
              lt: new Date(input.observingPollStartedAtMs),
            },
          },
          orderBy: [{ policyVersion: 'asc' }],
          select: {
            opportunityId: true,
            policyVersion: true,
            realPollCompletedAt: true,
          },
        });
        dbQueries += 1;

        const completedAtMs = priorRows[0]?.realPollCompletedAt?.getTime();
        if (completedAtMs == null) {
          processedOpportunities += 1;
          opportunityCursor = opportunityId;
          continue;
        }

        if (dbQueries >= maxDbQueries) {
          budgetExhausted = true;
          break;
        }

        const immediateNext = await this.prisma.dimoPollLog.findFirst({
          where: {
            vehicleId: input.vehicleId,
            jobType: DimoPollJobType.SNAPSHOT,
            status: DimoPollStatus.SUCCESS,
            startedAt: { gt: new Date(completedAtMs) },
          },
          orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
          select: { id: true, startedAt: true },
        });
        dbQueries += 1;

        if (immediateNext?.startedAt) {
          const nextStartedMs = immediateNext.startedAt.getTime();
          if (
            nextStartedMs < input.observingPollStartedAtMs &&
            !isImmediateNextBaselineSuccessPoll({
              immediateNextPollId: immediateNext.id,
              observingPollId: input.observingPollId,
            })
          ) {
            await this.markDiscoveryDelayNotAssessable({
              organizationId: input.organizationId,
              vehicleId: input.vehicleId,
              activationEpochId: input.activationEpochId,
              opportunityId,
            });
            processedOpportunities += 1;
            opportunityCursor = opportunityId;
            continue;
          }
        }

        if (
          !isImmediateNextBaselineSuccessPoll({
            immediateNextPollId: immediateNext?.id ?? null,
            observingPollId: input.observingPollId,
          })
        ) {
          processedOpportunities += 1;
          opportunityCursor = opportunityId;
          continue;
        }

        const delayEvidence = evaluateBaselineSkipDiscoveryDelay({
          priorPollCompletedAtMs: completedAtMs,
          nextBaselinePollStartedAtMs: input.observingPollStartedAtMs,
          nextBaselinePollCompletedAtMs: input.observingPollCompletedAtMs,
          nextBaselinePollId: input.observingPollId,
        });
        if (delayEvidence.kind !== 'NEXT_BASELINE_POLL_OBSERVED') {
          processedOpportunities += 1;
          opportunityCursor = opportunityId;
          continue;
        }

        for (const row of priorRows) {
          if (dbQueries >= maxDbQueries) {
            budgetExhausted = true;
            break;
          }
          const updated = await this.prisma.apdShadowReconciliationDecision.updateMany({
            where: {
              organizationId: input.organizationId,
              vehicleId: input.vehicleId,
              opportunityId: row.opportunityId,
              policyVersion: row.policyVersion,
              activationEpochId: input.activationEpochId,
              additionalDiscoveryDelayMs: null,
              discoveryDelayEvidenceVersion: null,
            },
            data: {
              simulatedNextPollAt: new Date(delayEvidence.simulatedNextPollAtMs),
              simulatedNextPollId: delayEvidence.simulatedNextPollId,
              additionalDiscoveryDelayMs: delayEvidence.additionalDiscoveryDelayMs,
              discoveryDelayEvidenceVersion: P25_APD_DELAY_EVIDENCE_V1_1_IMMEDIATE_NEXT,
            },
          });
          dbQueries += 1;
          if (updated.count !== 1) {
            this.logger.debug(
              `APD discovery delay reconcile skipped row count=${updated.count} opp=${opportunityId}`,
            );
          }
        }

        processedOpportunities += 1;
        opportunityCursor = opportunityId;
      }

      if (budgetExhausted) break;
      if (opportunityBatch.length < OPPORTUNITY_PAGE_SIZE) break;
    }

    if (this.redis && opportunityCursor) {
      await saveDelayReconcileOpportunityCursor(this.redis, scope, opportunityCursor);
    }

  return { processedOpportunities, budgetExhausted };
  }

  private async markDiscoveryDelayNotAssessable(input: {
    organizationId: string;
    vehicleId: string;
    activationEpochId: string;
    opportunityId: string;
  }): Promise<void> {
    await this.prisma.apdShadowReconciliationDecision.updateMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        opportunityId: input.opportunityId,
        activationEpochId: input.activationEpochId,
        additionalDiscoveryDelayMs: null,
        discoveryDelayEvidenceVersion: null,
      },
      data: {
        discoveryDelayEvidenceVersion: P25_APD_DELAY_EVIDENCE_NOT_ASSESSABLE,
      },
    });
  }

  /**
   * Tags legacy delay rows that predate V1_1 semantics without rewriting delay values.
   */
  markLegacyDiscoveryDelayEvidenceVersion(input: {
    organizationId: string;
    vehicleId: string;
    opportunityId: string;
    policyVersion: string;
  }): Promise<{ count: number }> {
    return this.prisma.apdShadowReconciliationDecision.updateMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        opportunityId: input.opportunityId,
        policyVersion: input.policyVersion,
        additionalDiscoveryDelayMs: { not: null },
        discoveryDelayEvidenceVersion: null,
      },
      data: {
        discoveryDelayEvidenceVersion: P25_APD_DELAY_EVIDENCE_V1_0_LEGACY,
      },
    });
  }

  /**
   * After async LIVE_VOLTAGE persistence, backfill baseline LV evidence when the
   * immediate post-poll path could not see the measurement row yet.
   */
  async reconcileDeferredLvAfterSnapshotPersistence(input: {
    organizationId: string;
    vehicleId: string;
    providerTimestampMs: number;
    snapshotCorrelationId: string | null | undefined;
    previousLvProviderSourceMsBeforePersist: number | null;
  }): Promise<void> {
    const parsed = parseSnapshotCorrelationId(input.snapshotCorrelationId);
    if (!parsed || parsed.vehicleId !== input.vehicleId) {
      return;
    }

    const poll = await this.prisma.dimoPollLog.findFirst({
      where: {
        vehicleId: input.vehicleId,
        jobType: DimoPollJobType.SNAPSHOT,
        status: DimoPollStatus.SUCCESS,
        startedAt: {
          gte: new Date(parsed.fetchedAtMs - 2_000),
          lte: new Date(parsed.fetchedAtMs + 2_000),
        },
      },
      orderBy: { startedAt: 'asc' },
      select: { id: true, startedAt: true, finishedAt: true },
    });
    if (!poll?.finishedAt) return;

    const rows = await this.prisma.apdShadowReconciliationDecision.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        realPollId: poll.id,
        realPollStatus: 'SUCCESS',
      },
      select: {
        opportunityId: true,
        policyVersion: true,
        decision: true,
        newLvSourceObserved: true,
        newTopLevelSourceObserved: true,
        additionalDiscoveryDelayMs: true,
        simulatedNextPollAt: true,
        simulatedDiscoveryAt: true,
        activationEpochId: true,
      },
    });

    for (const row of rows) {
      const rowEvidence = evaluateBaselineLvSourceEvidence({
        previousLvProviderSourceMs: input.previousLvProviderSourceMsBeforePersist,
        strictLvProviderSourceMs: input.providerTimestampMs,
      });
      if (
        !baselineLvEvidenceIsSkipInformative(rowEvidence) ||
        row.newLvSourceObserved
      ) {
        continue;
      }
      const lvAt =
        rowEvidence.kind === 'STRICT_LV_ADVANCE'
          ? new Date(rowEvidence.providerSourceMs)
          : null;

      const updated = await this.prisma.apdShadowReconciliationDecision.updateMany({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          opportunityId: row.opportunityId,
          policyVersion: row.policyVersion,
          realPollId: poll.id,
          newLvSourceObserved: false,
        },
        data: {
          newLvSourceObserved: true,
          newLvSourceAt: lvAt,
        },
      });

      if (updated.count === 1 && row.decision === 'WOULD_SKIP') {
        this.metrics?.recordSkippedInformative(row.policyVersion, 'lv');
      }
    }
  }
}
