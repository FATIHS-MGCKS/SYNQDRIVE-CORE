import { TripDetectionState } from '@prisma/client';
import { recordTripEndValidationObservationSafely } from './trip-end-validation-observability.integration';
import { TripEndValidationObservabilityService } from './trip-end-validation-observability.service';
import {
  TRIP_END_VALIDATION_OBSERVATION_OUTCOMES,
} from './trip-end-validation-observability.types';

import {
  TRIP_END_VALIDATION_OBSERVATION_RETENTION_READY_ACK_ENV,
  TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT_ENV,
  TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK_ENV,
} from './trip-end-validation-observability.config';
import {
  buildMockPrismaPassingObservabilityActivation,
  TDL_OBS_TEST_RETENTION_CONFIG,
} from './trip-end-validation-observability-test.helpers';

function enableObservabilityForVehicle(vehicleId: string): void {
  process.env.TRIP_END_VALIDATION_OBSERVABILITY_ENABLED = 'true';
  process.env.TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS = vehicleId;
  process.env[TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK_ENV] = 'true';
  process.env[TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT_ENV] = 'true';
  process.env[TRIP_END_VALIDATION_OBSERVATION_RETENTION_READY_ACK_ENV] = 'true';
}

function disableObservabilityEnv(): void {
  delete process.env.TRIP_END_VALIDATION_OBSERVABILITY_ENABLED;
  delete process.env.TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS;
  delete process.env[TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK_ENV];
  delete process.env[TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT_ENV];
  delete process.env[TRIP_END_VALIDATION_OBSERVATION_RETENTION_READY_ACK_ENV];
}

describe('trip-end-validation-observability safety (fire-and-forget)', () => {
  const vehicleId = 'veh-parity-1';
  const baseInput = {
    organizationId: 'org-1',
    vehicleId,
    tripId: 'trip-1',
    endCycleToken: 'cycle-1',
    fsmStateAtDecision: TripDetectionState.POSSIBLE_END,
    processPhase: 'END_VALIDATION' as const,
    decisionOutcome:
      TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CUSUM_INCONCLUSIVE_RETRY,
    workerDecisionAt: new Date('2026-11-02T10:00:00.000Z'),
  };

  it('does not invoke record when service is undefined (flag-off parity path)', () => {
    const record = jest.fn();
    recordTripEndValidationObservationSafely(undefined, undefined, baseInput);
    expect(record).not.toHaveBeenCalled();
  });

  it('does not invoke record when vehicle is not allowlisted (enabled gate)', async () => {
    const prev = process.env.TRIP_END_VALIDATION_OBSERVABILITY_ENABLED;
    const prevIds = process.env.TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS;
    enableObservabilityForVehicle('other-vehicle');

    const create = jest.fn();
    const service = new TripEndValidationObservabilityService(
      { tripEndValidationDecisionObservation: { create } } as any,
      TDL_OBS_TEST_RETENTION_CONFIG,
    );

    recordTripEndValidationObservationSafely(undefined, service, baseInput);
    await new Promise((r) => setImmediate(r));
    expect(create).not.toHaveBeenCalled();

    process.env.TRIP_END_VALIDATION_OBSERVABILITY_ENABLED = prev;
    process.env.TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS = prevIds;
    delete process.env[TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK_ENV];
  delete process.env[TRIP_END_VALIDATION_OBSERVATION_RETENTION_READY_ACK_ENV];
});

  it('absorbs writer failures without unhandledRejection', async () => {
    const prev = process.env.TRIP_END_VALIDATION_OBSERVABILITY_ENABLED;
    const prevIds = process.env.TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS;
    enableObservabilityForVehicle(vehicleId);

    const unhandled: unknown[] = [];
    const onRejection = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onRejection);

    const logger = { warn: jest.fn() };
    const create = jest.fn().mockRejectedValue(new Error('relation does not exist'));
    const service = new TripEndValidationObservabilityService(
      buildMockPrismaPassingObservabilityActivation({ create }) as any,
      TDL_OBS_TEST_RETENTION_CONFIG,
    );

    recordTripEndValidationObservationSafely(logger as any, service, baseInput);

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    process.off('unhandledRejection', onRejection);
    process.env.TRIP_END_VALIDATION_OBSERVABILITY_ENABLED = prev;
    process.env.TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS = prevIds;
    delete process.env[TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK_ENV];
    delete process.env[TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT_ENV];

    expect(unhandled).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
    expect(String(logger.warn.mock.calls[0]?.[0])).toContain(
      'trip_end_validation_observability_persist',
    );
  });

  it('does not await record (scheduler ordering unchanged vs sync FSM body)', () => {
    enableObservabilityForVehicle(vehicleId);

    let resolveRecord!: (v: 'inserted') => void;
    const recordPromise = new Promise<'inserted'>((r) => {
      resolveRecord = r;
    });
    const create = jest.fn(() => recordPromise);
    const service = new TripEndValidationObservabilityService(
      buildMockPrismaPassingObservabilityActivation({ create }) as any,
      TDL_OBS_TEST_RETENTION_CONFIG,
    );

    const t0 = Date.now();
    recordTripEndValidationObservationSafely(undefined, service, baseInput);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(20);
    resolveRecord('inserted');

    disableObservabilityEnv();
  });
});

describe('trip-end-validation-observability migration compatibility (writer)', () => {
  it('returns duplicate on P2002 without throwing to caller', async () => {
    const { Prisma } = await import('@prisma/client');
    const { TripEndValidationObservabilityService } = await import(
      './trip-end-validation-observability.service'
    );

    const create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const prisma = buildMockPrismaPassingObservabilityActivation({ create });

    process.env.TRIP_END_VALIDATION_OBSERVABILITY_ENABLED = 'true';
    process.env.TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS = 'veh-mig-1';
    process.env[TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK_ENV] = 'true';
    process.env[TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT_ENV] = 'true';
    process.env[TRIP_END_VALIDATION_OBSERVATION_RETENTION_READY_ACK_ENV] = 'true';

    const svc = new TripEndValidationObservabilityService(
      prisma as any,
      TDL_OBS_TEST_RETENTION_CONFIG,
    );
    const result = await svc.record({
      organizationId: 'org',
      vehicleId: 'veh-mig-1',
      tripId: 't1',
      endCycleToken: 'c1',
      fsmStateAtDecision: TripDetectionState.POSSIBLE_END,
      processPhase: 'END_VALIDATION',
      decisionOutcome:
        TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CUSUM_INCONCLUSIVE_RETRY,
      workerDecisionAt: new Date(),
    });
    expect(result).toBe('duplicate');

    disableObservabilityEnv();
  });
});
