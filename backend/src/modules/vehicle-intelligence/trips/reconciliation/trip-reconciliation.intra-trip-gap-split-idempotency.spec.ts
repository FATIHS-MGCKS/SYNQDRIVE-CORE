import { TripReconciliationService } from './trip-reconciliation.service';
import { stubTripDiBoundaryAdmissionService } from './__tests__/trip-reconciliation-di-admission.stub';
import { REPAIR_STATUS, REPAIR_TYPES } from './reconciliation.types';
import { buildIntraTripGapSplitRepairAuditId } from './intra-trip-gap-split-repair-id.util';

const VEHICLE_ID = 'veh-inc07';
const ORG_ID = 'org-inc07';
const PARENT_TRIP_ID = 'trip-parent';
const T0 = Date.parse('2026-09-02T12:00:00.000Z');
const at = (offsetMs: number) => new Date(T0 + offsetMs);

const GAP = {
  gapMs: 310_000,
  driftM: 12,
  firstEndAt: at(30 * 60_000),
  firstEndLat: 51.1,
  firstEndLng: 9.2,
  secondStartAt: at(34 * 60_000),
  secondStartLat: 51.1001,
  secondStartLng: 9.2001,
  preWaypointCount: 4,
  postWaypointCount: 3,
  seg1DistanceKm: 8,
  seg2DistanceKm: 5,
};

const parentTrip = {
  id: PARENT_TRIP_ID,
  startTime: at(0),
  endTime: at(60 * 60_000),
  endLatitude: 51.2,
  endLongitude: 9.3,
  distanceKm: 13,
  detectionProfile: 'ICE' as const,
};

type RepairRow = {
  id: string;
  vehicleId: string;
  tripId: string | null;
  repairType: string;
  status: string;
  reason: string;
  confidence: string;
  windowFrom: Date;
  windowTo: Date;
  detectorEvidence: Record<string, unknown>;
  appliedAt?: Date | null;
};

