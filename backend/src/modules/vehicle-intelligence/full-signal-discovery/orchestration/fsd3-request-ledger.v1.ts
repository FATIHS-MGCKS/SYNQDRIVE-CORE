import type { Prisma } from '@prisma/client';

export const FSD3_CATALOG_ATTEMPT_KEY_V1 = 'catalog:availableSignals' as const;

export type Fsd3ProviderRequestAttemptOutcomeV1 =
  | 'RESERVED'
  | 'DISPATCHED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'UNKNOWN';

export type Fsd3ProviderRequestAttemptV1 = {
  attemptKey: string;
  queryFingerprint: string;
  outcome: Fsd3ProviderRequestAttemptOutcomeV1;
  reservedAt: string;
  finishedAt?: string;
  httpStatus?: number;
};

export type Fsd3RequestLedgerV1 = {
  budgetTotal: number;
  attempts: Fsd3ProviderRequestAttemptV1[];
};

export type Fsd3CatalogStageCheckpointV1 = {
  requestLedger: Fsd3RequestLedgerV1;
  catalogFetch?: {
    declaredCatalogFingerprint?: string;
    availableSignalNames?: string[];
    httpStatus?: number;
    succeeded?: boolean;
  };
};

export type Fsd3SnapshotProgressCheckpointV1 = {
  nextDocumentIndex: number;
  rejectedQueryFingerprints: string[];
  completedDocumentFingerprints: string[];
};

export type Fsd3SnapshotStageCheckpointV1 = {
  snapshotProgress: Fsd3SnapshotProgressCheckpointV1;
};

export function createEmptyFsd3RequestLedger(budgetTotal: number): Fsd3RequestLedgerV1 {
  return { budgetTotal, attempts: [] };
}

export function countConsumedFsd3RequestSlots(ledger: Fsd3RequestLedgerV1): number {
  return ledger.attempts.length;
}

export function findFsd3AttemptByQueryFingerprint(
  ledger: Fsd3RequestLedgerV1,
  queryFingerprint: string,
): Fsd3ProviderRequestAttemptV1 | undefined {
  return ledger.attempts.find((a) => a.queryFingerprint === queryFingerprint);
}

export function findFsd3AttemptByAttemptKey(
  ledger: Fsd3RequestLedgerV1,
  attemptKey: string,
): Fsd3ProviderRequestAttemptV1 | undefined {
  return ledger.attempts.find((a) => a.attemptKey === attemptKey);
}

export type Fsd3ReserveAttemptResultV1 =
  | { kind: 'RESERVED'; ledger: Fsd3RequestLedgerV1; attempt: Fsd3ProviderRequestAttemptV1 }
  | { kind: 'IDEMPOTENT'; ledger: Fsd3RequestLedgerV1; attempt: Fsd3ProviderRequestAttemptV1 }
  | { kind: 'BUDGET_EXHAUSTED'; ledger: Fsd3RequestLedgerV1 };

export function reserveFsd3ProviderRequestAttempt(input: {
  ledger: Fsd3RequestLedgerV1;
  attemptKey: string;
  queryFingerprint: string;
  nowIso?: string;
}): Fsd3ReserveAttemptResultV1 {
  const existing = findFsd3AttemptByQueryFingerprint(input.ledger, input.queryFingerprint);
  if (existing) {
    return { kind: 'IDEMPOTENT', ledger: input.ledger, attempt: existing };
  }
  if (countConsumedFsd3RequestSlots(input.ledger) >= input.ledger.budgetTotal) {
    return { kind: 'BUDGET_EXHAUSTED', ledger: input.ledger };
  }
  const attempt: Fsd3ProviderRequestAttemptV1 = {
    attemptKey: input.attemptKey,
    queryFingerprint: input.queryFingerprint,
    outcome: 'RESERVED',
    reservedAt: input.nowIso ?? new Date().toISOString(),
  };
  return {
    kind: 'RESERVED',
    ledger: { ...input.ledger, attempts: [...input.ledger.attempts, attempt] },
    attempt,
  };
}

export function finalizeFsd3ProviderRequestAttempt(input: {
  ledger: Fsd3RequestLedgerV1;
  queryFingerprint: string;
  outcome: Exclude<Fsd3ProviderRequestAttemptOutcomeV1, 'RESERVED'>;
  httpStatus?: number;
  nowIso?: string;
}): Fsd3RequestLedgerV1 {
  const now = input.nowIso ?? new Date().toISOString();
  return {
    ...input.ledger,
    attempts: input.ledger.attempts.map((a) =>
      a.queryFingerprint === input.queryFingerprint
        ? {
            ...a,
            outcome: input.outcome,
            finishedAt: now,
            httpStatus: input.httpStatus,
          }
        : a,
    ),
  };
}

export function parseFsd3CatalogStageCheckpoint(raw: unknown): Fsd3CatalogStageCheckpointV1 | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (!o.requestLedger || typeof o.requestLedger !== 'object') {
    return null;
  }
  const ledger = o.requestLedger as Fsd3RequestLedgerV1;
  if (!Array.isArray(ledger.attempts) || typeof ledger.budgetTotal !== 'number') {
    return null;
  }
  return {
    requestLedger: ledger,
    catalogFetch:
      o.catalogFetch && typeof o.catalogFetch === 'object'
        ? (o.catalogFetch as Fsd3CatalogStageCheckpointV1['catalogFetch'])
        : undefined,
  };
}

