import type { ConfigType } from '@nestjs/config';
import type tripEndValidationObservabilityRetentionConfig from '@config/trip-end-validation-observability-retention.config';
import type { PrismaClient } from '@prisma/client';
import { TDL_EV_OBS_RETENTION_PURGE_STATUS } from './trip-end-validation-observability-retention.types';

export const TDL_OBS_TEST_RETENTION_CONFIG: ConfigType<
  typeof tripEndValidationObservabilityRetentionConfig
> = {
  enabled: true,
  dryRun: true,
  retentionDays: 90,
  batchSize: 500,
  maxBatchesPerRun: 200,
};

export function applyTdlObservabilityActivationEnv(vehicleId: string): void {
  process.env.TRIP_END_VALIDATION_OBSERVABILITY_ENABLED = 'true';
  process.env.TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS = vehicleId;
  process.env.TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK = 'true';
  process.env.TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT = 'true';
  process.env.TRIP_END_VALIDATION_OBSERVATION_RETENTION_READY_ACK = 'true';
  process.env.TRIP_END_VALIDATION_OBSERVATION_RETENTION_ENABLED = 'true';
  process.env.TRIP_END_VALIDATION_OBSERVATION_RETENTION_DAYS = '90';
  process.env.TRIP_END_VALIDATION_OBSERVATION_RETENTION_DRY_RUN = 'true';
}

export function clearTdlObservabilityActivationEnv(): void {
  delete process.env.TRIP_END_VALIDATION_OBSERVABILITY_ENABLED;
  delete process.env.TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS;
  delete process.env.TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK;
  delete process.env.TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT;
  delete process.env.TRIP_END_VALIDATION_OBSERVATION_RETENTION_READY_ACK;
  delete process.env.TRIP_END_VALIDATION_OBSERVATION_RETENTION_ENABLED;
  delete process.env.TRIP_END_VALIDATION_OBSERVATION_RETENTION_DAYS;
  delete process.env.TRIP_END_VALIDATION_OBSERVATION_RETENTION_DRY_RUN;
}

export async function seedCompletedTdlObsRetentionPurgeRun(
  prisma: PrismaClient,
  dryRun = true,
): Promise<void> {
  await prisma.tripEndValidationObservabilityRetentionPurgeRun.create({
    data: {
      trigger: 'manual',
      dryRun,
      status: TDL_EV_OBS_RETENTION_PURGE_STATUS.COMPLETED,
      eligibleCount: 0,
      rowsDeleted: 0,
      batchCount: 0,
      durationMs: 1,
      completedAt: new Date(),
    },
  });
}

/** Mocks PostgreSQL activation gates for unit tests (tables exist + completed purge proof). */
export function buildMockPrismaPassingObservabilityActivation(handlers: {
  create: jest.Mock | ((...args: unknown[]) => Promise<unknown>);
  queryRaw?: jest.Mock;
}): {
  $queryRaw: jest.Mock;
  tripEndValidationObservabilityRetentionPurgeRun: { findFirst: jest.Mock };
  tripEndValidationDecisionObservation: { create: jest.Mock | ((...args: unknown[]) => Promise<unknown>) };
} {
  return {
    $queryRaw:
      handlers.queryRaw ??
      jest.fn().mockResolvedValue([{ exists: true }]),
    tripEndValidationObservabilityRetentionPurgeRun: {
      findFirst: jest.fn().mockResolvedValue({
        completedAt: new Date(),
        status: TDL_EV_OBS_RETENTION_PURGE_STATUS.COMPLETED,
        dryRun: true,
      }),
    },
    tripEndValidationDecisionObservation: {
      create: handlers.create as jest.Mock,
    },
  };
}
