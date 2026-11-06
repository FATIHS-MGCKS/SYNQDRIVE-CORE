import type { Prisma } from '@prisma/client';
import type { FsdHistoricalWindowV1 } from '../fsd-query-document.builder.v1';
import {
  classifyFsd3CatalogReserveForProviderDispatch,
  classifyFsd3ReserveForProviderDispatch,
  createEmptyFsd3RequestLedger,
  finalizeFsd3ProviderRequestAttempt,
  FSD3_CATALOG_ATTEMPT_KEY_V1,
  parseFsd3CatalogStageCheckpoint,
  reserveFsd3ProviderRequestAttempt,
  type Fsd3CatalogStageCheckpointV1,
  type Fsd3RequestLedgerV1,
  type Fsd3SnapshotProgressCheckpointV1,
} from './fsd3-request-ledger.v1';

export type Fsd4HistoricalProgressCheckpointV1 = Fsd3SnapshotProgressCheckpointV1;

export const FSD4_CATALOG_ATTEMPT_KEY_V1 = FSD3_CATALOG_ATTEMPT_KEY_V1;
export const FSD4_CATALOG_QUERY_FINGERPRINT_V1 = 'catalog:availableSignals:v1';

export {
  createEmptyFsd3RequestLedger as createEmptyFsd4RequestLedger,
  finalizeFsd3ProviderRequestAttempt as finalizeFsd4ProviderRequestAttempt,
  reserveFsd3ProviderRequestAttempt as reserveFsd4ProviderRequestAttempt,
  classifyFsd3CatalogReserveForProviderDispatch as classifyFsd4CatalogReserveForProviderDispatch,
  classifyFsd3ReserveForProviderDispatch as classifyFsd4HistoricalReserveForProviderDispatch,
  parseFsd3CatalogStageCheckpoint as parseFsd4CatalogStageCheckpoint,
  type Fsd3CatalogStageCheckpointV1 as Fsd4CatalogStageCheckpointV1,
  type Fsd3RequestLedgerV1 as Fsd4RequestLedgerV1,
};

export function emptyFsd4HistoricalProgressCheckpoint(): Fsd4HistoricalProgressCheckpointV1 {
  return {
    nextDocumentIndex: 0,
    rejectedQueryFingerprints: [],
    completedDocumentFingerprints: [],
  };
}

export function parseFsd4HistoricalProgressCheckpoint(raw: unknown): Fsd4HistoricalProgressCheckpointV1 {
  if (!raw || typeof raw !== 'object') {
    return emptyFsd4HistoricalProgressCheckpoint();
  }
  const o = raw as Record<string, unknown>;
  const progress =
    o.historicalProgress && typeof o.historicalProgress === 'object'
      ? (o.historicalProgress as Fsd4HistoricalProgressCheckpointV1)
      : (o as unknown as Fsd4HistoricalProgressCheckpointV1);
  return {
    nextDocumentIndex: typeof progress.nextDocumentIndex === 'number' ? progress.nextDocumentIndex : 0,
    rejectedQueryFingerprints: Array.isArray(progress.rejectedQueryFingerprints)
      ? [...progress.rejectedQueryFingerprints]
      : [],
    completedDocumentFingerprints: Array.isArray(progress.completedDocumentFingerprints)
      ? [...progress.completedDocumentFingerprints]
      : [],
  };
}

export function historicalProgressCheckpointToJson(
  progress: Fsd4HistoricalProgressCheckpointV1,
  historicalWindow?: FsdHistoricalWindowV1,
): Prisma.InputJsonValue {
  return {
    historicalProgress: progress,
    ...(historicalWindow ? { historicalWindow } : {}),
  } as unknown as Prisma.InputJsonValue;
}

export function parseHistoricalWindowFromCheckpointJson(raw: unknown): FsdHistoricalWindowV1 | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const w = o.historicalWindow;
  if (!w || typeof w !== 'object') {
    return null;
  }
  const hw = w as Record<string, unknown>;
  if (typeof hw.fromUtc === 'string' && typeof hw.toUtc === 'string') {
    return { fromUtc: hw.fromUtc, toUtc: hw.toUtc };
  }
  return null;
}

export function findUnsettledHistoricalAttempts(
  ledger: Fsd3RequestLedgerV1,
  checkpoint: Fsd4HistoricalProgressCheckpointV1,
) {
  return ledger.attempts.filter((a) => {
    if (!a.attemptKey.startsWith('historical:')) {
      return false;
    }
    if (a.outcome === 'SUCCEEDED' && checkpoint.completedDocumentFingerprints.includes(a.queryFingerprint)) {
      return false;
    }
    if (a.outcome === 'FAILED' && checkpoint.rejectedQueryFingerprints.includes(a.queryFingerprint)) {
      return false;
    }
    return a.outcome === 'RESERVED' || a.outcome === 'DISPATCHED' || a.outcome === 'UNKNOWN';
  });
}

export function hasBlockingFsd4CatalogReservation(checkpoint: Fsd3CatalogStageCheckpointV1): boolean {
  const attempt = checkpoint.requestLedger.attempts.find(
    (a) => a.attemptKey === FSD4_CATALOG_ATTEMPT_KEY_V1,
  );
  if (!attempt) {
    return false;
  }
  if (checkpoint.catalogFetch?.succeeded === true) {
    return false;
  }
  return attempt.outcome === 'RESERVED' || attempt.outcome === 'DISPATCHED' || attempt.outcome === 'UNKNOWN';
}
