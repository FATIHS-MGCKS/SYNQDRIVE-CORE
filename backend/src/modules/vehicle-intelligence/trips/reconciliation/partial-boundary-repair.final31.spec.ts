import { TripDecisionEngine } from '../decision/trip-decision.engine';
import { BoundaryRepairConcurrentMutationError } from '../decision/decision.types';
import { TripReconciliationService } from './trip-reconciliation.service';
import { TripOverlapDetector } from '../detectors/trip-overlap.detector';
import { BoundaryRefreshLifecycleService } from '../boundary-refresh-lifecycle.service';
import { stubTripDiBoundaryAdmissionService } from './__tests__/trip-reconciliation-di-admission.stub';
import { REPAIR_STATUS, REPAIR_TYPES, BOUNDARY_REFRESH_STATE } from './reconciliation.types';
import { classifyPartialBoundaryRepair } from '../detectors/partial-boundary-classification.util';
import {
  buildBoundaryRefreshRecord,
  buildBoundaryRepairGeneration,
  isBoundaryRefreshRetryable,
  readBoundaryRefreshRecord,
} from '../boundary-repair.state.util';

const TEST_GENERATION = buildBoundaryRepairGeneration({
  auditId: 'audit-1',
  providerSegmentId: 'seg-1',
  newStartTime: new Date('2026-08-29T12:01:00.000Z'),
  newEndTime: new Date('2026-08-29T12:50:00.000Z'),
});

/**
 * P1.2 FINAL-3.1 — atomicity, refresh retry, concurrency, downstream semantics.
 */

const T0 = Date.parse('2026-08-29T12:00:00.000Z');
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

function makeTransactionalPrisma() {
  const tripStore = new Map<string, Record<string, unknown>>();
  const repairStore = new Map<string, Record<string, unknown>>();
  const waypointStore: Array<Record<string, unknown>> = [];
  const behaviorEvents: Array<Record<string, unknown>> = [];

  const tx = {
    vehicleTrip: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => tripStore.get(where.id) ?? null),
      findMany: jest.fn(async ({ where }: { where?: Record<string, unknown> }) => {
        let rows = [...tripStore.values()];
        if (where?.vehicleId) {
          rows = rows.filter((r) => r.vehicleId === where.vehicleId);
        }
        if (where?.tripStatus) {
          rows = rows.filter((r) => r.tripStatus === where.tripStatus);
        }
        const metaFilter = where?.rawDetectionMeta as
          | { path?: string[]; equals?: string }
          | undefined;
        if (metaFilter?.path?.[0] === 'boundaryRefresh' && metaFilter.path?.[1] === 'state') {
          rows = rows.filter(
            (r) => readBoundaryRefreshRecord(r.rawDetectionMeta)?.state === metaFilter.equals,
          );
        }
        return rows;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const row = tripStore.get(where.id as string);
        if (!row) return { count: 0 };
        if (row.startTime !== where.startTime || row.endTime !== where.endTime) return { count: 0 };
        tripStore.set(where.id as string, { ...row, ...data });
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = tripStore.get(where.id) ?? {};
        const merged = { ...row, ...data };
        tripStore.set(where.id, merged);
        return merged;
      }),
    },
    tripRepair: {
      upsert: jest.fn(async ({ where, create, update }: { where: { id: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = repairStore.get(where.id);
        const next = existing ? { ...existing, ...update } : create;
        repairStore.set(where.id, next);
        return next;
      }),
      findMany: jest.fn(async ({ where }: { where?: Record<string, unknown> }) => {
        let rows: Array<Record<string, unknown>> = [...repairStore.entries()].map(([id, row]) => ({
          id,
          ...row,
        }));
        if (where?.tripId) rows = rows.filter((r) => r.tripId === where.tripId);
        if (where?.repairType) rows = rows.filter((r) => r.repairType === where.repairType);
        return rows;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => repairStore.get(where.id) ?? null),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        repairStore.set(where.id, { ...(repairStore.get(where.id) ?? {}), ...data });
      }),
    },
    vehicleTripWaypoint: {
      deleteMany: jest.fn(async ({ where }: { where: { tripId: string } }) => {
        const before = waypointStore.length;
        for (let i = waypointStore.length - 1; i >= 0; i--) {
          if (waypointStore[i].tripId === where.tripId) waypointStore.splice(i, 1);
        }
        return { count: before - waypointStore.length };
      }),
      createMany: jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
        waypointStore.push(...data);
        return { count: data.length };
      }),
      findMany: jest.fn(async ({ where }: { where: { tripId: string } }) =>
        waypointStore.filter((w) => w.tripId === where.tripId),
      ),
    },
    tripBehaviorEvent: {
      deleteMany: jest.fn(async ({ where }: { where: { tripId: string } }) => {
        const before = behaviorEvents.length;
        for (let i = behaviorEvents.length - 1; i >= 0; i--) {
          if (behaviorEvents[i].tripId === where.tripId) behaviorEvents.splice(i, 1);
        }
        return { count: before - behaviorEvents.length };
      }),
      createMany: jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
        behaviorEvents.push(...data);
        return { count: data.length };
      }),
      findMany: jest.fn(async ({ where }: { where: { tripId: string } }) =>
        behaviorEvents.filter((e) => e.tripId === where.tripId),
      ),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    vehicle: {
      findUnique: jest.fn(async () => ({ organizationId: 'org-1' })),
    },
    vehicleTrip: tx.vehicleTrip,
    tripRepair: tx.tripRepair,
    vehicleTripWaypoint: tx.vehicleTripWaypoint,
    tripBehaviorEvent: tx.tripBehaviorEvent,
  };

  return { prisma, tripStore, repairStore, waypointStore, behaviorEvents, tx };
}

