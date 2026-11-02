import type { Logger } from '@nestjs/common';
import type { TripDetectionState } from '@prisma/client';
import { END_DETECTION_MODES } from './trip-detection.types';
import { resolveEndCycleToken } from './trip-end-cycle-reset';
import {
  readEvidenceRevisionFromSummary,
  readInputFingerprintFromSummary,
} from './trip-end-validation-observability.domain';
import type { TripEndValidationObservabilityService } from './trip-end-validation-observability.service';
import {
  TRIP_END_VALIDATION_OBSERVATION_OUTCOMES,
  type TripEndValidationObservationInput,
} from './trip-end-validation-observability.types';
import { runTripObservabilitySafely } from './trip-fsm-observability-safe.util';

type DetSlice = {
  state: TripDetectionState;
  activeTripId?: string | null;
  possibleEndAt?: Date | null;
  endDetectionMode?: string | null;
  endValidationAttempts?: number | null;
  cusumValidatedAt?: Date | null;
  cusumSegmentEnd?: Date | null;
  lastEvidenceSummary?: unknown;
};

export function recordTripEndValidationObservationSafely(
  logger: Logger | undefined,
  service: TripEndValidationObservabilityService | undefined,
  input: TripEndValidationObservationInput,
): void {
  if (!service?.isEnabledForVehicle(input.vehicleId)) return;
  void service
    .record(input)
    .catch((err) => {
      runTripObservabilitySafely(logger, 'trip_end_validation_observability_persist', () => {
        throw err;
      });
    });
}

export function buildEndValidationObservationBase(input: {
  organizationId: string | null;
  vehicleId: string;
  det: DetSlice;
  workerNow: Date;
  retryBudgetMax?: number;
}): Pick<
  TripEndValidationObservationInput,
  | 'organizationId'
  | 'vehicleId'
  | 'tripId'
  | 'endCycleToken'
  | 'fsmStateAtDecision'
  | 'retryCount'
  | 'retryBudgetMax'
  | 'qualifiedStopBoundaryAt'
  | 'workerDecisionAt'
  | 'evidenceRevision'
  | 'inputFingerprint'
> {
  const summary =
    (input.det.lastEvidenceSummary as Record<string, unknown> | null) ?? null;
  return {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.det.activeTripId ?? null,
    endCycleToken: resolveEndCycleToken(input.det as Parameters<typeof resolveEndCycleToken>[0]),
    fsmStateAtDecision: input.det.state,
    retryCount: input.det.endValidationAttempts ?? null,
    retryBudgetMax: input.retryBudgetMax ?? null,
    qualifiedStopBoundaryAt: input.det.possibleEndAt ?? null,
    workerDecisionAt: input.workerNow,
    evidenceRevision: readEvidenceRevisionFromSummary(summary),
    inputFingerprint: readInputFingerprintFromSummary(summary),
  };
}

export function observeEndValidationCusumValidated(input: {
  logger?: Logger;
  service?: TripEndValidationObservabilityService;
  organizationId: string | null;
  vehicleId: string;
  det: DetSlice;
  workerNow: Date;
  validatedEndTime: Date;
  completedAttempt: number;
  retryBudgetMax: number;
  decisionReason?: string;
  cusumReason?: string;
  coreWindowPointCount: number;
  workerConfirmationAt: Date;
}): void {
  const base = buildEndValidationObservationBase({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    det: input.det,
    workerNow: input.workerNow,
    retryBudgetMax: input.retryBudgetMax,
  });
  recordTripEndValidationObservationSafely(input.logger, input.service, {
    ...base,
    processPhase: 'END_VALIDATION',
    decisionOutcome: TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CUSUM_VALIDATED,
    transitionToState: 'RESTING',
    endDetectionMode: END_DETECTION_MODES.CUSUM_VALIDATED,
    decisionReason: input.decisionReason ?? 'cusum_change_point_confirmed',
    cusumReason: input.cusumReason ?? null,
    retryCount: input.completedAttempt,
    canonicalEndBoundaryAt: input.validatedEndTime,
    eventTimeAt: input.validatedEndTime,
    workerConfirmationAt: input.workerConfirmationAt,
    coreWindowPointCount: input.coreWindowPointCount,
    providerSource: 'dimo_core',
  });
}

export function observeEndValidationOutcome(input: {
  logger?: Logger;
  service?: TripEndValidationObservabilityService;
  organizationId: string | null;
  vehicleId: string;
  det: DetSlice;
  workerNow: Date;
  retryBudgetMax: number;
  outcome: (typeof TRIP_END_VALIDATION_OBSERVATION_OUTCOMES)[keyof typeof TRIP_END_VALIDATION_OBSERVATION_OUTCOMES];
  processPhase: TripEndValidationObservationInput['processPhase'];
  transitionToState?: TripDetectionState | null;
  endDetectionMode?: string | null;
  decisionReason?: string | null;
  detectorOutcome?: string | null;
  cusumReason?: string | null;
  retryCount?: number | null;
  canonicalEndBoundaryAt?: Date | null;
  coreWindowPointCount?: number | null;
  workerConfirmationAt?: Date | null;
}): void {
  const base = buildEndValidationObservationBase({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    det: input.det,
    workerNow: input.workerNow,
    retryBudgetMax: input.retryBudgetMax,
  });
  recordTripEndValidationObservationSafely(input.logger, input.service, {
    ...base,
    processPhase: input.processPhase,
    decisionOutcome: input.outcome,
    transitionToState: input.transitionToState ?? null,
    endDetectionMode: input.endDetectionMode ?? input.det.endDetectionMode ?? null,
    decisionReason: input.decisionReason ?? null,
    detectorOutcome: input.detectorOutcome ?? null,
    cusumReason: input.cusumReason ?? null,
    retryCount: input.retryCount ?? base.retryCount ?? null,
    canonicalEndBoundaryAt: input.canonicalEndBoundaryAt ?? input.det.cusumSegmentEnd ?? null,
    eventTimeAt: input.canonicalEndBoundaryAt ?? input.det.cusumSegmentEnd ?? null,
    coreWindowPointCount: input.coreWindowPointCount ?? null,
    workerConfirmationAt: input.workerConfirmationAt ?? input.det.cusumValidatedAt ?? null,
  });
}

export function observeFinalizeCommitted(input: {
  logger?: Logger;
  service?: TripEndValidationObservabilityService;
  organizationId: string | null;
  vehicleId: string;
  det: DetSlice;
  workerNow: Date;
  canonicalEndAt: Date;
  endRecognizedAt: Date;
  retryBudgetMax: number;
}): void {
  const base = buildEndValidationObservationBase({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    det: input.det,
    workerNow: input.workerNow,
    retryBudgetMax: input.retryBudgetMax,
  });
  recordTripEndValidationObservationSafely(input.logger, input.service, {
    ...base,
    processPhase: 'FINALIZE',
    decisionOutcome: TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.FINALIZE_COMMITTED,
    transitionToState: 'RESTING',
    endDetectionMode: input.det.endDetectionMode ?? null,
    decisionReason: 'finalize_trip_committed',
    canonicalEndBoundaryAt: input.canonicalEndAt,
    eventTimeAt: input.canonicalEndAt,
    workerConfirmationAt: input.endRecognizedAt,
  });
}
