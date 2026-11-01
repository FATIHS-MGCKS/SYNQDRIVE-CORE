/**
 * Partial boundary extension → DI admission → S4 discovery eligibility (PostgreSQL).
 * Uses persisted meta aligned with trip-decision.engine commit shape (no full repair engine call).
 */
import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { buildBoundaryRepairGeneration, PARTIAL_TRIP_BOUNDARY_EXTENSION_REPAIR_TYPE } from '../boundary-repair.state.util';
import { BoundaryRefreshLifecycleService } from '../boundary-refresh-lifecycle.service';
import { TripDiBoundaryAdmissionService } from '../di-boundary-admission/trip-di-boundary-admission.service';
import {
  evaluateTripDiBoundaryAdmission,
  readTripDiBoundaryAdmissionV1,
} from '../di-boundary-admission/trip-di-boundary-admission';
import { TripReconciliationService } from './trip-reconciliation.service';
import { TripDecisionEngine } from '../decision/trip-decision.engine';
import { TripOverlapDetector } from '../detectors/trip-overlap.detector';
import {
  assertS4aPostgresCiEnv,
  cleanupS4aTenant,
  newS4aClient,
  S4A_POSTGRES_LIVE,
  seedS4aTenant,
  setKillState,
  s4aConfigFor,
  s4aManifestFor,
  type S4aTenant,
} from '../../driving-intelligence/s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { DiV0S4WorkItemRepository } from '../../driving-intelligence/s4a-foundation/di-v0-s4a-work-item.repository';
import { DiV0S4DiscoveryService } from '../../driving-intelligence/s4b-orchestration/di-v0-s4b-discovery.service';
import { DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS } from '../../driving-intelligence/s4b-orchestration/di-v0-s4b-discovery-containment';
import { buildDiV0S4RuntimePipelineManifest } from '../../driving-intelligence/s4b-orchestration/di-v0-s4b-pipeline-manifest';

assertS4aPostgresCiEnv();

const LIVE = S4A_POSTGRES_LIVE;

async function commitPartialExtensionMeta(
  admin: PrismaClient,
  t: S4aTenant,
  newEnd: Date,
): Promise<string> {
  const auditId = randomUUID();
  const generation = buildBoundaryRepairGeneration({
    auditId,
    providerSegmentId: t.dimoSegmentId,
    newStartTime: t.startTime,
    newEndTime: newEnd,
  });
  await admin.$executeRawUnsafe(
    `UPDATE vehicle_trips
     SET end_time = ($1::timestamptz AT TIME ZONE 'UTC'),
         raw_detection_meta = COALESCE(raw_detection_meta, '{}'::jsonb) || $2::jsonb
     WHERE id = $3`,
    newEnd.toISOString(),
    JSON.stringify({
      boundaryRepair: {
        repairType: PARTIAL_TRIP_BOUNDARY_EXTENSION_REPAIR_TYPE,
        auditId,
        providerSegmentId: t.dimoSegmentId,
        newStartTime: t.startTime.toISOString(),
        newEndTime: newEnd.toISOString(),
      },
      boundaryRefresh: {
        state: 'PENDING',
        generation,
        requestedAt: new Date().toISOString(),
        attempts: 1,
        stages: { route: 'pending', behavior: 'pending', drivingImpact: 'pending' },
      },
    }),
    t.tripId,
  );
  return generation;
}

