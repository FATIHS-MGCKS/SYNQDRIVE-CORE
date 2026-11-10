import type { Fsd3RequestLedgerV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-request-ledger.v1';
import type { MasterFsdSafeLedgerAttemptV1 } from './vsi-master-fsd-read.types';

export function parseLedgerFromCheckpoint(checkpoint: unknown): Fsd3RequestLedgerV1 | null {
  if (!checkpoint || typeof checkpoint !== 'object') {
    return null;
  }
  const cp = checkpoint as { requestLedger?: Fsd3RequestLedgerV1 };
  return cp.requestLedger ?? null;
}

export function aggregateLedgersFromStages(stages: Array<{ stageType: string; checkpointJson: unknown }>): {
  ledgerAttemptCount: number;
  ledgerOutcomes: Record<string, number>;
  budgetTotal: number | null;
  deduplicatedAttemptKeys: number;
  safeAttempts: MasterFsdSafeLedgerAttemptV1[];
} | null {
  const attemptKeys = new Set<string>();
  const ledgerOutcomes: Record<string, number> = {};
  let budgetTotal: number | null = null;
  const safeAttempts: MasterFsdSafeLedgerAttemptV1[] = [];
  let totalAttempts = 0;

  for (const stage of stages) {
    const ledger = parseLedgerFromCheckpoint(stage.checkpointJson);
    if (!ledger) continue;
    if (budgetTotal == null) {
      budgetTotal = ledger.budgetTotal;
    }
    for (const attempt of ledger.attempts) {
      const dedupeKey = `${stage.stageType}|${attempt.attemptKey}|${attempt.queryFingerprint}`;
      if (attemptKeys.has(dedupeKey)) continue;
      attemptKeys.add(dedupeKey);
      totalAttempts += 1;
      ledgerOutcomes[attempt.outcome] = (ledgerOutcomes[attempt.outcome] ?? 0) + 1;
      const queryPlannedVsAttempted =
        attempt.outcome === 'RESERVED' && !attempt.finishedAt ? 'PLANNED_ONLY' : 'ATTEMPT_RECORDED';
      safeAttempts.push({
        stageType: stage.stageType,
        attemptKey: attempt.attemptKey,
        queryFingerprint: attempt.queryFingerprint,
        outcome: attempt.outcome,
        reservedAt: attempt.reservedAt,
        finishedAt: attempt.finishedAt ?? null,
        httpStatus: attempt.httpStatus ?? null,
        queryPlannedVsAttempted,
      });
    }
  }

  if (totalAttempts === 0 && safeAttempts.length === 0) {
    return null;
  }

  return {
    ledgerAttemptCount: totalAttempts,
    ledgerOutcomes,
    budgetTotal,
    deduplicatedAttemptKeys: attemptKeys.size,
    safeAttempts,
  };
}
