import type { PrismaService } from '@shared/database/prisma.service';
import { buildFsd3DiscoveryRequestRunKeyV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-discovery-request.v1';
import {
  FSD3_CATALOG_ATTEMPT_KEY_V1,
  findFsd3AttemptByAttemptKey,
  type Fsd3CatalogStageCheckpointV1,
} from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-request-ledger.v1';
import { parsePersistedCatalogCheckpointV1 } from './fsd-p6d-catalog-provenance-authority.v1';

export type FsdP6dCatalogPrepLedgerSnapshotV1 = {
  runId: string;
  catalogAttemptSucceeded: boolean;
  catalogAttemptReservedAt: string | null;
};

export async function readFsdP6dCatalogPrepLedgerSnapshotV1(input: {
  prisma: PrismaService;
  organizationId: string;
  connectionIdentityFingerprint: string;
  catalogPrepDiscoveryRequestKey: string;
}): Promise<FsdP6dCatalogPrepLedgerSnapshotV1 | null> {
  const runKey = buildFsd3DiscoveryRequestRunKeyV1({
    discoveryRequestKey: input.catalogPrepDiscoveryRequestKey,
    connectionIdentityFingerprint: input.connectionIdentityFingerprint,
  });
  const run = await input.prisma.fsdDiscoveryRun.findFirst({
    where: {
      organizationId: input.organizationId,
      runKey,
      invalidatedAt: null,
    },
    include: {
      stages: { where: { stageType: 'CATALOG' }, take: 1 },
    },
  });
  if (!run?.stages[0]) {
    return null;
  }
  const checkpoint = parsePersistedCatalogCheckpointV1(run.stages[0].checkpointJson);
  if (!checkpoint) {
    return { runId: run.id, catalogAttemptSucceeded: false, catalogAttemptReservedAt: null };
  }
  const attempt = findFsd3AttemptByAttemptKey(checkpoint.requestLedger, FSD3_CATALOG_ATTEMPT_KEY_V1);
  const catalogAttemptSucceeded =
    attempt?.outcome === 'SUCCEEDED' && checkpoint.catalogFetch?.succeeded === true;
  return {
    runId: run.id,
    catalogAttemptSucceeded,
    catalogAttemptReservedAt: attempt?.reservedAt ?? null,
  };
}

export function deriveFsdP6dCatalogLedgerReplayV1(input: {
  ledgerBefore: FsdP6dCatalogPrepLedgerSnapshotV1 | null;
  persistedRunId: string;
  checkpoint: Fsd3CatalogStageCheckpointV1;
}): { ledgerReplayed: boolean; providerDispatchConsumed: boolean } {
  const attempt = findFsd3AttemptByAttemptKey(input.checkpoint.requestLedger, FSD3_CATALOG_ATTEMPT_KEY_V1);
  const catalogSettled =
    attempt?.outcome === 'SUCCEEDED' && input.checkpoint.catalogFetch?.succeeded === true;

  const ledgerReplayed =
    input.ledgerBefore != null &&
    input.ledgerBefore.catalogAttemptSucceeded &&
    input.ledgerBefore.runId === input.persistedRunId &&
    catalogSettled;

  const providerDispatchConsumed = catalogSettled && !ledgerReplayed;
  return { ledgerReplayed, providerDispatchConsumed };
}
