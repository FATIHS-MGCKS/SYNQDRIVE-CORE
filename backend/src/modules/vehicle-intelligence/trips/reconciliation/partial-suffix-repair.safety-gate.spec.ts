import { TripOverlapDetector, type TripOverlapEvidence } from '../detectors/trip-overlap.detector';
import { assessCoverage } from '../detectors/trip-coverage.util';
import { TripReconciliationService } from './trip-reconciliation.service';
import { stubTripDiBoundaryAdmissionService } from './__tests__/trip-reconciliation-di-admission.stub';
import { TripOverlapDetector as OverlapCtor } from '../detectors/trip-overlap.detector';
import { REPAIR_STATUS } from './reconciliation.types';

/**
 * FINAL-2 safety gate — partial suffix live trip vs full DIMO segment (B, C, E4–E7).
 */

const T0 = Date.parse('2026-08-29T12:00:00.000Z');
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

const row = (id: string, startMin: number, endMin: number) => ({
  id,
  startTime: at(startMin),
  endTime: at(endMin),
  tripStatus: 'COMPLETED',
});

function overlapEvidence(
  mode: 'legacy' | 'shadow' | 'enforce',
  existingTrips: ReturnType<typeof row>[],
  candidateStartMin = 1,
  candidateEndMin = 50,
): Promise<TripOverlapEvidence> {
  const findMany = jest.fn().mockResolvedValue(existingTrips);
  const detector = new TripOverlapDetector({ vehicleTrip: { findMany } } as never);
  return detector
    .evaluate({
      vehicleId: 'veh-1',
      dimoTokenId: 1,
      profile: 'ICE',
      phase: 'duplicate_or_overlap_check',
      candidateStart: at(candidateStartMin),
      candidateEnd: at(candidateEndMin),
      coverageMode: mode,
    } as never)
    .then((f) => f.evidence as TripOverlapEvidence);
}

const candidate = (startMin = 1, endMin = 50) => ({
  source: 'DIMO_SEGMENT' as const,
  segmentId: 'seg-full',
  mechanism: 'changePointDetection',
  startTime: at(startMin),
  endTime: at(endMin),
  confidence: 'HIGH' as const,
  reason: 'DIMO segment without canonical trip',
  startDetectionMode: 'DIMO_IGNITION_REPAIR',
  endDetectionMode: 'DIMO_IGNITION_REPAIR',
  startLatitude: 51.1,
  startLongitude: 9.2,
  endLatitude: 51.25,
  endLongitude: 9.35,
  distanceKm: 42,
  detectorEvidence: { detector: 'DimoSegmentFallback' },
});