function buildGapSplitHarness(options?: {
  existingRepairs?: RepairRow[];
  gapSequence?: (typeof GAP | null)[];
  splitThrows?: boolean;
  createRejectsOnce?: boolean;
}) {
  const repairRows = new Map<string, RepairRow>();
  for (const row of options?.existingRepairs ?? []) {
    repairRows.set(row.id, { ...row });
  }

  let createRejectPending = options?.createRejectsOnce ?? false;
  const gapCalls: (typeof GAP | null)[] = [...(options?.gapSequence ?? [GAP, null])];

  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: ORG_ID }),
    },
    tripRepair: {
      findFirst: jest.fn(async ({ where }: any) => {
        for (const row of repairRows.values()) {
          if (
            row.vehicleId === where.vehicleId &&
            row.repairType === where.repairType &&
            row.status === where.status &&
            row.windowFrom.getTime() === where.windowFrom.getTime() &&
            row.windowTo.getTime() === where.windowTo.getTime()
          ) {
            return { id: row.id };
          }
        }
        return null;
      }),
      findUnique: jest.fn(async ({ where }: any) => repairRows.get(where.id) ?? null),
      create: jest.fn(async ({ data }: any) => {
        if (createRejectPending) {
          createRejectPending = false;
          throw new Error('Unique constraint failed on the fields: (`id`)');
        }
        if (repairRows.has(data.id)) {
          throw new Error('Unique constraint failed on the fields: (`id`)');
        }
        const stored: RepairRow = { ...data };
        repairRows.set(data.id, stored);
        return stored;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const stored = repairRows.get(where.id);
        if (!stored) throw new Error('missing repair');
        Object.assign(stored, data);
        repairRows.set(where.id, stored);
        return stored;
      }),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const stored = repairRows.get(where.id);
        if (stored) {
          Object.assign(stored, update);
          repairRows.set(where.id, stored);
          return stored;
        }
        const created: RepairRow = { ...create };
        repairRows.set(where.id, created);
        return created;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const stored = repairRows.get(where.id);
        if (!stored) return { count: 0 };
        if (where.status?.not === REPAIR_STATUS.APPLIED && stored.status === REPAIR_STATUS.APPLIED) {
          return { count: 0 };
        }
        Object.assign(stored, data);
        repairRows.set(where.id, stored);
        return { count: 1 };
      }),
    },
  };

  let txLock: Promise<void> = Promise.resolve();
  const prisma = {
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: ORG_ID }),
    },
    vehicleTrip: {
      findMany: jest.fn().mockResolvedValue([parentTrip]),
      findUnique: jest.fn().mockResolvedValue({
        ...parentTrip,
        id: 'trip-second',
      }),
    },
    tripRepair: {
      ...tx.tripRepair,
      updateMany: tx.tripRepair.updateMany,
    },
    $transaction: jest.fn(async (fn: (inner: typeof tx) => Promise<unknown>) => {
      const prev = txLock;
      let release!: () => void;
      txLock = new Promise<void>((resolve) => {
        release = resolve;
      });
      await prev;
      const snapshot = new Map(repairRows);
      try {
        return await fn(tx);
      } catch (err) {
        repairRows.clear();
        for (const [key, value] of snapshot.entries()) {
          repairRows.set(key, value);
        }
        throw err;
      } finally {
        release();
      }
    }),
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };

  const splitTripAtGap = jest.fn(async (_params: unknown, _tx?: unknown) => ({
    firstTripId: PARENT_TRIP_ID,
    secondTripId: 'trip-second',
    movedWaypoints: 2,
  }));
  if (options?.splitThrows) {
    splitTripAtGap.mockRejectedValueOnce(new Error('split failed'));
  }

  const decisionEngine = {
    splitTripAtGap,
    finalizeRepairedTrip: jest.fn(async () => undefined),
  };

  const tripMetrics = {
    repairActions: { inc: jest.fn() },
    tripEvidencePaths: { inc: jest.fn() },
    tripReconciliationRepairApply: { inc: jest.fn() },
    tripReconciliationRepairIdempotentSkip: { inc: jest.fn() },
    tripReconciliationRepairClaimConflict: { inc: jest.fn() },
    tripReconciliationRepairRecovery: { inc: jest.fn() },
  };

  const service = new TripReconciliationService(
    prisma as never,
    decisionEngine as never,
    {} as never,
    {} as never,
    {} as never,
    stubTripDiBoundaryAdmissionService(),
    undefined as never,
    undefined as never,
    undefined as never,
    undefined,
    undefined,
    tripMetrics as never,
    { get: jest.fn() } as never,
  );

  let gapCallCount = 0;
  jest.spyOn(service as any, 'findWaypointGapForSplit').mockImplementation(async () => {
    gapCallCount += 1;
    // Odd calls open a split attempt; even calls end recursion within one invocation.
    if (gapCallCount % 2 === 1) {
      return gapCalls.length > 0 ? gapCalls.shift() ?? GAP : GAP;
    }
    return null;
  });
  const enqueueRepairEnrichment = jest
    .spyOn(service as any, 'enqueueRepairEnrichment')
    .mockResolvedValue(undefined);

  const runSingleSplit = (boundaryScannedTripIds = new Set<string>()) => {
    gapCallCount = 0;
    return (
      service as never as {
        splitCompletedTripRecursively: (
          trip: typeof parentTrip,
          vehicleId: string,
          tier: 'warm',
          boundaryScannedTripIds: Set<string>,
        ) => Promise<{ proposed: number; applied: number; rejected: number }>;
      }
    ).splitCompletedTripRecursively(parentTrip, VEHICLE_ID, 'warm', boundaryScannedTripIds);
  };

  const runWarmReplay = () =>
    (
      service as never as {
        repairIntraTripGapSplits: (
          vehicleId: string,
          from: Date,
          to: Date,
          tier: 'warm',
        ) => Promise<{
          proposed: number;
          applied: number;
          rejected: number;
          boundaryScannedTripIds: string[];
        }>;
      }
    ).repairIntraTripGapSplits(VEHICLE_ID, at(-60 * 60_000), at(2 * 60 * 60_000), 'warm');

  return {
    service,
    runWarmReplay,
    runSingleSplit,
    prisma,
    decisionEngine,
    repairRows,
    tripMetrics,
    enqueueRepairEnrichment,
    repairId: buildIntraTripGapSplitRepairAuditId(
      VEHICLE_ID,
      GAP.firstEndAt,
      GAP.secondStartAt,
    ),
  };
}

