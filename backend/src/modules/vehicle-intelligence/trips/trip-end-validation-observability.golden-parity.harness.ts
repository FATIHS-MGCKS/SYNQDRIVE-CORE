import type { PrismaClient } from '@prisma/client';
import { TripMetricsService } from '../../observability/trip-metrics.service';
import { TripEndValidationObservabilityService } from './trip-end-validation-observability.service';
import {
  TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT_ENV,
  TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK_ENV,
  TRIP_END_VALIDATION_OBSERVABILITY_ENABLED_ENV,
  TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS_ENV,
  TRIP_END_VALIDATION_OBSERVATION_RETENTION_READY_ACK_ENV,
} from './trip-end-validation-observability.config';
import {
  TRIP_END_VALIDATION_OBSERVATION_RETENTION_DRY_RUN_ENV,
  TRIP_END_VALIDATION_OBSERVATION_RETENTION_ENABLED_ENV,
} from '@config/trip-end-validation-observability-retention.config';
import { TDL_OBS_TEST_RETENTION_CONFIG } from './trip-end-validation-observability-test.helpers';
import type { FsmGoldenFingerprint } from './trip-end-validation-observability.golden-fsm.util';

export function setTripEndValidationObservabilityTestEnv(
  vehicleId: string,
  enabled: boolean,
): void {
  clearTripEndValidationObservabilityTestEnv();
  if (!enabled) return;
  process.env[TRIP_END_VALIDATION_OBSERVABILITY_ENABLED_ENV] = 'true';
  process.env[TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS_ENV] = vehicleId;
  process.env[TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK_ENV] = 'true';
  process.env[TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT_ENV] = 'true';
  process.env[TRIP_END_VALIDATION_OBSERVATION_RETENTION_READY_ACK_ENV] = 'true';
  process.env[TRIP_END_VALIDATION_OBSERVATION_RETENTION_ENABLED_ENV] = 'true';
  process.env[TRIP_END_VALIDATION_OBSERVATION_RETENTION_DRY_RUN_ENV] = 'true';
}

export function clearTripEndValidationObservabilityTestEnv(): void {
  delete process.env[TRIP_END_VALIDATION_OBSERVABILITY_ENABLED_ENV];
  delete process.env[TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS_ENV];
  delete process.env[TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK_ENV];
  delete process.env[TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT_ENV];
  delete process.env[TRIP_END_VALIDATION_OBSERVATION_RETENTION_READY_ACK_ENV];
  delete process.env[TRIP_END_VALIDATION_OBSERVATION_RETENTION_ENABLED_ENV];
  delete process.env[TRIP_END_VALIDATION_OBSERVATION_RETENTION_DRY_RUN_ENV];
}

export function buildTripEndValidationObservabilityService(
  prisma: PrismaClient,
): TripEndValidationObservabilityService {
  return new TripEndValidationObservabilityService(
    prisma as never,
    TDL_OBS_TEST_RETENTION_CONFIG,
    new TripMetricsService(),
  );
}

export async function waitForTripEndValidationObservations(
  prisma: PrismaClient,
  vehicleId: string,
  minRows: number,
  timeoutMs = 8_000,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let count = 0;
  while (Date.now() < deadline) {
    count = await prisma.tripEndValidationDecisionObservation.count({
      where: { vehicleId },
    });
    if (count >= minRows) return count;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return count;
}

export type { FsmGoldenFingerprint };
