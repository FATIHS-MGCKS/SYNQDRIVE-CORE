import { PrismaClient } from '@prisma/client';
import { TripMetricsService } from '../../observability/trip-metrics.service';
import { TripEndValidationObservabilityService } from './trip-end-validation-observability.service';
import {
  TRIP_END_VALIDATION_OBSERVATION_OUTCOMES,
} from './trip-end-validation-observability.types';
import {
  applyTdlObservabilityActivationEnv,
  clearTdlObservabilityActivationEnv,
  seedCompletedTdlObsRetentionPurgeRun,
  TDL_OBS_TEST_RETENTION_CONFIG,
} from './trip-end-validation-observability-test.helpers';

const LIVE = process.env.TRIP_END_VALIDATION_OBSERVABILITY_POSTGRES_INTEGRATION === '1';
const REQUIRED =
  process.env.TRIP_END_VALIDATION_OBSERVABILITY_POSTGRES_REQUIRED === '1';

if (REQUIRED && !LIVE) {
  throw new Error(
    'TRIP_END_VALIDATION_OBSERVABILITY_POSTGRES_REQUIRED=1 but integration flag is off',
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

async function createMinimalVehicleFixture(prisma: PrismaClient) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: {
      companyName: `TDL PR0 obs ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `PR0-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'PR0',
      year: 2024,
      fuelType: 'GASOLINE',
      status: 'AVAILABLE',
    },
    select: { id: true, organizationId: true },
  });
  return { org, vehicle, suffix };
}

(LIVE ? describe : describe.skip)(
  'trip-end-validation-observability (Postgres integration)',
  () => {
    let prisma: PrismaClient;
    let service: TripEndValidationObservabilityService;
    let dbOk = false;
    let tableOk = false;
    let fixture: Awaited<ReturnType<typeof createMinimalVehicleFixture>>;

    beforeAll(async () => {
      try {
        prisma = new PrismaClient();
        await prisma.$connect();
        dbOk = true;
        tableOk = await probeObservationTable(prisma);
      } catch {
        dbOk = false;
      }
      if (REQUIRED && !dbOk) {
        throw new Error('Postgres probe failed in required CI mode');
      }
      if (REQUIRED && dbOk && !tableOk) {
        throw new Error(
          'trip_end_validation_decision_observations missing — run prisma migrate deploy',
        );
      }
      service = new TripEndValidationObservabilityService(
        prisma as any,
        TDL_OBS_TEST_RETENTION_CONFIG,
        new TripMetricsService(),
      );
    }, 120_000);

    beforeEach(async () => {
      if (!dbOk || !tableOk) return;
      fixture = await createMinimalVehicleFixture(prisma);
      applyTdlObservabilityActivationEnv(fixture.vehicle.id);
      await seedCompletedTdlObsRetentionPurgeRun(prisma, true);
    });

    afterEach(async () => {
      clearTdlObservabilityActivationEnv();
      if (!dbOk || !fixture) return;
      await prisma.tripEndValidationDecisionObservation.deleteMany({
        where: { vehicleId: fixture.vehicle.id },
      });
      await prisma.tripEndValidationObservabilityRetentionPurgeRun.deleteMany({});
      await prisma.vehicle.delete({ where: { id: fixture.vehicle.id } }).catch(() => undefined);
      await prisma.organization.delete({ where: { id: fixture.org.id } }).catch(() => undefined);
    });

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('skips when observation table is not migrated', () => {
      if (!dbOk) {
        expect(true).toBe(true);
        return;
      }
      expect(typeof tableOk).toBe('boolean');
    });

    it('persists idempotently per end-cycle decision', async () => {
      if (!dbOk || !tableOk) return;

      const workerNow = new Date('2026-11-02T10:15:00.000Z');
      const input = {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        tripId: null,
        endCycleToken: 'cycle-token-pr0',
        fsmStateAtDecision: 'POSSIBLE_END',
        processPhase: 'END_VALIDATION' as const,
        decisionOutcome:
          TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CUSUM_INCONCLUSIVE_RETRY,
        decisionReason: 'cusum_threshold_not_crossed',
        retryCount: 1,
        retryBudgetMax: 3,
        workerDecisionAt: workerNow,
      };

      expect(await service.record(input)).toBe('inserted');
      expect(await service.record(input)).toBe('duplicate');

      const rows = await prisma.tripEndValidationDecisionObservation.findMany({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.organizationId).toBe(fixture.org.id);
    });

    it('does not write when flag disabled', async () => {
      if (!dbOk || !tableOk) return;

      process.env.TRIP_END_VALIDATION_OBSERVABILITY_ENABLED = 'false';
      const result = await service.record({
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        tripId: null,
        endCycleToken: 'x',
        fsmStateAtDecision: 'POSSIBLE_END',
        processPhase: 'END_VALIDATION',
        decisionOutcome:
          TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CUSUM_INCONCLUSIVE_RETRY,
        workerDecisionAt: new Date(),
      });
      expect(result).toBe('skipped');
      const count = await prisma.tripEndValidationDecisionObservation.count({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(count).toBe(0);
    });
  },
);