describe('INTRA_TRIP_GAP_SPLIT idempotency (INC-07)', () => {
  it('reproduces INC-07 on pre-fix semantics: second warm replay would duplicate without APPLIED guard', async () => {
    const h = buildGapSplitHarness({ gapSequence: [GAP, null] });
    const firstRun = await h.runSingleSplit();
    expect(firstRun).toEqual({ proposed: 1, applied: 1, rejected: 0 });
    expect(h.decisionEngine.splitTripAtGap).toHaveBeenCalledTimes(1);
    expect(h.repairRows.get(h.repairId)?.status).toBe(REPAIR_STATUS.APPLIED);

    const secondRun = await h.runSingleSplit();
    expect(secondRun).toEqual({ proposed: 1, applied: 0, rejected: 0 });
    expect(h.decisionEngine.splitTripAtGap).toHaveBeenCalledTimes(1);
    expect(h.tripMetrics.tripReconciliationRepairIdempotentSkip.inc).toHaveBeenCalled();
  });

  it('SERIAL_REPLAY_TEST: immediate second execution is a no-op', async () => {
    const h = buildGapSplitHarness({ gapSequence: [GAP, null, GAP, null] });
    await h.runSingleSplit();
    const replay = await h.runSingleSplit();
    expect(replay.applied).toBe(0);
    expect(h.decisionEngine.splitTripAtGap).toHaveBeenCalledTimes(1);
    expect(h.enqueueRepairEnrichment).toHaveBeenCalledTimes(2);
  });

  it('FOUR_HOUR_REPLAY_TEST: simulated warm-tier rerun is a no-op', async () => {
    const h = buildGapSplitHarness({ gapSequence: [GAP, null, GAP, null] });
    const first = await h.runSingleSplit();
    const second = await h.runSingleSplit();
    expect(first.applied).toBe(1);
    expect(second.applied).toBe(0);
    expect(h.decisionEngine.splitTripAtGap).toHaveBeenCalledTimes(1);
  });

  it('uses deterministic TripRepair primary key before mutation', async () => {
    const h = buildGapSplitHarness();
    await h.runSingleSplit();
    expect(h.prisma.tripRepair.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id: h.repairId }),
      }),
    );
  });

  it('LEGACY compatibility: random-UUID APPLIED row blocks re-application', async () => {
    const legacyId = 'legacy-random-uuid';
    const h = buildGapSplitHarness({
      existingRepairs: [
        {
          id: legacyId,
          vehicleId: VEHICLE_ID,
          tripId: PARENT_TRIP_ID,
          repairType: REPAIR_TYPES.INTRA_TRIP_GAP_SPLIT,
          status: REPAIR_STATUS.APPLIED,
          reason: 'legacy',
          confidence: 'MEDIUM',
          windowFrom: GAP.firstEndAt,
          windowTo: GAP.secondStartAt,
          detectorEvidence: {},
          appliedAt: at(4 * 60 * 60_000),
        },
      ],
      gapSequence: [GAP, null],
    });
    const result = await h.runSingleSplit();
    expect(result.applied).toBe(0);
    expect(h.decisionEngine.splitTripAtGap).not.toHaveBeenCalled();
  });

  it('TRANSACTION_FAILURE_RECOVERY: REJECTED repair can be retried once', async () => {
    const h = buildGapSplitHarness({
      existingRepairs: [
        {
          id: buildIntraTripGapSplitRepairAuditId(
            VEHICLE_ID,
            GAP.firstEndAt,
            GAP.secondStartAt,
          ),
          vehicleId: VEHICLE_ID,
          tripId: PARENT_TRIP_ID,
          repairType: REPAIR_TYPES.INTRA_TRIP_GAP_SPLIT,
          status: REPAIR_STATUS.REJECTED,
          reason: 'Split failed: split failed',
          confidence: 'MEDIUM',
          windowFrom: GAP.firstEndAt,
          windowTo: GAP.secondStartAt,
          detectorEvidence: {},
        },
      ],
      gapSequence: [GAP, null],
    });
    const result = await h.runSingleSplit();
    expect(result).toEqual({ proposed: 1, applied: 1, rejected: 0 });
    expect(h.tripMetrics.tripReconciliationRepairRecovery.inc).toHaveBeenCalled();
  });

  it('does not treat idempotent skip as a rejected repair', async () => {
    const h = buildGapSplitHarness({ gapSequence: [GAP, null, GAP, null] });
    await h.runWarmReplay();
    const replay = await h.runWarmReplay();
    expect(replay.rejected).toBe(0);
    expect(h.tripMetrics.repairActions.inc).not.toHaveBeenCalledWith(
      expect.objectContaining({ result: 'rejected' }),
    );
  });

  it('TWO_DISTINCT_GAPS_TEST: separate gap boundaries get separate repair identities', () => {
    const gap2 = {
      ...GAP,
      firstEndAt: at(45 * 60_000),
      secondStartAt: at(49 * 60_000),
    };
    const id1 = buildIntraTripGapSplitRepairAuditId(
      VEHICLE_ID,
      GAP.firstEndAt,
      GAP.secondStartAt,
    );
    const id2 = buildIntraTripGapSplitRepairAuditId(
      VEHICLE_ID,
      gap2.firstEndAt,
      gap2.secondStartAt,
    );
    expect(id1).not.toBe(id2);
  });

  it('DIFFERENT_VEHICLE_NEGATIVE_CONTROL: identity changes with vehicle', () => {
    const a = buildIntraTripGapSplitRepairAuditId(
      VEHICLE_ID,
      GAP.firstEndAt,
      GAP.secondStartAt,
    );
    const b = buildIntraTripGapSplitRepairAuditId(
      'veh-other',
      GAP.firstEndAt,
      GAP.secondStartAt,
    );
    expect(a).not.toBe(b);
  });

  it('UNIT_CONCURRENT_TWIN_TEST: parallel replay resolves to a single apply', async () => {
    const h = buildGapSplitHarness({ gapSequence: [GAP, null, GAP, null] });
    const [a, b] = await Promise.all([h.runSingleSplit(), h.runSingleSplit()]);
    expect(a.applied + b.applied).toBe(1);
    expect(h.decisionEngine.splitTripAtGap).toHaveBeenCalledTimes(1);
    expect(h.repairRows.get(h.repairId)?.status).toBe(REPAIR_STATUS.APPLIED);
  });

  it('ROOT_PARENT_NEGATIVE_CONTROL: same gap boundaries share identity across parent rows', () => {
    const idFromParentA = buildIntraTripGapSplitRepairAuditId(
      VEHICLE_ID,
      GAP.firstEndAt,
      GAP.secondStartAt,
    );
    const idFromParentB = buildIntraTripGapSplitRepairAuditId(
      VEHICLE_ID,
      GAP.firstEndAt,
      GAP.secondStartAt,
    );
    expect(idFromParentA).toBe(idFromParentB);
  });

  it('CRASH_AFTER_PROPOSED_TEST: failed transaction rolls back PROPOSED repair row', async () => {
    const h = buildGapSplitHarness({ splitThrows: true, gapSequence: [GAP, null] });
    const failed = await h.runSingleSplit();
    expect(failed).toEqual({ proposed: 1, applied: 0, rejected: 1 });
    expect(h.repairRows.get(h.repairId)?.status).toBe(REPAIR_STATUS.REJECTED);
    expect(h.decisionEngine.splitTripAtGap).toHaveBeenCalledTimes(1);
  });

  it('TRANSACTION_ROLLBACK_RETRY_TEST: retry after failed tx applies once', async () => {
    const h = buildGapSplitHarness({ splitThrows: true, gapSequence: [GAP, null, GAP, null] });
    const failed = await h.runSingleSplit();
    expect(failed.rejected).toBe(1);
    const retry = await h.runSingleSplit();
    expect(retry).toEqual({ proposed: 1, applied: 1, rejected: 0 });
    expect(h.decisionEngine.splitTripAtGap).toHaveBeenCalledTimes(2);
    expect(h.repairRows.get(h.repairId)?.status).toBe(REPAIR_STATUS.APPLIED);
  });

  it('DOWNSTREAM_ON_FAILED_TX: no enrichment when transaction fails', async () => {
    const h = buildGapSplitHarness({ splitThrows: true, gapSequence: [GAP, null] });
    await h.runSingleSplit();
    expect(h.enqueueRepairEnrichment).not.toHaveBeenCalled();
  });

  it('marks failed split as REJECTED without blocking future retry', async () => {
    const h = buildGapSplitHarness({ splitThrows: true, gapSequence: [GAP, null] });
    const failed = await h.runSingleSplit();
    expect(failed).toEqual({ proposed: 1, applied: 0, rejected: 1 });
    expect(h.repairRows.get(h.repairId)?.status).toBe(REPAIR_STATUS.REJECTED);
  });

  it('POST_COMMIT_ENQUEUE_FAILURE_TEST: enqueue failure must not downgrade APPLIED', async () => {
    const h = buildGapSplitHarness({ gapSequence: [GAP, null, GAP, null] });
    h.enqueueRepairEnrichment.mockRejectedValue(new Error('enqueue failed'));
    const first = await h.runSingleSplit();
    expect(first).toEqual({ proposed: 1, applied: 1, rejected: 0 });
    expect(h.repairRows.get(h.repairId)?.status).toBe(REPAIR_STATUS.APPLIED);
    const replay = await h.runSingleSplit();
    expect(replay.applied).toBe(0);
    expect(h.decisionEngine.splitTripAtGap).toHaveBeenCalledTimes(1);
    expect(h.tripMetrics.repairActions.inc).not.toHaveBeenCalledWith(
      expect.objectContaining({ result: 'rejected' }),
    );
  });

  it('POST_COMMIT_RECURSION_READ_FAILURE_TEST: read failure must not downgrade APPLIED', async () => {
    const h = buildGapSplitHarness({ gapSequence: [GAP, null] });
    h.prisma.vehicleTrip.findUnique.mockRejectedValueOnce(new Error('read failed'));
    const result = await h.runSingleSplit();
    expect(result).toEqual({ proposed: 1, applied: 1, rejected: 0 });
    expect(h.repairRows.get(h.repairId)?.status).toBe(REPAIR_STATUS.APPLIED);
  });

  it('POST_COMMIT_FAILURE_REPLAY_TEST: warm replay after enqueue failure is idempotent', async () => {
    const h = buildGapSplitHarness({ gapSequence: [GAP, null, GAP, null] });
    h.enqueueRepairEnrichment.mockRejectedValueOnce(new Error('enqueue failed'));
    await h.runSingleSplit();
    const replay = await h.runSingleSplit();
    expect(replay).toEqual({ proposed: 1, applied: 0, rejected: 0 });
    expect(h.decisionEngine.splitTripAtGap).toHaveBeenCalledTimes(1);
  });

  it('AMBIGUOUS_COMMIT_APPLIED_PRESERVATION_TEST: failure recorder preserves APPLIED', async () => {
    const h = buildGapSplitHarness();
    h.repairRows.set(h.repairId, {
      id: h.repairId,
      vehicleId: VEHICLE_ID,
      tripId: PARENT_TRIP_ID,
      repairType: REPAIR_TYPES.INTRA_TRIP_GAP_SPLIT,
      status: REPAIR_STATUS.APPLIED,
      reason: 'applied',
      confidence: 'MEDIUM',
      windowFrom: GAP.firstEndAt,
      windowTo: GAP.secondStartAt,
      detectorEvidence: {},
      appliedAt: at(0),
    });
    const outcome = await (
      h.service as never as {
        recordIntraTripGapSplitFailureSafely: (input: unknown) => Promise<string>;
      }
    ).recordIntraTripGapSplitFailureSafely({
      repairId: h.repairId,
      vehicleId: VEHICLE_ID,
      tripId: PARENT_TRIP_ID,
      gap: GAP,
      reason: 'test',
      detectorEvidence: {},
      error: new Error('client timeout after commit'),
    });
    expect(outcome).toBe('COMMIT_STATE_ALREADY_APPLIED');
    expect(h.repairRows.get(h.repairId)?.status).toBe(REPAIR_STATUS.APPLIED);
    expect(h.prisma.tripRepair.updateMany).not.toHaveBeenCalled();
  });

  it('APPLIED_TERMINAL_STATE_TEST: guarded update never downgrades APPLIED', async () => {
    const h = buildGapSplitHarness();
    h.repairRows.set(h.repairId, {
      id: h.repairId,
      vehicleId: VEHICLE_ID,
      tripId: PARENT_TRIP_ID,
      repairType: REPAIR_TYPES.INTRA_TRIP_GAP_SPLIT,
      status: REPAIR_STATUS.APPLIED,
      reason: 'applied',
      confidence: 'MEDIUM',
      windowFrom: GAP.firstEndAt,
      windowTo: GAP.secondStartAt,
      detectorEvidence: {},
    });
    h.prisma.tripRepair.updateMany = jest.fn(async (_args: unknown) => ({ count: 0 }));
    const outcome = await (
      h.service as never as {
        recordIntraTripGapSplitFailureSafely: (input: unknown) => Promise<string>;
      }
    ).recordIntraTripGapSplitFailureSafely({
      repairId: h.repairId,
      vehicleId: VEHICLE_ID,
      tripId: PARENT_TRIP_ID,
      gap: GAP,
      reason: 'test',
      detectorEvidence: {},
      error: new Error('post-commit'),
    });
    expect(outcome).toBe('COMMIT_STATE_ALREADY_APPLIED');
    expect(h.prisma.tripRepair.updateMany).not.toHaveBeenCalled();
  });
});

describe('DI boundary admission — step-4 scan gate (EXP021 #2047)', () => {
  it('records trip id only after findWaypointGapForSplit completes (no gap still counts as scanned)', async () => {
    const h = buildGapSplitHarness({ gapSequence: [null] });
    jest.spyOn(h.service as any, 'findWaypointGapForSplit').mockResolvedValue(null);
    const scanned = new Set<string>();
    await h.runSingleSplit(scanned);
    expect([...scanned]).toEqual([PARENT_TRIP_ID]);
  });

  it('repairIntraTripGapSplits omits trip when per-trip scan throws (no false release list)', async () => {
    const h = buildGapSplitHarness({ gapSequence: [null] });
    jest.spyOn(h.service as any, 'findWaypointGapForSplit').mockRejectedValue(new Error('waypoint read failed'));
    const result = await h.runWarmReplay();
    expect(result.boundaryScannedTripIds).toEqual([]);
  });

  it('warm replay includes scanned trip ids for release in the same reconcile pass', async () => {
    const h = buildGapSplitHarness({ gapSequence: [null] });
    const result = await h.runWarmReplay();
    expect(result.boundaryScannedTripIds).toContain(PARENT_TRIP_ID);
  });
});
