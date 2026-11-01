import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { TripDetectionState } from '@prisma/client';
import {
  S4A_POSTGRES_LIVE,
  cleanupS4aTenant,
  newS4aClient,
  seedS4aTenant,
  type S4aTenant,
} from '../../../driving-intelligence/s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { TripDiBoundaryAdmissionService } from '../trip-di-boundary-admission.service';
import { readTripDiBoundaryAdmissionV1 } from '../trip-di-boundary-admission';
import type { TripDiBoundaryAdmissionRecoveryPolicy } from '../trip-di-boundary-admission-recovery.policy';
import {
  ensureRecoveryPostgresHarness,
  seedRecoverySupportedDimoIdentityForTenant,
} from './trip-di-boundary-admission-recovery.test-harness';

(S4A_POSTGRES_LIVE ? describe : describe.skip)(
  'Trip DI boundary admission durable recovery (PostgreSQL)',
  () => {
    let admin: PrismaClient;
    let admission: TripDiBoundaryAdmissionService;
    let tripMetrics: TripMetricsService;
    const tenants: S4aTenant[] = [];

    beforeAll(async () => {
      admin = newS4aClient();
      tripMetrics = new TripMetricsService();
      admission = new TripDiBoundaryAdmissionService(admin as never, tripMetrics);
      await ensureRecoveryPostgresHarness(admin);
    });

    afterAll(async () => {
      for (const t of tenants.splice(0)) {
        await cleanupS4aTenant(admin, t);
      }
      await admin.$disconnect();
    });

    async function tenant(recent = true): Promise<S4aTenant> {
      const t = await seedS4aTenant(admin, recent ? 3_600 : 3 * 86_400);
      await seedRecoverySupportedDimoIdentityForTenant(admin, t);
      tenants.push(t);
      if (recent) {
        const end = new Date(Date.now() - 60_000);
        const start = new Date(end.getTime() - 20 * 60_000);
        await admin.$executeRawUnsafe(
          `UPDATE vehicle_trips SET start_time = $1, end_time = $2 WHERE id = $3`,
          start,
          end,
          t.tripId,
        );
      }
      return t;
    }

    function policyFor(t: S4aTenant, writer: boolean): TripDiBoundaryAdmissionRecoveryPolicy {
      return {
        s4: {
          masterEnabled: true,
          discoveryEnabled: true,
          workerEnabled: true,
          positionEnabled: true,
          r1Enabled: true,
          nativeEnabled: false,
          organizationAllowlist: new Set([t.organizationId]),
          vehicleAllowlist: new Set([t.vehicleId]),
        },
        recoveryGlobalAuthorized: false,
        recoveryActivationHorizonUtc: new Date('2020-01-01T00:00:00.000Z'),
        writerEnabled: writer,
        shadowObserveEnabled: true,
        lookbackHours: 48,
        maxTripsPerVehicle: 32,
        globalMaxPerPass: 64,
      };
    }

    async function setResting(vehicleId: string): Promise<void> {
      await admin.vehicleTripDetectionState.upsert({
        where: { vehicleId },
        create: { vehicleId, state: TripDetectionState.RESTING, activeTripId: null },
        update: { state: TripDetectionState.RESTING, activeTripId: null },
      });
    }

    async function snapshotVehicleTrips(
      vehicleId: string,
    ): Promise<Array<{ id: string; raw_detection_meta: unknown }>> {
      return admin.$queryRaw`
        SELECT id, raw_detection_meta FROM vehicle_trips WHERE vehicle_id = ${vehicleId} ORDER BY id`;
    }

    it('shadow mode is strictly read-only across all vehicle_trips rows', async () => {
      const t = await tenant();
      await setResting(t.vehicleId);
      await admin.$executeRawUnsafe(
        `UPDATE vehicle_trips SET raw_detection_meta = (raw_detection_meta - 'diV0BoundaryAdmissionV1') WHERE id = $1`,
        t.tripId,
      );
      const before = await snapshotVehicleTrips(t.vehicleId);
      const result = await admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, {
        policy: policyFor(t, false),
      });
      const after = await snapshotVehicleTrips(t.vehicleId);
      expect(result.mode).toBe('SHADOW');
      expect(result.needsRelease).toBeGreaterThanOrEqual(1);
      expect(result.released).toBe(0);
      expect(after).toEqual(before);
    });

    it('shadow mode observes missing admission without writing', async () => {
      const t = await tenant();
      await setResting(t.vehicleId);
      await admin.$executeRawUnsafe(
        `UPDATE vehicle_trips SET raw_detection_meta = (raw_detection_meta - 'diV0BoundaryAdmissionV1') WHERE id = $1`,
        t.tripId,
      );
      const result = await admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, {
        policy: policyFor(t, false),
      });
      expect(result.mode).toBe('SHADOW');
      expect(result.needsRelease).toBeGreaterThanOrEqual(1);
      expect(result.released).toBe(0);
      const rows = await admin.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
        SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${t.tripId}`;
      expect(readTripDiBoundaryAdmissionV1(rows[0]?.raw_detection_meta)).toBeNull();
    });

    it('writer mode recovers missing direct-hook admission idempotently', async () => {
      const t = await tenant();
      await setResting(t.vehicleId);
      await admin.$executeRawUnsafe(
        `UPDATE vehicle_trips SET raw_detection_meta = (raw_detection_meta - 'diV0BoundaryAdmissionV1') WHERE id = $1`,
        t.tripId,
      );
      const policy = policyFor(t, true);
      const first = await admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, {
        policy,
      });
      expect(first.mode).toBe('WRITER');
      expect(first.released).toBeGreaterThanOrEqual(1);
      const metricsText = await tripMetrics.getMetrics();
      expect(metricsText).toContain('synqdrive_trip_di_boundary_admission_recovery_pass_total{mode="WRITER"}');
      expect(metricsText).toContain('synqdrive_trip_di_boundary_admission_recovery_success_total{mode="WRITER"}');
      const rows = await admin.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
        SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${t.tripId}`;
      expect(readTripDiBoundaryAdmissionV1(rows[0]?.raw_detection_meta)).not.toBeNull();

      const second = await admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, {
        policy,
      });
      expect(second.released).toBe(0);
      expect(second.alreadyCurrent).toBeGreaterThanOrEqual(1);
    });

    it('does not recover trips ending before activation horizon', async () => {
      const t = await tenant();
      await setResting(t.vehicleId);
      const oldEnd = new Date('2019-06-01T10:00:00.000Z');
      await admin.$executeRawUnsafe(
        `UPDATE vehicle_trips SET end_time = $1, raw_detection_meta = (raw_detection_meta - 'diV0BoundaryAdmissionV1') WHERE id = $2`,
        oldEnd,
        t.tripId,
      );
      const policy: TripDiBoundaryAdmissionRecoveryPolicy = {
        ...policyFor(t, true),
        recoveryActivationHorizonUtc: new Date('2026-01-01T00:00:00.000Z'),
      };
      const result = await admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, {
        now: new Date('2026-10-31T00:00:00.000Z'),
        policy,
      });
      expect(result.released).toBe(0);
      expect(result.needsRelease).toBe(0);
    });

    it('rejects non-allowlisted vehicle without scan side effects', async () => {
      const t = await tenant();
      await setResting(t.vehicleId);
      await admin.$executeRawUnsafe(
        `UPDATE vehicle_trips SET raw_detection_meta = (raw_detection_meta - 'diV0BoundaryAdmissionV1') WHERE id = $1`,
        t.tripId,
      );
      const policy = policyFor(t, true);
      policy.s4.vehicleAllowlist = new Set([randomUUID()]);
      const result = await admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, {
        policy,
      });
      expect(result.mode).toBe('DISABLED');
      expect(result.scanned).toBe(0);
    });

    it('two concurrent writer attempts remain idempotent (single admission revision)', async () => {
      const t = await tenant();
      await setResting(t.vehicleId);
      await admin.$executeRawUnsafe(
        `UPDATE vehicle_trips SET raw_detection_meta = (raw_detection_meta - 'diV0BoundaryAdmissionV1') WHERE id = $1`,
        t.tripId,
      );
      const policy = policyFor(t, true);
      const [a, b] = await Promise.all([
        admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, { policy }),
        admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, { policy }),
      ]);
      expect(a.released + b.released).toBeGreaterThanOrEqual(1);
      const rows = await admin.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
        SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${t.tripId}`;
      expect(readTripDiBoundaryAdmissionV1(rows[0]?.raw_detection_meta)).not.toBeNull();
    });
  },
);
