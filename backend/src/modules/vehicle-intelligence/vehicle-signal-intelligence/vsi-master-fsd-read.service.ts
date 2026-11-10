import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FsdDiscoveryStageType, FsdDiscoveryStream, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import {
  describeExplicitRunCatalog,
  extractCatalogCheckpointFromRun,
  pickAuthoritativeFsd3Catalog,
  type FsdRunWithStages,
} from './vsi-master-fsd-read.catalog-resolution';
import type { HistoricalCrossStreamLinkV1 } from './vsi-master-fsd-read.cross-stream';
import { resolveFsd4HistoricalCrossStreamLink } from './vsi-master-fsd-read.cross-stream';
import { aggregateLedgersFromStages } from './vsi-master-fsd-read.ledger';
import { paginateSortedUniqueSignalNames } from './vsi-master-fsd-read.signal-pagination';
import {
  extractStageQueryFlags,
  mapEvidenceStageAvailability,
  mapRunExecutionAvailability,
  mapSignalPresentationState,
  stageEvidenceColumnValue,
} from './vsi-master-fsd-read.semantics';
import {
  VSI_MASTER_FSD_READ_CONTRACT_V1,
  type MasterFsdRunHistoryPageDtoV1,
  type MasterFsdRunInspectorDtoV1,
  type MasterFsdSignalExplorerPageDtoV1,
  type MasterFsdSummaryDtoV1,
} from './vsi-master-fsd-read.types';

const MAX_PAGE = 50;
const DEFAULT_PAGE = 25;
const MAX_RUN_SCAN = 64;

type EvidenceRow = {
  signalName: string;
  declaredByProvider: boolean;
  schemaShape: string | null;
  evidenceState: import('@prisma/client').FsdDiscoverySignalEvidenceState;
  queryPlanned: boolean;
  queryAccepted: boolean | null;
  observedValue: boolean | null;
  stageType: FsdDiscoveryStageType;
  provenanceJson: unknown;
  qualityJson: unknown;
  runId: string;
};

