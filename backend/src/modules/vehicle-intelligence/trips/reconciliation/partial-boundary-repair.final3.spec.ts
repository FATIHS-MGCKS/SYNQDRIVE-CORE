import { TripOverlapDetector } from '../detectors/trip-overlap.detector';
import { TripReconciliationService } from './trip-reconciliation.service';
import { stubTripDiBoundaryAdmissionService } from './__tests__/trip-reconciliation-di-admission.stub';
import { TripDecisionEngine } from '../decision/trip-decision.engine';
import { REPAIR_STATUS, REPAIR_TYPES } from './reconciliation.types';

/**
 * P1.2 FINAL-3 — canonical partial-boundary repair on real production path.
 * Uses real TripOverlapDetector classification helpers, real TripDecisionEngine
 * boundary repair, and real TripReconciliationService decision ordering.
 */

const T0 = Date.parse('2026-08-29T12:00:00.000Z');
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

const row = (id: string, startMin: number, endMin: number, status = 'COMPLETED') => ({
  id,
  startTime: at(startMin),
  endTime: at(endMin),
  tripStatus: status,
});

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
  endLatitude: 51.3,
  endLongitude: 9.4,
  distanceKm: 42,
  detectorEvidence: {
    repairSource: 'DIMO_SEGMENT',
    dimoSegment: { segmentId: 'seg-full', mechanism: 'changePointDetection' },
  },
});

function buildHarness(trips: ReturnType<typeof row>[]) {
  const vehicleTripRows = [...trips];
  const tripRepairStore = new Map<string, Record<string, unknown>>();
  const tripStore = new Map<string, Record<string, unknown>>();

  for (const t of trips) {
    tripStore.set(t.id, {
      id: t.id,
      vehicleId: 'veh-1',
      tripStatus: t.tripStatus,
      startTime: t.startTime,
      endTime: t.endTime,
      dimoSegmentId: null,
      rawDetectionMeta: null,
      startLatitude: 51.2,
      startLongitude: 9.3,
      endLatitude: 51.25,
      endLongitude: 9.35,
    });
  }

  const txClient = {
    vehicleTrip: {
      findMany: jest.fn().mockImplementation(async () => vehicleTripRows),
      findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
        return tripStore.get(where.id) ?? null;
      }),
      updateMany: jest.fn().mockImplementation(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const row = tripStore.get(where.id as string);
          if (!row) return { count: 0 };
          if (row.startTime !== where.startTime || row.endTime !== where.endTime) {
            return { count: 0 };
          }
          if (where.tripStatus && (where.tripStatus as { not?: string }).not === 'CANCELLED') {
            if (row.tripStatus === 'CANCELLED') return { count: 0 };
          }
          const merged = { ...row, ...data };
          tripStore.set(where.id as string, merged);
          const idx = vehicleTripRows.findIndex((r) => r.id === where.id);
          if (idx >= 0) {
            vehicleTripRows[idx] = {
              ...vehicleTripRows[idx],
              startTime: (merged.startTime as Date) ?? vehicleTripRows[idx].startTime,
              endTime: (merged.endTime as Date) ?? vehicleTripRows[idx].endTime,
              tripStatus: (merged.tripStatus as string) ?? vehicleTripRows[idx].tripStatus,
            };
          }
          return { count: 1 };
        },
      ),
      update: jest.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const existing = tripStore.get(where.id) ?? {};
        const merged = { ...existing, ...data };
        tripStore.set(where.id, merged);
        const idx = vehicleTripRows.findIndex((r) => r.id === where.id);
        if (idx >= 0) {
          vehicleTripRows[idx] = {
            ...vehicleTripRows[idx],
            startTime: (merged.startTime as Date) ?? vehicleTripRows[idx].startTime,
            endTime: (merged.endTime as Date) ?? vehicleTripRows[idx].endTime,
            tripStatus: (merged.tripStatus as string) ?? vehicleTripRows[idx].tripStatus,
          } as (typeof vehicleTripRows)[number];
        }
        return merged;
      }),
    },
    tripRepair: {
      findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
        const row = tripRepairStore.get(where.id);
        return row ? { id: where.id, ...row } : null;
      }),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        tripRepairStore.set(String(data.id), data);
        return data;
      }),
      update: jest.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const existing = tripRepairStore.get(where.id) ?? {};
        tripRepairStore.set(where.id, { ...existing, ...data });
        return { ...existing, ...data };
      }),
      upsert: jest.fn().mockImplementation(
        async ({
          where,
          create,
          update,
        }: {
          where: { id: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const existing = tripRepairStore.get(where.id);
          const next = existing ? { ...existing, ...update } : create;
          tripRepairStore.set(where.id, next);
          return next;
        },
      ),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({
        organizationId: 'org-1',
        dimoVehicle: { tokenId: 77 },
        tripDetectionState: { detectionProfile: 'ICE' },
      }),
    },
    vehicleTrip: txClient.vehicleTrip,
    tripRepair: txClient.tripRepair,
  };

  const decisionEngine = new TripDecisionEngine(prisma as never);
  const enrichmentOrchestrator = {
    refreshEnrichmentAfterBoundaryRepair: jest.fn().mockResolvedValue(undefined),
  };

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'worker.tripPartialBoundaryRepairEnabled') return true;
      if (key === 'worker.tripRepairCoverageMode') return 'shadow';
      return undefined;
    }),
  };

  const tripMetrics = {
    duplicateCandidates: { inc: jest.fn() },
    repairActions: { inc: jest.fn() },
  };

  const service = new TripReconciliationService(
    prisma as never,
    decisionEngine,
    {} as never,
    new TripOverlapDetector(prisma as never),
    {} as never,
    stubTripDiBoundaryAdmissionService(),
    undefined as never,
    undefined as never,
    undefined as never,
    enrichmentOrchestrator as never,
    undefined,
    tripMetrics as never,
    configService as never,
  );

  (service as never as Record<string, unknown>).collectRepairCandidates = jest
    .fn()
    .mockResolvedValue([dimoCandidate()]);
  (service as never as Record<string, unknown>).resolveEffectiveConfidence = jest
    .fn()
    .mockResolvedValue('HIGH');

  return {
    service,
    prisma,
    decisionEngine,
    enrichmentOrchestrator,
    tripStore,
    tripRepairStore,
    vehicleTripRows,
  };
}

