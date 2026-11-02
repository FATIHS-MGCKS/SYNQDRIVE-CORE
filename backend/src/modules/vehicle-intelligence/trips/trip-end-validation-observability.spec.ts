import { TripDetectionState } from '@prisma/client';
import {
  buildTripEndValidationObservationIdempotencyKey,
  buildTripEndValidationObservationRow,
  resolveEndConfirmationSourceForMode,
} from './trip-end-validation-observability.domain';
import {
  isTripEndValidationObservabilityEnabledForVehicle,
  parseTripEndValidationObservabilityEnabled,
} from './trip-end-validation-observability.config';
import {
  TRIP_END_VALIDATION_OBSERVATION_OUTCOMES,
} from './trip-end-validation-observability.types';

const VEHICLE = 'veh-obs-1';

describe('trip-end-validation-observability config', () => {
  it('defaults to disabled', () => {
    expect(parseTripEndValidationObservabilityEnabled(undefined)).toBe(false);
    expect(
      isTripEndValidationObservabilityEnabledForVehicle(VEHICLE, {
        TRIP_END_VALIDATION_OBSERVABILITY_ENABLED: 'true',
        TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS: '',
      }),
    ).toBe(false);
  });

  it('enables only allowlisted vehicles with activation attestation', () => {
    expect(
      isTripEndValidationObservabilityEnabledForVehicle(VEHICLE, {
        TRIP_END_VALIDATION_OBSERVABILITY_ENABLED: 'true',
        TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS: VEHICLE,
      }),
    ).toBe(false);
    expect(
      isTripEndValidationObservabilityEnabledForVehicle(VEHICLE, {
        TRIP_END_VALIDATION_OBSERVABILITY_ENABLED: 'true',
        TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS: VEHICLE,
        TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK: 'true',
        TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT: 'true',
      }),
    ).toBe(true);
  });
});

describe('trip-end-validation-observability domain', () => {
  const workerNow = new Date('2026-11-02T10:00:00.000Z');
  const endAt = new Date('2026-11-02T09:58:00.000Z');

  it('builds stable idempotency keys for retries', () => {
    const keyA = buildTripEndValidationObservationIdempotencyKey({
      vehicleId: VEHICLE,
      tripId: 'trip-1',
      endCycleToken: 'cycle-a',
      processPhase: 'END_VALIDATION',
      decisionOutcome: TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CUSUM_INCONCLUSIVE_RETRY,
      retryCount: 2,
    });
    const keyB = buildTripEndValidationObservationIdempotencyKey({
      vehicleId: VEHICLE,
      tripId: 'trip-1',
      endCycleToken: 'cycle-a',
      processPhase: 'END_VALIDATION',
      decisionOutcome: TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CUSUM_INCONCLUSIVE_RETRY,
      retryCount: 2,
    });
    expect(keyA).toBe(keyB);
    const keyC = buildTripEndValidationObservationIdempotencyKey({
      vehicleId: VEHICLE,
      tripId: 'trip-1',
      endCycleToken: 'cycle-a',
      processPhase: 'END_VALIDATION',
      decisionOutcome: TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CUSUM_INCONCLUSIVE_RETRY,
      retryCount: 3,
    });
    expect(keyC).not.toBe(keyA);
  });

  it('separates endConfirmationSource from legacy cusumValidatedAt semantics', () => {
    expect(
      resolveEndConfirmationSourceForMode({
        endDetectionMode: 'CLICKHOUSE_END_ASSIST',
        processPhase: 'END_VALIDATION',
        decisionOutcome:
          TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CLICKHOUSE_END_ASSIST_CONFIRMED,
      }),
    ).toBe('CLICKHOUSE_SEGMENT_END');
    expect(
      resolveEndConfirmationSourceForMode({
        endDetectionMode: 'CUSUM_VALIDATED',
        processPhase: 'END_VALIDATION',
        decisionOutcome: TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CUSUM_VALIDATED,
      }),
    ).toBe('CUSUM_CHANGE_POINT');
  });

  it('maps observation row with explicit null timestamps when unknown', () => {
    const row = buildTripEndValidationObservationRow({
      organizationId: 'org-1',
      vehicleId: VEHICLE,
      tripId: 'trip-1',
      endCycleToken: 'cycle-a',
      fsmStateAtDecision: TripDetectionState.POSSIBLE_END,
      processPhase: 'END_VALIDATION',
      decisionOutcome: TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CUSUM_INCONCLUSIVE_RETRY,
      workerDecisionAt: workerNow,
      canonicalEndBoundaryAt: null,
      eventTimeAt: null,
      evidenceAvailableAt: null,
      workerConfirmationAt: null,
      decisionReason: 'cusum_threshold_not_crossed',
      retryCount: 1,
      retryBudgetMax: 3,
    });
    expect(row.idempotencyKey).toContain(VEHICLE);
    expect(row.workerConfirmationAt).toBeNull();
    expect(row.canonicalEndBoundaryAt).toBeNull();
    expect(row.endConfirmationSource).toBeNull();
  });

  it('records workerConfirmationAt separately from canonical boundary for CUSUM', () => {
    const row = buildTripEndValidationObservationRow({
      organizationId: 'org-1',
      vehicleId: VEHICLE,
      tripId: 'trip-1',
      endCycleToken: 'cycle-a',
      fsmStateAtDecision: TripDetectionState.POSSIBLE_END,
      processPhase: 'END_VALIDATION',
      decisionOutcome: TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CUSUM_VALIDATED,
      endDetectionMode: 'CUSUM_VALIDATED',
      endConfirmationSource: 'CUSUM_CHANGE_POINT',
      workerDecisionAt: workerNow,
      workerConfirmationAt: workerNow,
      canonicalEndBoundaryAt: endAt,
      eventTimeAt: endAt,
      retryCount: 1,
      retryBudgetMax: 3,
    });
    expect(row.workerConfirmationAt).toEqual(workerNow);
    expect(row.canonicalEndBoundaryAt).toEqual(endAt);
    expect(row.endConfirmationSource).toBe('CUSUM_CHANGE_POINT');
  });
});
