import { TripReconciliationService } from './trip-reconciliation.service';
import { stubTripDiBoundaryAdmissionService } from './__tests__/trip-reconciliation-di-admission.stub';
import { REPAIR_STATUS } from './reconciliation.types';
import { TripOverlapDetector } from '../detectors/trip-overlap.detector';

/**
 * Section G — repair enrichment orchestration (unit-style integration).
 *
 * Classification: orchestration/unit-style integration test.
 * Mocks TripDecisionEngine persistence — does NOT exercise real Prisma writes,
 * BullMQ, or Driver Score computation. Proves enqueue wiring only.
 */

const T0 = Date.parse('2026-08-01T08:00:00.000Z');
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

const candidate = () => ({
  source: 'DIMO_SEGMENT' as const,
  segmentId: 'seg-1',
  startTime: at(0),
  endTime: at(45),
  confidence: 'HIGH' as const,
  reason: 'DIMO segment without canonical trip',
  startDetectionMode: 'DIMO_SEGMENT',
  endDetectionMode: 'DIMO_SEGMENT',
  startLatitude: 51.1,
  startLongitude: 9.2,
  endLatitude: 51.3,
  endLongitude: 9.4,
  distanceKm: 18,
  detectorEvidence: { detector: 'DimoSegmentFallback' },
});

function buildService() {
  const tripRepair = {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: data.id,
      status: data.status,
    })),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
      id: where.id,
      status: data.status,
    })),
  };

  const prisma = {
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({
        organizationId: 'org-1',
        dimoVehicle: { tokenId: 77 },
        tripDetectionState: { detectionProfile: 'ICE' },
      }),
    },
    vehicleTrip: { findMany: jest.fn().mockResolvedValue([]) },
    tripRepair,
  };

  const decisionEngine = {
    createRepairedTrip: jest.fn(async () => ({ id: 'trip-repaired-1' })),
    finalizeRepairedTrip: jest.fn(async () => undefined),
  };

  const postFinalizeAnalysisProducer = {
    produceAfterPersistedCompletion: jest.fn(async () => undefined),
  };

  const enrichmentOrchestrator = {
    enqueueBehaviorEnrichment: jest.fn(async () => undefined),
  };

  const configService = {
    get: jest.fn((key: string) =>
      key === 'worker.tripRepairCoverageMode' ? 'shadow' : undefined,
    ),
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
    enrichmentOrchestrator as never,
    postFinalizeAnalysisProducer as never,
    undefined,
    configService as never,
  );

  (service as never as Record<string, unknown>).collectRepairCandidates = jest
    .fn()
    .mockResolvedValue([candidate()]);
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
          options?: { useDimoSegmentFallback?: boolean },
        ) => Promise<{ proposed: number; applied: number; rejected: number }>;
      }
    ).detectAndRepairMissingTrips('veh-1', at(-60), at(120), {
      useDimoSegmentFallback: true,
    });

  return {
    run,
    decisionEngine,
    postFinalizeAnalysisProducer,
    enrichmentOrchestrator,
    tripRepair,
  };
}

describe('trip repair enrichment chain', () => {
  it('enqueues post-finalize analysis and behavior enrichment after repair apply', async () => {
    const h = buildService();

    const result = await h.run();

    expect(result.applied).toBe(1);
    expect(h.decisionEngine.createRepairedTrip).toHaveBeenCalledTimes(1);
    expect(h.decisionEngine.finalizeRepairedTrip).toHaveBeenCalledTimes(1);
    expect(h.tripRepair.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: REPAIR_STATUS.APPLIED }),
      }),
    );

    expect(h.postFinalizeAnalysisProducer.produceAfterPersistedCompletion).toHaveBeenCalledWith({
      tripId: 'trip-repaired-1',
      vehicleId: 'veh-1',
      organizationId: 'org-1',
      source: 'REPAIR_FINALIZE',
    });

    expect(h.enrichmentOrchestrator.enqueueBehaviorEnrichment).toHaveBeenCalledWith(
      'trip-repaired-1',
      'veh-1',
      'org-1',
      { delayMs: 0 },
    );
  });
});
