import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FsdDiscoveryStream, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { parsePersistedCatalogCheckpointV1 } from '@modules/vehicle-intelligence/fsd-integration/ops/p6d/fsd-p6d-catalog-provenance-authority.v1';
import { aggregateLedgersFromStages } from './vsi-master-fsd-read.ledger';
import { resolvePersistedCatalogProvenanceReadV1 } from './vsi-master-fsd-read.provenance';
import {
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

@Injectable()
export class VsiMasterFsdReadService {
  constructor(private readonly prisma: PrismaService) {}

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
      where: {
        id: providerSourceLinkId,
        vehicleId,
        vehicle: { organizationId },
      },
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

  private parseRunHistoryCursor(cursor: string | null | undefined): { createdAt: Date; id: string } | null {
    if (!cursor?.trim()) return null;
    const sep = cursor.indexOf('|');
    if (sep <= 0) throw new BadRequestException('Invalid run history cursor');
    const createdAt = new Date(cursor.slice(0, sep));
    const id = cursor.slice(sep + 1);
    if (Number.isNaN(createdAt.getTime()) || !id) {
      throw new BadRequestException('Invalid run history cursor');
    }
    return { createdAt, id };
  }

  private parseSignalCursor(cursor: string | null | undefined): string | null {
    if (!cursor?.trim()) return null;
    if (cursor.length > 256) throw new BadRequestException('Invalid signal cursor');
    return cursor;
  }

  private async latestRunForStream(
    organizationId: string,
    vehicleId: string,
    providerSourceLinkId: string,
    discoveryStream: FsdDiscoveryStream,
  ) {
    return this.prisma.fsdDiscoveryRun.findFirst({
      where: { organizationId, vehicleId, providerSourceLinkId, discoveryStream },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        stages: { orderBy: { stageType: 'asc' } },
      },
    });
  }

  private catalogSignalCountFromStages(
    stages: Array<{ stageType: string; status: string; checkpointJson: unknown }>,
  ): number | null {
    const catalog = stages.find((s) => s.stageType === 'CATALOG' && s.status === 'SUCCEEDED');
    if (!catalog) return null;
    const cp = parsePersistedCatalogCheckpointV1(catalog.checkpointJson);
    const names = cp?.catalogFetch?.availableSignalNames;
    return names ? names.length : null;
  }

  private stageExecuted(stages: Array<{ stageType: string; status: string }>, stageType: string): boolean {
    const row = stages.find((s) => s.stageType === stageType);
    return row != null && row.status === 'SUCCEEDED';
  }

  async getSummary(
    organizationId: string,
    vehicleId: string,
    providerSourceLinkId: string,
  ): Promise<MasterFsdSummaryDtoV1> {
    await this.assertSourceLinkScope(organizationId, vehicleId, providerSourceLinkId);

    const fsd3 = await this.latestRunForStream(
      organizationId,
      vehicleId,
      providerSourceLinkId,
      'FSD3_CATALOG_SNAPSHOT',
    );
    const fsd4 = await this.latestRunForStream(
      organizationId,
      vehicleId,
      providerSourceLinkId,
      'FSD4_HISTORICAL',
    );

    let catalog = {
      availability: 'NOT_AVAILABLE' as MasterFsdSummaryDtoV1['catalog']['availability'],
      provenanceClass: 'UNVERIFIED' as MasterFsdSummaryDtoV1['catalog']['provenanceClass'],
      declaredSignalCount: null as number | null,
      authoritativeRunId: null as string | null,
      declaredCatalogFingerprint: null as string | null,
      rejectionReason: null as string | null,
    };

    if (fsd3?.stages.length) {
      const catalogStage = fsd3.stages.find((s) => s.stageType === 'CATALOG');
      const checkpoint = catalogStage
        ? parsePersistedCatalogCheckpointV1(catalogStage.checkpointJson)
        : null;
      if (checkpoint && catalogStage?.status === 'SUCCEEDED') {
        const resolved = resolvePersistedCatalogProvenanceReadV1({
          runId: fsd3.id,
          runKey: fsd3.runKey,
          organizationId: fsd3.organizationId,
          vehicleId: fsd3.vehicleId,
          providerSourceLinkId: fsd3.providerSourceLinkId,
          dimoTokenId: fsd3.dimoTokenId,
          connectionIdentityFingerprint: fsd3.connectionIdentityFingerprint,
          invalidatedAt: fsd3.invalidatedAt,
          checkpoint,
          stageHttpStatus: catalogStage.lastHttpStatus,
        });
        catalog = {
          availability: resolved.availability,
          provenanceClass: resolved.provenanceClass,
          declaredSignalCount: resolved.declaredSignalCount,
          authoritativeRunId: resolved.authoritativeRunId,
          declaredCatalogFingerprint: resolved.declaredCatalogFingerprint,
          rejectionReason: resolved.rejectionReason,
        };
      } else if (fsd3.status === 'COMPLETED') {
        catalog = {
          availability: 'CATALOG_PENDING',
          provenanceClass: 'UNVERIFIED',
          declaredSignalCount: null,
          authoritativeRunId: fsd3.id,
          declaredCatalogFingerprint: null,
          rejectionReason: 'CATALOG_STAGE_NOT_SUCCEEDED',
        };
      }
    }

    const stages3 = fsd3?.stages ?? [];
    const stages4 = fsd4?.stages ?? [];

    const snapshotRows = fsd3
      ? await this.prisma.fsdDiscoverySignalEvidence.count({
          where: { runId: fsd3.id, stageType: 'SNAPSHOT' },
        })
      : 0;
    const historicalRows = fsd4
      ? await this.prisma.fsdDiscoverySignalEvidence.count({
          where: { runId: fsd4.id, stageType: 'HISTORICAL' },
        })
      : fsd3
        ? await this.prisma.fsdDiscoverySignalEvidence.count({
            where: { runId: fsd3.id, stageType: 'HISTORICAL' },
          })
        : 0;

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
            status: fsd3?.status ?? 'PENDING',
            invalidatedAt: fsd3?.invalidatedAt ?? null,
            hasAnyRun: fsd3 != null,
          }),
          latestRunId: fsd3?.id ?? null,
          lastCompletedAt: fsd3?.completedAt?.toISOString() ?? null,
        },
        fsd4: {
          discoveryStream: 'FSD4_HISTORICAL',
          state: mapRunExecutionAvailability({
            status: fsd4?.status ?? 'PENDING',
            invalidatedAt: fsd4?.invalidatedAt ?? null,
            hasAnyRun: fsd4 != null,
          }),
          latestRunId: fsd4?.id ?? null,
          lastCompletedAt: fsd4?.completedAt?.toISOString() ?? null,
        },
      },
      evidence: {
        snapshot: mapEvidenceStageAvailability({
          stageExecuted: this.stageExecuted(stages3, 'SNAPSHOT'),
          rowCount: snapshotRows,
        }),
        historical: mapEvidenceStageAvailability({
          stageExecuted: this.stageExecuted(stages4, 'HISTORICAL') || this.stageExecuted(stages3, 'HISTORICAL'),
          rowCount: historicalRows,
        }),
      },
      invalidation: {
        isInvalidated: fsd3?.invalidatedAt != null,
        invalidatedAt: fsd3?.invalidatedAt?.toISOString() ?? null,
        supersededByRunId: fsd3?.supersededByRunId ?? null,
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

    let catalogRun = input.runId
      ? await this.prisma.fsdDiscoveryRun.findFirst({
          where: {
            id: input.runId,
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            providerSourceLinkId: input.providerSourceLinkId,
          },
        })
      : await this.latestRunForStream(
          input.organizationId,
          input.vehicleId,
          input.providerSourceLinkId,
          'FSD3_CATALOG_SNAPSHOT',
        );

    if (input.runId && !catalogRun) {
      throw new NotFoundException('FSD discovery run not found for authorized scope');
    }

    const catalogRunId = catalogRun?.id ?? null;
    if (!catalogRunId) {
      return {
        contractVersion: VSI_MASTER_FSD_READ_CONTRACT_V1,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
        catalogRunId: null,
        items: [],
        page: { limit, nextCursor: null, hasMore: false },
        aggregates: { declaredSignalCount: null, rowsReturned: 0 },
      };
    }

    const stages = await this.prisma.fsdDiscoveryStage.findMany({
      where: { runId: catalogRunId },
      select: { stageType: true, status: true },
    });
    const snapshotExecuted = this.stageExecuted(stages, 'SNAPSHOT');
    const historicalExecuted = this.stageExecuted(stages, 'HISTORICAL');

    const where: Prisma.FsdDiscoverySignalEvidenceWhereInput = {
      runId: catalogRunId,
      ...(afterName ? { signalName: { gt: afterName } } : {}),
    };

    const rows = await this.prisma.fsdDiscoverySignalEvidence.findMany({
      where,
      orderBy: { signalName: 'asc' },
      take: limit + 1,
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

    const pageRows = rows.slice(0, limit);
    const hasMore = rows.length > limit;

    const bySignal = new Map<string, (typeof pageRows)[number][]>();
    for (const row of pageRows) {
      const list = bySignal.get(row.signalName) ?? [];
      list.push(row);
      bySignal.set(row.signalName, list);
    }

    const items = [...bySignal.entries()].map(([signalName, group]) => {
      const catalogRow = group.find((g) => g.stageType === 'CATALOG') ?? group[0]!;
      const snapshotRow = group.find((g) => g.stageType === 'SNAPSHOT');
      const historicalRow = group.find((g) => g.stageType === 'HISTORICAL');
      const presentation = mapSignalPresentationState({
        evidenceState: catalogRow.evidenceState,
        qualityJson: catalogRow.qualityJson,
      });
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

      const provRef =
        catalogRow.provenanceJson &&
        typeof catalogRow.provenanceJson === 'object' &&
        'declaredCatalogFingerprint' in (catalogRow.provenanceJson as object)
          ? 'DECLARED_CATALOG_FINGERPRINT'
          : 'PERSISTED_EVIDENCE_ROW';

      return {
        providerNativeSignalName: signalName,
        declaredByProvider: catalogRow.declaredByProvider,
        schemaShape: catalogRow.schemaShape,
        presentationState: presentation,
        catalogDeclared: catalogRow.declaredByProvider,
        snapshotEvidence: stageEvidenceColumnValue(snapshotExecuted, snapshotState),
        historicalEvidence: stageEvidenceColumnValue(historicalExecuted, historicalState),
        queryPlanned: catalogRow.queryPlanned,
        queryAccepted: catalogRow.queryAccepted,
        observedValue: catalogRow.observedValue,
        coverageAggregate: null,
        sourceRunId: catalogRow.runId,
        provenanceReference: provRef,
      };
    });

    const declaredCount = this.catalogSignalCountFromStages(
      await this.prisma.fsdDiscoveryStage.findMany({
        where: { runId: catalogRunId, stageType: 'CATALOG', status: 'SUCCEEDED' },
        select: { stageType: true, status: true, checkpointJson: true },
      }),
    );

    return {
      contractVersion: VSI_MASTER_FSD_READ_CONTRACT_V1,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
      catalogRunId,
      items,
      page: {
        limit,
        nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.providerNativeSignalName : null,
        hasMore,
      },
      aggregates: {
        declaredSignalCount: declaredCount,
        rowsReturned: items.length,
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
      include: {
        stages: { orderBy: { stageType: 'asc' } },
      },
    });

    const pageRuns = runs.slice(0, limit);
    const hasMore = runs.length > limit;

    const items = await Promise.all(
      pageRuns.map(async (run) => {
        const snapshotRows = await this.prisma.fsdDiscoverySignalEvidence.count({
          where: { runId: run.id, stageType: 'SNAPSHOT' },
        });
        const historicalRows = await this.prisma.fsdDiscoverySignalEvidence.count({
          where: { runId: run.id, stageType: 'HISTORICAL' },
        });
        const ledgerAgg = aggregateLedgersFromStages(
          run.stages.map((s) => ({
            stageType: s.stageType,
            checkpointJson: s.checkpointJson,
          })),
        );
        const diagnosticCodes: string[] = [];
        if (run.status === 'IN_PROGRESS') diagnosticCodes.push('RUN_IN_PROGRESS');
        if (run.invalidatedAt) diagnosticCodes.push('RUN_INVALIDATED');
        for (const s of run.stages) {
          if (s.status === 'UNKNOWN_OUTCOME') diagnosticCodes.push(`STAGE_UNKNOWN_OUTCOME_${s.stageType}`);
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
            snapshotRows: this.stageExecuted(run.stages, 'SNAPSHOT') ? snapshotRows : null,
            historicalRows: this.stageExecuted(run.stages, 'HISTORICAL') ? historicalRows : null,
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
      }),
    );

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
    if (!run) {
      throw new NotFoundException('FSD discovery run not found for authorized scope');
    }

    const catalogStage = run.stages.find((s) => s.stageType === 'CATALOG');
    const checkpoint = catalogStage ? parsePersistedCatalogCheckpointV1(catalogStage.checkpointJson) : null;
    const catalogProvenance =
      checkpoint && catalogStage?.status === 'SUCCEEDED'
        ? resolvePersistedCatalogProvenanceReadV1({
            runId: run.id,
            runKey: run.runKey,
            organizationId: run.organizationId,
            vehicleId: run.vehicleId,
            providerSourceLinkId: run.providerSourceLinkId,
            dimoTokenId: run.dimoTokenId,
            connectionIdentityFingerprint: run.connectionIdentityFingerprint,
            invalidatedAt: run.invalidatedAt,
            checkpoint,
            stageHttpStatus: catalogStage.lastHttpStatus,
          })
        : {
            availability: 'NOT_AVAILABLE' as const,
            provenanceClass: 'UNVERIFIED' as const,
            declaredSignalCount: null,
            declaredCatalogFingerprint: null,
            authoritativeRunId: null,
            rejectionReason: 'CATALOG_STAGE_NOT_SUCCEEDED',
          };

    const ledgerAgg = aggregateLedgersFromStages(
      run.stages.map((s) => ({ stageType: s.stageType, checkpointJson: s.checkpointJson })),
    );

    const evidenceRows = await this.prisma.fsdDiscoverySignalEvidence.findMany({
      where: { runId: run.id, stageType: 'SNAPSHOT' },
      select: { evidenceState: true, qualityJson: true },
    });
    let observationCounts: MasterFsdRunInspectorDtoV1['evidenceCoverage']['observationCounts'] = null;
    if (evidenceRows.length > 0 && this.stageExecuted(run.stages, 'SNAPSHOT')) {
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

    const snapshotRows = await this.prisma.fsdDiscoverySignalEvidence.count({
      where: { runId: run.id, stageType: 'SNAPSHOT' },
    });
    const historicalRows = await this.prisma.fsdDiscoverySignalEvidence.count({
      where: { runId: run.id, stageType: 'HISTORICAL' },
    });

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
        persistedAttemptCount: ledgerAgg?.ledgerAttemptCount ?? null,
        deduplicatedAttemptKeys: ledgerAgg?.deduplicatedAttemptKeys ?? null,
        outcomeCounts: ledgerAgg?.ledgerOutcomes ?? null,
        reconciliationNote:
          'Persisted ledger attempt count reconciles in-run reserved/dispatched records; not labeled as exact provider HTTP call count.',
        attempts: ledgerAgg?.safeAttempts ?? [],
      },
      evidenceCoverage: {
        snapshot: mapEvidenceStageAvailability({
          stageExecuted: this.stageExecuted(run.stages, 'SNAPSHOT'),
          rowCount: snapshotRows,
        }),
        historical: mapEvidenceStageAvailability({
          stageExecuted: this.stageExecuted(run.stages, 'HISTORICAL'),
          rowCount: historicalRows,
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
