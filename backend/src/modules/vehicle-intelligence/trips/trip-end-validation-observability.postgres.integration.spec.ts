import { PrismaClient, TripDetectionState } from '@prisma/client';
import { TripMetricsService } from '../../observability/trip-metrics.service';
import { TripEndValidationObservabilityService } from './trip-end-validation-observability.service';
import {
  TRIP_END_VALIDATION_OBSERVATION_OUTCOMES,
} from './trip-end-validation-observability.types';
import {
  cleanupTripR11Fixture,
  createTripR11Ks661PreIdleFixture,
  probeTripR11Postgres,
  type TripR11PostgresFixture,
} from './testing/trip-r11-postgres-redis.integration.harness';

const LIVE = process.env.TRIP_END_VALIDATION_OBSERVABILITY_POSTGRES_INTEGRATION === '1';
const REQUIRED =
  process.env.TRIP_END_VALIDATION_OBSERVABILITY_POSTGRES_REQUIRED === '1';

if (REQUIRED && !LIVE) {
  throw new Error(
    'TRIP_END_VALIDATION_OBSERVABILITY_POSTGRES_REQUIRED=1 but integration flag is off',
  );
}

(LIVE ? describe : describe.skip)(
  'trip-end-validation-observability (Postgres integration)',
  () => {
    let prisma: PrismaClient;
    let service: TripEndValidationObservabilityService;
    let dbOk = false;
    let fixture: TripR11PostgresFixture;

    beforeAll(async () => {
      dbOk = await probeTripR11Postgres();
      if (REQUIRED && !dbOk) {
        throw new Error('Postgres probe failed in required CI mode');
      }
      if (!dbOk) return;
      prisma = new PrismaClient();
      service = new TripEndValidationObservabilityService(prisma as any, new TripMetricsService());
    }, 120_000);

    beforeEach(async () => {
      if (!dbOk) return;
      process.env.TRIP_END_VALIDATION_OBSERVABILITY_ENABLED = 'true';
      process.env.TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS = '';
      fixture = await createTripR11Ks661PreIdleFixture(prisma);
      process.env.TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS = fixture.vehicle.id;
    });

    afterEach(async () => {
      delete process.env.TRIP_END_VALIDATION_OBSERVABILITY_ENABLED;
      delete process.env.TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS;
      if (!dbOk || !fixture) return;
      await prisma.tripEndValidationDecisionObservation.deleteMany({
        where: { vehicleId: fixture.vehicle.id },
      });
      await cleanupTripR11Fixture(prisma, fixture);
    });

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('persists idempotently per end-cycle decision', async () => {
      const workerNow = new Date('2026-11-02T10:15:00.000Z');
      const input = {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        tripId: fixture.trip.id,
        endCycleToken: fixture.stopBoundaryAt.toISOString(),
        fsmStateAtDecision: TripDetectionState.POSSIBLE_END,
        processPhase: 'END_VALIDATION' as const,
        decisionOutcome:
          TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CUSUM_INCONCLUSIVE_RETRY,
        decisionReason: 'cusum_threshold_not_crossed',
        retryCount: 1,
        retryBudgetMax: 3,
        workerDecisionAt: workerNow,
        qualifiedStopBoundaryAt: fixture.stopBoundaryAt,
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
      process.env.TRIP_END_VALIDATION_OBSERVABILITY_ENABLED = 'false';
      const result = await service.record({
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        tripId: fixture.trip.id,
        endCycleToken: 'x',
        fsmStateAtDecision: TripDetectionState.POSSIBLE_END,
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
