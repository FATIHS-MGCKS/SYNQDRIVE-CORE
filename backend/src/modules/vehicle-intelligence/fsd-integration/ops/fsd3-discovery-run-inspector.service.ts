import { Injectable } from '@nestjs/common';
import { UserPlatformRole } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { FsdDiscoveryPersistenceRepository } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import type { Fsd3RequestLedgerV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-request-ledger.v1';

export type Fsd3DiscoveryRunInspectorInputV1 = {
  actorUserId: string;
  organizationId: string;
  runId: string;
};

export type Fsd3DiscoveryRunInspectorReportV1 = {
  runId: string;
  discoveryStream: string;
  status: string;
  version: number;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  invalidatedAt: string | null;
  stages: Array<{ stageType: string; status: string; version: number }>;
  ledgerAttemptCount: number | null;
  ledgerOutcomes: Record<string, number> | null;
  ledgerReconciliation: {
    catalogAttempts: number;
    snapshotAttempts: number;
    totalAttempts: number;
    deduplicatedAttemptKeys: number;
    outcomeSum: number;
  } | null;
  catalogSignalCount: number | null;
  signalObservationCounts: {
    observed: number;
    null: number;
    deferred: number;
    queryFailed: number;
    absent: number;
    other: number;
    total: number;
  } | null;
  unknownOutcomeStages: string[];
  strandedInProgress: boolean;
};

function parseLedgerFromCheckpoint(checkpoint: unknown): Fsd3RequestLedgerV1 | null {
  if (!checkpoint || typeof checkpoint !== 'object') {
    return null;
  }
  const cp = checkpoint as { requestLedger?: Fsd3RequestLedgerV1 };
  return cp.requestLedger ?? null;
}

function aggregateLedgersFromStages(stages: Array<{ stageType: string; checkpointJson: unknown }>): {
  ledgerOutcomes: Record<string, number>;
  ledgerAttemptCount: number;
  ledgerReconciliation: NonNullable<Fsd3DiscoveryRunInspectorReportV1['ledgerReconciliation']>;
} | null {
  const attemptKeys = new Set<string>();
  const ledgerOutcomes: Record<string, number> = {};
  let catalogAttempts = 0;
  let snapshotAttempts = 0;
  let totalAttempts = 0;

  for (const stage of stages) {
    const ledger = parseLedgerFromCheckpoint(stage.checkpointJson);
    if (!ledger) {
      continue;
    }
    for (const attempt of ledger.attempts) {
      const dedupeKey = `${stage.stageType}|${attempt.attemptKey}|${attempt.queryFingerprint}`;
      if (attemptKeys.has(dedupeKey)) {
        continue;
      }
      attemptKeys.add(dedupeKey);
      totalAttempts += 1;
      ledgerOutcomes[attempt.outcome] = (ledgerOutcomes[attempt.outcome] ?? 0) + 1;
      if (stage.stageType === 'CATALOG') {
        catalogAttempts += 1;
      }
      if (stage.stageType === 'SNAPSHOT') {
        snapshotAttempts += 1;
      }
    }
  }

  if (totalAttempts === 0 && attemptKeys.size === 0) {
    return null;
  }

  const outcomeSum = Object.values(ledgerOutcomes).reduce((a, b) => a + b, 0);
  return {
    ledgerOutcomes,
    ledgerAttemptCount: totalAttempts,
    ledgerReconciliation: {
      catalogAttempts,
      snapshotAttempts,
      totalAttempts,
      deduplicatedAttemptKeys: attemptKeys.size,
      outcomeSum,
    },
  };
}

@Injectable()
export class Fsd3DiscoveryRunInspectorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly persistence: FsdDiscoveryPersistenceRepository,
  ) {}

  async assertInspectorPrincipal(actorUserId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, platformRole: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new Error('INSPECTOR_FORBIDDEN');
    }
    if (user.platformRole !== UserPlatformRole.MASTER_ADMIN) {
      throw new Error('INSPECTOR_FORBIDDEN');
    }
  }

  async inspectTenantScoped(input: Fsd3DiscoveryRunInspectorInputV1): Promise<Fsd3DiscoveryRunInspectorReportV1> {
    await this.assertInspectorPrincipal(input.actorUserId);

    const run = await this.prisma.fsdDiscoveryRun.findFirst({
      where: { id: input.runId, organizationId: input.organizationId },
      include: { stages: { orderBy: { stageType: 'asc' } } },
    });
    if (!run) {
      throw new Error('RUN_NOT_FOUND');
    }

    const bundle = await this.persistence.loadRunOrchestrationBundle({
      scope: {
        organizationId: run.organizationId,
        vehicleId: run.vehicleId,
        providerSourceLinkId: run.providerSourceLinkId,
      },
      runId: run.id,
    });

    let ledgerAttemptCount: number | null = null;
    let ledgerOutcomes: Record<string, number> | null = null;
    let ledgerReconciliation: Fsd3DiscoveryRunInspectorReportV1['ledgerReconciliation'] = null;
    let catalogSignalCount: number | null = null;

    const aggregated =
      bundle?.stages?.length ?
        aggregateLedgersFromStages(
          bundle.stages.map((s) => ({
            stageType: s.stageType,
            checkpointJson: s.checkpointJson,
          })),
        )
      : null;
    if (aggregated) {
      ledgerAttemptCount = aggregated.ledgerAttemptCount;
      ledgerOutcomes = aggregated.ledgerOutcomes;
      ledgerReconciliation = aggregated.ledgerReconciliation;
    }

    const catalogStage = bundle?.stages.find((s) => s.stageType === 'CATALOG');
    if (catalogStage?.checkpointJson) {
      const cat = (catalogStage.checkpointJson as { catalogFetch?: { availableSignalNames?: string[] } })
        .catalogFetch;
      if (cat?.availableSignalNames) {
        catalogSignalCount = cat.availableSignalNames.length;
      }
    }

    const evidenceRows = await this.prisma.fsdDiscoverySignalEvidence.findMany({
      where: { runId: run.id, stageType: 'SNAPSHOT' },
      select: { evidenceState: true, qualityJson: true },
    });
    let signalObservationCounts: Fsd3DiscoveryRunInspectorReportV1['signalObservationCounts'] = null;
    if (evidenceRows.length > 0) {
      const counts = { observed: 0, null: 0, deferred: 0, queryFailed: 0, absent: 0, other: 0, total: 0 };
      for (const row of evidenceRows) {
        counts.total += 1;
        const state = row.evidenceState;
        const kind = (row.qualityJson as { observationKind?: string } | null)?.observationKind;
        if (state === 'QUERY_FAILED') {
          counts.queryFailed += 1;
          continue;
        }
        if (state === 'DEFERRED') {
          counts.deferred += 1;
          continue;
        }
        if (kind === 'ABSENT') {
          counts.absent += 1;
          continue;
        }
        if (kind === 'NULL') {
          counts.null += 1;
          continue;
        }
        if (
          state === 'OBSERVED' ||
          kind === 'VALID_NONZERO' ||
          kind === 'VALID_ZERO' ||
          kind === 'OBSERVED'
        ) {
          counts.observed += 1;
          continue;
        }
        counts.other += 1;
      }
      signalObservationCounts = counts;
    }

    const unknownOutcomeStages =
      bundle?.stages.filter((s) => s.status === 'UNKNOWN_OUTCOME').map((s) => s.stageType) ?? [];

    const now = Date.now();
    const strandedInProgress =
      run.status === 'IN_PROGRESS' &&
      (run.leaseExpiresAt == null || run.leaseExpiresAt.getTime() < now);

    return {
      runId: run.id,
      discoveryStream: run.discoveryStream,
      status: run.status,
      version: run.version,
      leaseOwner: run.leaseOwner,
      leaseExpiresAt: run.leaseExpiresAt?.toISOString() ?? null,
      invalidatedAt: run.invalidatedAt?.toISOString() ?? null,
      stages: (bundle?.stages ?? []).map((s) => ({
        stageType: s.stageType,
        status: s.status,
        version: s.version,
      })),
      ledgerAttemptCount,
      ledgerOutcomes,
      ledgerReconciliation,
      catalogSignalCount,
      signalObservationCounts,
      unknownOutcomeStages,
      strandedInProgress,
    };
  }
}
