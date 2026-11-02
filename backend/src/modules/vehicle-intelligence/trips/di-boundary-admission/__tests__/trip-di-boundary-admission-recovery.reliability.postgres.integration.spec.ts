import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { TripDetectionState } from '@prisma/client';
import {
  S4A_POSTGRES_LIVE,
  cleanupS4aTenant,
  newS4aClient,
  s4aConfigFor,
  s4aManifestFor,
  seedS4aTenant,
  type S4aTenant,
} from '../../../driving-intelligence/s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { DiV0S4WorkItemRepository } from '../../../driving-intelligence/s4a-foundation/di-v0-s4a-work-item.repository';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { TripDiBoundaryAdmissionService } from '../trip-di-boundary-admission.service';
import { buildTripDiBoundaryRevisionKey, readTripDiBoundaryAdmissionV1 } from '../trip-di-boundary-admission';
import type { TripDiBoundaryAdmissionRecoveryPolicy } from '../trip-di-boundary-admission-recovery.policy';
import { TripDiBoundaryAdmissionRecoveryFleetBudget } from '../trip-di-boundary-admission-recovery.fleet-budget';
import { isDiV0S4Rejection } from '../../../driving-intelligence/s4a-foundation/di-v0-s4a-errors';
import {
  PARTIAL_TRIP_BOUNDARY_EXTENSION_REPAIR_TYPE,
  buildBoundaryRepairGeneration,
} from '../../boundary-repair.state.util';
import {
  ensureRecoveryPostgresHarness,
  seedRecoverySupportedDimoIdentityForTenant,
} from './trip-di-boundary-admission-recovery.test-harness';