function buildReconciliationHarness(
  mode: 'legacy' | 'shadow' | 'enforce',
  trips: ReturnType<typeof row>[],
  partialBoundaryRepairEnabled = false,
) {
  const tripRepair = {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: data.id,
      status: data.status,
    })),
    update: jest.fn(async () => undefined),
  };

  const prisma = {
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({
        organizationId: 'org-1',
        dimoVehicle: { tokenId: 77 },
        tripDetectionState: { detectionProfile: 'ICE' },
      }),
    },
    vehicleTrip: {
      findMany: jest.fn().mockResolvedValue(
        trips.map((t) => ({
          ...t,
          dimoSegmentId: null,
          startLatitude: 51.2,
          startLongitude: 9.3,
          endLatitude: 51.25,
          endLongitude: 9.35,
          distanceKm: null,
          rawDetectionMeta: null,
        })),
      ),
      findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
        const t = trips.find((r) => r.id === where.id);
        return t
          ? {
              ...t,
              vehicleId: 'veh-1',
              dimoSegmentId: null,
              startLatitude: 51.2,
              startLongitude: 9.3,
              endLatitude: 51.25,
              endLongitude: 9.35,
              rawDetectionMeta: {
                boundaryRefresh: {
                  state: 'PENDING',
                  generation: 'gen-test',
                  requestedAt: new Date().toISOString(),
                },
              },
            }
          : null;
      }),
      update: jest.fn(async () => undefined),
    },
    tripRepair,
  };

  const decisionEngine = {
    createRepairedTrip: jest.fn(async (input: Record<string, unknown>) => ({
      id: `trip-${String(input.startTime)}`,
      startTime: input.startTime,
      endTime: null,
    })),
    finalizeRepairedTrip: jest.fn(async () => undefined),
    repairTripBoundaries: jest.fn(async () => ({ applied: true, trip: { id: trips[0]?.id } })),
    repairTripBoundariesWithAudit: jest.fn(async () => ({
      applied: true,
      trip: { id: trips[0]?.id },
    })),
  };

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'worker.tripRepairCoverageMode') return mode;
      if (key === 'worker.tripPartialBoundaryRepairEnabled') return partialBoundaryRepairEnabled;
      return undefined;
    }),
  };

  const tripMetrics = {
    duplicateCandidates: { inc: jest.fn() },
    repairActions: { inc: jest.fn() },
  };

  const enrichmentOrchestrator = {
    refreshEnrichmentAfterBoundaryRepair: jest.fn().mockResolvedValue(undefined),
  };

  const service = new TripReconciliationService(
    prisma as never,
    decisionEngine as never,
    {} as never,
    new OverlapCtor(prisma as never),
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
    .mockResolvedValue([candidate()]);
  (service as never as Record<string, unknown>).resolveEffectiveConfidence = jest
    .fn()
    .mockResolvedValue('HIGH');

  return { service, decisionEngine, tripRepair, prisma };
}

describe('partial suffix live trip vs full DIMO segment (B)', () => {
  const existingSuffix = [row('live-suffix', 30, 50)];

  it.each(['legacy', 'shadow', 'enforce'] as const)(
    '%s mode — overlap evidence for DIMO 12:01–12:50 vs live 12:30–12:50',
    async (mode) => {
      const evidence = await overlapEvidence(mode, existingSuffix);

      expect(evidence.coverageVerdict).toBe('PARTIALLY_COVERED');
      expect(evidence.coverage.prefixMissingSeconds).toBe(29 * 60);
      expect(evidence.coverage.suffixMissingSeconds).toBe(0);
      expect(evidence.repairableSpans).toEqual([
        { start: at(1).toISOString(), end: at(30).toISOString() },
      ]);

      if (mode === 'legacy' || mode === 'shadow') {
        expect(evidence.legacyVerdict).toBe('TRIGGERED');
        expect(evidence.effectiveDecision).toBe('SUPPRESS');
        expect(evidence.decisionSource).toBe('legacy');
      } else {
        expect(evidence.effectiveDecision).toBe('ACCEPT');
        expect(evidence.decisionSource).toBe('coverage');
      }
    },
  );

  it('shadow reconciliation suppresses generic missing-trip repair when partial repair disabled', async () => {
    const h = buildReconciliationHarness('shadow', existingSuffix, false);
    const result = await (
      h.service as never as {
        detectAndRepairMissingTrips: (
          vehicleId: string,
          from: Date,
          to: Date,
          options?: { useDimoSegmentFallback?: boolean },
        ) => Promise<{ proposed: number; applied: number; rejected: number }>;
      }
    ).detectAndRepairMissingTrips('veh-1', at(-10), at(60), {
      useDimoSegmentFallback: true,
    });

    expect(result.applied).toBe(0);
    expect(h.decisionEngine.createRepairedTrip).not.toHaveBeenCalled();
    expect(h.tripRepair.create.mock.calls[0][0].data.status).toBe(REPAIR_STATUS.SUPPRESSED);
  });

  it('FINAL-3 — partial boundary repair extends suffix trip to ONE canonical window (all modes)', async () => {
    for (const mode of ['legacy', 'shadow', 'enforce'] as const) {
      const h = buildReconciliationHarness(mode, existingSuffix, true);
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
      expect(h.decisionEngine.repairTripBoundariesWithAudit).toHaveBeenCalled();
      expect(h.decisionEngine.createRepairedTrip).not.toHaveBeenCalled();
    }
  });

  it('enforce reconciliation creates prefix trip when partial repair disabled — TWO canonical trips', async () => {
    const h = buildReconciliationHarness('enforce', existingSuffix, false);
    const result = await (
      h.service as never as {
        detectAndRepairMissingTrips: (
          vehicleId: string,
          from: Date,
          to: Date,
          options?: { useDimoSegmentFallback?: boolean },
        ) => Promise<{ proposed: number; applied: number }>;
      }
    ).detectAndRepairMissingTrips('veh-1', at(-10), at(60), {
      useDimoSegmentFallback: true,
    });

    expect(result.applied).toBe(1);
    expect(h.decisionEngine.createRepairedTrip).toHaveBeenCalledTimes(1);
    expect(h.decisionEngine.finalizeRepairedTrip).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ endTime: at(30) }),
    );
  });
});