@Injectable()
export class VsiMasterFsdReadService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertVehicleScope(organizationId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found for organization scope');
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
    if (!link) throw new NotFoundException('Provider source link not found for vehicle scope');
  }

  private parseLimit(raw?: number): number {
    if (raw == null || Number.isNaN(raw)) return DEFAULT_PAGE;
    return Math.min(Math.max(raw, 1), MAX_PAGE);
  }

  private parseRunHistoryCursor(cursor: string | null | undefined): { createdAt: Date; id: string } | null {
    if (!cursor?.trim()) return null;
    const sep = cursor.indexOf('|');
    if (sep <= 0) throw new BadRequestException('Invalid run history cursor');
    const createdAt = new Date(cursor.slice(0, sep));
    const id = cursor.slice(sep + 1);
    if (Number.isNaN(createdAt.getTime()) || !id) throw new BadRequestException('Invalid run history cursor');
    return { createdAt, id };
  }

  private parseSignalCursor(cursor: string | null | undefined): string | null {
    if (!cursor?.trim()) return null;
    if (cursor.length > 256) throw new BadRequestException('Invalid signal cursor');
    return cursor;
  }

  private async listRunsForStream(
    organizationId: string,
    vehicleId: string,
    providerSourceLinkId: string,
    discoveryStream: FsdDiscoveryStream,
  ): Promise<FsdRunWithStages[]> {
    return this.prisma.fsdDiscoveryRun.findMany({
      where: { organizationId, vehicleId, providerSourceLinkId, discoveryStream },
      orderBy: [{ createdAt: 'desc' }],
      take: MAX_RUN_SCAN,
      include: { stages: { orderBy: { stageType: 'asc' } } },
    });
  }

  private stageExecuted(stages: Array<{ stageType: string; status: string }>, stageType: string): boolean {
    const row = stages.find((s) => s.stageType === stageType);
    return row != null && row.status === 'SUCCEEDED';
  }

  private stageStatus(stages: Array<{ stageType: string; status: string }>, stageType: string): string | null {
    return stages.find((s) => s.stageType === stageType)?.status ?? null;
  }

  private async loadScopedContext(
    organizationId: string,
    vehicleId: string,
    providerSourceLinkId: string,
  ) {
    const fsd3Runs = await this.listRunsForStream(
      organizationId,
      vehicleId,
      providerSourceLinkId,
      'FSD3_CATALOG_SNAPSHOT',
    );
    const fsd4Runs = await this.listRunsForStream(
      organizationId,
      vehicleId,
      providerSourceLinkId,
      'FSD4_HISTORICAL',
    );
    const latestActivity = fsd3Runs[0] ?? null;
    const authoritative = pickAuthoritativeFsd3Catalog(fsd3Runs);
    const historicalLink = authoritative
      ? resolveFsd4HistoricalCrossStreamLink({
          authoritative: {
            organizationId,
            vehicleId,
            providerSourceLinkId,
            dimoTokenId: authoritative.run.dimoTokenId,
            connectionIdentityFingerprint: authoritative.run.connectionIdentityFingerprint,
            declaredCatalogFingerprint: authoritative.provenance.declaredCatalogFingerprint,
          },
          fsd4RunsNewestFirst: fsd4Runs,
        })
      : ({ kind: 'NOT_AVAILABLE' } as const);
    return { fsd3Runs, fsd4Runs, latestActivity, authoritative, historicalLink };
  }

  private async countEvidenceForRun(runId: string, stageType: FsdDiscoveryStageType): Promise<number> {
    return this.prisma.fsdDiscoverySignalEvidence.count({
      where: { runId, stageType },
    });
  }

  private async batchEvidenceCounts(
    runIds: string[],
  ): Promise<Map<string, { snapshot: number; historical: number }>> {
    const map = new Map<string, { snapshot: number; historical: number }>();
    for (const id of runIds) map.set(id, { snapshot: 0, historical: 0 });
    if (runIds.length === 0) return map;
    const grouped = await this.prisma.fsdDiscoverySignalEvidence.groupBy({
      by: ['runId', 'stageType'],
      where: { runId: { in: runIds }, stageType: { in: ['SNAPSHOT', 'HISTORICAL'] } },
      _count: { _all: true },
    });
    for (const g of grouped) {
      const entry = map.get(g.runId) ?? { snapshot: 0, historical: 0 };
      if (g.stageType === 'SNAPSHOT') entry.snapshot = g._count._all;
      if (g.stageType === 'HISTORICAL') entry.historical = g._count._all;
      map.set(g.runId, entry);
    }
    return map;
  }

  private catalogSignalCountFromStages(
    stages: Array<{ stageType: string; status: string; checkpointJson: unknown }>,
  ): number | null {
    const catalog = stages.find((s) => s.stageType === 'CATALOG' && s.status === 'SUCCEEDED');
    if (!catalog) return null;
    const cp = extractCatalogCheckpointFromRun({ stages } as FsdRunWithStages).checkpoint;
    const names = cp?.catalogFetch?.availableSignalNames;
    return names ? names.length : null;
  }

  async getSummary(
    organizationId: string,
    vehicleId: string,
    providerSourceLinkId: string,
  ): Promise<MasterFsdSummaryDtoV1> {
    await this.assertSourceLinkScope(organizationId, vehicleId, providerSourceLinkId);
    const { latestActivity, authoritative, historicalLink } = await this.loadScopedContext(
      organizationId,
      vehicleId,
      providerSourceLinkId,
    );
    const fsd4Latest = (await this.listRunsForStream(
      organizationId,
      vehicleId,
      providerSourceLinkId,
      'FSD4_HISTORICAL',
    ))[0];

    const catalog = authoritative
      ? {
          availability: authoritative.provenance.availability,
          provenanceClass: authoritative.provenance.provenanceClass,
          declaredSignalCount: authoritative.provenance.declaredSignalCount,
          authoritativeRunId: authoritative.run.id,
          declaredCatalogFingerprint: authoritative.provenance.declaredCatalogFingerprint,
          rejectionReason: authoritative.provenance.rejectionReason,
        }
      : {
          availability: 'NOT_AVAILABLE' as const,
          provenanceClass: 'UNVERIFIED' as const,
          declaredSignalCount: null,
          authoritativeRunId: null,
          declaredCatalogFingerprint: null,
          rejectionReason: latestActivity ? 'NO_AUTHORITATIVE_CATALOG' : null,
        };

    const authStages = authoritative?.run.stages ?? [];
    const snapshotRows = authoritative
      ? await this.countEvidenceForRun(authoritative.run.id, 'SNAPSHOT')
      : 0;

    let historicalRows = 0;
    let historicalStageExecuted = false;
    let historicalStageStatus: string | null = null;
    let historicalLimitation: string | null = null;
    let declaredForHistorical: number | null = authoritative?.provenance.declaredSignalCount ?? null;

    if (historicalLink.kind === 'LINKED') {
      historicalStageExecuted = this.stageExecuted(historicalLink.fsd4Run.stages, 'HISTORICAL');
      historicalStageStatus = this.stageStatus(historicalLink.fsd4Run.stages, 'HISTORICAL');
      historicalRows = await this.countEvidenceForRun(historicalLink.fsd4Run.id, 'HISTORICAL');
    } else if (historicalLink.kind === 'UNVERIFIED_LINK') {
      historicalLimitation = historicalLink.limitation;
    }

    return {
      contractVersion: VSI_MASTER_FSD_READ_CONTRACT_V1,
      organizationId,
      vehicleId,
      providerSourceLinkId,
      catalog,
      execution: {
        fsd3: {
          discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
          state: mapRunExecutionAvailability({
            status: latestActivity?.status ?? 'PENDING',
            invalidatedAt: latestActivity?.invalidatedAt ?? null,
            hasAnyRun: latestActivity != null,
          }),
          latestActivityRunId: latestActivity?.id ?? null,
          latestRunId: latestActivity?.id ?? null,
          lastCompletedAt: latestActivity?.completedAt?.toISOString() ?? null,
        },
        fsd4: {
          discoveryStream: 'FSD4_HISTORICAL',
          state: mapRunExecutionAvailability({
            status: fsd4Latest?.status ?? 'PENDING',
            invalidatedAt: fsd4Latest?.invalidatedAt ?? null,
            hasAnyRun: fsd4Latest != null,
          }),
          latestRunId: fsd4Latest?.id ?? null,
          lastCompletedAt: fsd4Latest?.completedAt?.toISOString() ?? null,
          historicalCrossStreamLink:
            historicalLink.kind === 'LINKED'
              ? 'LINKED'
              : historicalLink.kind === 'UNVERIFIED_LINK'
                ? 'UNVERIFIED_LINK'
                : 'NOT_AVAILABLE',
        },
      },
      evidence: {
        snapshot: mapEvidenceStageAvailability({
          stageExecuted: this.stageExecuted(authStages, 'SNAPSHOT'),
          stageStatus: this.stageStatus(authStages, 'SNAPSHOT'),
          rowCount: snapshotRows,
          declaredSignalCount: declaredForHistorical,
        }),
        historical: mapEvidenceStageAvailability({
          stageExecuted: historicalStageExecuted,
          stageStatus: historicalStageStatus,
          rowCount: historicalRows,
          declaredSignalCount: declaredForHistorical,
        }),
        historicalCrossStreamLimitation: historicalLimitation,
      },
      invalidation: {
        isInvalidated: authoritative?.run.invalidatedAt != null,
        invalidatedAt: authoritative?.run.invalidatedAt?.toISOString() ?? null,
        supersededByRunId: authoritative?.run.supersededByRunId ?? null,
      },
      vsiProfileCompositionHints: { organizationId, vehicleId, providerSourceLinkId },
    };
  }

  async getSignalExplorer(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    limit?: number;
    cursor?: string | null;
    runId?: string | null;
  }): Promise<MasterFsdSignalExplorerPageDtoV1> {
    await this.assertSourceLinkScope(input.organizationId, input.vehicleId, input.providerSourceLinkId);
    const limit = this.parseLimit(input.limit);
    const afterName = this.parseSignalCursor(input.cursor);

    let authoritativeRunId: string | null = null;
    let catalogAuthoritative = false;
    let declaredNames: readonly string[] = [];
    let catalogRun: FsdRunWithStages | null = null;
    let historicalLink: HistoricalCrossStreamLinkV1 = { kind: 'NOT_AVAILABLE' };

    if (input.runId) {
      const explicit = await this.prisma.fsdDiscoveryRun.findFirst({
        where: {
          id: input.runId,
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          providerSourceLinkId: input.providerSourceLinkId,
          discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
        },
        include: { stages: { orderBy: { stageType: 'asc' } } },
      });
      if (!explicit) throw new NotFoundException('FSD discovery run not found for authorized scope');
      const described = describeExplicitRunCatalog(explicit);
      catalogRun = explicit;
      authoritativeRunId = explicit.id;
      catalogAuthoritative = described.authoritative;
      declaredNames = described.authoritative ? described.declaredSignalNames : [];
    } else {
      const ctx = await this.loadScopedContext(input.organizationId, input.vehicleId, input.providerSourceLinkId);
      historicalLink = ctx.historicalLink;
      if (ctx.authoritative) {
        catalogRun = ctx.authoritative.run;
        authoritativeRunId = ctx.authoritative.run.id;
        catalogAuthoritative = true;
        declaredNames = ctx.authoritative.declaredSignalNames;
      }
    }

    if (!authoritativeRunId || declaredNames.length === 0) {
      return {
        contractVersion: VSI_MASTER_FSD_READ_CONTRACT_V1,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
        catalogRunId: authoritativeRunId,
        catalogAuthoritative,
        historicalLink: 'NOT_AVAILABLE',
        items: [],
        page: { limit, nextCursor: null, hasMore: false },
        aggregates: { declaredSignalCount: declaredNames.length || null, logicalSignalsReturned: 0 },
      };
    }

    if (input.runId && catalogRun) {
      const described = describeExplicitRunCatalog(catalogRun);
      historicalLink = resolveFsd4HistoricalCrossStreamLink({
        authoritative: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          providerSourceLinkId: input.providerSourceLinkId,
          dimoTokenId: catalogRun.dimoTokenId,
          connectionIdentityFingerprint: catalogRun.connectionIdentityFingerprint,
          declaredCatalogFingerprint: described.provenance?.declaredCatalogFingerprint ?? null,
        },
        fsd4RunsNewestFirst: await this.listRunsForStream(
          input.organizationId,
          input.vehicleId,
          input.providerSourceLinkId,
          'FSD4_HISTORICAL',
        ),
      });
    }

    const { pageNames, nextCursor, hasMore } = paginateSortedUniqueSignalNames({
      sortedNames: declaredNames,
      cursor: afterName,
      limit,
    });

    const runIds = [authoritativeRunId];
    if (historicalLink.kind === 'LINKED') runIds.push(historicalLink.fsd4Run.id);

    const rows = await this.prisma.fsdDiscoverySignalEvidence.findMany({
      where: {
        runId: { in: runIds },
        signalName: { in: [...pageNames] },
      },
      select: {
        signalName: true,
        declaredByProvider: true,
        schemaShape: true,
        evidenceState: true,
        queryPlanned: true,
        queryAccepted: true,
        observedValue: true,
        stageType: true,
        provenanceJson: true,
        qualityJson: true,
        runId: true,
      },
    });

    const bySignal = new Map<string, EvidenceRow[]>();
    for (const row of rows) {
      const list = bySignal.get(row.signalName) ?? [];
      list.push(row);
      bySignal.set(row.signalName, list);
    }

    const catalogStages = catalogRun?.stages ?? [];
    const snapshotExecuted = this.stageExecuted(catalogStages, 'SNAPSHOT');
    const historicalExecuted =
      historicalLink.kind === 'LINKED'
        ? this.stageExecuted(historicalLink.fsd4Run.stages, 'HISTORICAL')
        : false;
    const historicalUnverified = historicalLink.kind === 'UNVERIFIED_LINK';

    const items = pageNames.map((signalName) => {
      const group = bySignal.get(signalName) ?? [];
      const catalogRow = group.find((g) => g.runId === authoritativeRunId && g.stageType === 'CATALOG');
      const snapshotRow = group.find((g) => g.runId === authoritativeRunId && g.stageType === 'SNAPSHOT');
      const historicalRow =
        historicalLink.kind === 'LINKED'
          ? group.find((g) => g.runId === historicalLink.fsd4Run.id && g.stageType === 'HISTORICAL')
          : undefined;

      const presentation = catalogRow
        ? mapSignalPresentationState({ evidenceState: catalogRow.evidenceState, qualityJson: catalogRow.qualityJson })
        : 'DECLARED_ONLY';

      const snapshotState = snapshotRow
        ? mapSignalPresentationState({
            evidenceState: snapshotRow.evidenceState,
            qualityJson: snapshotRow.qualityJson,
          })
        : null;
      const historicalState = historicalRow
        ? mapSignalPresentationState({
            evidenceState: historicalRow.evidenceState,
            qualityJson: historicalRow.qualityJson,
          })
        : null;

      return {
        providerNativeSignalName: signalName,
        declaredByProvider: catalogRow?.declaredByProvider ?? true,
        schemaShape: catalogRow?.schemaShape ?? null,
        presentationState: presentation,
        catalogDeclared: true,
        snapshotEvidence: stageEvidenceColumnValue(snapshotExecuted, snapshotState) as import('./vsi-master-fsd-read.types').MasterFsdSignalExplorerItemV1['snapshotEvidence'],
        historicalEvidence: stageEvidenceColumnValue(historicalExecuted, historicalState, {
          unverifiedLink: historicalUnverified,
        }) as import('./vsi-master-fsd-read.types').MasterFsdHistoricalColumnV1,
        catalogQuery: extractStageQueryFlags(
          catalogRow ?? { queryPlanned: false, queryAccepted: null, observedValue: null },
        ),
        snapshotQuery: snapshotRow ? extractStageQueryFlags(snapshotRow) : null,
        historicalQuery: historicalRow ? extractStageQueryFlags(historicalRow) : null,
        coverageAggregate: null,
        sourceRunId: authoritativeRunId,
        provenanceReference: catalogAuthoritative ? 'AUTHORITATIVE_CATALOG_RUN' : 'UNVERIFIED_CATALOG_RUN',
      };
    });

    return {
      contractVersion: VSI_MASTER_FSD_READ_CONTRACT_V1,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
      catalogRunId: authoritativeRunId,
      catalogAuthoritative,
      historicalLink:
        historicalLink.kind === 'LINKED'
          ? 'LINKED'
          : historicalLink.kind === 'UNVERIFIED_LINK'
            ? 'UNVERIFIED_LINK'
            : 'NOT_AVAILABLE',
      items,
      page: { limit, nextCursor, hasMore },
      aggregates: {
        declaredSignalCount: declaredNames.length,
        logicalSignalsReturned: items.length,
      },
    };
  }

  async getRunHistory(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    limit?: number;
    cursor?: string | null;
  }): Promise<MasterFsdRunHistoryPageDtoV1> {
    await this.assertSourceLinkScope(input.organizationId, input.vehicleId, input.providerSourceLinkId);
    const limit = this.parseLimit(input.limit);
    const cursor = this.parseRunHistoryCursor(input.cursor);

    const runs = await this.prisma.fsdDiscoveryRun.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { stages: { orderBy: { stageType: 'asc' } } },
    });

    const pageRuns = runs.slice(0, limit);
    const hasMore = runs.length > limit;
    const evidenceCounts = await this.batchEvidenceCounts(pageRuns.map((r) => r.id));

    const items = pageRuns.map((run) => {
      const counts = evidenceCounts.get(run.id) ?? { snapshot: 0, historical: 0 };
      const ledgerAgg = aggregateLedgersFromStages(
        run.stages.map((s) => ({ stageType: s.stageType, checkpointJson: s.checkpointJson })),
      );
      const diagnosticCodes: string[] = [];
      if (run.status === 'IN_PROGRESS') diagnosticCodes.push('RUN_IN_PROGRESS');
      if (run.invalidatedAt) diagnosticCodes.push('RUN_INVALIDATED');
      for (const s of run.stages) {
        if (s.status === 'UNKNOWN_OUTCOME') diagnosticCodes.push(`STAGE_UNKNOWN_OUTCOME_${s.stageType}`);
      }
      if (ledgerAgg?.malformedCheckpointStages.length) {
        diagnosticCodes.push('MALFORMED_CHECKPOINT_LEDGER');
      }

      return {
        runId: run.id,
        discoveryStream: run.discoveryStream,
        status: run.status,
        providerSourceLinkId: run.providerSourceLinkId,
        createdAt: run.createdAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
        invalidatedAt: run.invalidatedAt?.toISOString() ?? null,
        supersededByRunId: run.supersededByRunId,
        stages: run.stages.map((s) => ({ stageType: s.stageType, status: s.status })),
        catalogSignalCount: this.catalogSignalCountFromStages(run.stages),
        evidenceCounts: {
          snapshotRows: this.stageExecuted(run.stages, 'SNAPSHOT') ? counts.snapshot : null,
          historicalRows: this.stageExecuted(run.stages, 'HISTORICAL') ? counts.historical : null,
        },
        ledgerSummary: {
          persistedAttemptCount: ledgerAgg?.ledgerAttemptCount ?? null,
          budgetTotal: ledgerAgg?.budgetTotal ?? null,
          outcomeCounts: ledgerAgg?.ledgerOutcomes ?? null,
          note: 'Ledger counts are persisted in-run bookkeeping; not an exact external network request count.',
        },
        failureClass: run.failureClass,
        diagnosticCodes,
      };
    });

    const last = pageRuns[pageRuns.length - 1];
    return {
      contractVersion: VSI_MASTER_FSD_READ_CONTRACT_V1,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
      items,
      page: {
        limit,
        nextCursor: hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
        hasMore,
      },
    };
  }

  async getRunInspector(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    runId: string;
  }): Promise<MasterFsdRunInspectorDtoV1> {
    await this.assertSourceLinkScope(input.organizationId, input.vehicleId, input.providerSourceLinkId);

    const run = await this.prisma.fsdDiscoveryRun.findFirst({
      where: {
        id: input.runId,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
      },
      include: { stages: { orderBy: { stageType: 'asc' } } },
    });
    if (!run) throw new NotFoundException('FSD discovery run not found for authorized scope');

    const described = describeExplicitRunCatalog(run);
    const catalogProvenance = described.provenance ?? {
      availability: 'NOT_AVAILABLE' as const,
      provenanceClass: 'UNVERIFIED' as const,
      declaredSignalCount: null,
      declaredCatalogFingerprint: null,
      authoritativeRunId: null,
      rejectionReason: run.discoveryStream !== 'FSD3_CATALOG_SNAPSHOT' ? 'NOT_FSD3_STREAM' : 'CATALOG_STAGE_NOT_SUCCEEDED',
    };

    const ledgerAgg = aggregateLedgersFromStages(
      run.stages.map((s) => ({ stageType: s.stageType, checkpointJson: s.checkpointJson })),
    );

    const snapshotRows = await this.countEvidenceForRun(run.id, 'SNAPSHOT');
    const historicalRows = await this.countEvidenceForRun(run.id, 'HISTORICAL');
    const declaredCount = this.catalogSignalCountFromStages(run.stages);

    let observationCounts: MasterFsdRunInspectorDtoV1['evidenceCoverage']['observationCounts'] = null;
    if (this.stageExecuted(run.stages, 'SNAPSHOT')) {
      const evidenceRows = await this.prisma.fsdDiscoverySignalEvidence.findMany({
        where: { runId: run.id, stageType: 'SNAPSHOT' },
        select: { evidenceState: true, qualityJson: true },
      });
      if (evidenceRows.length > 0) {
        const counts = {
          observed: 0,
          nullObserved: 0,
          deferred: 0,
          queryFailed: 0,
          absent: 0,
          other: 0,
          total: 0,
        };
        for (const row of evidenceRows) {
          counts.total += 1;
          const state = mapSignalPresentationState({
            evidenceState: row.evidenceState,
            qualityJson: row.qualityJson,
          });
          if (state === 'QUERY_FAILED') counts.queryFailed += 1;
          else if (state === 'DEFERRED') counts.deferred += 1;
          else if (state === 'MISSING') counts.absent += 1;
          else if (state === 'NULL_OBSERVED') counts.nullObserved += 1;
          else if (state === 'OBSERVED') counts.observed += 1;
          else counts.other += 1;
        }
        observationCounts = counts;
      }
    }

    return {
      contractVersion: VSI_MASTER_FSD_READ_CONTRACT_V1,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
      runId: run.id,
      discoveryStream: run.discoveryStream,
      status: run.status,
      stages: run.stages.map((s) => ({
        stageType: s.stageType,
        status: s.status,
        version: s.version,
        lastHttpStatus: s.lastHttpStatus,
      })),
      catalogProvenance: {
        class: catalogProvenance.provenanceClass,
        declaredSignalCount: catalogProvenance.declaredSignalCount,
        authoritative: catalogProvenance.availability === 'AUTHORITATIVE_LIVE',
        rejectionReason: catalogProvenance.rejectionReason,
      },
      ledger: {
        budgetTotal: ledgerAgg?.budgetTotal ?? null,
        budgetByStage: ledgerAgg?.budgetByStage ?? {},
        persistedAttemptCount: ledgerAgg?.ledgerAttemptCount ?? null,
        deduplicatedAttemptKeys: ledgerAgg?.deduplicatedAttemptKeys ?? null,
        outcomeCounts: ledgerAgg?.ledgerOutcomes ?? null,
        malformedCheckpointStages: ledgerAgg?.malformedCheckpointStages ?? [],
        reconciliationNote:
          'Persisted ledger rows distinguish RESERVED vs DISPATCHED vs settled outcomes; counts are not exact provider HTTP call totals.',
        attempts: ledgerAgg?.safeAttempts ?? [],
      },
      evidenceCoverage: {
        snapshot: mapEvidenceStageAvailability({
          stageExecuted: this.stageExecuted(run.stages, 'SNAPSHOT'),
          stageStatus: this.stageStatus(run.stages, 'SNAPSHOT'),
          rowCount: snapshotRows,
          declaredSignalCount: declaredCount,
        }),
        historical: mapEvidenceStageAvailability({
          stageExecuted: this.stageExecuted(run.stages, 'HISTORICAL'),
          stageStatus: this.stageStatus(run.stages, 'HISTORICAL'),
          rowCount: historicalRows,
          declaredSignalCount: declaredCount,
        }),
        observationCounts,
      },
      cadence: {
        nativePollingFrequencyProven: false,
        note: 'Polling cadence remains unknown unless separately proven by VSI profile evidence; provider fetch timestamps are not signal measurements.',
      },
      aggregationSemantics: {
        aggregated1sIsProvenNative1Hz: false,
        note: 'FSD4 AGGREGATED_1S MUST NOT be presented as proven native 1Hz telemetry.',
      },
    };
  }
}