(S4A_POSTGRES_LIVE ? describe : describe.skip)(
  'Trip DI boundary admission recovery reliability (PostgreSQL)',
  () => {
    let admin: PrismaClient;
    let admission: TripDiBoundaryAdmissionService;
    const tenants: S4aTenant[] = [];

    beforeAll(async () => {
      admin = newS4aClient();
      admission = new TripDiBoundaryAdmissionService(admin as never, new TripMetricsService());
      await ensureRecoveryPostgresHarness(admin);
    });

    afterAll(async () => {
      for (const t of tenants.splice(0)) {
        await cleanupS4aTenant(admin, t);
      }
      await admin.$disconnect();
    });

    async function tenant(): Promise<S4aTenant> {
      const t = await seedS4aTenant(admin, 3_600);
      await seedRecoverySupportedDimoIdentityForTenant(admin, t);
      tenants.push(t);
      return t;
    }

    function policyFor(
      t: S4aTenant,
      writer: boolean,
      overrides?: Partial<TripDiBoundaryAdmissionRecoveryPolicy>,
    ): TripDiBoundaryAdmissionRecoveryPolicy {
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
        ...overrides,
      };
    }

    async function setResting(vehicleId: string, state: TripDetectionState = TripDetectionState.RESTING) {
      await admin.vehicleTripDetectionState.upsert({
        where: { vehicleId },
        create: { vehicleId, state, activeTripId: null },
        update: { state, activeTripId: null },
      });
    }

    async function insertCompletedTrip(
      t: S4aTenant,
      endOffsetMinutes: number,
      withAdmission: boolean,
    ): Promise<string> {
      const tripId = randomUUID();
      const end = new Date(Date.now() - endOffsetMinutes * 60_000);
      const start = new Date(end.getTime() - 15 * 60_000);
      await admin.$executeRawUnsafe(
        `INSERT INTO vehicle_trips (id, vehicle_id, trip_status, start_time, end_time, dimo_segment_id, created_at)
         VALUES ($1, $2, 'COMPLETED', $3, $4, $5, NOW())`,
        tripId,
        t.vehicleId,
        start,
        end,
        `seg-${tripId}`,
      );
      if (withAdmission) {
        await admission.tryReleaseForTripTransactional(tripId);
      }
      return tripId;
    }

    async function loadTripRevisionScope(t: S4aTenant, tripId: string) {
      const rows = await admin.$queryRaw<
        Array<{
          trip_status: string;
          start_time: Date;
          end_time: Date;
          dimo_segment_id: string | null;
          merge_parent_trip_id: string | null;
          raw_detection_meta: unknown;
        }>
      >`SELECT trip_status, start_time, end_time, dimo_segment_id, merge_parent_trip_id, raw_detection_meta
        FROM vehicle_trips WHERE id = ${tripId}`;
      const row = rows[0]!;
      return {
        organizationId: t.organizationId,
        vehicleId: t.vehicleId,
        tripId,
        tripStatus: row.trip_status,
        startTime: row.start_time,
        endTime: row.end_time,
        dimoSegmentId: row.dimo_segment_id,
        mergeParentTripId: row.merge_parent_trip_id,
        rawDetectionMeta: row.raw_detection_meta,
      };
    }

    /** Drift canonical boundary inputs while preserving the existing admission record (true stale revision). */
    async function applyCommittedBoundaryRepairDrift(t: S4aTenant, tripId: string) {
      const scope = await loadTripRevisionScope(t, tripId);
      const admissionBefore = readTripDiBoundaryAdmissionV1(scope.rawDetectionMeta);
      expect(admissionBefore).not.toBeNull();
      const auditId = randomUUID();
      await admin.$executeRawUnsafe(
        `UPDATE vehicle_trips SET raw_detection_meta = COALESCE(raw_detection_meta, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
        JSON.stringify({
          boundaryRepair: {
            auditId,
            providerSegmentId: scope.dimoSegmentId ?? `seg-${tripId}`,
            newStartTime: scope.startTime.toISOString(),
            newEndTime: scope.endTime!.toISOString(),
          },
        }),
        tripId,
      );
      const afterScope = await loadTripRevisionScope(t, tripId);
      const currentRevisionKey = buildTripDiBoundaryRevisionKey(afterScope);
      expect(admissionBefore!.revisionKey).not.toEqual(currentRevisionKey);
      expect(readTripDiBoundaryAdmissionV1(afterScope.rawDetectionMeta)?.revisionKey).toBe(
        admissionBefore!.revisionKey,
      );
      return { admissionBefore: admissionBefore!, currentRevisionKey };
    }

    async function insertGuardedMissingTrip(t: S4aTenant, endOffsetMinutes: number): Promise<string> {
      const tripId = randomUUID();
      const end = new Date(Date.now() - endOffsetMinutes * 60_000);
      const start = new Date(end.getTime() - 15 * 60_000);
      await admin.$executeRawUnsafe(
        `INSERT INTO vehicle_trips (id, vehicle_id, trip_status, start_time, end_time, dimo_segment_id, created_at, raw_detection_meta)
         VALUES ($1, $2, 'COMPLETED', $3, $4, $5, NOW(), $6::jsonb)`,
        tripId,
        t.vehicleId,
        start,
        end,
        `seg-${tripId}`,
        JSON.stringify({
          boundaryRefresh: {
            state: 'PENDING',
            generation: `gen-${tripId}`,
            requestedAt: new Date().toISOString(),
            attempts: 1,
            stages: { route: 'pending', behavior: 'pending', drivingImpact: 'pending' },
          },
        }),
      );
      return tripId;
    }

    it('33+ starvation: missing admission is found when older trips are already current', async () => {
      const t = await tenant();
      await setResting(t.vehicleId);
      for (let i = 40; i > 8; i -= 1) {
        await insertCompletedTrip(t, i, true);
      }
      const missingId = await insertCompletedTrip(t, 5, false);
      const result = await admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, {
        policy: policyFor(t, true, { maxTripsPerVehicle: 32 }),
      });
      expect(result.needsRelease).toBeGreaterThanOrEqual(1);
      expect(result.released).toBeGreaterThanOrEqual(1);
      const rows = await admin.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
        SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${missingId}`;
      expect(readTripDiBoundaryAdmissionV1(rows[0]?.raw_detection_meta)).not.toBeNull();
    });

    it('missing admission beyond first writer batch is recovered on a second pass', async () => {
      const t = await tenant();
      await setResting(t.vehicleId);
      const missing: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        missing.push(await insertCompletedTrip(t, 10 + i, false));
      }
      const policy = policyFor(t, true, { maxTripsPerVehicle: 32, globalMaxPerPass: 1 });
      const budget = new TripDiBoundaryAdmissionRecoveryFleetBudget(1);
      await admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, { policy, fleetBudget: budget });
      await admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, {
        policy: policyFor(t, true, { globalMaxPerPass: 2 }),
      });
      const admitted = await Promise.all(
        missing.map(async (id) => {
          const rows = await admin.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
            SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${id}`;
          return readTripDiBoundaryAdmissionV1(rows[0]?.raw_detection_meta) != null;
        }),
      );
      expect(admitted.filter(Boolean).length).toBeGreaterThanOrEqual(2);
    });

    it('two vehicles share one global writer budget in a scheduler cycle', async () => {
      const t1 = await tenant();
      const t2 = await tenant();
      await setResting(t1.vehicleId);
      await setResting(t2.vehicleId);
      const policy1 = policyFor(t1, true, {
        s4: {
          ...policyFor(t1, true).s4,
          vehicleAllowlist: new Set([t1.vehicleId]),
          organizationAllowlist: new Set([t1.organizationId]),
        },
      });
      const policy2 = policyFor(t2, true, {
        s4: {
          ...policyFor(t2, true).s4,
          vehicleAllowlist: new Set([t2.vehicleId]),
          organizationAllowlist: new Set([t2.organizationId]),
        },
      });
      await admin.$executeRawUnsafe(
        `UPDATE vehicle_trips SET raw_detection_meta = (raw_detection_meta - 'diV0BoundaryAdmissionV1') WHERE vehicle_id IN ($1, $2)`,
        t1.vehicleId,
        t2.vehicleId,
      );
      const budget = new TripDiBoundaryAdmissionRecoveryFleetBudget(1);
      const r1 = await admission.runDurableAdmissionRecoveryPass(t1.organizationId, t1.vehicleId, {
        policy: policy1,
        fleetBudget: budget,
      });
      const r2 = await admission.runDurableAdmissionRecoveryPass(t2.organizationId, t2.vehicleId, {
        policy: policy2,
        fleetBudget: budget,
      });
      expect(r1.released + r2.released).toBe(1);
      expect(budget.remainingAttempts).toBe(0);
    });

    it('ACTIVE FSM state blocks recovery; missing row remains explicit fallback', async () => {
      const t = await tenant();
      await admin.vehicleTripDetectionState.upsert({
        where: { vehicleId: t.vehicleId },
        create: {
          vehicleId: t.vehicleId,
          state: TripDetectionState.ACTIVE_TRIP,
          activeTripId: t.tripId,
        },
        update: {
          state: TripDetectionState.ACTIVE_TRIP,
          activeTripId: t.tripId,
        },
      });
      await admin.$executeRawUnsafe(
        `UPDATE vehicle_trips SET raw_detection_meta = (raw_detection_meta - 'diV0BoundaryAdmissionV1') WHERE id = $1`,
        t.tripId,
      );
      const blocked = await admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, {
        policy: policyFor(t, true),
      });
      expect(blocked.released).toBe(0);

      await admin.vehicleTripDetectionState.deleteMany({ where: { vehicleId: t.vehicleId } });
      const fallback = await admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, {
        policy: policyFor(t, true),
      });
      expect(fallback.released).toBeGreaterThanOrEqual(1);
    });

    it('partial extension hook writes admission while recovery writer remains OFF', async () => {
      const t = await tenant();
      await setResting(t.vehicleId);
      const generation = buildBoundaryRepairGeneration({
        auditId: randomUUID(),
        providerSegmentId: t.dimoSegmentId,
        newStartTime: t.startTime,
        newEndTime: t.endTime,
      });
      await admin.$executeRawUnsafe(
        `UPDATE vehicle_trips SET raw_detection_meta = (COALESCE(raw_detection_meta, '{}'::jsonb) - 'diV0BoundaryAdmissionV1') || $1::jsonb WHERE id = $2`,
        JSON.stringify({
          boundaryRefresh: {
            state: 'PENDING',
            generation,
            requestedAt: new Date().toISOString(),
            attempts: 1,
            stages: { route: 'pending', behavior: 'pending', drivingImpact: 'pending' },
          },
          boundaryRepair: {
            repairType: PARTIAL_TRIP_BOUNDARY_EXTENSION_REPAIR_TYPE,
            auditId: generation.split('|')[0],
            providerSegmentId: t.dimoSegmentId,
            newStartTime: t.startTime.toISOString(),
            newEndTime: t.endTime.toISOString(),
          },
        }),
        t.tripId,
      );
      const hook = await admission.tryReleaseAfterPartialTripBoundaryExtension(t.tripId, t.vehicleId);
      expect(hook).toEqual({ released: true });
      const shadow = await admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, {
        policy: policyFor(t, false),
      });
      expect(shadow.mode).toBe('SHADOW');
      expect(shadow.released).toBe(0);
    });

    it('recent admitted trip becomes S4-discoverable (T01 contract)', async () => {
      const t = await tenant();
      await setResting(t.vehicleId);
      await admin.$executeRawUnsafe(
        `UPDATE vehicle_trips SET raw_detection_meta = (raw_detection_meta - 'diV0BoundaryAdmissionV1') WHERE id = $1`,
        t.tripId,
      );
      await admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, {
        policy: policyFor(t, true),
      });
      const config = s4aConfigFor([t]);
      const manifest = s4aManifestFor(config);
      const repo = new DiV0S4WorkItemRepository(admin, config);
      const created = await repo.createWorkItem({
        tripId: t.tripId,
        sourceFamily: 'RUPTELA_R1',
        runPurpose: 'PRIMARY',
        pipelineManifest: manifest,
        expectedOrganizationId: t.organizationId,
        expectedVehicleId: t.vehicleId,
      });
      expect(created.workItemId).toBeTruthy();
    });

    it('trip before activation horizon remains excluded (Tiguan-class historical protection)', async () => {
      const t = await tenant();
      await setResting(t.vehicleId);
      await admin.$executeRawUnsafe(
        `UPDATE vehicle_trips SET end_time = $1, raw_detection_meta = (raw_detection_meta - 'diV0BoundaryAdmissionV1') WHERE id = $2`,
        new Date('2019-01-01T12:00:00.000Z'),
        t.tripId,
      );
      const result = await admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, {
        now: new Date('2026-10-31T00:00:00.000Z'),
        policy: {
          ...policyFor(t, true),
          recoveryActivationHorizonUtc: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
      expect(result.released).toBe(0);
      expect(result.scanOutcome).toBe('none_in_window');
    });

    it('guarded missing-admission rows do not starve true stale-revision keyset recovery', async () => {
      const t = await tenant();
      await setResting(t.vehicleId);
      for (let i = 0; i < 35; i += 1) {
        await insertGuardedMissingTrip(t, 120 + i);
      }
      const staleTripId = await insertCompletedTrip(t, 2, true);
      const { admissionBefore, currentRevisionKey } = await applyCommittedBoundaryRepairDrift(t, staleTripId);
      const policy = policyFor(t, true, { maxTripsPerVehicle: 32 });
      let releasedTotal = 0;
      for (let pass = 0; pass < 15 && releasedTotal < 1; pass += 1) {
        const result = await admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, {
          policy,
        });
        if (pass === 0) {
          expect(result.guarded).toBeGreaterThan(0);
        }
        releasedTotal += result.released;
      }
      expect(releasedTotal).toBeGreaterThanOrEqual(1);
      const rows = await admin.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
        SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${staleTripId}`;
      const admissionAfter = readTripDiBoundaryAdmissionV1(rows[0]?.raw_detection_meta);
      expect(admissionAfter).not.toBeNull();
      expect(admissionAfter!.revisionKey).toBe(currentRevisionKey);
      expect(admissionAfter!.revisionKey).not.toBe(admissionBefore.revisionKey);

      const config = s4aConfigFor([t]);
      const manifest = s4aManifestFor(config);
      const repo = new DiV0S4WorkItemRepository(admin, config);
      const primaryInput = {
        tripId: staleTripId,
        sourceFamily: 'RUPTELA_R1' as const,
        runPurpose: 'PRIMARY' as const,
        pipelineManifest: manifest,
        expectedOrganizationId: t.organizationId,
        expectedVehicleId: t.vehicleId,
      };
      const first = await repo.createWorkItem(primaryInput);
      expect(first.workItemId).toBeTruthy();
      try {
        await repo.createWorkItem(primaryInput);
        throw new Error('expected duplicate PRIMARY rejection');
      } catch (err) {
        expect(isDiV0S4Rejection(err, 'DUPLICATE_WORK_ITEM')).toBe(true);
      }
    });

    it('keyset cursor persists across passes and clears when keyset exhausts window', async () => {
      const t = await tenant();
      await setResting(t.vehicleId);
      const ids: string[] = [];
      for (let i = 40; i >= 1; i -= 1) {
        ids.push(await insertCompletedTrip(t, i, true));
      }
      const staleId = ids[0]!;
      await admin.$executeRawUnsafe(
        `UPDATE vehicle_trips SET raw_detection_meta = (raw_detection_meta - 'diV0BoundaryAdmissionV1') WHERE id = $1`,
        staleId,
      );
      const policy = policyFor(t, true, { maxTripsPerVehicle: 5 });
      await admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, { policy });
      const afterFirst = await admin.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
        SELECT raw_detection_meta FROM vehicle_trips
        WHERE vehicle_id = ${t.vehicleId}
          AND (raw_detection_meta->>'diV0BoundaryAdmissionRecoveryCursorCarrierV1') = 'true'`;
      expect(afterFirst.length).toBe(1);
      expect(afterFirst[0]?.raw_detection_meta).toMatchObject({
        scanCursor: expect.objectContaining({ tripId: expect.any(String) }),
      });
      await admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, { policy });
      const admitted = await admin.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
        SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${staleId}`;
      expect(readTripDiBoundaryAdmissionV1(admitted[0]?.raw_detection_meta)).not.toBeNull();
    });

    it('concurrent writer passes keep a single cursor carrier row', async () => {
      const t = await tenant();
      await setResting(t.vehicleId);
      for (let i = 0; i < 10; i += 1) {
        await insertCompletedTrip(t, 10 + i, false);
      }
      const policy = policyFor(t, true, { maxTripsPerVehicle: 8, globalMaxPerPass: 20 });
      await Promise.all([
        admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, { policy }),
        admission.runDurableAdmissionRecoveryPass(t.organizationId, t.vehicleId, { policy }),
      ]);
      const carriers = await admin.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM vehicle_trips
        WHERE vehicle_id = ${t.vehicleId}
          AND (raw_detection_meta->>'diV0BoundaryAdmissionRecoveryCursorCarrierV1') = 'true'`;
      expect(carriers.length).toBe(1);
    });

    it('fails closed when caller organizationId does not match persisted vehicle ownership', async () => {
      const t = await tenant();
      await setResting(t.vehicleId);
      await insertCompletedTrip(t, 5, false);
      const policy = policyFor(t, true);
      const wrongOrg = randomUUID();
      const result = await admission.runDurableAdmissionRecoveryPass(wrongOrg, t.vehicleId, { policy });
      expect(result.mode).toBe('DISABLED');
      expect(result.released).toBe(0);
    });
  },
);