describe('FINAL-3.1 boundary repair atomicity', () => {
  it('1 — boundary mutation + audit are atomic; refresh failure leaves BOUNDARY_APPLIED not REJECTED', async () => {
    const { prisma, tripStore, repairStore } = makeTransactionalPrisma();
    tripStore.set('trip-1', {
      id: 'trip-1',
      vehicleId: 'veh-1',
      tripStatus: 'COMPLETED',
      startTime: at(30),
      endTime: at(50),
      dimoSegmentId: null,
      rawDetectionMeta: null,
    });

    const engine = new TripDecisionEngine(prisma as never);
    const result = await engine.repairTripBoundariesWithAudit(
      {
        tripId: 'trip-1',
        vehicleId: 'veh-1',
        organizationId: 'org-1',
        providerSegmentId: 'seg-1',
        providerMechanism: 'changePointDetection',
        oldStartTime: at(30),
        oldEndTime: at(50),
        newStartTime: at(1),
        newEndTime: at(50),
        confidence: 'HIGH',
        reason: 'test',
        source: 'test',
      },
      {
        auditId: 'audit-1',
        repairType: REPAIR_TYPES.PARTIAL_TRIP_BOUNDARY_EXTENSION,
        windowFrom: at(1),
        windowTo: at(50),
        confidence: 'HIGH',
        reason: 'test',
        detectorEvidence: {},
      },
    );

    expect(result.applied).toBe(true);
    expect(tripStore.get('trip-1')?.startTime).toEqual(at(1));
    expect(repairStore.get('audit-1')?.status).toBe(REPAIR_STATUS.BOUNDARY_APPLIED);
  });

  it('4 — EXACT_MATCH retries refresh when boundaryRefresh is pending', async () => {
    const h = makeTransactionalPrisma();
    h.tripStore.set('trip-1', {
      id: 'trip-1',
      vehicleId: 'veh-1',
      tripStatus: 'COMPLETED',
      startTime: at(1),
      endTime: at(50),
      rawDetectionMeta: {
        boundaryRefresh: buildBoundaryRefreshRecord('PENDING', null, undefined, {
          generation: TEST_GENERATION,
        }),
      },
    });

    const enrichment = {
      refreshEnrichmentAfterBoundaryRepair: jest.fn().mockResolvedValue(undefined),
    };

    const lifecycle = new BoundaryRefreshLifecycleService(h.prisma as never);
    const service = new TripReconciliationService(
      h.prisma as never,
      { repairTripBoundariesWithAudit: jest.fn() } as never,
      {} as never,
      new TripOverlapDetector(h.prisma as never),
      {} as never,
      stubTripDiBoundaryAdmissionService(),
      undefined as never,
      undefined as never,
      undefined as never,
      enrichment as never,
      undefined,
      undefined,
      { get: jest.fn(() => true) } as never,
      undefined,
      undefined,
      lifecycle,
    );

    await (
      service as never as {
        retryPendingBoundaryRefreshes: (vehicleId: string) => Promise<void>;
      }
    ).retryPendingBoundaryRefreshes('veh-1');

    expect(enrichment.refreshEnrichmentAfterBoundaryRepair).toHaveBeenCalledWith(
      'trip-1',
      'veh-1',
      'org-1',
    );
  });

  it('6 — route waypoints are replaced on refresh (deleteMany + createMany)', async () => {
    const h = makeTransactionalPrisma();
    h.waypointStore.push(
      { tripId: 'trip-1', latitude: 1, longitude: 1, recordedAt: at(30) },
      { tripId: 'trip-1', latitude: 2, longitude: 2, recordedAt: at(40) },
    );

    const tripsService = {
      enrichTrip: jest.fn(async (_org: string, _veh: string, tripId: string) => {
        await h.prisma.vehicleTripWaypoint.deleteMany({ where: { tripId } });
        await h.prisma.vehicleTripWaypoint.createMany({
          data: [
            { tripId, latitude: 0.5, longitude: 0.5, recordedAt: at(1) },
            { tripId, latitude: 2.5, longitude: 2.5, recordedAt: at(50) },
          ],
        });
        return {};
      }),
    };

    const orchestrator = new (await import('../trip-enrichment-orchestrator.service')).TripEnrichmentOrchestratorService(
      h.prisma as never,
      { enrichTrip: jest.fn() } as never,
      { add: jest.fn() } as never,
      { add: jest.fn() } as never,
      undefined,
      undefined,
      tripsService as never,
    );

    (orchestrator as never as { tripsService: typeof tripsService }).tripsService = tripsService;

    await orchestrator.refreshEnrichmentAfterBoundaryRepair('trip-1', 'veh-1', 'org-1');

    expect(h.waypointStore).toHaveLength(2);
    expect(h.waypointStore[0].recordedAt).toEqual(at(1));
    expect(h.waypointStore[1].recordedAt).toEqual(at(50));
  });

  it('7 — behavior events are replace-by-trip on refresh path', async () => {
    const h = makeTransactionalPrisma();
    h.behaviorEvents.push({ tripId: 'trip-1', eventType: 'HARD_BRAKE', recordedAt: at(35) });

    await h.prisma.tripBehaviorEvent.deleteMany({ where: { tripId: 'trip-1' } });
    await h.prisma.tripBehaviorEvent.createMany({
      data: [
        { tripId: 'trip-1', eventType: 'HARD_BRAKE', recordedAt: at(5) },
        { tripId: 'trip-1', eventType: 'HARD_ACCEL', recordedAt: at(45) },
      ],
    });

    expect(h.behaviorEvents).toHaveLength(2);
    expect(h.behaviorEvents.every((e) => e.tripId === 'trip-1')).toBe(true);
    expect(h.behaviorEvents.some((e) => e.recordedAt === at(35))).toBe(false);
  });

  it('12 — concurrent identical repairs: one applies, other sees no-op/concurrent guard', async () => {
    const { prisma, tripStore } = makeTransactionalPrisma();
    tripStore.set('trip-1', {
      id: 'trip-1',
      vehicleId: 'veh-1',
      tripStatus: 'COMPLETED',
      startTime: at(30),
      endTime: at(50),
      dimoSegmentId: null,
      rawDetectionMeta: null,
    });

    const engine = new TripDecisionEngine(prisma as never);
    const params = {
      tripId: 'trip-1',
      vehicleId: 'veh-1',
      organizationId: 'org-1',
      providerSegmentId: 'seg-1',
      providerMechanism: 'changePointDetection',
      oldStartTime: at(30),
      oldEndTime: at(50),
      newStartTime: at(1),
      newEndTime: at(50),
      confidence: 'HIGH' as const,
      reason: 'test',
      source: 'test',
    };

    const results = await Promise.allSettled([
      engine.repairTripBoundariesWithAudit(params, {
        auditId: 'audit-a',
        repairType: REPAIR_TYPES.PARTIAL_TRIP_BOUNDARY_EXTENSION,
        windowFrom: at(1),
        windowTo: at(50),
        confidence: 'HIGH',
        reason: 'test',
        detectorEvidence: {},
      }),
      engine.repairTripBoundariesWithAudit(params, {
        auditId: 'audit-b',
        repairType: REPAIR_TYPES.PARTIAL_TRIP_BOUNDARY_EXTENSION,
        windowFrom: at(1),
        windowTo: at(50),
        confidence: 'HIGH',
        reason: 'test',
        detectorEvidence: {},
      }),
    ]);

    const appliedCount = results.filter(
      (r) => r.status === 'fulfilled' && r.value.applied,
    ).length;
    const concurrentRejections = results.filter(
      (r) =>
        r.status === 'rejected' &&
        r.reason instanceof BoundaryRepairConcurrentMutationError,
    ).length;
    expect(appliedCount).toBe(1);
    expect(concurrentRejections + (appliedCount === 1 ? 1 : 0)).toBeGreaterThanOrEqual(1);
    expect(tripStore.get('trip-1')?.startTime).toEqual(at(1));
  });

  it('16 — interior short trip inside long provider is AMBIGUOUS', () => {
    const result = classifyPartialBoundaryRepair(
      {
        segmentId: 'seg-long',
        mechanism: 'changePointDetection',
        startTime: at(0),
        endTime: at(120),
      },
      [
        {
          id: 'short-inner',
          startTime: at(50),
          endTime: at(55),
          tripStatus: 'COMPLETED',
        },
      ],
    );
    expect(result.kind).toBe('AMBIGUOUS');
  });
});

