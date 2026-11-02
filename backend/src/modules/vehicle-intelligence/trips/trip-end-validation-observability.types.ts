import type { TripDetectionState } from '@prisma/client';
import type { EndDetectionMode } from './trip-detection.types';

/** Bounded process phases — mirrors worker handlers, not Bull trigger names alone. */
export type TripEndValidationObservabilityProcessPhase =
  | 'END_VALIDATION'
  | 'POSSIBLE_END_CHECK'
  | 'FINALIZE';

/**
 * Stable outcome taxonomy for as-of replay (distinct from persisted endDetectionMode).
 * Covers live FSM branches @ PR0 baseline without inventing counterfactual modes.
 */
export const TRIP_END_VALIDATION_OBSERVATION_OUTCOMES = {
  CUSUM_VALIDATED: 'CUSUM_VALIDATED',
  CLICKHOUSE_END_ASSIST_CONFIRMED: 'CLICKHOUSE_END_ASSIST_CONFIRMED',
  CLICKHOUSE_END_ASSIST_RESUME_INVALIDATED: 'CLICKHOUSE_END_ASSIST_RESUME_INVALIDATED',
  CLICKHOUSE_END_ASSIST_DEFERRED: 'CLICKHOUSE_END_ASSIST_DEFERRED',
  CLICKHOUSE_END_ASSIST_HANDOFF_CUSUM: 'CLICKHOUSE_END_ASSIST_HANDOFF_CUSUM',
  CUSUM_STILL_ONGOING_REOPEN: 'CUSUM_STILL_ONGOING_REOPEN',
  CUSUM_INCONCLUSIVE_RETRY: 'CUSUM_INCONCLUSIVE_RETRY',
  CUSUM_DETECTOR_FAILURE: 'CUSUM_DETECTOR_FAILURE',
  CUSUM_FETCH_FAILURE: 'CUSUM_FETCH_FAILURE',
  COMPOSITE_MAX_ATTEMPT_FALLBACK: 'COMPOSITE_MAX_ATTEMPT_FALLBACK',
  FSM_HARD_TIMEOUT_FALLBACK: 'FSM_HARD_TIMEOUT_FALLBACK',
  FINALIZE_COMMITTED: 'FINALIZE_COMMITTED',
  FINALIZE_DISCARDED: 'FINALIZE_DISCARDED',
} as const;

export type TripEndValidationObservationOutcome =
  (typeof TRIP_END_VALIDATION_OBSERVATION_OUTCOMES)[keyof typeof TRIP_END_VALIDATION_OBSERVATION_OUTCOMES];

/** Forensic separation of worker commit vs algorithmic boundary (PR0 — observability only). */
export const END_CONFIRMATION_SOURCES = {
  CUSUM_CHANGE_POINT: 'CUSUM_CHANGE_POINT',
  CLICKHOUSE_SEGMENT_END: 'CLICKHOUSE_SEGMENT_END',
  COMPOSITE_INACTIVITY_FALLBACK: 'COMPOSITE_INACTIVITY_FALLBACK',
  FSM_HARD_TIMEOUT: 'FSM_HARD_TIMEOUT',
  FINALIZE_WORKER_COMMIT: 'FINALIZE_WORKER_COMMIT',
} as const;

export type EndConfirmationSource =
  (typeof END_CONFIRMATION_SOURCES)[keyof typeof END_CONFIRMATION_SOURCES];

export type TripEndValidationObservationInput = {
  organizationId: string | null;
  vehicleId: string;
  tripId: string | null;
  endCycleToken: string | null;
  fsmStateAtDecision: TripDetectionState | string;
  transitionToState?: TripDetectionState | string | null;
  processPhase: TripEndValidationObservabilityProcessPhase;
  decisionOutcome: TripEndValidationObservationOutcome;
  endDetectionMode?: EndDetectionMode | string | null;
  endConfirmationSource?: EndConfirmationSource | string | null;
  decisionReason?: string | null;
  detectorOutcome?: string | null;
  cusumReason?: string | null;
  retryCount?: number | null;
  retryBudgetMax?: number | null;
  evidenceRevision?: string | null;
  inputFingerprint?: string | null;
  qualifiedStopBoundaryAt?: Date | null;
  canonicalEndBoundaryAt?: Date | null;
  eventTimeAt?: Date | null;
  evidenceAvailableAt?: Date | null;
  workerDecisionAt: Date;
  workerConfirmationAt?: Date | null;
  coreWindowPointCount?: number | null;
  providerSource?: string | null;
  dataQualityFlags?: string[] | null;
  missingEvidenceFlags?: string[] | null;
};

export const TRIP_END_VALIDATION_OBSERVATION_SCHEMA_VERSION = 1;
