import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { DiV0S4WorkItemRepository } from '../../../driving-intelligence/s4a-foundation/di-v0-s4a-work-item.repository';
import {
  S4A_POSTGRES_LIVE,
  cleanupS4aTenant,
  newS4aClient,
  s4aConfigFor,
  s4aManifestFor,
  seedS4aTenant,
  seedS4aTripDiBoundaryAdmission,
  setKillState,
  type S4aTenant,
} from '../../../driving-intelligence/s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { PARTIAL_TRIP_BOUNDARY_EXTENSION_REPAIR_TYPE, buildBoundaryRepairGeneration } from '../../boundary-repair.state.util';
import { TripDiBoundaryAdmissionService } from '../trip-di-boundary-admission.service';
import { readTripDiBoundaryAdmissionV1 } from '../trip-di-boundary-admission';

(S4A_POSTGRES_LIVE ? describe : describe.skip)('Trip DI boundary admission (PostgreSQL)', () => {
  let admin: PrismaClient;
  let admission: TripDiBoundaryAdmissionService;
  const tenants: S4aTenant[] = [];

  beforeAll(async () => {
    admin = newS4aClient();
    admission = new TripDiBoundaryAdmissionService(admin as never);
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

  it('release merges admission json without overwriting sibling meta keys', async () => {
    const t = await tenant();
    await admin.$executeRawUnsafe(
      `UPDATE vehicle_trips SET raw_detection_meta = $1::jsonb WHERE id = $2`,
      JSON.stringify({ fsmMarker: 'keep-me', splitGapMs: 1365000 }),
      t.tripId,
    );
    const ok = await admission.tryReleaseForTripTransactional(t.tripId);
    expect(ok).toBe(true);
    const rows = await admin.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
      SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${t.tripId}`;
    const meta = rows[0]?.raw_detection_meta as Record<string, unknown>;
    expect(meta.fsmMarker).toBe('keep-me');
    expect(meta.splitGapMs).toBe(1365000);
    expect(readTripDiBoundaryAdmissionV1(meta)?.contractVersion).toBe(1);
  });

  it('T01 createWorkItem rejects without admission; accepts after transactional release', async () => {
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

    await seedS4aTripDiBoundaryAdmission(admin, t);
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

  it('repair generation change between release attempts blocks stale revision', async () => {
    const t = await tenant();
    const first = await admission.tryReleaseForTripTransactional(t.tripId);
    expect(first).toBe(true);
    await admin.$executeRawUnsafe(
      `UPDATE vehicle_trips SET raw_detection_meta = COALESCE(raw_detection_meta, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
      JSON.stringify({
        boundaryRepair: {
          auditId: randomUUID(),
          providerSegmentId: t.dimoSegmentId,
          newStartTime: t.startTime.toISOString(),
          newEndTime: new Date(t.endTime.getTime() + 60_000).toISOString(),
        },
      }),
      t.tripId,
    );
    const second = await admission.tryReleaseForTripTransactional(t.tripId);
    expect(second).toBe(true);
    const rows = await admin.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
      SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${t.tripId}`;
    const admissionRecord = readTripDiBoundaryAdmissionV1(rows[0]?.raw_detection_meta);
    expect(admissionRecord).not.toBeNull();
  });

  it('releaseForBoundaryScannedTripIds is a no-op for empty input', async () => {
    const result = await admission.releaseForBoundaryScannedTripIds([]);
    expect(result).toEqual({ released: 0, skipped: 0 });
  });

  it('duplicate transactional release is idempotent', async () => {
    const t = await tenant();
    expect(await admission.tryReleaseForTripTransactional(t.tripId)).toBe(true);
    expect(await admission.tryReleaseForTripTransactional(t.tripId)).toBe(true);
  });

  it('concurrent release: only one writer advances admission revision', async () => {
    const t = await tenant();
    const [a, b] = await Promise.all([
      admission.tryReleaseForTripTransactional(t.tripId),
      admission.tryReleaseForTripTransactional(t.tripId),
    ]);
    expect(a || b).toBe(true);
    const rows = await admin.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
      SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${t.tripId}`;
    expect(readTripDiBoundaryAdmissionV1(rows[0]?.raw_detection_meta)).not.toBeNull();
  });

  it('tryReleaseAfterPartialTripBoundaryExtension releases under PENDING boundary refresh', async () => {
    const t = await tenant();
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
    expect(await admission.tryReleaseForTripTransactional(t.tripId)).toBe(true);
    const first = await admission.tryReleaseAfterPartialTripBoundaryExtension(t.tripId, t.vehicleId);
    expect(first).toEqual({ released: true });
    const second = await admission.tryReleaseAfterPartialTripBoundaryExtension(t.tripId, t.vehicleId);
    expect(second).toEqual({ released: true });
    const rows = await admin.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
      SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${t.tripId}`;
    const meta = rows[0]?.raw_detection_meta;
    expect(readTripDiBoundaryAdmissionV1(meta)?.releasedBy).toBe('RECONCILIATION');
  });

  it('tryReleaseAfterPartialTripBoundaryExtension rejects stale refresh generation', async () => {
    const t = await tenant();
    const generation = buildBoundaryRepairGeneration({
      auditId: randomUUID(),
      providerSegmentId: t.dimoSegmentId,
      newStartTime: t.startTime,
      newEndTime: t.endTime,
    });
    await admin.$executeRawUnsafe(
      `UPDATE vehicle_trips SET raw_detection_meta = $1::jsonb WHERE id = $2`,
      JSON.stringify({
        boundaryRefresh: {
          state: 'PENDING',
          generation: 'stale-generation',
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
    const outcome = await admission.tryReleaseAfterPartialTripBoundaryExtension(t.tripId, t.vehicleId);
    expect(outcome).toEqual({ released: false, reason: 'REFRESH_GENERATION_MISMATCH' });
  });

  it('vehicle mismatch is rejected for partial extension admission hook', async () => {
    const t = await tenant();
    const outcome = await admission.tryReleaseAfterPartialTripBoundaryExtension(
      t.tripId,
      randomUUID(),
    );
    expect(outcome).toEqual({ released: false, reason: 'VEHICLE_MISMATCH' });
  });

  it('tryReleaseAfterPartialTripBoundaryExtension rejects without committed repair meta', async () => {
    const t = await tenant();
    const outcome = await admission.tryReleaseAfterPartialTripBoundaryExtension(t.tripId, t.vehicleId);
    expect(outcome).toEqual({ released: false, reason: 'BOUNDARY_REPAIR_NOT_COMMITTED' });
  });
});
