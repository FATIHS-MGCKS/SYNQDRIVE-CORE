import { PrismaClient } from '@prisma/client';
import { TripDecisionEngine } from '../decision/trip-decision.engine';
import { TripReconciliationService } from './trip-reconciliation.service';
import { stubTripDiBoundaryAdmissionService } from './__tests__/trip-reconciliation-di-admission.stub';
import { buildIntraTripGapSplitRepairAuditId } from './intra-trip-gap-split-repair-id.util';
import { REPAIR_STATUS } from './reconciliation.types';
import {
  cleanupIntraTripGapSplitPostgresFixture,
  createIntraTripGapSplitPostgresFixture,
  probeIntraTripGapSplitDatabase,
  type IntraTripGapSplitPostgresFixture,
} from '../testing/intra-trip-gap-split-postgres.integration.harness';

const LIVE = process.env.INTRA_TRIP_GAP_SPLIT_POSTGRES_INTEGRATION === '1';

function buildService(
  prisma: PrismaClient,
  engine?: TripDecisionEngine,
): TripReconciliationService {
  const decisionEngine = engine ?? new TripDecisionEngine(prisma as never);
  return new TripReconciliationService(
    prisma as never,
    decisionEngine,
    {} as never,
    {} as never,
    {} as never,
    stubTripDiBoundaryAdmissionService(),
    {} as never,
    {} as never,
    {} as never,
  );
}

(LIVE ? describe : describe.skip)(
  'INTRA_TRIP_GAP_SPLIT PostgreSQL atomicity (DATABASE_URL)',
  () => {
    let prismaA: PrismaClient;
    let prismaB: PrismaClient;
    let fixture: IntraTripGapSplitPostgresFixture;

    beforeAll(async () => {
      const dbOk = await probeIntraTripGapSplitDatabase();
      if (!dbOk) {
        throw new Error(
          'INTRA_TRIP_GAP_SPLIT_POSTGRES_INTEGRATION=1 requires reachable DATABASE_URL',
        );
      }
      prismaA = new PrismaClient();
      prismaB = new PrismaClient();
    }, 60_000);

    beforeEach(async () => {
      fixture = await createIntraTripGapSplitPostgresFixture(prismaA);
    });

    afterEach(async () => {
      if (!fixture) return;
      await cleanupIntraTripGapSplitPostgresFixture(prismaA, fixture);
    });

    afterAll(async () => {
      await prismaA?.$disconnect().catch(() => undefined);
      await prismaB?.$disconnect().catch(() => undefined);
    });

    const applyOnce = async (service: TripReconciliationService) => {
      const repairId = buildIntraTripGapSplitRepairAuditId(
        fixture.vehicle.id,
        fixture.gap.firstEndAt,
        fixture.gap.secondStartAt,
      );
      return (
        service as never as {
          applyIntraTripGapSplitRepairAtomically: (input: unknown) => Promise<unknown>;
        }
      ).applyIntraTripGapSplitRepairAtomically({
        repairId,
        vehicleId: fixture.vehicle.id,
        tripId: fixture.trip.id,
        gap: {
          ...fixture.gap,
          driftM: 12,
          preWaypointCount: 4,
          postWaypointCount: 3,
        },
        tier: 'warm',
        reason: 'pg integration',
        detectorEvidence: { repairIdentity: repairId },
        current: {
          id: fixture.trip.id,
          startTime: fixture.trip.startTime,
          endTime: fixture.trip.endTime,
          endLatitude: fixture.trip.endLatitude,
          endLongitude: fixture.trip.endLongitude,
          distanceKm: fixture.trip.distanceKm,
          detectionProfile: 'ICE',
        },
      });
    };

    it('POSTGRES_CONCURRENT_TWIN_TEST: two Prisma clients, one committed mutation', async () => {
      const serviceA = buildService(prismaA);
      const serviceB = buildService(prismaB);
      const [pidA, pidB] = await Promise.all([
        prismaA.$queryRaw<[{ pid: number }]>`SELECT pg_backend_pid() as pid`,
        prismaB.$queryRaw<[{ pid: number }]>`SELECT pg_backend_pid() as pid`,
      ]);
      expect(pidA[0].pid).not.toBe(pidB[0].pid);

      const [a, b] = await Promise.all([applyOnce(serviceA), applyOnce(serviceB)]);
      const outcomes = [a, b].map((r: any) => r.outcome);
      expect(outcomes.filter((o) => o === 'APPLY_COMMITTED').length).toBe(1);
      expect(outcomes.filter((o) => o === 'IDEMPOTENT_SKIP').length).toBe(1);

      const trips = await prismaA.vehicleTrip.findMany({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(trips).toHaveLength(2);

      const repairs = await prismaA.tripRepair.findMany({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(repairs.filter((r) => r.status === REPAIR_STATUS.APPLIED)).toHaveLength(1);
    });

    it('POSTGRES_ROLLBACK_TEST: mid-split failure rolls back all writes', async () => {
      const engine = new TripDecisionEngine(prismaA as never);
      const splitSpy = jest
        .spyOn(engine, 'splitTripAtGap')
        .mockImplementationOnce(async () => {
          throw new Error('forced mid-split failure');
        });

      const service = buildService(prismaA, engine);
      await expect(applyOnce(service)).rejects.toThrow('forced mid-split failure');
      splitSpy.mockRestore();

      const trips = await prismaA.vehicleTrip.findMany({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(trips).toHaveLength(1);

      const repair = await prismaA.tripRepair.findFirst({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(repair).toBeNull();
    });

    it('POSTGRES_RETRY_TEST: retry after rollback applies once', async () => {
      const engine = new TripDecisionEngine(prismaA as never);
      jest.spyOn(engine, 'finalizeRepairedTrip').mockImplementationOnce(async () => {
        throw new Error('forced before APPLIED');
      });

      const service = buildService(prismaA, engine);
      await expect(applyOnce(service)).rejects.toThrow('forced before APPLIED');

      const tripsAfterFail = await prismaA.vehicleTrip.findMany({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(tripsAfterFail).toHaveLength(1);

      const retry = (await applyOnce(buildService(prismaA))) as { outcome: string };
      expect(retry.outcome).toBe('APPLY_COMMITTED');

      const tripsAfterRetry = await prismaA.vehicleTrip.findMany({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(tripsAfterRetry).toHaveLength(2);
    });
  },
);