describe('FINAL-3 partial boundary repair (I1–I15)', () => {
  it('I1 — ONE trip 12:01→12:50 from suffix partial 12:30→12:50', async () => {
    const h = buildHarness([row('live-suffix', 30, 50)]);
    const result = await (
      h.service as never as {
        detectAndRepairMissingTrips: (
          vehicleId: string,
          from: Date,
          to: Date,
          options?: { useDimoSegmentFallback?: boolean },
        ) => Promise<{ applied: number }>;
      }
    ).detectAndRepairMissingTrips('veh-1', at(-10), at(60), {
      useDimoSegmentFallback: true,
    });

    expect(result.applied).toBe(1);
    const stored = h.tripStore.get('live-suffix');
    expect(stored?.startTime).toEqual(at(1));
    expect(stored?.endTime).toEqual(at(50));
    expect(h.enrichmentOrchestrator.refreshEnrichmentAfterBoundaryRepair).toHaveBeenCalledWith(
      'live-suffix',
      'veh-1',
      'org-1',
    );
  });

  it('I2 — prefix partial extends end to provider boundary', async () => {
    const h = buildHarness([row('live-prefix', 1, 30)]);
    const result = await (
      h.service as never as {
        detectAndRepairMissingTrips: (
          a: string,
          b: Date,
          c: Date,
          o?: { useDimoSegmentFallback?: boolean },
        ) => Promise<{ applied: number }>;
      }
    ).detectAndRepairMissingTrips('veh-1', at(-10), at(60), { useDimoSegmentFallback: true });

    expect(result.applied).toBe(1);
    expect(h.tripStore.get('live-prefix')?.endTime).toEqual(at(50));
  });

  it('I3 — repeated repair is idempotent (10 runs, one boundary)', async () => {
    const h = buildHarness([row('live-suffix', 30, 50)]);
    const run = () =>
      (
        h.service as never as {
          detectAndRepairMissingTrips: (
            a: string,
            b: Date,
            c: Date,
            o?: { useDimoSegmentFallback?: boolean },
          ) => Promise<{ applied: number }>;
        }
      ).detectAndRepairMissingTrips('veh-1', at(-10), at(60), { useDimoSegmentFallback: true });

    let totalApplied = 0;
    for (let i = 0; i < 10; i++) {
      const r = await run();
      totalApplied += r.applied;
    }
    expect(totalApplied).toBe(1);
    expect(h.tripStore.get('live-suffix')?.startTime).toEqual(at(1));
    expect(h.tripStore.get('live-suffix')?.endTime).toEqual(at(50));
  });

  it('I4 — exact trip produces no applied repair', async () => {
    const h = buildHarness([row('exact', 1, 50)]);
    const result = await (
      h.service as never as {
        detectAndRepairMissingTrips: (
          a: string,
          b: Date,
          c: Date,
          o?: { useDimoSegmentFallback?: boolean },
        ) => Promise<{ applied: number }>;
      }
    ).detectAndRepairMissingTrips('veh-1', at(-10), at(60), { useDimoSegmentFallback: true });

    expect(result.applied).toBe(0);
    expect(h.enrichmentOrchestrator.refreshEnrichmentAfterBoundaryRepair).not.toHaveBeenCalled();
  });

  it('I5 — two fragments → ambiguous, no destructive mutation', async () => {
    const h = buildHarness([row('t1', 1, 10), row('t2', 40, 50)]);
    const result = await (
      h.service as never as {
        detectAndRepairMissingTrips: (
          a: string,
          b: Date,
          c: Date,
          o?: { useDimoSegmentFallback?: boolean },
        ) => Promise<{ applied: number }>;
      }
    ).detectAndRepairMissingTrips('veh-1', at(-10), at(60), { useDimoSegmentFallback: true });

    expect(result.applied).toBe(0);
    expect(h.tripStore.get('t1')?.startTime).toEqual(at(1));
    expect(h.tripStore.get('t2')?.endTime).toEqual(at(50));
  });

  it('I6 — conflicting trip in extension range → no mutation', async () => {
    const h = buildHarness([row('suffix', 30, 50), row('blocker', 5, 15)]);
    const result = await (
      h.service as never as {
        detectAndRepairMissingTrips: (
          a: string,
          b: Date,
          c: Date,
          o?: { useDimoSegmentFallback?: boolean },
        ) => Promise<{ applied: number }>;
      }
    ).detectAndRepairMissingTrips('veh-1', at(-10), at(60), { useDimoSegmentFallback: true });

    expect(result.applied).toBe(0);
    expect(h.tripStore.get('suffix')?.startTime).toEqual(at(30));
  });

  it('records PARTIAL_TRIP_BOUNDARY_EXTENSION audit type', async () => {
    const h = buildHarness([row('live-suffix', 30, 50)]);
    await (
      h.service as never as {
        detectAndRepairMissingTrips: (
          a: string,
          b: Date,
          c: Date,
          o?: { useDimoSegmentFallback?: boolean },
        ) => Promise<unknown>;
      }
    ).detectAndRepairMissingTrips('veh-1', at(-10), at(60), { useDimoSegmentFallback: true });

    const audits = [...h.tripRepairStore.values()];
    expect(audits.some((a) => a.repairType === REPAIR_TYPES.PARTIAL_TRIP_BOUNDARY_EXTENSION)).toBe(
      true,
    );
    expect(audits.some((a) => a.status === REPAIR_STATUS.APPLIED || a.status === REPAIR_STATUS.BOUNDARY_APPLIED)).toBe(
      true,
    );
  });

  it('I14 — assignment fields on trip row survive boundary repair', async () => {
    const h = buildHarness([row('assigned', 30, 50)]);
    h.tripStore.set('assigned', {
      ...h.tripStore.get('assigned'),
      assignedDriverId: 'driver-42',
      assignedBookingId: 'booking-99',
      bookingCustomerId: 'cust-7',
    });

    await (
      h.service as never as {
        detectAndRepairMissingTrips: (
          a: string,
          b: Date,
          c: Date,
          o?: { useDimoSegmentFallback?: boolean },
        ) => Promise<unknown>;
      }
    ).detectAndRepairMissingTrips('veh-1', at(-10), at(60), { useDimoSegmentFallback: true });

    const stored = h.tripStore.get('assigned');
    expect(stored?.id).toBe('assigned');
    expect(stored?.assignedDriverId).toBe('driver-42');
    expect(stored?.assignedBookingId).toBe('booking-99');
    expect(stored?.startTime).toEqual(at(1));
  });
});