export function parseFsd3SnapshotStageCheckpoint(raw: unknown): Fsd3SnapshotProgressCheckpointV1 {
  if (!raw || typeof raw !== 'object') {
    return emptyFsd3SnapshotProgressCheckpoint();
  }
  const o = raw as Record<string, unknown>;
  const progress =
    o.snapshotProgress && typeof o.snapshotProgress === 'object'
      ? (o.snapshotProgress as Fsd3SnapshotProgressCheckpointV1)
      : (o as unknown as Fsd3SnapshotProgressCheckpointV1);
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

export function emptyFsd3SnapshotProgressCheckpoint(): Fsd3SnapshotProgressCheckpointV1 {
  return {
    nextDocumentIndex: 0,
    rejectedQueryFingerprints: [],
    completedDocumentFingerprints: [],
  };
}

export function catalogCheckpointToJson(
  checkpoint: Fsd3CatalogStageCheckpointV1,
): Prisma.InputJsonValue {
  return checkpoint as unknown as Prisma.InputJsonValue;
}

export function snapshotCheckpointToJson(
  progress: Fsd3SnapshotProgressCheckpointV1,
): Prisma.InputJsonValue {
  return { snapshotProgress: progress } as unknown as Prisma.InputJsonValue;
}

export function hasBlockingCatalogReservation(checkpoint: Fsd3CatalogStageCheckpointV1): boolean {
  const attempt = findFsd3AttemptByAttemptKey(checkpoint.requestLedger, FSD3_CATALOG_ATTEMPT_KEY_V1);
  if (!attempt) {
    return false;
  }
  if (checkpoint.catalogFetch?.succeeded === true) {
    return false;
  }
  return attempt.outcome === 'RESERVED' || attempt.outcome === 'DISPATCHED' || attempt.outcome === 'UNKNOWN';
}

export type Fsd3DispatchGateDecisionV1 =
  | { action: 'DISPATCH_NEW' }
  | { action: 'SKIP_SETTLED'; reason: string }
  | { action: 'FAIL_CLOSED'; reason: string };

/** R1: only RESERVED may hit the provider; IDEMPOTENT attempts follow persisted outcomes. */
export function classifyFsd3ReserveForProviderDispatch(input: {
  reserve: Fsd3ReserveAttemptResultV1;
  checkpoint: Fsd3SnapshotProgressCheckpointV1;
  queryFingerprint: string;
}): Fsd3DispatchGateDecisionV1 {
  if (input.reserve.kind === 'RESERVED') {
    return { action: 'DISPATCH_NEW' };
  }
  if (input.reserve.kind === 'BUDGET_EXHAUSTED') {
    return { action: 'FAIL_CLOSED', reason: 'FSD3_REQUEST_BUDGET_EXHAUSTED' };
  }
  const attempt = input.reserve.attempt;
  if (attempt.outcome === 'SUCCEEDED') {
    if (input.checkpoint.completedDocumentFingerprints.includes(input.queryFingerprint)) {
      return { action: 'SKIP_SETTLED', reason: 'ALREADY_COMPLETED' };
    }
    return { action: 'FAIL_CLOSED', reason: 'FSD3_LEDGER_SUCCEEDED_WITHOUT_CHECKPOINT' };
  }
  if (attempt.outcome === 'FAILED') {
    if (input.checkpoint.rejectedQueryFingerprints.includes(input.queryFingerprint)) {
      return { action: 'SKIP_SETTLED', reason: 'ALREADY_REJECTED' };
    }
    return { action: 'FAIL_CLOSED', reason: 'FSD3_LEDGER_FAILED_WITHOUT_CHECKPOINT' };
  }
  return {
    action: 'FAIL_CLOSED',
    reason: `FSD3_UNSETTLED_ATTEMPT_${attempt.outcome}`,
  };
}

export function classifyFsd3CatalogReserveForProviderDispatch(input: {
  reserve: Fsd3ReserveAttemptResultV1;
  checkpoint: Fsd3CatalogStageCheckpointV1;
}): Fsd3DispatchGateDecisionV1 {
  if (input.reserve.kind === 'RESERVED') {
    return { action: 'DISPATCH_NEW' };
  }
  if (input.reserve.kind === 'BUDGET_EXHAUSTED') {
    return { action: 'FAIL_CLOSED', reason: 'FSD3_REQUEST_BUDGET_EXHAUSTED' };
  }
  const attempt = input.reserve.attempt;
  if (attempt.outcome === 'SUCCEEDED' && input.checkpoint.catalogFetch?.succeeded === true) {
    return { action: 'SKIP_SETTLED', reason: 'CATALOG_ALREADY_SUCCEEDED' };
  }
  if (attempt.outcome === 'FAILED') {
    return { action: 'SKIP_SETTLED', reason: 'CATALOG_ALREADY_FAILED' };
  }
  return {
    action: 'FAIL_CLOSED',
    reason: `FSD3_CATALOG_UNSETTLED_ATTEMPT_${attempt.outcome}`,
  };
}

export function findUnsettledSnapshotAttempts(
  ledger: Fsd3RequestLedgerV1,
  checkpoint: Fsd3SnapshotProgressCheckpointV1,
): Fsd3ProviderRequestAttemptV1[] {
  return ledger.attempts.filter((a) => {
    if (!a.attemptKey.startsWith('snapshot:')) {
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
