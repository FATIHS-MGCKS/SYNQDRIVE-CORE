/**
 * Deterministic COMPOSITE_MAX_ATTEMPT_FALLBACK chain (same anchors as R12 retry-budget HEAD).
 * Used for TDL observability OFF vs ON golden parity only — no FSM parameter changes.
 */
import { PrismaClient, TripDetectionState, TripStatus } from '@prisma/client';
import type { Queue } from 'bullmq';

import {
  buildActiveTickJob,
  buildTripR11OrchestrationHarness,
  drainTripTrackingQueue,
  restoreTripR11Clock,
  useTripR11FrozenClock,
  type TripR11OrchestrationHarness,
  type TripR11PostgresFixture,
  type TripR11SegmentsMock,
} from './testing/trip-r11-postgres-redis.integration.harness';

export const COMPOSITE_GOLDEN_TRIP_START = new Date('2026-09-12T04:31:00.000Z');
export const COMPOSITE_GOLDEN_LAST_MOVEMENT = new Date('2026-09-12T05:06:52.636Z');
export const COMPOSITE_GOLDEN_STOP_BOUNDARY = new Date('2026-09-12T05:06:59.000Z');
export const COMPOSITE_GOLDEN_STALE_VLS = new Date('2026-09-12T05:06:59.000Z');
export const COMPOSITE_GOLDEN_POSSIBLE_END_AT = new Date('2026-09-12T05:09:02.763Z');
export const COMPOSITE_GOLDEN_EV1_AT = new Date('2026-09-12T05:11:03.781Z');
export const COMPOSITE_GOLDEN_REOPEN1_ACTIVE = new Date('2026-09-12T05:11:33.000Z');
export const COMPOSITE_GOLDEN_EV2_PEC_AT = new Date('2026-09-12T05:13:30.000Z');
export const COMPOSITE_GOLDEN_REOPEN2_ACTIVE = new Date('2026-09-12T05:14:00.000Z');
export const COMPOSITE_GOLDEN_EV3_PEC_AT = new Date('2026-09-12T05:15:57.000Z');
export const COMPOSITE_GOLDEN_REOPEN3_ACTIVE = new Date('2026-09-12T05:16:27.000Z');
export const COMPOSITE_GOLDEN_EV4_PEC_AT = new Date('2026-09-12T05:18:24.000Z');

