import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import {
  END_CONFIRMATION_SOURCES,
  TRIP_END_VALIDATION_OBSERVATION_SCHEMA_VERSION,
  type TripEndValidationObservationInput,
} from './trip-end-validation-observability.types';

const MAX_REASON = 512;
const MAX_CUSUM_REASON = 256;
const MAX_FLAGS = 16;

function truncate(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const t = value.trim();
  if (!t) return null;
  return t.length <= max ? t : t.slice(0, max);
}

function boundedFlags(flags: string[] | null | undefined): string[] | null {
  if (!flags?.length) return null;
  const out = flags.filter(Boolean).slice(0, MAX_FLAGS);
  return out.length ? out : null;
}

export function buildTripEndValidationObservationIdempotencyKey(
  input: Pick<
    TripEndValidationObservationInput,
    | 'vehicleId'
    | 'tripId'
    | 'endCycleToken'
    | 'processPhase'
    | 'decisionOutcome'
    | 'retryCount'
  >,
): string {
  const parts = [
    `v${TRIP_END_VALIDATION_OBSERVATION_SCHEMA_VERSION}`,
    input.vehicleId,
    input.tripId ?? 'no_trip',
    input.endCycleToken ?? 'no_cycle',
    input.processPhase,
    input.decisionOutcome,
    input.retryCount == null ? 'na' : String(input.retryCount),
  ];
  const digest = createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
  return `${parts.slice(0, 6).join('|')}|${digest}`;
}

export function buildTripEndValidationObservationRow(
  input: TripEndValidationObservationInput,
): Prisma.TripEndValidationDecisionObservationCreateInput {
  const idempotencyKey = buildTripEndValidationObservationIdempotencyKey(input);
  const dataQuality = boundedFlags(input.dataQualityFlags);
  const missingEvidence = boundedFlags(input.missingEvidenceFlags);

  return {
    schemaVersion: TRIP_END_VALIDATION_OBSERVATION_SCHEMA_VERSION,
    idempotencyKey,
    organizationId: input.organizationId,
    vehicle: { connect: { id: input.vehicleId } },
    tripId: input.tripId,
    endCycleToken: input.endCycleToken,
    fsmStateAtDecision: String(input.fsmStateAtDecision),
    transitionToState: input.transitionToState ? String(input.transitionToState) : null,
    processPhase: input.processPhase,
    decisionOutcome: input.decisionOutcome,
    endDetectionMode: input.endDetectionMode ?? null,
    endConfirmationSource: input.endConfirmationSource ?? null,
    decisionReason: truncate(input.decisionReason, MAX_REASON),
    detectorOutcome: truncate(input.detectorOutcome, 128),
    cusumReason: truncate(input.cusumReason, MAX_CUSUM_REASON),
    retryCount: input.retryCount ?? null,
    retryBudgetMax: input.retryBudgetMax ?? null,
    evidenceRevision: truncate(input.evidenceRevision, 64),
    inputFingerprint: truncate(input.inputFingerprint, 128),
    qualifiedStopBoundaryAt: input.qualifiedStopBoundaryAt ?? null,
    canonicalEndBoundaryAt: input.canonicalEndBoundaryAt ?? null,
    eventTimeAt: input.eventTimeAt ?? null,
    evidenceAvailableAt: input.evidenceAvailableAt ?? null,
    workerDecisionAt: input.workerDecisionAt,
    workerConfirmationAt: input.workerConfirmationAt ?? null,
    coreWindowPointCount: input.coreWindowPointCount ?? null,
    providerSource: truncate(input.providerSource, 64),
    dataQualityFlags: dataQuality ?? undefined,
    missingEvidenceFlags: missingEvidence ?? undefined,
  };
}

export function resolveEndConfirmationSourceForMode(input: {
  endDetectionMode: string | null | undefined;
  processPhase: TripEndValidationObservationInput['processPhase'];
  decisionOutcome: TripEndValidationObservationInput['decisionOutcome'];
}): string | null {
  if (input.decisionOutcome === 'CUSUM_VALIDATED') {
    return END_CONFIRMATION_SOURCES.CUSUM_CHANGE_POINT;
  }
  if (
    input.decisionOutcome === 'CLICKHOUSE_END_ASSIST_CONFIRMED' ||
    input.endDetectionMode === 'CLICKHOUSE_END_ASSIST'
  ) {
    return END_CONFIRMATION_SOURCES.CLICKHOUSE_SEGMENT_END;
  }
  if (input.decisionOutcome === 'COMPOSITE_MAX_ATTEMPT_FALLBACK') {
    return END_CONFIRMATION_SOURCES.COMPOSITE_INACTIVITY_FALLBACK;
  }
  if (input.decisionOutcome === 'FSM_HARD_TIMEOUT_FALLBACK') {
    return END_CONFIRMATION_SOURCES.FSM_HARD_TIMEOUT;
  }
  if (
    input.processPhase === 'FINALIZE' &&
    input.decisionOutcome === 'FINALIZE_COMMITTED'
  ) {
    return END_CONFIRMATION_SOURCES.FINALIZE_WORKER_COMMIT;
  }
  return null;
}

export function readEvidenceRevisionFromSummary(
  summary: Record<string, unknown> | null | undefined,
): string | null {
  if (!summary) return null;
  const rev = summary.evidenceRevision ?? summary.endEvidenceRevision;
  return typeof rev === 'string' && rev.trim() ? rev.trim() : null;
}

export function readInputFingerprintFromSummary(
  summary: Record<string, unknown> | null | undefined,
): string | null {
  if (!summary) return null;
  const fp = summary.inputFingerprint ?? summary.endValidationInputFingerprint;
  return typeof fp === 'string' && fp.trim() ? fp.trim() : null;
}
