import { modelDelayedStartLiveBoundary } from '../start-boundary-window.util';
import { TripReconciliationService } from './trip-reconciliation.service';
import { stubTripDiBoundaryAdmissionService } from './__tests__/trip-reconciliation-di-admission.stub';
import { TripOverlapDetector } from '../detectors/trip-overlap.detector';

/**
 * FINAL-2 executable regression matrix E1–E3, E8–E9.
 */

const T0 = Date.parse('2026-08-29T12:00:00.000Z');
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

const dimoSegment = (startMin: number, endMin: number, startedBeforeRange = false) => ({
  segmentId: `seg-${startMin}-${endMin}`,
  mechanism: 'changePointDetection' as const,
  startTime: at(startMin).toISOString(),
  endTime: at(endMin).toISOString(),
  startedBeforeRange,
  isOngoing: false,
  durationSeconds: (endMin - startMin) * 60,
  startLatitude: 51.1,
  startLongitude: 9.2,
  endLatitude: 51.3,
  endLongitude: 9.4,
  odometerStartKm: null,
  odometerEndKm: null,
  distanceKm: 8,
  maxSpeedKmh: null,
});

function buildHarness(trips: Array<{ id: string; startMin: number; endMin: number }>) {
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
          id: t.id,
          startTime: at(t.startMin),
          endTime: at(t.endMin),
          tripStatus: 'COMPLETED',
        })),
      ),
    },
    tripRepair,
  };

  const decisionEngine = {
    createRepairedTrip: jest.fn(async (input: Record<string, unknown>) => ({
      id: 'trip-repaired',
      startTime: input.startTime,
    })),
    finalizeRepairedTrip: jest.fn(async () => undefined),
  };

  const postFinalize = {
    produceAfterPersistedCompletion: jest.fn(async () => undefined),
  };
  const enrichment = {
    enqueueBehaviorEnrichment: jest.fn(async () => undefined),
  };

  const configService = {
    get: jest.fn((key: string) =>
      key === 'worker.tripRepairCoverageMode' ? 'shadow' : undefined,
    ),
  };

  const tripMetrics = {
    duplicateCandidates: { inc: jest.fn() },
    repairActions: { inc: jest.fn() },
  };

  const service = new TripReconciliationService(
    prisma as never,
    decisionEngine as never,
    {} as never,
    new TripOverlapDetector(prisma as never),
    {} as never,
    stubTripDiBoundaryAdmissionService(),
    undefined as never,
    undefined as never,
    undefined as never,
    enrichment as never,
    postFinalize as never,
    tripMetrics as never,
    configService as never,
  );

  (service as never as Record<string, unknown>).collectRepairCandidates = jest
    .fn()
    .mockImplementation(async () => [
      {
        source: 'DIMO_SEGMENT',
        segmentId: 'seg-1',
        startTime: at(0),
        endTime: at(2),
        confidence: 'HIGH',
        reason: 'short trip',
        startDetectionMode: 'DIMO_REPAIR',
        endDetectionMode: 'DIMO_REPAIR',
        detectorEvidence: {},
      },
    ]);
  (service as never as Record<string, unknown>).resolveEffectiveConfidence = jest
    .fn()
    .mockResolvedValue('HIGH');

  return { service, decisionEngine, postFinalize, enrichment, tripRepair };
}