(LIVE ? describe : describe.skip)(
  'Partial boundary extension admission → S4 discovery (PostgreSQL)',
  () => {
    let admin: PrismaClient;
    let admission: TripDiBoundaryAdmissionService;
    let lifecycle: BoundaryRefreshLifecycleService;
    const tenants: S4aTenant[] = [];

    beforeAll(async () => {
      admin = newS4aClient();
      admission = new TripDiBoundaryAdmissionService(admin as never);
      lifecycle = new BoundaryRefreshLifecycleService(admin as never);
      await setKillState(admin, 'NOT_KILLED').catch(() => undefined);
    });

    afterAll(async () => {
      for (const t of tenants.splice(0)) {
        await cleanupS4aTenant(admin, t);
      }
      await admin.$disconnect();
    });

    async function tenant(): Promise<S4aTenant> {
      const t = await seedS4aTenant(admin);
      tenants.push(t);
      return t;
    }

    it('committed repair meta → admission hook → discovery pass creates work item', async () => {
      const t = await tenant();
      const newEnd = new Date(t.endTime.getTime() + 5 * 60_000);
      await commitPartialExtensionMeta(admin, t, newEnd);

      const hookOutcome = await admission.tryReleaseAfterPartialTripBoundaryExtension(
        t.tripId,
        t.vehicleId,
      );
      expect(hookOutcome).toEqual({ released: true });

      const scope = await admission.loadScope(t.tripId);
      expect(scope).not.toBeNull();
      expect(evaluateTripDiBoundaryAdmission(scope!)).toMatchObject({ ok: true });

      const config = s4aConfigFor([t]);
      const manifest = s4aManifestFor(config);
      const repo = new DiV0S4WorkItemRepository(admin, config);
      const pipeline = buildDiV0S4RuntimePipelineManifest(config);
      const discovery = new DiV0S4DiscoveryService(
        admin,
        repo,
        config,
        pipeline,
        DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS,
      );
      const pass = await discovery.runDiscoveryPass({ limit: 20 });
      expect(pass.created + pass.duplicates).toBeGreaterThanOrEqual(1);
      expect(readTripDiBoundaryAdmissionV1((await admission.loadScope(t.tripId))!.rawDetectionMeta)).not.toBeNull();
    });

    it('transient hook failure is recovered on retryPendingBoundaryRefreshes', async () => {
      const t = await tenant();
      const newEnd = new Date(t.endTime.getTime() + 3 * 60_000);
      await commitPartialExtensionMeta(admin, t, newEnd);

      const failingAdmission = {
        tryReleaseAfterPartialTripBoundaryExtension: jest
          .fn()
          .mockRejectedValueOnce(new Error('transient db'))
          .mockImplementation((tripId: string, vehicleId: string) =>
            admission.tryReleaseAfterPartialTripBoundaryExtension(tripId, vehicleId),
          ),
        releaseForBoundaryScannedTripIds: jest.fn().mockResolvedValue({ released: 0, skipped: 0 }),
        releaseLiveFsmSplitSegmentsInReconciliationWindow: jest
          .fn()
          .mockResolvedValue({ released: 0, skipped: 0, tripIds: [] }),
      } as unknown as TripDiBoundaryAdmissionService;

      const svc = new TripReconciliationService(
        admin as never,
        new TripDecisionEngine(admin as never),
        {} as never,
        new TripOverlapDetector(admin as never),
        {} as never,
        failingAdmission,
        undefined as never,
        undefined as never,
        undefined as never,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        lifecycle,
      );

      await (
        svc as never as { retryPendingBoundaryRefreshes: (v: string) => Promise<void> }
      ).retryPendingBoundaryRefreshes(t.vehicleId);

      const rows = await admin.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
        SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${t.tripId}`;
      expect(readTripDiBoundaryAdmissionV1(rows[0]?.raw_detection_meta)?.releasedBy).toBe(
        'RECONCILIATION',
      );
    });

    it('createWorkItem rejects trip without admission patch (no unauthorized S4 work)', async () => {
      const t = await tenant();
      await admin.$executeRawUnsafe(
        `UPDATE vehicle_trips SET raw_detection_meta = (raw_detection_meta - 'diV0BoundaryAdmissionV1') WHERE id = $1`,
        t.tripId,
      );
      const config = s4aConfigFor([t]);
      const manifest = s4aManifestFor(config);
      const repo = new DiV0S4WorkItemRepository(admin, config);
      await expect(
        repo.createWorkItem({
          tripId: t.tripId,
          sourceFamily: 'RUPTELA_R1',
          runPurpose: 'PRIMARY',
          pipelineManifest: manifest,
          expectedOrganizationId: t.organizationId,
          expectedVehicleId: t.vehicleId,
        }),
      ).rejects.toMatchObject({ code: 'TRIP_BOUNDARY_NOT_RELEASED' });
    });
  },
);
