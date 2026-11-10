import type { FsdDiscoverySignalEvidenceState } from '@prisma/client';
import type {
  MasterFsdSignalPresentationStateV1,
  MasterFsdStageEvidenceAvailabilityV1,
} from './vsi-master-fsd-read.types';

export function mapEvidenceStageAvailability(input: {
  stageExecuted: boolean;
  stageStatus: string | null;
  rowCount: number;
  declaredSignalCount?: number | null;
}): MasterFsdStageEvidenceAvailabilityV1 {
  if (!input.stageExecuted) {
    return 'NOT_EXECUTED';
  }
  if (input.stageStatus === 'UNKNOWN_OUTCOME') {
    return 'PARTIAL';
  }
  if (input.rowCount === 0) {
    return 'NOT_AVAILABLE';
  }
  if (
    input.declaredSignalCount != null &&
    input.declaredSignalCount > 0 &&
    input.rowCount < input.declaredSignalCount
  ) {
    return 'PARTIAL';
  }
  return 'AVAILABLE';
}

export function mapSignalPresentationState(input: {
  evidenceState: FsdDiscoverySignalEvidenceState;
  qualityJson: unknown;
}): MasterFsdSignalPresentationStateV1 {
  const kind =
    input.qualityJson && typeof input.qualityJson === 'object'
      ? (input.qualityJson as { observationKind?: string }).observationKind
      : undefined;

  if (input.evidenceState === 'QUERY_FAILED') return 'QUERY_FAILED';
  if (input.evidenceState === 'DEFERRED') return 'DEFERRED';
  if (input.evidenceState === 'NOT_EVALUABLE') return 'NOT_EVALUABLE';
  if (input.evidenceState === 'QUERY_PLANNED') return 'QUERY_PLANNED';
  if (input.evidenceState === 'QUERY_ACCEPTED') return 'QUERY_ACCEPTED';
  if (input.evidenceState === 'DECLARED_ONLY') return 'DECLARED_ONLY';

  if (kind === 'ABSENT' || kind === 'MISSING') return 'MISSING';
  if (kind === 'NULL') return 'NULL_OBSERVED';
  if (kind === 'INVALID') return 'INVALID';
  if (input.evidenceState === 'OBSERVED' || kind === 'OBSERVED' || kind === 'VALID_ZERO' || kind === 'VALID_NONZERO') {
    return 'OBSERVED';
  }
  return 'UNKNOWN';
}

export type MasterFsdStageColumnValueV1 =
  | 'NOT_EXECUTED'
  | 'NOT_AVAILABLE'
  | 'UNVERIFIED_LINK'
  | MasterFsdSignalPresentationStateV1;

export function stageEvidenceColumnValue(
  stageExecuted: boolean,
  state: MasterFsdSignalPresentationStateV1 | null,
  options?: { unverifiedLink?: boolean },
): MasterFsdStageColumnValueV1 {
  if (options?.unverifiedLink) return 'UNVERIFIED_LINK';
  if (!stageExecuted) return 'NOT_EXECUTED';
  if (state == null) return 'NOT_AVAILABLE';
  return state;
}

export function extractStageQueryFlags(row: {
  queryPlanned: boolean;
  queryAccepted: boolean | null;
  observedValue: boolean | null;
}): {
  queryPlanned: boolean;
  queryAccepted: boolean | null;
  observedValue: boolean | null;
} {
  return {
    queryPlanned: row.queryPlanned,
    queryAccepted: row.queryAccepted,
    observedValue: row.observedValue,
  };
}

export function mapRunExecutionAvailability(input: {
  status: string;
  invalidatedAt: Date | null;
  hasAnyRun: boolean;
}): import('./vsi-master-fsd-read.types').MasterFsdExecutionAvailabilityV1 {
  if (!input.hasAnyRun) return 'NOT_YET_EXECUTED';
  if (input.invalidatedAt != null || input.status === 'INVALIDATED') return 'INVALIDATED';
  if (input.status === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (input.status === 'COMPLETED') return 'COMPLETED';
  if (input.status === 'FAILED') return 'FAILED';
  if (input.status === 'PENDING') return 'UNKNOWN';
  return 'UNKNOWN';
}