describe('delayed-start reconciliation regression (E1–E3, E8–E9)', () => {
  it('E1 — 2min trip entirely between RESTING polls yields exactly one repaired trip', async () => {
    const h = buildHarness([]);
    const result = await (
      h.service as never as {
        detectAndRepairMissingTrips: (
          a: string,
          b: Date,
          c: Date,
          o?: { useDimoSegmentFallback?: boolean },
        ) => Promise<{ applied: number }>;
      }
    ).detectAndRepairMissingTrips('veh-1', at(-5), at(10), { useDimoSegmentFallback: true });

    expect(result.applied).toBe(1);
    expect(h.decisionEngine.createRepairedTrip).toHaveBeenCalledTimes(1);
    expect(h.postFinalize.produceAfterPersistedCompletion).toHaveBeenCalledTimes(1);
    expect(h.enrichment.enqueueBehaviorEnrichment).toHaveBeenCalledTimes(1);
  });

  it('E2 — 20min trip detected 5min late truncates live prefix; shadow recon does not repair', async () => {
    const live = modelDelayedStartLiveBoundary({
      realDimoStart: at(0),
      firstDetectionAt: at(5),
      confirmationDelayMs: 60_000,
      dimoSegment: dimoSegment(0, 20, true) as never,
    });

    expect(live.missingPrefixMs).toBeGreaterThan(0);

    const h = buildHarness([{ id: 'live-suffix', startMin: 5, endMin: 20 }]);
    (h.service as never as Record<string, unknown>).collectRepairCandidates = jest
      .fn()
      .mockResolvedValue([
        {
          source: 'DIMO_SEGMENT',
          segmentId: 'seg-full',
          startTime: at(0),
          endTime: at(20),
          confidence: 'HIGH',
          reason: 'full segment',
          startDetectionMode: 'DIMO_REPAIR',
          endDetectionMode: 'DIMO_REPAIR',
          detectorEvidence: {},
        },
      ]);

    const result = await (
      h.service as never as {
        detectAndRepairMissingTrips: (
          a: string,
          b: Date,
          c: Date,
          o?: { useDimoSegmentFallback?: boolean },
        ) => Promise<{ applied: number }>;
      }
    ).detectAndRepairMissingTrips('veh-1', at(-5), at(25), { useDimoSegmentFallback: true });

    expect(result.applied).toBe(0);
  });

  it('E3 — 50min trip detected 30min late truncates ≥28min live prefix', async () => {
    const live = modelDelayedStartLiveBoundary({
      realDimoStart: at(1),
      firstDetectionAt: at(30),
      confirmationDelayMs: 60_000,
      dimoSegment: dimoSegment(1, 50, true) as never,
    });

    expect(live.missingPrefixMs).toBeGreaterThanOrEqual(28 * 60_000);

    const h = buildHarness([{ id: 'live-suffix', startMin: 30, endMin: 50 }]);
    const result = await (
      h.service as never as {
        detectAndRepairMissingTrips: (
          a: string,
          b: Date,
          c: Date,
          o?: { useDimoSegmentFallback?: boolean },
        ) => Promise<{ applied: number }>;
      }
    ).detectAndRepairMissingTrips('veh-1', at(-5), at(60), { useDimoSegmentFallback: true });

    expect(result.applied).toBe(0);
  });

  it('E8 — worker restart does not change boundary math; truncation persists until recon', () => {
    const beforeRestart = modelDelayedStartLiveBoundary({
      realDimoStart: at(1),
      firstDetectionAt: at(30),
      confirmationDelayMs: 60_000,
      dimoSegment: dimoSegment(1, 50, true) as never,
    });
    const afterRestart = modelDelayedStartLiveBoundary({
      realDimoStart: at(1),
      firstDetectionAt: at(30),
      confirmationDelayMs: 60_000,
      dimoSegment: dimoSegment(1, 50, true) as never,
    });

    expect(afterRestart.missingPrefixMs).toBe(beforeRestart.missingPrefixMs);
  });

  it('E9 — snapshot failure then mid-trip detection still truncates prefix at first success', () => {
    const result = modelDelayedStartLiveBoundary({
      realDimoStart: at(2),
      firstDetectionAt: at(35),
      confirmationDelayMs: 90_000,
      dimoSegment: dimoSegment(2, 45, true) as never,
    });

    expect(result.selectedDimoSegmentStart).toBeNull();
    expect(result.missingPrefixMs).toBeGreaterThan(30 * 60_000);
  });
});