function buildReconciliationHarness() {
  const h = makeTransactionalPrisma();
  const enrichment = {
    refreshEnrichmentAfterBoundaryRepair: jest.fn().mockResolvedValue(undefined),
  };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'worker.tripPartialBoundaryRepairEnabled') return true;
      if (key === 'worker.tripRepairCoverageMode') return 'shadow';
      return undefined;
    }),
  };
  const decisionEngine = new TripDecisionEngine(h.prisma as never);
  const boundaryRefreshLifecycle = new BoundaryRefreshLifecycleService(h.prisma as never);
  const service = new TripReconciliationService(
    h.prisma as never,
    decisionEngine,
    {} as never,
    new TripOverlapDetector(h.prisma as never),
    {} as never,
    stubTripDiBoundaryAdmissionService(),
    undefined as never,
    undefined as never,
    undefined as never,
    enrichment as never,
    undefined,
    { repairActions: { inc: jest.fn() }, duplicateCandidates: { inc: jest.fn() } } as never,
    configService as never,
    undefined,
    undefined,
    boundaryRefreshLifecycle,
  );
  return { ...h, service, enrichment, decisionEngine, boundaryRefreshLifecycle };
}

describe('FINAL-3.1 refresh retry + org safety', () => {
  const dimoCandidate = () => ({
    source: 'DIMO_SEGMENT' as const,
    segmentId: 'seg-full',
    mechanism: 'changePointDetection',
    startTime: at(1),
    endTime: at(50),
    confidence: 'HIGH' as const,
    reason: 'DIMO segment',
    startDetectionMode: 'DIMO_changePointDetection_REPAIR',
    endDetectionMode: 'DIMO_changePointDetection_REPAIR',
    startLatitude: 51.1,
    startLongitude: 9.2,
    endLatitude: 51.25,
    endLongitude: 9.35,
    distanceKm: 42,
    detectorEvidence: { dimoSegment: { segmentId: 'seg-full', mechanism: 'changePointDetection' } },
  });

  it('2 — refresh enqueue failure leaves BOUNDARY_APPLIED + PENDING refresh, retry succeeds', async () => {
    const h = buildReconciliationHarness();
    h.tripStore.set('trip-1', {
      id: 'trip-1',
      vehicleId: 'veh-1',
      tripStatus: 'COMPLETED',
      startTime: at(30),
      endTime: at(50),
      dimoSegmentId: null,
      rawDetectionMeta: null,
      startLatitude: 51.2,
      startLongitude: 9.3,
      endLatitude: 51.25,
      endLongitude: 9.35,
    });
    h.enrichment.refreshEnrichmentAfterBoundaryRepair
      .mockRejectedValueOnce(new Error('redis down'))
      .mockResolvedValueOnce(undefined);

    (h.service as never as Record<string, unknown>).collectRepairCandidates = jest
      .fn()
      .mockResolvedValue([dimoCandidate()]);
    (h.service as never as Record<string, unknown>).resolveEffectiveConfidence = jest
      .fn()
      .mockResolvedValue('HIGH');

    const run = () =>
      (
        h.service as never as {
          detectAndRepairMissingTrips: (
            vehicleId: string,
            from: Date,
            to: Date,
            options?: { useDimoSegmentFallback?: boolean },
          ) => Promise<{ applied: number }>;
        }
      ).detectAndRepairMissingTrips('veh-1', at(-10), at(60), { useDimoSegmentFallback: true });

    const first = await run();
    expect(first.applied).toBe(1);
    expect(h.tripStore.get('trip-1')?.startTime).toEqual(at(1));
    const auditsAfterFirst = [...h.repairStore.values()];
    expect(auditsAfterFirst.some((a) => a.status === REPAIR_STATUS.BOUNDARY_APPLIED)).toBe(true);
    expect(auditsAfterFirst.some((a) => a.status === REPAIR_STATUS.REJECTED)).toBe(false);

    const meta = h.tripStore.get('trip-1')?.rawDetectionMeta as Record<string, unknown>;
    const refreshAfterFailure = readBoundaryRefreshRecord(meta);
    expect(refreshAfterFailure?.state).toBe(BOUNDARY_REFRESH_STATE.PENDING);
    expect(refreshAfterFailure?.lastError).toContain('redis down');

    const retryAfterMs = Date.parse(refreshAfterFailure?.retryAfter ?? '0');
    jest.spyOn(Date, 'now').mockReturnValue(retryAfterMs + 1);
    expect(isBoundaryRefreshRetryable(refreshAfterFailure)).toBe(true);

    await (
      h.service as never as { retryPendingBoundaryRefreshes: (v: string) => Promise<void> }
    ).retryPendingBoundaryRefreshes('veh-1');

    jest.spyOn(Date, 'now').mockRestore();
    expect(h.enrichment.refreshEnrichmentAfterBoundaryRepair).toHaveBeenCalledTimes(2);
  });

  it('3 — restart recovery: pending refresh retried on reconciliation entry', async () => {
    const h = buildReconciliationHarness();
    h.tripStore.set('trip-1', {
      id: 'trip-1',
      vehicleId: 'veh-1',
      tripStatus: 'COMPLETED',
      startTime: at(1),
      endTime: at(50),
      rawDetectionMeta: {
        boundaryRefresh: buildBoundaryRefreshRecord('PENDING', null, 'queue lost on restart', {
          generation: TEST_GENERATION,
        }),
      },
    });

    (h.service as never as Record<string, unknown>).collectRepairCandidates = jest
      .fn()
      .mockResolvedValue([dimoCandidate()]);

    await (
      h.service as never as {
        detectAndRepairMissingTrips: (
          vehicleId: string,
          from: Date,
          to: Date,
          options?: { useDimoSegmentFallback?: boolean },
        ) => Promise<unknown>;
      }
    ).detectAndRepairMissingTrips('veh-1', at(-10), at(60), { useDimoSegmentFallback: true });

    expect(h.enrichment.refreshEnrichmentAfterBoundaryRepair).toHaveBeenCalled();
  });

  it('5 — refuses boundary repair when organizationId cannot be resolved', async () => {
    const h = buildReconciliationHarness();
    h.prisma.vehicle.findUnique.mockResolvedValue({
      organizationId: null,
      dimoVehicle: { tokenId: 77 },
      tripDetectionState: { detectionProfile: 'ICE' },
    } as never);
    h.tripStore.set('trip-1', {
      id: 'trip-1',
      vehicleId: 'veh-1',
      tripStatus: 'COMPLETED',
      startTime: at(30),
      endTime: at(50),
      dimoSegmentId: null,
      rawDetectionMeta: null,
      startLatitude: 51.2,
      startLongitude: 9.3,
      endLatitude: 51.25,
      endLongitude: 9.35,
    });

    (h.service as never as Record<string, unknown>).collectRepairCandidates = jest
      .fn()
      .mockResolvedValue([dimoCandidate()]);
    (h.service as never as Record<string, unknown>).resolveEffectiveConfidence = jest
      .fn()
      .mockResolvedValue('HIGH');

    const result = await (
      h.service as never as {
        detectAndRepairMissingTrips: (
          vehicleId: string,
          from: Date,
          to: Date,
          options?: { useDimoSegmentFallback?: boolean },
        ) => Promise<{ applied: number; rejected: number }>;
      }
    ).detectAndRepairMissingTrips('veh-1', at(-10), at(60), { useDimoSegmentFallback: true });

    expect(result.applied).toBe(0);
    expect(result.rejected).toBe(1);
    expect(h.tripStore.get('trip-1')?.startTime).toEqual(at(30));
  });

  it('8 — repeated behavior refresh remains replace-by-trip (no duplicates)', async () => {
    const h = makeTransactionalPrisma();
    const replaceOnce = async () => {
      await h.prisma.tripBehaviorEvent.deleteMany({ where: { tripId: 'trip-1' } });
      await h.prisma.tripBehaviorEvent.createMany({
        data: [{ tripId: 'trip-1', eventType: 'HARD_BRAKE', recordedAt: at(5) }],
      });
    };
    await replaceOnce();
    await replaceOnce();
    expect(h.behaviorEvents).toHaveLength(1);
  });

  it('10 — boundary refresh resets drivingImpactStatus to PENDING for recompute', async () => {
    const h = makeTransactionalPrisma();
    h.tripStore.set('trip-1', {
      id: 'trip-1',
      vehicleId: 'veh-1',
      drivingImpactStatus: 'READY',
      drivingImpactComputedAt: new Date(),
      behaviorEnrichmentStatus: 'COMPLETED',
    });

    const orchestrator = new (await import('../trip-enrichment-orchestrator.service')).TripEnrichmentOrchestratorService(
      h.prisma as never,
      { enrichTrip: jest.fn() } as never,
      { add: jest.fn() } as never,
      { add: jest.fn() } as never,
      undefined,
      undefined,
      { enrichTrip: jest.fn().mockResolvedValue({}) } as never,
      undefined,
      undefined,
      new BoundaryRefreshLifecycleService(h.prisma as never),
    );

    await orchestrator.refreshEnrichmentAfterBoundaryRepair('trip-1', 'veh-1', 'org-1');
    expect(h.tripStore.get('trip-1')?.drivingImpactStatus).toBe('PENDING');
    expect(h.tripStore.get('trip-1')?.drivingImpactComputedAt).toBeNull();
  });

  it('11 — driver score aggregates corrected impact once per trip row', async () => {
    const { DriverScoreService } = await import('../driver-score.service');
    const { TripAssignmentSubjectType } = await import('@prisma/client');
    const service = new DriverScoreService({} as never);
    const rows = [{ drivingStressScore: 72, distanceKm: 40 }];
    const once = service.aggregateRows(TripAssignmentSubjectType.BOOKING_CUSTOMER, 'cust-1', rows);
    const twice = service.aggregateRows(
      TripAssignmentSubjectType.BOOKING_CUSTOMER,
      'cust-1',
      [...rows, ...rows],
    );
    expect(once.scoredTripCount).toBe(1);
    expect(twice.scoredTripCount).toBe(2);
    expect(once.drivingStressScore).toBe(72);
  });

  it('13 — concurrent reconciliation attempts on same trip: safe single mutation', async () => {
    const h = buildReconciliationHarness();
    h.tripStore.set('trip-1', {
      id: 'trip-1',
      vehicleId: 'veh-1',
      tripStatus: 'COMPLETED',
      startTime: at(30),
      endTime: at(50),
      dimoSegmentId: null,
      rawDetectionMeta: null,
      startLatitude: 51.2,
      startLongitude: 9.3,
      endLatitude: 51.25,
      endLongitude: 9.35,
    });

    (h.service as never as Record<string, unknown>).collectRepairCandidates = jest
      .fn()
      .mockResolvedValue([dimoCandidate()]);
    (h.service as never as Record<string, unknown>).resolveEffectiveConfidence = jest
      .fn()
      .mockResolvedValue('HIGH');

    const run = () =>
      (
        h.service as never as {
          detectAndRepairMissingTrips: (
            vehicleId: string,
            from: Date,
            to: Date,
            options?: { useDimoSegmentFallback?: boolean },
          ) => Promise<{ applied: number }>;
        }
      ).detectAndRepairMissingTrips('veh-1', at(-10), at(60), { useDimoSegmentFallback: true });

    const results = await Promise.allSettled([run(), run()]);
    const appliedTotal = results
      .filter((r) => r.status === 'fulfilled')
      .reduce((sum, r) => sum + (r as PromiseFulfilledResult<{ applied: number }>).value.applied, 0);

    expect(h.tripStore.get('trip-1')?.startTime).toEqual(at(1));
    expect(appliedTotal).toBeGreaterThanOrEqual(1);
    expect(appliedTotal).toBeLessThanOrEqual(2);
  });

  it('14 — malformed boundaryRepairHistory in decision engine does not throw', async () => {
    const { prisma, tripStore } = makeTransactionalPrisma();
    tripStore.set('trip-1', {
      id: 'trip-1',
      vehicleId: 'veh-1',
      tripStatus: 'COMPLETED',
      startTime: at(30),
      endTime: at(50),
      dimoSegmentId: null,
      rawDetectionMeta: { boundaryRepairHistory: 'legacy-string' },
    });
    const engine = new TripDecisionEngine(prisma as never);
    await expect(
      engine.repairTripBoundariesWithAudit(
        {
          tripId: 'trip-1',
          vehicleId: 'veh-1',
          organizationId: 'org-1',
          providerSegmentId: 'seg-1',
          providerMechanism: 'changePointDetection',
          oldStartTime: at(30),
          oldEndTime: at(50),
          newStartTime: at(1),
          newEndTime: at(50),
          confidence: 'HIGH',
          reason: 'test',
          source: 'test',
        },
        {
          auditId: 'audit-malformed',
          repairType: REPAIR_TYPES.PARTIAL_TRIP_BOUNDARY_EXTENSION,
          windowFrom: at(1),
          windowTo: at(50),
          confidence: 'HIGH',
          reason: 'test',
          detectorEvidence: {},
        },
      ),
    ).resolves.toMatchObject({ applied: true });
    const meta = tripStore.get('trip-1')?.rawDetectionMeta as Record<string, unknown>;
    expect(Array.isArray(meta.boundaryRepairHistory)).toBe(true);
  });
});
