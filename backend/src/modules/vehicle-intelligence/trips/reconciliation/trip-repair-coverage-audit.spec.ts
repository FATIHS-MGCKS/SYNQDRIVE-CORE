import { TripReconciliationService } from './trip-reconciliation.service';
import { stubTripDiBoundaryAdmissionService } from './__tests__/trip-reconciliation-di-admission.stub';
import { REPAIR_STATUS } from './reconciliation.types';
import { TripOverlapDetector } from '../detectors/trip-overlap.detector';

/**
 * PR A — repair audit ordering, idempotency and coverage-mode behaviour.
 *
 * Exercises `detectAndRepairMissingTrips` directly with the real
 * TripOverlapDetector: candidate collection and confidence resolution are
 * stubbed because neither is changed by this PR, while the overlap decision,
 * the audit write and the persistence decision are the behaviour under test.
 */

const T0 = Date.parse('2026-08-01T08:00:00.000Z');
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

const tripRow = (id: string, startMin: number, endMin: number | null, tripStatus = 'COMPLETED') => ({
  id,
  startTime: at(startMin),
  endTime: endMin == null ? null : at(endMin),
  tripStatus,
});

const candidate = (startMin = 0, endMin = 98) => ({
  source: 'CLICKHOUSE_IGNITION' as const,
  startTime: at(startMin),
  endTime: at(endMin),
  confidence: 'HIGH' as const,
  reason: 'Ignition segment without canonical trip',
  startDetectionMode: 'CH_IGNITION_SEGMENT',
  endDetectionMode: 'CH_IGNITION_SEGMENT',
  startLatitude: 51.1,
  startLongitude: 9.2,
  endLatitude: 51.3,
  endLongitude: 9.4,
  distanceKm: 42,
  detectorEvidence: { detector: 'IgnitionSegmentDetector' },
});

function buildService(options: {
  mode: 'legacy' | 'shadow' | 'enforce';
  trips: ReturnType<typeof tripRow>[];
  candidates?: ReturnType<typeof candidate>[];
  existingRepair?: { id: string; status: string } | null;
  createRejects?: boolean;
}) {
  const repairRows = new Map<string, { id: string; status: string }>();
  if (options.existingRepair) repairRows.set(options.existingRepair.id, options.existingRepair);

  const tripRepair = {
    findUnique: jest.fn(async ({ where }: any) => repairRows.get(where.id) ?? null),
    create: jest.fn(async ({ data }: any) => {
      if (options.createRejects) throw new Error('Unique constraint failed on the fields: (`id`)');
      const stored = { id: data.id, status: data.status };
      repairRows.set(data.id, stored);
      return stored;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const stored = repairRows.get(where.id) ?? { id: where.id, status: 'PROPOSED' };
      if (data.status) stored.status = data.status;
      repairRows.set(where.id, stored);
      return stored;
    }),
  };

  const prisma = {
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({
        organizationId: 'org-1',
        dimoVehicle: { tokenId: 77 },
        tripDetectionState: { detectionProfile: 'ICE' },
      }),
    },
    vehicleTrip: { findMany: jest.fn().mockResolvedValue(options.trips) },
    tripRepair,
  };

  const decisionEngine = {
    createRepairedTrip: jest.fn(async (_input: Record<string, unknown>) => ({
      id: `trip-${Math.random().toString(16).slice(2, 8)}`,
    })),
    finalizeRepairedTrip: jest.fn(
      async (_tripId: string, _input: Record<string, unknown>) => undefined,
    ),
  };

  const configService = {
    get: jest.fn((key: string) =>
      key === 'worker.tripRepairCoverageMode' ? options.mode : undefined,
    ),
  };

  const service = new TripReconciliationService(
    prisma as never,
    decisionEngine as never,
    {} as never, // policy resolver — unused on this path
    new TripOverlapDetector(prisma as never),
    {} as never, // dimo segments
    stubTripDiBoundaryAdmissionService(),
    {} as never, // ignition detector (presence only)
    undefined as never,
    undefined as never,
    undefined,
    undefined,
    undefined,
    configService as never,
  );

  (service as never as Record<string, unknown>).collectRepairCandidates = jest
    .fn()
    .mockResolvedValue(options.candidates ?? [candidate()]);
  (service as never as Record<string, unknown>).resolveEffectiveConfidence = jest
    .fn()
    .mockResolvedValue('HIGH');

  const run = () =>
    (
      service as never as {
        detectAndRepairMissingTrips: (
          vehicleId: string,
          from: Date,
          to: Date,
        ) => Promise<{ proposed: number; applied: number; rejected: number }>;
      }
    ).detectAndRepairMissingTrips('veh-1', at(-60), at(120));

  return { service, run, prisma, tripRepair, decisionEngine, repairRows };
}