export async function createCompositeGoldenFixture(
  prisma: PrismaClient,
): Promise<TripR11PostgresFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dimoTokenId = 941000 + Math.floor(Math.random() * 1000);
  const org = await prisma.organization.create({
    data: {
      companyName: `TDL composite golden ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `CG-${suffix}`.slice(0, 12),
      make: 'Audi',
      model: 'A4',
      year: 2024,
      fuelType: 'GASOLINE',
      status: 'AVAILABLE',
    },
    select: { id: true, organizationId: true },
  });
  const trip = await prisma.vehicleTrip.create({
    data: {
      vehicleId: vehicle.id,
      tripStatus: TripStatus.ONGOING,
      startTime: COMPOSITE_GOLDEN_TRIP_START,
      startLatitude: 51.33,
      startLongitude: 9.5,
      distanceKm: 17,
      rawDetectionMeta: {},
    },
    select: { id: true, startTime: true },
  });
  await prisma.vehicleTripDetectionState.create({
    data: {
      vehicleId: vehicle.id,
      organizationId: org.id,
      state: TripDetectionState.ACTIVE_TRIP,
      detectionProfile: 'ICE',
      activeTripId: trip.id,
      possibleStartAt: COMPOSITE_GOLDEN_TRIP_START,
      lastMeaningfulMovementAt: COMPOSITE_GOLDEN_LAST_MOVEMENT,
      lastActivityAt: COMPOSITE_GOLDEN_LAST_MOVEMENT,
      lastCoreProcessedAt: COMPOSITE_GOLDEN_LAST_MOVEMENT,
      lastRouteProcessedAt: COMPOSITE_GOLDEN_LAST_MOVEMENT,
      lastDrivingProcessedAt: COMPOSITE_GOLDEN_LAST_MOVEMENT,
      lastEvidenceSummary: {
        lastProviderActivityAt: COMPOSITE_GOLDEN_LAST_MOVEMENT.toISOString(),
      },
    },
  });
  await prisma.vehicleLatestState.create({
    data: {
      vehicleId: vehicle.id,
      dimoTokenId,
      isIgnitionOn: false,
      speedKmh: 0,
      engineLoad: 39.6,
      sourceTimestamp: COMPOSITE_GOLDEN_STOP_BOUNDARY,
      updatedAt: COMPOSITE_GOLDEN_STOP_BOUNDARY,
    },
  });
  return {
    suffix,
    org,
    vehicle: { id: vehicle.id, organizationId: vehicle.organizationId, dimoTokenId },
    trip,
    lastMovementAt: COMPOSITE_GOLDEN_LAST_MOVEMENT,
    stopBoundaryAt: COMPOSITE_GOLDEN_STOP_BOUNDARY,
    expectedEndTime: COMPOSITE_GOLDEN_STOP_BOUNDARY,
    stopBoundaryPreseeded: false,
  };
}

export function buildCompositeStopCoreMock(): TripR11SegmentsMock {
  return {
    fetchRawTripCoreData: jest.fn().mockResolvedValue([
      {
        timestamp: COMPOSITE_GOLDEN_STOP_BOUNDARY.toISOString(),
        speed: 0,
        travelledDistance: 191075,
        isIgnitionOn: false,
      },
    ]),
    fetchRouteEnrichment: jest.fn().mockResolvedValue([
      {
        latitude: 51.33535,
        longitude: 9.5059516,
        speedKmh: 0,
        timestamp: COMPOSITE_GOLDEN_STOP_BOUNDARY.toISOString(),
      },
    ]),
    fetchPerformance: jest.fn().mockResolvedValue([]),
    fetchEndValidationWindow: jest.fn().mockResolvedValue([
      {
        timestamp: COMPOSITE_GOLDEN_STOP_BOUNDARY.toISOString(),
        speed: 0,
        isIgnitionOn: false,
        travelledDistance: 191075,
      },
    ]),
  };
}

export function buildCompositeEmptyStaleMock(): TripR11SegmentsMock {
  return {
    fetchRawTripCoreData: jest.fn().mockResolvedValue([]),
    fetchRouteEnrichment: jest.fn().mockResolvedValue([]),
    fetchPerformance: jest.fn().mockResolvedValue([]),
    fetchEndValidationWindow: jest.fn().mockResolvedValue([
      {
        timestamp: COMPOSITE_GOLDEN_STOP_BOUNDARY.toISOString(),
        speed: 0,
        isIgnitionOn: false,
        travelledDistance: 191075,
      },
    ]),
  };
}

export function buildCompositeCusumOngoingDetectorMock() {
  return {
    runAll: jest.fn().mockImplementation(async (names: string[]) => {
      if (names.includes('ChangePointEndDetector')) {
        return [
          {
            detectorName: 'ChangePointEndDetector',
            verdict: 'NOT_TRIGGERED',
            evidence: {
              cusumLastMovementAt: COMPOSITE_GOLDEN_LAST_MOVEMENT.toISOString(),
              appearsOngoing: true,
            },
          },
        ];
      }
      if (names.includes('EndContinuityDetector')) {
        return [
          {
            detectorName: 'EndContinuityDetector',
            verdict: 'NOT_TRIGGERED',
            evidence: {},
          },
        ];
      }
      return [];
    }),
  };
}

async function seedPossibleEndFromEmptyCore(params: {
  prisma: PrismaClient;
  harness: TripR11OrchestrationHarness;
  fixture: TripR11PostgresFixture;
}): Promise<void> {
  const stopTickAt = new Date('2026-09-12T05:07:30.000Z');
  useTripR11FrozenClock(stopTickAt);
  try {
    await params.harness.runJob(buildActiveTickJob(params.fixture, stopTickAt));
  } finally {
    restoreTripR11Clock();
  }

  await params.prisma.vehicleLatestState.update({
    where: { vehicleId: params.fixture.vehicle.id },
    data: {
      isIgnitionOn: false,
      speedKmh: 0,
      engineLoad: 39.6,
      sourceTimestamp: COMPOSITE_GOLDEN_STALE_VLS,
      updatedAt: COMPOSITE_GOLDEN_STALE_VLS,
    },
  });

  const emptyMock = buildCompositeEmptyStaleMock();
  params.harness.segments.fetchRawTripCoreData = emptyMock.fetchRawTripCoreData;
  params.harness.segments.fetchRouteEnrichment = emptyMock.fetchRouteEnrichment;
  params.harness.segments.fetchPerformance = emptyMock.fetchPerformance;

  useTripR11FrozenClock(COMPOSITE_GOLDEN_POSSIBLE_END_AT);
  try {
    await params.harness.runJob(
      buildActiveTickJob(params.fixture, COMPOSITE_GOLDEN_POSSIBLE_END_AT),
    );
  } finally {
    restoreTripR11Clock();
  }

  const det = await params.prisma.vehicleTripDetectionState.findUnique({
    where: { vehicleId: params.fixture.vehicle.id },
  });
  if (det?.state !== TripDetectionState.POSSIBLE_END) {
    throw new Error(`expected POSSIBLE_END after empty core, got ${det?.state}`);
  }
}

async function runActiveReopen(params: {
  harness: TripR11OrchestrationHarness;
  fixture: TripR11PostgresFixture;
  emptyMock: TripR11SegmentsMock;
  at: Date;
}): Promise<void> {
  params.harness.segments.fetchRawTripCoreData = params.emptyMock.fetchRawTripCoreData;
  params.harness.segments.fetchRouteEnrichment = params.emptyMock.fetchRouteEnrichment;
  params.harness.segments.fetchPerformance = params.emptyMock.fetchPerformance;
  useTripR11FrozenClock(params.at);
  try {
    await params.harness.runJob(buildActiveTickJob(params.fixture, params.at));
  } finally {
    restoreTripR11Clock();
  }
}

export async function runCompositeMaxAttemptFallbackChain(params: {
  prisma: PrismaClient;
  queue: Queue;
  harness: TripR11OrchestrationHarness;
  fixture: TripR11PostgresFixture;
}): Promise<void> {
  const stopMock = buildCompositeStopCoreMock();
  const emptyMock = buildCompositeEmptyStaleMock();
  stopMock.fetchEndValidationWindow = emptyMock.fetchEndValidationWindow;
  params.harness.segments.fetchRawTripCoreData = stopMock.fetchRawTripCoreData;
  params.harness.segments.fetchRouteEnrichment = stopMock.fetchRouteEnrichment;
  params.harness.segments.fetchPerformance = stopMock.fetchPerformance;
  params.harness.segments.fetchEndValidationWindow = stopMock.fetchEndValidationWindow;

  await seedPossibleEndFromEmptyCore({
    prisma: params.prisma,
    harness: params.harness,
    fixture: params.fixture,
  });

  useTripR11FrozenClock(COMPOSITE_GOLDEN_EV1_AT);
  await drainTripTrackingQueue({
    queue: params.queue,
    runJob: params.harness.runJob,
    maxSteps: 2,
  });
  restoreTripR11Clock();

  await runActiveReopen({
    harness: params.harness,
    fixture: params.fixture,
    emptyMock,
    at: COMPOSITE_GOLDEN_REOPEN1_ACTIVE,
  });

  useTripR11FrozenClock(COMPOSITE_GOLDEN_EV2_PEC_AT);
  await drainTripTrackingQueue({
    queue: params.queue,
    runJob: params.harness.runJob,
    maxSteps: 2,
  });
  restoreTripR11Clock();

  await runActiveReopen({
    harness: params.harness,
    fixture: params.fixture,
    emptyMock,
    at: COMPOSITE_GOLDEN_REOPEN2_ACTIVE,
  });

  useTripR11FrozenClock(COMPOSITE_GOLDEN_EV3_PEC_AT);
  await drainTripTrackingQueue({
    queue: params.queue,
    runJob: params.harness.runJob,
    maxSteps: 2,
  });
  restoreTripR11Clock();

  await runActiveReopen({
    harness: params.harness,
    fixture: params.fixture,
    emptyMock,
    at: COMPOSITE_GOLDEN_REOPEN3_ACTIVE,
  });

  useTripR11FrozenClock(COMPOSITE_GOLDEN_EV4_PEC_AT);
  await drainTripTrackingQueue({
    queue: params.queue,
    runJob: params.harness.runJob,
    maxSteps: 4,
  });
  restoreTripR11Clock();

  const trip = await params.prisma.vehicleTrip.findUnique({
    where: { id: params.fixture.trip.id },
  });
  const det = await params.prisma.vehicleTripDetectionState.findUnique({
    where: { vehicleId: params.fixture.vehicle.id },
  });
  const pecRuns = await params.prisma.vehicleTripTrackingRun.findMany({
    where: { tripId: params.fixture.trip.id, runType: 'POSSIBLE_END_CHECK' },
    orderBy: { createdAt: 'asc' },
  });
  const maxFallbackRun = pecRuns.find(
    (r) =>
      (r.resultSummary as Record<string, unknown>)?.reason ===
      'max_completed_cusum_attempts_fallback',
  );

  if (!maxFallbackRun) {
    throw new Error('COMPOSITE max fallback PEC run missing');
  }
  if (trip?.tripStatus !== TripStatus.COMPLETED) {
    throw new Error(`expected COMPLETED trip, got ${trip?.tripStatus}`);
  }
  if (det?.state !== TripDetectionState.RESTING) {
    throw new Error(`expected RESTING det, got ${det?.state}`);
  }
}
