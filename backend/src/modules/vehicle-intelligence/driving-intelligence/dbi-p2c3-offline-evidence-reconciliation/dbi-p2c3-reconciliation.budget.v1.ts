import {
  DBI_P2C3_DEFAULT_MAX_CANDIDATE_PAIRS,
  DBI_P2C3_DEFAULT_MAX_PARTICIPANTS,
  DBI_P2C3_HARD_MAX_CANDIDATE_PAIRS,
  DBI_P2C3_HARD_MAX_PARTICIPANTS,
  type DbiP2c3ReconciliationOptionsV1,
} from './dbi-p2c3-reconciliation.contract.v1';

export type DbiP2c3ResolvedBudgetV1 =
  | { readonly ok: true; readonly maxParticipants: number; readonly maxCandidatePairs: number }
  | { readonly ok: false };

function isValidBound(value: unknown, hardMax: number): value is number {
  if (typeof value !== 'number') return false;
  if (!Number.isFinite(value)) return false;
  if (!Number.isSafeInteger(value)) return false;
  if (value < 0) return false;
  return value <= hardMax;
}

export function resolveReconciliationBudget(
  options: DbiP2c3ReconciliationOptionsV1,
): DbiP2c3ResolvedBudgetV1 {
  const maxParticipantsRaw = options.maxParticipants ?? DBI_P2C3_DEFAULT_MAX_PARTICIPANTS;
  const maxPairsRaw = options.maxCandidatePairs ?? DBI_P2C3_DEFAULT_MAX_CANDIDATE_PAIRS;
  if (!isValidBound(maxParticipantsRaw, DBI_P2C3_HARD_MAX_PARTICIPANTS)) return { ok: false };
  if (!isValidBound(maxPairsRaw, DBI_P2C3_HARD_MAX_CANDIDATE_PAIRS)) return { ok: false };
  return {
    ok: true,
    maxParticipants: maxParticipantsRaw,
    maxCandidatePairs: maxPairsRaw,
  };
}

/** Safe pair count for n candidates — returns null when overflow would occur. */
export function theoreticalCandidatePairCount(candidateCount: number): number | null {
  if (!Number.isSafeInteger(candidateCount) || candidateCount < 0) return null;
  if (candidateCount <= 1) return 0;
  const n = candidateCount;
  if (n > 2 ** 31) return null;
  const pairs = (n * (n - 1)) / 2;
  return Number.isSafeInteger(pairs) ? pairs : null;
}

export function countBundleFootprint(bundle: {
  readonly descriptive: unknown | null;
  readonly powertrainProxies: readonly { readonly candidates: readonly unknown[] }[];
}): { readonly participantCount: number; readonly candidateCount: number; readonly pairCount: number | null } {
  const participantCount =
    (bundle.descriptive ? 1 : 0) +
    bundle.powertrainProxies.length;
  let candidateCount = 0;
  for (const plane of bundle.powertrainProxies) {
    candidateCount += plane.candidates.length;
  }
  return {
    participantCount,
    candidateCount,
    pairCount: theoreticalCandidatePairCount(candidateCount),
  };
}
