import type { Fsd3ProviderRequestAttemptV1, Fsd3RequestLedgerV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-request-ledger.v1';
import type { MasterFsdSafeLedgerAttemptV1 } from './vsi-master-fsd-read.types';

function isValidAttempt(attempt: unknown): attempt is Fsd3ProviderRequestAttemptV1 {
  if (!attempt || typeof attempt !== 'object') return false;
  const a = attempt as Fsd3ProviderRequestAttemptV1;
  return typeof a.attemptKey === 'string' && typeof a.queryFingerprint === 'string' && typeof a.outcome === 'string';
}

export function parseLedgerFromCheckpoint(checkpoint: unknown): Fsd3RequestLedgerV1 | null {
  if (!checkpoint || typeof checkpoint !== 'object') {
    return null;
  }
  const cp = checkpoint as { requestLedger?: unknown };
  const ledger = cp.requestLedger;
  if (!ledger || typeof ledger !== 'object') return null;
  const l = ledger as Fsd3RequestLedgerV1;
  if (typeof l.budgetTotal !== 'number' || !Array.isArray(l.attempts)) {
    return null;
  }
  if (!l.attempts.every(isValidAttempt)) {
    return null;
  }
  return l;
}

export function mapLedgerAttemptLifecycle(attempt: Fsd3ProviderRequestAttemptV1): MasterFsdSafeLedgerAttemptV1['lifecycle'] {
  if (attempt.outcome === 'RESERVED' && !attempt.finishedAt) {
    return 'RESERVED_UNDISPATCHED';
  }
  if (attempt.outcome === 'RESERVED' && attempt.finishedAt) {
    return 'RESERVED_SETTLING';
  }
  if (attempt.outcome === 'DISPATCHED') {
    return 'DISPATCHED';
  }
  if (attempt.outcome === 'SUCCEEDED') {
    return 'SETTLED_SUCCEEDED';
  }
  if (attempt.outcome === 'FAILED') {
    return 'SETTLED_FAILED';
  }
  if (attempt.outcome === 'UNKNOWN') {
    return 'SETTLED_UNKNOWN';
  }
  return 'MALFORMED';
}

export function aggregateLedgersFromStages(stages: Array<{ stageType: string; checkpointJson: unknown }>): {
  ledgerAttemptCount: number;
  ledgerOutcomes: Record<string, number>;
  budgetTotal: number | null;
  budgetByStage: Record<string, number | null>;
  deduplicatedAttemptKeys: number;
  malformedCheckpointStages: string[];
  safeAttempts: MasterFsdSafeLedgerAttemptV1[];
} | null {
  const attemptKeys = new Set<string>();
  const ledgerOutcomes: Record<string, number> = {};
  let budgetTotal: number | null = null;
  const budgetByStage: Record<string, number | null> = {};
  const safeAttempts: MasterFsdSafeLedgerAttemptV1[] = [];
  const malformedCheckpointStages: string[] = [];
  let totalAttempts = 0;

  for (const stage of stages) {
    const rawLedger = stage.checkpointJson && typeof stage.checkpointJson === 'object'
      ? (stage.checkpointJson as { requestLedger?: unknown }).requestLedger
      : undefined;
    if (rawLedger != null && parseLedgerFromCheckpoint(stage.checkpointJson) == null) {
      malformedCheckpointStages.push(stage.stageType);
      continue;
    }
    const ledger = parseLedgerFromCheckpoint(stage.checkpointJson);
    if (!ledger) continue;
    budgetByStage[stage.stageType] = ledger.budgetTotal;
    if (budgetTotal == null) {
      budgetTotal = ledger.budgetTotal;
    }
    for (const attempt of ledger.attempts) {
      const dedupeKey = `${stage.stageType}|${attempt.attemptKey}|${attempt.queryFingerprint}`;
      if (attemptKeys.has(dedupeKey)) continue;
      attemptKeys.add(dedupeKey);
      totalAttempts += 1;
      ledgerOutcomes[attempt.outcome] = (ledgerOutcomes[attempt.outcome] ?? 0) + 1;
      safeAttempts.push({
        stageType: stage.stageType,
        attemptKey: attempt.attemptKey,
        queryFingerprint: attempt.queryFingerprint,
        outcome: attempt.outcome,
        reservedAt: attempt.reservedAt,
        finishedAt: attempt.finishedAt ?? null,
        httpStatus: attempt.httpStatus ?? null,
        lifecycle: mapLedgerAttemptLifecycle(attempt),
      });
    }
  }

  if (totalAttempts === 0 && safeAttempts.length === 0 && malformedCheckpointStages.length === 0) {
    return null;
  }

  return {
    ledgerAttemptCount: totalAttempts,
    ledgerOutcomes,
    budgetTotal,
    budgetByStage,
    deduplicatedAttemptKeys: attemptKeys.size,
    malformedCheckpointStages,
    safeAttempts,
  };
}