describe('repair audit ordering', () => {
  it('writes a durable audit row for a suppressed proposal before suppressing it', async () => {
    const h = buildService({ mode: 'shadow', trips: [tripRow('t1', 5, 19), tripRow('t2', 60, 75)] });

    const result = await h.run();

    expect(h.tripRepair.create).toHaveBeenCalledTimes(1);
    const written = h.tripRepair.create.mock.calls[0][0].data;
    expect(written.status).toBe(REPAIR_STATUS.SUPPRESSED);
    expect(written.windowFrom).toEqual(at(0));
    expect(written.windowTo).toEqual(at(98));
    expect(h.decisionEngine.createRepairedTrip).not.toHaveBeenCalled();
    expect(result).toEqual({ proposed: 0, applied: 0, rejected: 0 });
  });

  it('the suppressed audit row can reconstruct the whole decision', async () => {
    const h = buildService({ mode: 'shadow', trips: [tripRow('t1', 5, 19), tripRow('t2', 60, 75)] });

    await h.run();

    const written = h.tripRepair.create.mock.calls[0][0].data;
    const overlap = written.detectorEvidence.overlapDecision;

    expect(written.reason).toContain('Suppressed as duplicate');
    expect(written.confidence).toBe('HIGH');
    expect(written.detectorEvidence.source).toBe('CLICKHOUSE_IGNITION');
    expect(overlap.legacyVerdict).toBe('TRIGGERED');
    expect(overlap.coverageVerdict).toBe('PARTIALLY_COVERED');
    expect(overlap.effectiveDecision).toBe('SUPPRESS');
    expect(overlap.agreement).toBe('COVERAGE_WOULD_ACCEPT');
    expect(overlap.intersectingTripIds).toEqual(['t1', 't2']);
    expect(overlap.coverage.missingSeconds).toBe(69 * 60);
    expect(overlap.coverage.longestUncoveredSpanSeconds).toBe(41 * 60);
    expect(overlap.repairableSpans).toHaveLength(3);
  });

  it('accepted proposals still reach APPLIED with the trip linked', async () => {
    const h = buildService({ mode: 'shadow', trips: [] });

    const result = await h.run();

    expect(h.decisionEngine.createRepairedTrip).toHaveBeenCalledTimes(1);
    expect(h.tripRepair.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: REPAIR_STATUS.APPLIED }),
      }),
    );
    expect(result.proposed).toBe(1);
    expect(result.applied).toBe(1);
  });
});

