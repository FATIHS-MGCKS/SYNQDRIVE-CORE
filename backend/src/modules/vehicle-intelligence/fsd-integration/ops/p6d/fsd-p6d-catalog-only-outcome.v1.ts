import type { PrismaService } from '@shared/database/prisma.service';
import { FSD3_CATALOG_ATTEMPT_KEY_V1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-request-ledger.v1';
import type { Fsd3OneShotExecutionResultV1 } from '../fsd3-one-shot-execution.service';
import {
  assertFsdP6dAuthoritativePersistedCatalogV1,
  parsePersistedCatalogCheckpointV1,
} from './fsd-p6d-catalog-provenance-authority.v1';

export type FsdP6dCatalogOnlyDispatchVerdictV1 =
  | {
      accepted: true;
      runTerminalClientStatus: string;
      catalogOnlySuccess: true;
      ledgerReplayed: boolean;
      ledgerCatalogAttemptsSucceeded: number;
    }
  | { accepted: false; reason: string };

function countSucceededCatalogAttempts(checkpoint: ReturnType<typeof parsePersistedCatalogCheckpointV1>): number {
  if (!checkpoint) {
    return 0;
  }
  return checkpoint.requestLedger.attempts.filter(
    (a) => a.attemptKey === FSD3_CATALOG_ATTEMPT_KEY_V1 && a.outcome === 'SUCCEEDED',
  ).length;
}

/**
 * Catalog-only success is derived from persisted catalog stage + ledger, not global FSD3 PARTIAL semantics.
 */
export async function verifyFsdP6dCatalogOnlyLedgerDispatchV1(input: {
  prisma: PrismaService;
  env?: NodeJS.ProcessEnv;
  organizationId: string;
  oneShotResult: Fsd3OneShotExecutionResultV1;
  preflight: { dimoTokenId: number; connectionIdentityFingerprint: string };
}): Promise<
  | {
      verdict: Extract<FsdP6dCatalogOnlyDispatchVerdictV1, { accepted: true }>;
      availableSignals: readonly string[];
      declaredCatalogFingerprint: string;
      persistedRunId: string;
      httpStatus: number;
    }
  | { verdict: Extract<FsdP6dCatalogOnlyDispatchVerdictV1, { accepted: false }> }
> {
  if (input.oneShotResult.terminalStatus === 'FAILED' || input.oneShotResult.terminalStatus === 'SKIPPED') {
    return {
      verdict: {
        accepted: false,
        reason: `FSD_P6D_CATALOG_ONLY_TERMINAL_REJECTED:${input.oneShotResult.terminalStatus}`,
      },
    };
  }

  const run = await input.prisma.fsdDiscoveryRun.findFirst({
    where: {
      id: input.oneShotResult.runId,
      organizationId: input.organizationId,
    },
    include: {
      stages: true,
    },
  });
  if (!run) {
    return { verdict: { accepted: false, reason: 'FSD_P6D_CATALOG_ONLY_RUN_MISSING' } };
  }
  if (run.invalidatedAt != null) {
    return { verdict: { accepted: false, reason: 'FSD_P6D_CATALOG_ONLY_RUN_INVALIDATED' } };
  }
  if (run.status !== 'COMPLETED') {
    return { verdict: { accepted: false, reason: `FSD_P6D_CATALOG_ONLY_RUN_STATUS_${run.status}` } };
  }

  const catalogStage = run.stages.find((s) => s.stageType === 'CATALOG');
  const snapshotStage = run.stages.find((s) => s.stageType === 'SNAPSHOT');
  if (!catalogStage || catalogStage.status !== 'SUCCEEDED') {
    return { verdict: { accepted: false, reason: 'FSD_P6D_CATALOG_ONLY_CATALOG_STAGE_NOT_SUCCEEDED' } };
  }
  if (snapshotStage?.status === 'FAILED' || snapshotStage?.status === 'UNKNOWN_OUTCOME') {
    return { verdict: { accepted: false, reason: `FSD_P6D_CATALOG_ONLY_SNAPSHOT_BLOCKER_${snapshotStage.status}` } };
  }
  if (snapshotStage && snapshotStage.status !== 'SUCCEEDED' && snapshotStage.status !== 'SKIPPED') {
    return { verdict: { accepted: false, reason: `FSD_P6D_CATALOG_ONLY_SNAPSHOT_STATUS_${snapshotStage.status}` } };
  }

  const checkpoint = parsePersistedCatalogCheckpointV1(catalogStage.checkpointJson);
  if (!checkpoint) {
    return { verdict: { accepted: false, reason: 'FSD_P6D_CATALOG_ONLY_CHECKPOINT_MISSING' } };
  }

  const succeededAttempts = countSucceededCatalogAttempts(checkpoint);
  if (succeededAttempts !== 1) {
    return {
      verdict: {
        accepted: false,
        reason: `FSD_P6D_CATALOG_ONLY_LEDGER_ATTEMPT_COUNT_${succeededAttempts}`,
      },
    };
  }

  if (
    input.oneShotResult.terminalStatus === 'PARTIAL' &&
    input.oneShotResult.reason &&
    input.oneShotResult.reason !== 'DEFERRED_SIGNALS'
  ) {
    return {
      verdict: {
        accepted: false,
        reason: `FSD_P6D_CATALOG_ONLY_PARTIAL_REASON_${input.oneShotResult.reason}`,
      },
    };
  }

  if (run.dimoTokenId !== input.preflight.dimoTokenId) {
    return { verdict: { accepted: false, reason: 'FSD_P6D_CATALOG_ONLY_TOKEN_MISMATCH' } };
  }
  if (run.connectionIdentityFingerprint !== input.preflight.connectionIdentityFingerprint) {
    return { verdict: { accepted: false, reason: 'FSD_P6D_CATALOG_ONLY_CONNECTION_FP_MISMATCH' } };
  }

  let authoritative: ReturnType<typeof assertFsdP6dAuthoritativePersistedCatalogV1>;
  try {
    authoritative = assertFsdP6dAuthoritativePersistedCatalogV1({
      env: input.env,
      context: {
        runId: run.id,
        runKey: run.runKey,
        organizationId: run.organizationId,
        vehicleId: run.vehicleId,
        providerSourceLinkId: run.providerSourceLinkId,
        dimoTokenId: run.dimoTokenId!,
        connectionIdentityFingerprint: run.connectionIdentityFingerprint!,
        invalidatedAt: run.invalidatedAt,
        checkpoint,
        stageHttpStatus: catalogStage.lastHttpStatus,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { verdict: { accepted: false, reason: message } };
  }

  return {
    verdict: {
      accepted: true,
      runTerminalClientStatus: input.oneShotResult.terminalStatus,
      catalogOnlySuccess: true,
      ledgerReplayed: false,
      ledgerCatalogAttemptsSucceeded: succeededAttempts,
    },
    availableSignals: authoritative.availableSignals,
    declaredCatalogFingerprint: authoritative.declaredCatalogFingerprint,
    persistedRunId: run.id,
    httpStatus: checkpoint.catalogFetch?.httpStatus ?? catalogStage.lastHttpStatus ?? 200,
  };
}
