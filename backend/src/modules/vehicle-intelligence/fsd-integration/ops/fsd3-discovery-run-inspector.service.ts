import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { FsdDiscoveryPersistenceRepository } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import type { Fsd3RequestLedgerV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-request-ledger.v1';

export type Fsd3DiscoveryRunInspectorInputV1 = {
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
  catalogSignalCount: number | null;
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

@Injectable()
export class Fsd3DiscoveryRunInspectorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly persistence: FsdDiscoveryPersistenceRepository,
  ) {}

  async inspectTenantScoped(input: Fsd3DiscoveryRunInspectorInputV1): Promise<Fsd3DiscoveryRunInspectorReportV1> {
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
    let catalogSignalCount: number | null = null;

    const catalogStage = bundle?.stages.find((s) => s.stageType === 'CATALOG');
    if (catalogStage?.checkpointJson) {
      const ledger = parseLedgerFromCheckpoint(catalogStage.checkpointJson);
      if (ledger) {
        ledgerAttemptCount = ledger.attempts.length;
        ledgerOutcomes = {};
        for (const a of ledger.attempts) {
          ledgerOutcomes[a.outcome] = (ledgerOutcomes[a.outcome] ?? 0) + 1;
        }
        const cat = (catalogStage.checkpointJson as { catalogFetch?: { availableSignalNames?: string[] } })
          .catalogFetch;
        if (cat?.availableSignalNames) {
          catalogSignalCount = cat.availableSignalNames.length;
        }
      }
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
      catalogSignalCount,
      unknownOutcomeStages,
      strandedInProgress,
    };
  }
}