describe('coverage mode', () => {
  it('legacy and shadow persist identical trips; only the audit differs', async () => {
    const trips = [tripRow('t1', 5, 19), tripRow('t2', 60, 75)];
    const legacy = buildService({ mode: 'legacy', trips });
    const shadow = buildService({ mode: 'shadow', trips });

    const legacyResult = await legacy.run();
    const shadowResult = await shadow.run();

    expect(legacyResult).toEqual(shadowResult);
    expect(legacy.decisionEngine.createRepairedTrip).not.toHaveBeenCalled();
    expect(shadow.decisionEngine.createRepairedTrip).not.toHaveBeenCalled();

    const legacyEvidence =
      legacy.tripRepair.create.mock.calls[0][0].data.detectorEvidence.overlapDecision;
    const shadowEvidence =
      shadow.tripRepair.create.mock.calls[0][0].data.detectorEvidence.overlapDecision;
    expect(legacyEvidence.mode).toBe('legacy');
    expect(shadowEvidence.mode).toBe('shadow');
    expect(legacyEvidence.effectiveDecision).toBe(shadowEvidence.effectiveDecision);
  });

  it('enforce repairs the uncovered spans only, never the covered envelope', async () => {
    const h = buildService({ mode: 'enforce', trips: [tripRow('t1', 5, 19), tripRow('t2', 60, 75)] });

    const result = await h.run();

    expect(result.applied).toBe(3);
    const persisted = h.decisionEngine.createRepairedTrip.mock.calls.map((call) => call[0].startTime);
    expect(persisted).toEqual([at(0), at(19), at(75)]);

    const ends = h.decisionEngine.finalizeRepairedTrip.mock.calls.map((call) => call[1].endTime);
    expect(ends).toEqual([at(5), at(60), at(98)]);

    // A clipped span inherits no boundary coordinates from the envelope.
    expect(h.decisionEngine.createRepairedTrip.mock.calls[0][0].startLatitude).toBeNull();
  });

  it('enforce still suppresses a fully covered drive (healthy trips untouched)', async () => {
    const h = buildService({ mode: 'enforce', trips: [tripRow('t1', 0, 98)] });

    const result = await h.run();

    expect(h.decisionEngine.createRepairedTrip).not.toHaveBeenCalled();
    expect(result).toEqual({ proposed: 0, applied: 0, rejected: 0 });
    expect(h.tripRepair.create.mock.calls[0][0].data.status).toBe(REPAIR_STATUS.SUPPRESSED);
  });

  it('enforce waits rather than duplicating while an ONGOING trip intersects', async () => {
    const h = buildService({ mode: 'enforce', trips: [tripRow('t1', 10, null, 'ONGOING')] });

    await h.run();

    expect(h.decisionEngine.createRepairedTrip).not.toHaveBeenCalled();
    const evidence = h.tripRepair.create.mock.calls[0][0].data.detectorEvidence.overlapDecision;
    expect(evidence.ambiguousReason).toBe('ONGOING_TRIP_INTERSECTS');
  });
});

describe('idempotency', () => {
  it('a duplicate scheduler replay updates the same audit row instead of inserting again', async () => {
    const h = buildService({ mode: 'shadow', trips: [tripRow('t1', 5, 19)] });

    await h.run();
    await h.run();
    await h.run();

    expect(h.tripRepair.create).toHaveBeenCalledTimes(1);
    expect(h.repairRows.size).toBe(1);
  });

  it('the audit id is derived from vehicle, type and window, not from time of evaluation', async () => {
    const first = buildService({ mode: 'shadow', trips: [tripRow('t1', 5, 19)] });
    const second = buildService({ mode: 'shadow', trips: [tripRow('t1', 5, 19)] });

    await first.run();
    await second.run();

    expect(first.tripRepair.create.mock.calls[0][0].data.id).toBe(
      second.tripRepair.create.mock.calls[0][0].data.id,
    );
  });

  it('a lost insert race does not fail the reconciliation run', async () => {
    const h = buildService({
      mode: 'shadow',
      trips: [tripRow('t1', 5, 19)],
      createRejects: true,
    });

    await expect(h.run()).resolves.toEqual({ proposed: 0, applied: 0, rejected: 0 });
  });

  it('an APPLIED repair is not downgraded when its own trip later covers the window', async () => {
    const h = buildService({ mode: 'shadow', trips: [] });

    await h.run();
    const id = h.tripRepair.create.mock.calls[0][0].data.id;
    expect(h.repairRows.get(id)?.status).toBe(REPAIR_STATUS.APPLIED);

    // The repair created a trip; the next tick now sees that trip as coverage.
    h.prisma.vehicleTrip.findMany.mockResolvedValue([tripRow('t-new', 0, 98)]);
    h.tripRepair.update.mockClear();

    await h.run();

    expect(h.repairRows.get(id)?.status).toBe(REPAIR_STATUS.APPLIED);
    expect(h.tripRepair.update).not.toHaveBeenCalled();
  });
});
