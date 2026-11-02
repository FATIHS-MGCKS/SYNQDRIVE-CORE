import { PrismaClient, TripDetectionState } from '@prisma/client';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { TripMetricsService } from '../../observability/trip-metrics.service';
import { TripEndValidationObservabilityService } from './trip-end-validation-observability.service';
import {
  TDL_OBS_TEST_RETENTION_CONFIG,
} from './trip-end-validation-observability-test.helpers';
import {
  TRIP_END_VALIDATION_OBSERVATION_OUTCOMES,
} from './trip-end-validation-observability.types';

const LIVE = process.env.TRIP_END_VALIDATION_OBSERVABILITY_MIGRATION_POSTGRES === '1';
const REQUIRED = process.env.TRIP_END_VALIDATION_OBSERVABILITY_MIGRATION_POSTGRES_REQUIRED === '1';

if (REQUIRED && !LIVE) {
  throw new Error(
    'TRIP_END_VALIDATION_OBSERVABILITY_MIGRATION_POSTGRES_REQUIRED=1 but flag is off',
  );
}

async function probeObservationTable(prisma: PrismaClient): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1 FROM trip_end_validation_decision_observations LIMIT 1`;
    return true;
  } catch {
    return false;
  }
}

(LIVE ? describe : describe.skip)(
  'trip-end-validation-observability migration + rolling compatibility (Postgres)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;

    beforeAll(async () => {
      try {
        prisma = new PrismaClient();
        await prisma.$connect();
        dbOk = true;
      } catch {
        dbOk = false;
      }
      if (REQUIRED && !dbOk) {
        throw new Error('Postgres probe failed in required CI mode');
      }
    }, 120_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('applies prisma db push idempotently on empty CI database', async () => {
      if (!dbOk) return;
      const backendRoot = path.resolve(__dirname, '../../../../');
      execSync('npx prisma db push --accept-data-loss --skip-generate', {
        cwd: backendRoot,
        stdio: 'pipe',
        env: process.env,
      });
      expect(await probeObservationTable(prisma)).toBe(true);
    });

    it('flag OFF skips writes on migrated schema', async () => {
      if (!dbOk || !(await probeObservationTable(prisma))) return;
      delete process.env.TRIP_END_VALIDATION_OBSERVABILITY_ENABLED;
      delete process.env.TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS;

      const svc = new TripEndValidationObservabilityService(
        prisma as never,
        TDL_OBS_TEST_RETENTION_CONFIG,
        new TripMetricsService(),
      );
      const result = await svc.record({
        organizationId: 'org-off',
        vehicleId: 'veh-off',
        tripId: null,
        endCycleToken: 'cycle-off',
        fsmStateAtDecision: TripDetectionState.POSSIBLE_END,
        processPhase: 'END_VALIDATION',
        decisionOutcome:
          TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CUSUM_INCONCLUSIVE_RETRY,
        workerDecisionAt: new Date(),
      });
      expect(result).toBe('skipped');
    });

    it('flag ON without PR0 table fails closed (skipped, no FSM throw)', async () => {
      if (!dbOk) return;
      const create = jest.fn().mockRejectedValue(new Error('relation does not exist'));
      const prismaNoTable = {
        $queryRaw: jest.fn().mockResolvedValue([{ exists: false }]),
        tripEndValidationObservabilityRetentionPurgeRun: {
          findFirst: jest.fn(),
        },
        tripEndValidationDecisionObservation: { create },
      };
      process.env.TRIP_END_VALIDATION_OBSERVABILITY_ENABLED = 'true';
      process.env.TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS = 'veh-missing-table';
      process.env.TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK = 'true';
      process.env.TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT = 'true';
      process.env.TRIP_END_VALIDATION_OBSERVATION_RETENTION_READY_ACK = 'true';

      const svc = new TripEndValidationObservabilityService(
        prismaNoTable as never,
        TDL_OBS_TEST_RETENTION_CONFIG,
        new TripMetricsService(),
      );
      const result = await svc.record({
        organizationId: 'org-x',
        vehicleId: 'veh-missing-table',
        tripId: null,
        endCycleToken: 'c1',
        fsmStateAtDecision: TripDetectionState.POSSIBLE_END,
        processPhase: 'END_VALIDATION',
        decisionOutcome:
          TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CUSUM_INCONCLUSIVE_RETRY,
        workerDecisionAt: new Date(),
      });
      expect(result).toBe('skipped');
      expect(create).not.toHaveBeenCalled();

      delete process.env.TRIP_END_VALIDATION_OBSERVABILITY_ENABLED;
      delete process.env.TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS;
      delete process.env.TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK;
      delete process.env.TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT;
      delete process.env.TRIP_END_VALIDATION_OBSERVATION_RETENTION_READY_ACK;
    });

    it('PR1 purge audit table exists after db push', async () => {
      if (!dbOk) return;
      const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT to_regclass('public.trip_end_validation_observability_retention_purge_runs') IS NOT NULL AS exists
      `;
      expect(rows[0]?.exists).toBe(true);
    });
  },
);
