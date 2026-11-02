import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { VsiProfileRevisionHistoryRepository } from './vsi-profile-revision-history.repository';
import { isVsiP5h1ProfileRevisionHistoryCaptureEnabled } from './vsi-p5h1-profile-revision-history.config';
import {
  mapDecisionRowToSummary,
  mapEpochRow,
  mapRealPollEvidence,
  maskIdentifier,
} from './apds-master-intelligence-read.mapper';
import type {
  MasterApdsDecisionDetailDto,
  MasterApdsDecisionHistoryPageDto,
  MasterApdsEpochHistoryPageDto,
  MasterApdsOverviewDto,
  MasterApdsPresentationAvailability,
  MasterApdsVsiCorrelationDto,
} from './apds-master-intelligence-read.types';

const MAX_PAGE = 50;
const DEFAULT_PAGE = 20;

@Injectable()
export class ApdsMasterIntelligenceReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revisionHistory: VsiProfileRevisionHistoryRepository,
  ) {}

  private async assertVehicleScope(organizationId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found for organization scope');
    }
  }

  private async assertSourceLinkScope(
    organizationId: string,
    vehicleId: string,
    providerSourceLinkId: string,
  ): Promise<void> {
    await this.assertVehicleScope(organizationId, vehicleId);
    const link = await this.prisma.vehicleDataSourceLink.findFirst({
      where: { id: providerSourceLinkId, vehicleId, vehicle: { organizationId } },
      select: { id: true },
    });
    if (!link) {
      throw new NotFoundException('Provider source link not found for vehicle scope');
    }
  }

  private parseLimit(raw?: number): number {
    if (raw == null || Number.isNaN(raw)) return DEFAULT_PAGE;
    return Math.min(Math.max(raw, 1), MAX_PAGE);
  }

  private parseDecisionCursor(cursor: string | null | undefined): { decisionAt: Date; id: string } | null {
    if (!cursor?.trim()) return null;
    const sep = cursor.indexOf('|');
    if (sep <= 0) throw new BadRequestException('Invalid decision cursor');
    const decisionAt = new Date(cursor.slice(0, sep));
    const id = cursor.slice(sep + 1);
    if (Number.isNaN(decisionAt.getTime()) || !id) {
      throw new BadRequestException('Invalid decision cursor');
    }
    return { decisionAt, id };
  }

  private parseEpochCursor(cursor: string | null | undefined): Date | null {
    if (!cursor?.trim()) return null;
    const d = new Date(cursor);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid epoch cursor');
    return d;
  }

  private resolveAvailability(input: {
    activeEpoch: boolean;
    decisionCount: number;
  }): { availability: MasterApdsPresentationAvailability; explanation: string[] } {
    const explanation: string[] = [];
    if (input.decisionCount === 0) {
      explanation.push('NO_PERSISTED_SHADOW_DECISIONS_FOR_VEHICLE');
      return { availability: 'NO_DECISIONS_CAPTURED', explanation };
    }
    if (!input.activeEpoch) {
      explanation.push('NO_ACTIVE_ACTIVATION_EPOCH_FOR_ORGANIZATION');
      return { availability: 'NOT_ACTIVATED', explanation };
    }
    return { availability: 'AVAILABLE', explanation };
  }

  async getOverview(
    organizationId: string,
    vehicleId: string,
    providerSourceLinkId?: string | null,
  ): Promise<MasterApdsOverviewDto> {
    await this.assertVehicleScope(organizationId, vehicleId);
    if (providerSourceLinkId) {
      await this.assertSourceLinkScope(organizationId, vehicleId, providerSourceLinkId);
    }

    const decisionCount = await this.prisma.apdShadowReconciliationDecision.count({
      where: { organizationId, vehicleId },
    });

    const activeEpochRow = await this.prisma.apdShadowActivationEpoch.findFirst({
      where: { organizationId, lifecycleState: 'ACTIVE' },
      orderBy: { activatedAt: 'desc' },
    });

    const latestEpochRow = await this.prisma.apdShadowActivationEpoch.findFirst({
      where: { organizationId },
      orderBy: { preparedAt: 'desc' },
    });

    const latestDecisionRow = await this.prisma.apdShadowReconciliationDecision.findFirst({
      where: { organizationId, vehicleId },
      orderBy: [{ decisionAt: 'desc' }, { id: 'desc' }],
    });

    const epochIds = [activeEpochRow?.id, latestEpochRow?.id].filter(Boolean) as string[];
    const vehicleCounts =
      epochIds.length === 0
        ? new Map<string, number>()
        : new Map(
            (
              await this.prisma.apdShadowReconciliationDecision.groupBy({
                by: ['activationEpochId'],
                where: {
                  organizationId,
                  vehicleId,
                  activationEpochId: { in: epochIds },
                },
                _count: { _all: true },
              })
            ).map((g) => [g.activationEpochId ?? '', g._count._all]),
          );

    const { availability, explanation } = this.resolveAvailability({
      activeEpoch: activeEpochRow != null,
      decisionCount,
    });

    return {
      organizationId,
      vehicleId,
      providerSourceLinkId: providerSourceLinkId ?? null,
      availability,
      availabilityExplanation: explanation,
      activeEpoch: activeEpochRow
        ? mapEpochRow(activeEpochRow, vehicleCounts.get(activeEpochRow.id) ?? 0)
        : null,
      latestEpoch: latestEpochRow
        ? mapEpochRow(latestEpochRow, vehicleCounts.get(latestEpochRow.id) ?? 0)
        : null,
      latestDecision: latestDecisionRow ? mapDecisionRowToSummary(latestDecisionRow) : null,
      decisionCountForVehicle: decisionCount,
    };
  }

  async getEpochHistory(input: {
    organizationId: string;
    vehicleId: string;
    limit?: number;
    cursor?: string | null;
  }): Promise<MasterApdsEpochHistoryPageDto> {
    await this.assertVehicleScope(input.organizationId, input.vehicleId);
    const limit = this.parseLimit(input.limit);
    const cursorPreparedAt = this.parseEpochCursor(input.cursor);

    const rows = await this.prisma.apdShadowActivationEpoch.findMany({
      where: {
        organizationId: input.organizationId,
        ...(cursorPreparedAt ? { preparedAt: { lt: cursorPreparedAt } } : {}),
      },
      orderBy: { preparedAt: 'desc' },
      take: limit + 1,
    });

    const pageRows = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const ids = pageRows.map((r) => r.id);
    const counts =
      ids.length === 0
        ? new Map<string, number>()
        : new Map(
            (
              await this.prisma.apdShadowReconciliationDecision.groupBy({
                by: ['activationEpochId'],
                where: {
                  organizationId: input.organizationId,
                  vehicleId: input.vehicleId,
                  activationEpochId: { in: ids },
                },
                _count: { _all: true },
              })
            ).map((g) => [g.activationEpochId ?? '', g._count._all]),
          );

    return {
      items: pageRows.map((r) => mapEpochRow(r, counts.get(r.id) ?? 0)),
      page: {
        limit,
        nextCursor: hasMore ? pageRows[pageRows.length - 1]!.preparedAt.toISOString() : null,
        hasMore,
      },
    };
  }

  async getDecisionHistory(input: {
    organizationId: string;
    vehicleId: string;
    limit?: number;
    cursor?: string | null;
    policyVersion?: string | null;
  }): Promise<MasterApdsDecisionHistoryPageDto> {
    await this.assertVehicleScope(input.organizationId, input.vehicleId);
    const limit = this.parseLimit(input.limit);
    const cursor = this.parseDecisionCursor(input.cursor);

    const rows = await this.prisma.apdShadowReconciliationDecision.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        ...(input.policyVersion ? { policyVersion: input.policyVersion } : {}),
        ...(cursor
          ? {
              OR: [
                { decisionAt: { lt: cursor.decisionAt } },
                { decisionAt: cursor.decisionAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ decisionAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const pageRows = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const last = pageRows[pageRows.length - 1];

    return {
      items: pageRows.map(mapDecisionRowToSummary),
      page: {
        limit,
        nextCursor: hasMore && last ? `${last.decisionAt.toISOString()}|${last.id}` : null,
        hasMore,
      },
    };
  }

  async getDecisionDetail(input: {
    organizationId: string;
    vehicleId: string;
    opportunityId: string;
    policyVersion: string;
  }): Promise<MasterApdsDecisionDetailDto> {
    await this.assertVehicleScope(input.organizationId, input.vehicleId);
    const row = await this.prisma.apdShadowReconciliationDecision.findUnique({
      where: {
        organizationId_vehicleId_opportunityId_policyVersion: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          opportunityId: input.opportunityId,
          policyVersion: input.policyVersion,
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Shadow decision not found for vehicle scope');
    }

    const epoch = row.activationEpochId
      ? await this.prisma.apdShadowActivationEpoch.findFirst({
          where: { id: row.activationEpochId, organizationId: input.organizationId },
        })
      : null;

    const pollLog = row.realPollId
      ? await this.prisma.dimoPollLog.findFirst({
          where: { id: row.realPollId, vehicleId: input.vehicleId },
        })
      : null;

    const missingEvidence: string[] = [];
    if (!row.activationEpochId) missingEvidence.push('ACTIVATION_EPOCH_NOT_RECORDED_ON_DECISION');
    if (row.simulatedNextPollAt && !row.realPollId) {
      missingEvidence.push('SIMULATED_NEXT_POLL_WITHOUT_LINKED_REAL_POLL');
    }

    const persistedInputs = {
      lastLvSourceAt: row.lastLvSourceAt?.toISOString() ?? null,
      lastProviderFetchedAt: row.lastProviderFetchedAt?.toISOString() ?? null,
      expectedWindowStart: row.expectedWindowStart?.toISOString() ?? null,
      expectedWindowEnd: row.expectedWindowEnd?.toISOString() ?? null,
      providerGapState: row.providerGapState,
      connectivityState: row.connectivityState,
      wakeCorrelationIdPrefix: maskIdentifier(row.wakeCorrelationId),
    };

    const persistedOutputs = {
      decision: row.decision,
      reason: row.reason,
      reconciliation: row.reconciliation,
      enqueueOutcome: row.enqueueOutcome,
      simulatedNextPollAt: row.simulatedNextPollAt?.toISOString() ?? null,
      simulatedDiscoveryAt: row.simulatedDiscoveryAt?.toISOString() ?? null,
      newLvSourceObserved: row.newLvSourceObserved,
      legacyAssessmentImpact: row.legacyAssessmentImpact,
    };

    return {
      summary: mapDecisionRowToSummary(row),
      persistedInputs,
      persistedOutputs,
      policyProvenance: {
        policyVersion: row.policyVersion,
        profileVersion: row.profileVersion,
        profileClass: row.profileClass,
        shadowExecutionVersion: row.shadowExecutionVersion,
        fromPersistedDecision: true,
      },
      epoch: epoch ? mapEpochRow(epoch, null) : null,
      realPollEvidence: mapRealPollEvidence(row, pollLog),
      missingEvidence,
      shadowRecommendationIsNotRealPoll: true,
    };
  }

  async getVsiCorrelation(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    opportunityId: string;
    policyVersion: string;
    decisionAt: string;
    historicalLinkAttributionProven?: boolean;
  }): Promise<MasterApdsVsiCorrelationDto> {
    await this.assertSourceLinkScope(
      input.organizationId,
      input.vehicleId,
      input.providerSourceLinkId,
    );

    const decisionAt = new Date(input.decisionAt);
    if (Number.isNaN(decisionAt.getTime())) {
      throw new BadRequestException('Invalid decisionAt');
    }

    const decision = await this.prisma.apdShadowReconciliationDecision.findUnique({
      where: {
        organizationId_vehicleId_opportunityId_policyVersion: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          opportunityId: input.opportunityId,
          policyVersion: input.policyVersion,
        },
      },
    });
    if (!decision) {
      throw new NotFoundException('Shadow decision not found for correlation scope');
    }

    const offlineRows = await this.prisma.vsiApdsP5CorrelationEvidence.count({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        opportunityId: input.opportunityId,
        policyVersion: input.policyVersion,
        decisionAt,
      },
    });

    let revisionHistoryCaptureStatus: 'CAPTURE_ENABLED' | 'NOT_CAPTURED' = 'NOT_CAPTURED';
    let revisionAsOfAuthority: string | null = null;
    let revisionAsOfLimitations: string[] = [];
    let selectedRevisionPrefix: string | null = null;
    let attributionQuality: MasterApdsVsiCorrelationDto['attributionQuality'] = 'NOT_AVAILABLE';

    if (isVsiP5h1ProfileRevisionHistoryCaptureEnabled()) {
      revisionHistoryCaptureStatus = 'CAPTURE_ENABLED';
      const resolution = await this.revisionHistory.resolveRevisionAsOf({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
        decisionAt,
        historicalLinkAttributionProven: input.historicalLinkAttributionProven === true,
      });
      revisionAsOfAuthority = resolution.authority;
      revisionAsOfLimitations = resolution.limitations;
      selectedRevisionPrefix = resolution.selectedRevision
        ? maskIdentifier(String(resolution.selectedRevision.profileRevision))
        : null;
      attributionQuality =
        input.historicalLinkAttributionProven && resolution.selectedRevision
          ? 'PROVEN'
          : resolution.selectedRevision
            ? 'LIMITED'
            : 'NOT_AVAILABLE';
    } else {
      revisionAsOfLimitations = ['P5H1_REVISION_HISTORY_NOT_CAPTURED'];
    }

    return {
      providerSourceLinkId: input.providerSourceLinkId,
      decisionAt: decisionAt.toISOString(),
      policyVersion: input.policyVersion,
      opportunityIdPrefix: maskIdentifier(input.opportunityId) ?? input.opportunityId,
      offlineCorrelationRows: offlineRows,
      offlineCorrelationNote:
        offlineRows > 0
          ? 'P5B1_OFFLINE_RESEARCH_EVIDENCE_PRESENT_NOT_RUNTIME_DECISION_INPUT'
          : 'NO_P5B1_OFFLINE_CORRELATION_ROWS',
      revisionHistoryCaptureStatus,
      revisionAsOfAuthority,
      revisionAsOfLimitations,
      selectedRevisionPrefix,
      attributionQuality,
      historicalCorrelationIsNotRuntimeDriver: true,
      vsiProfileAtDecisionIsNotCurrentProfile: true,
    };
  }

  async getRealPollEvidence(
    organizationId: string,
    vehicleId: string,
    realPollId: string,
  ) {
    await this.assertVehicleScope(organizationId, vehicleId);
    const pollLog = await this.prisma.dimoPollLog.findFirst({
      where: { id: realPollId, vehicleId },
    });
    if (!pollLog) {
      throw new NotFoundException('Poll log not found for vehicle scope');
    }
    const decision = await this.prisma.apdShadowReconciliationDecision.findFirst({
      where: { organizationId, vehicleId, realPollId },
      orderBy: { decisionAt: 'desc' },
    });
    if (!decision) {
      return {
        pollLog: {
          idPrefix: maskIdentifier(pollLog.id),
          status: pollLog.status,
          startedAt: pollLog.startedAt.toISOString(),
          finishedAt: pollLog.finishedAt?.toISOString() ?? null,
          jobType: pollLog.jobType,
        },
        linkedDecision: null,
        limitations: ['POLL_LOG_NOT_LINKED_TO_PERSISTED_SHADOW_DECISION'],
      };
    }
    return {
      pollLog: {
        idPrefix: maskIdentifier(pollLog.id),
        status: pollLog.status,
        startedAt: pollLog.startedAt.toISOString(),
        finishedAt: pollLog.finishedAt?.toISOString() ?? null,
        jobType: pollLog.jobType,
      },
      linkedDecision: mapDecisionRowToSummary(decision),
      realPollEvidence: mapRealPollEvidence(decision, pollLog),
      limitations: [] as string[],
    };
  }
}