describe('one physical drive = one canonical trip invariant (C)', () => {
  it('assessCoverage shows suffix-only canonical trip leaves 29min prefix uncovered', () => {
    const assessment = assessCoverage(at(1), at(50), [
      {
        id: 'live-suffix',
        startTime: at(30),
        endTime: at(50),
        tripStatus: 'COMPLETED',
      },
    ]);

    expect(assessment.verdict).toBe('PARTIALLY_COVERED');
    expect(assessment.repairableSpans).toHaveLength(1);
    expect(assessment.repairableSpans[0]).toEqual({ start: at(1), end: at(30) });
  });

  it('FINAL-3 — one physical drive invariant when partial repair enabled', async () => {
    const shadow = buildReconciliationHarness('shadow', [row('live', 30, 50)], true);
    const result = await (
      shadow.service as never as {
        detectAndRepairMissingTrips: (
          a: string,
          b: Date,
          c: Date,
          o?: { useDimoSegmentFallback?: boolean },
        ) => Promise<{ applied: number }>;
      }
    ).detectAndRepairMissingTrips('veh-1', at(-10), at(60), { useDimoSegmentFallback: true });

    expect(result.applied).toBe(1);
    expect(shadow.decisionEngine.repairTripBoundariesWithAudit).toHaveBeenCalled();
    expect(shadow.decisionEngine.createRepairedTrip).not.toHaveBeenCalled();
  });
});

describe('executable regression matrix (E4–E7)', () => {
  it('E4/E5 — partial suffix + full DIMO segment in shadow vs enforce', async () => {
    const shadow = buildReconciliationHarness('shadow', [row('live', 30, 50)]);
    const enforce = buildReconciliationHarness('enforce', [row('live', 30, 50)]);

    const shadowResult = await (
      shadow.service as never as {
        detectAndRepairMissingTrips: (
          a: string,
          b: Date,
          c: Date,
          o?: { useDimoSegmentFallback?: boolean },
        ) => Promise<{ applied: number }>;
      }
    ).detectAndRepairMissingTrips('veh-1', at(-10), at(60), { useDimoSegmentFallback: true });

    const enforceResult = await (
      enforce.service as never as {
        detectAndRepairMissingTrips: (
          a: string,
          b: Date,
          c: Date,
          o?: { useDimoSegmentFallback?: boolean },
        ) => Promise<{ applied: number }>;
      }
    ).detectAndRepairMissingTrips('veh-1', at(-10), at(60), { useDimoSegmentFallback: true });

    expect(shadowResult.applied).toBe(0);
    expect(enforceResult.applied).toBe(1);
  });

  it('E6 — partial prefix live trip + full DIMO segment is also fragmented under enforce', async () => {
    const evidence = await overlapEvidence('enforce', [row('live-prefix', 1, 20)]);
    expect(evidence.repairableSpans).toEqual([
      { start: at(20).toISOString(), end: at(50).toISOString() },
    ]);
  });

  it('E7 — interior gap leaves repairable interior span only', async () => {
    const evidence = await overlapEvidence('enforce', [
      row('t1', 1, 10),
      row('t2', 40, 50),
    ]);
    expect(evidence.repairableSpans).toEqual([
      { start: at(10).toISOString(), end: at(40).toISOString() },
    ]);
  });
});
