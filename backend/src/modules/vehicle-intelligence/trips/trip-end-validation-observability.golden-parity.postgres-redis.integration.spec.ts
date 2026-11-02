/**
 * TDL PR2303 — deterministic FSM golden parity (observability OFF vs ON).
 * Requires Postgres + BullMQ/Redis (same harness as R11/R12 integration).
 */
import { PrismaClient, TripDetectionState, TripStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { QUEUE_NAMES } from '@workers/queues/queue-names';

import { END_DETECTION_MODES, TRIP_TRACKING_TRIGGERS, type TripTrackingJobData } from './trip-detection.types';
import {
  buildActiveTickJob,
  buildKs661EmptyCoreSegmentsMock,
  buildKs661IdleTransitionSegmentsMock,
  buildTripR11DetectorMock,
  buildTripR11OrchestrationHarness,
  cleanupTripR11Fixture,
  createTripR11ActiveTripFixture,
  createTripR11Ks661PreIdleFixture,
  drainTripTrackingQueue,
  probeTripR11Postgres,
  restoreTripR11Clock,
  startTripR11RedisStack,
  stopTripR11RedisStack,
  useTripR11FrozenClock,
  type TripR11OrchestrationHarness,
  type TripR11PostgresFixture,
} from './testing/trip-r11-postgres-redis.integration.harness';
import {
  assertFsmGoldenParity,
  captureFsmGoldenFingerprint,
} from './trip-end-validation-observability.golden-fsm.util';
import {
  buildTripEndValidationObservabilityService,
  clearTripEndValidationObservabilityTestEnv,
  setTripEndValidationObservabilityTestEnv,
  waitForTripEndValidationObservations,
} from './trip-end-validation-observability.golden-parity.harness';
import { seedCompletedTdlObsRetentionPurgeRun } from './trip-end-validation-observability-test.helpers';
import type { TripEndValidationObservabilityService } from './trip-end-validation-observability.service';
import { TripDecisionEngine } from './decision/trip-decision.engine';
import {
  buildCompositeCusumOngoingDetectorMock,
  buildCompositeStopCoreMock,
  createCompositeGoldenFixture,
  runCompositeMaxAttemptFallbackChain,
} from './trip-end-validation-observability.golden-parity-composite.harness';

const LIVE = process.env.TRIP_END_VALIDATION_GOLDEN_PARITY_POSTGRES_REDIS === '1';
const REQUIRED = process.env.TRIP_END_VALIDATION_GOLDEN_PARITY_POSTGRES_REDIS_REQUIRED === '1';

if (REQUIRED) {
  if (!LIVE) {
    throw new Error(
      'TRIP_END_VALIDATION_GOLDEN_PARITY_POSTGRES_REDIS_REQUIRED=1 but integration flag is off',
    );
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
    throw new Error('Golden parity integration requires CI-local DATABASE_URL');
  }
}

async function runGoldenParityCase(params: {
  prisma: PrismaClient;
  queue: Queue<TripTrackingJobData>;
  label: string;
  minObservationsWhenOn?: number;
  createFixture: () => Promise<TripR11PostgresFixture>;
  buildHarness?: (ctx: {
    prisma: PrismaClient;
    queue: Queue<TripTrackingJobData>;
    fixture: TripR11PostgresFixture;
    observability: TripEndValidationObservabilityService | undefined;
  }) => TripR11OrchestrationHarness;
  run: (ctx: {
    harness: TripR11OrchestrationHarness;
    fixture: TripR11PostgresFixture;
  }) => Promise<void>;
}): Promise<void> {
  const minObs = params.minObservationsWhenOn ?? 1;

  const runOnce = async (obsEnabled: boolean) => {
    await params.queue.obliterate({ force: true });
    const fixture = await params.createFixture();
    clearTripEndValidationObservabilityTestEnv();
    setTripEndValidationObservabilityTestEnv(fixture.vehicle.id, obsEnabled);
    if (obsEnabled) {
      await seedCompletedTdlObsRetentionPurgeRun(params.prisma, true);
    }
    const observability = obsEnabled
      ? buildTripEndValidationObservabilityService(params.prisma)
      : undefined;
    const harness = params.buildHarness
      ? params.buildHarness({
          prisma: params.prisma,
          queue: params.queue,
          fixture,
          observability,
        })
      : (() => {
          const idleSegments = buildKs661IdleTransitionSegmentsMock(
            new Date('2026-09-08T19:59:22.000Z'),
          );
          const detectorRegistry = buildTripR11DetectorMock(fixture.expectedEndTime);
          return buildTripR11OrchestrationHarness(
            params.prisma,
            params.queue,
            fixture,
            idleSegments,
            detectorRegistry,
            { endValidationObservability: observability },
          );
        })();
    try {
      await params.run({ harness, fixture });
      return {
        fixture,
        fingerprint: await captureFsmGoldenFingerprint({
          prisma: params.prisma,
          queue: params.queue,
          vehicleId: fixture.vehicle.id,
          tripId: fixture.trip.id,
        }),
        observability,
      };
    } catch (err) {
      await cleanupTripR11Fixture(params.prisma, fixture);
      throw err;
    }
  };

  const off = await runOnce(false);
  const on = await runOnce(true);

  try {
    assertFsmGoldenParity(off.fingerprint, on.fingerprint);
  } catch (err) {
    throw new Error(`${params.label}: ${String(err)}`);
  }

  const obsCount = await waitForTripEndValidationObservations(
    params.prisma,
    on.fixture.vehicle.id,
    minObs,
  );
  expect(obsCount).toBeGreaterThanOrEqual(minObs);

  await cleanupTripR11Fixture(params.prisma, off.fixture);
  await cleanupTripR11Fixture(params.prisma, on.fixture);
  clearTripEndValidationObservabilityTestEnv();
}

function mockEndValidationWindow(
  harness: TripR11OrchestrationHarness,
  stopAt: Date,
): void {
  harness.segments.fetchEndValidationWindow = jest.fn().mockResolvedValue([
    {
      timestamp: stopAt.toISOString(),
      speed: 0,
      isIgnitionOn: false,
      travelledDistance: 1000,
    },
  ]);
}

function buildEndValidationJob(
  fixture: TripR11PostgresFixture,
  det: { possibleEndEnteredAt: Date | null },
  at: Date,
): TripTrackingJobData {
  return {
    vehicleId: fixture.vehicle.id,
    organizationId: fixture.org.id,
    dimoTokenId: fixture.vehicle.dimoTokenId,
    trigger: TRIP_TRACKING_TRIGGERS.END_VALIDATION,
    requestedAt: at.toISOString(),
    endCycleToken: det.possibleEndEnteredAt?.toISOString(),
  };
}

(LIVE ? describe : describe.skip)(
  'trip-end-validation-observability golden FSM parity (Postgres + Redis)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let redisStack: Awaited<ReturnType<typeof startTripR11RedisStack>>;
    let trackingQueue: Queue<TripTrackingJobData>;

    beforeAll(async () => {
      dbOk = await probeTripR11Postgres();
      if (REQUIRED && !dbOk) {
        throw new Error('Golden parity postgres probe failed in required CI mode');
      }
      if (!dbOk) return;
      prisma = new PrismaClient();
      redisStack = await startTripR11RedisStack();
      trackingQueue = new Queue(QUEUE_NAMES.TRIP_TRACKING, {
        connection: redisStack.connectionOptions,
      });
      RuntimeStatusRegistry.setWorkersEnabled(true);
    }, 120_000);

    afterAll(async () => {
      clearTripEndValidationObservabilityTestEnv();
      await trackingQueue?.close().catch(() => undefined);
      await prisma?.$disconnect().catch(() => undefined);
      if (redisStack) await stopTripR11RedisStack(redisStack);
    }, 60_000);

    it('CUSUM_VALIDATED + FINALIZE_COMMITTED — KS661 completion chain', async () => {
      if (!dbOk) return;

      const vlsObservedAt = new Date('2026-09-08T19:59:22.000Z');
      const idleTickAt = new Date('2026-09-08T19:59:56.000Z');
      const emptyCoreTickAt = new Date('2026-09-08T20:02:00.000Z');
      const endCycleAt = new Date('2026-09-08T20:04:30.000Z');

      await runGoldenParityCase({
        prisma,
        queue: trackingQueue,
        label: 'CUSUM_VALIDATED_FINALIZE',
        minObservationsWhenOn: 2,
        createFixture: () => createTripR11Ks661PreIdleFixture(prisma),
        run: async ({ harness, fixture }) => {
          const idleSegments = buildKs661IdleTransitionSegmentsMock(vlsObservedAt);
          const emptySegments = buildKs661EmptyCoreSegmentsMock(fixture.expectedEndTime);
          idleSegments.fetchEndValidationWindow = emptySegments.fetchEndValidationWindow;
          harness.segments.fetchRawTripCoreData = idleSegments.fetchRawTripCoreData;
          harness.segments.fetchRouteEnrichment = idleSegments.fetchRouteEnrichment;
          harness.segments.fetchPerformance = idleSegments.fetchPerformance;
          harness.segments.fetchEndValidationWindow = idleSegments.fetchEndValidationWindow;

          useTripR11FrozenClock(idleTickAt);
          try {
            await harness.runJob(buildActiveTickJob(fixture, idleTickAt));
          } finally {
            restoreTripR11Clock();
          }

          harness.segments.fetchRawTripCoreData = emptySegments.fetchRawTripCoreData;
          harness.segments.fetchPerformance = emptySegments.fetchPerformance;

          useTripR11FrozenClock(emptyCoreTickAt);
          try {
            await harness.runJob(buildActiveTickJob(fixture, emptyCoreTickAt));
          } finally {
            restoreTripR11Clock();
          }

          useTripR11FrozenClock(endCycleAt);
          try {
            await drainTripTrackingQueue({
              queue: trackingQueue,
              runJob: harness.runJob,
            });
          } finally {
            restoreTripR11Clock();
          }

          const trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
          expect(trip?.tripStatus).toBe(TripStatus.COMPLETED);
        },
      });
    }, 180_000);

    it('CUSUM_INCONCLUSIVE_RETRY schedules retry without FSM drift', async () => {
      if (!dbOk) return;
      const evAt = new Date('2026-09-08T06:10:00.000Z');

      await runGoldenParityCase({
        prisma,
        queue: trackingQueue,
        label: 'CUSUM_INCONCLUSIVE_RETRY',
        createFixture: () => createTripR11ActiveTripFixture(prisma),
        run: async ({ harness, fixture }) => {
          mockEndValidationWindow(harness, fixture.stopBoundaryAt);
          const enteredAt = new Date('2026-09-08T06:00:00.000Z');
          await prisma.vehicleTripDetectionState.update({
            where: { vehicleId: fixture.vehicle.id },
            data: {
              state: TripDetectionState.POSSIBLE_END,
              possibleEndAt: fixture.stopBoundaryAt,
              possibleEndEnteredAt: enteredAt,
              endValidationAttempts: 0,
            },
          });

          harness.evaluateEndCandidate.mockReturnValue({
            shouldEnd: false,
            shouldReopen: false,
            detectedEndAt: null,
            confidence: 'LOW',
            endMode: null,
            reason: 'cusum_threshold_not_crossed',
          });

          useTripR11FrozenClock(evAt);
          try {
            const det = await prisma.vehicleTripDetectionState.findUniqueOrThrow({
              where: { vehicleId: fixture.vehicle.id },
            });
            await harness.runJob(buildEndValidationJob(fixture, det, evAt));
          } finally {
            restoreTripR11Clock();
          }

          const after = await prisma.vehicleTripDetectionState.findUnique({
            where: { vehicleId: fixture.vehicle.id },
          });
          expect(after?.state).toBe(TripDetectionState.POSSIBLE_END);
          expect(after?.endValidationAttempts).toBe(1);
        },
      });
    }, 120_000);

    it('CUSUM_STILL_ONGOING_REOPEN returns to ACTIVE_TRIP', async () => {
      if (!dbOk) return;
      const evAt = new Date('2026-09-08T06:12:00.000Z');

      await runGoldenParityCase({
        prisma,
        queue: trackingQueue,
        label: 'CUSUM_STILL_ONGOING_REOPEN',
        createFixture: () => createTripR11ActiveTripFixture(prisma),
        run: async ({ harness, fixture }) => {
          mockEndValidationWindow(harness, fixture.stopBoundaryAt);
          const enteredAt = new Date('2026-09-08T06:00:00.000Z');
          await prisma.vehicleTripDetectionState.update({
            where: { vehicleId: fixture.vehicle.id },
            data: {
              state: TripDetectionState.POSSIBLE_END,
              possibleEndAt: fixture.stopBoundaryAt,
              possibleEndEnteredAt: enteredAt,
              endValidationAttempts: 0,
            },
          });

          harness.evaluateEndCandidate.mockReturnValue({
            shouldEnd: false,
            shouldReopen: true,
            detectedEndAt: null,
            confidence: 'LOW',
            endMode: null,
            reason: 'cusum_still_ongoing',
          });

          useTripR11FrozenClock(evAt);
          try {
            const det = await prisma.vehicleTripDetectionState.findUniqueOrThrow({
              where: { vehicleId: fixture.vehicle.id },
            });
            await harness.runJob(buildEndValidationJob(fixture, det, evAt));
          } finally {
            restoreTripR11Clock();
          }

          const after = await prisma.vehicleTripDetectionState.findUnique({
            where: { vehicleId: fixture.vehicle.id },
          });
          expect(after?.state).toBe(TripDetectionState.ACTIVE_TRIP);
        },
      });
    }, 120_000);

    it('CLICKHOUSE_END_ASSIST_DEFERRED preserves POSSIBLE_END episode', async () => {
      if (!dbOk) return;
      const segmentEnd = new Date('2026-09-08T06:05:00.000Z');
      const evAt = new Date('2026-09-08T06:10:00.000Z');

      await runGoldenParityCase({
        prisma,
        queue: trackingQueue,
        label: 'CLICKHOUSE_END_ASSIST_DEFERRED',
        createFixture: () => createTripR11ActiveTripFixture(prisma),
        run: async ({ harness, fixture }) => {
          mockEndValidationWindow(harness, fixture.stopBoundaryAt);
          const enteredAt = new Date('2026-09-08T06:00:00.000Z');
          await prisma.vehicleTripDetectionState.update({
            where: { vehicleId: fixture.vehicle.id },
            data: {
              state: TripDetectionState.POSSIBLE_END,
              possibleEndAt: fixture.stopBoundaryAt,
              possibleEndEnteredAt: enteredAt,
              endDetectionMode: END_DETECTION_MODES.CLICKHOUSE_END_ASSIST,
              cusumSegmentEnd: segmentEnd,
              endValidationAttempts: 0,
            },
          });

          (harness.orchestration as Record<string, unknown>).evaluateClickHouseSkipResumeRevalidation =
            jest.fn().mockResolvedValue({
              outcome: 'FETCH_UNCERTAIN',
              deferCount: 1,
              relatchEnteredAt: enteredAt,
              immaturityBoundMs: 90_000,
              fetchUncertain: true,
            });

          useTripR11FrozenClock(evAt);
          try {
            const det = await prisma.vehicleTripDetectionState.findUniqueOrThrow({
              where: { vehicleId: fixture.vehicle.id },
            });
            await harness.runJob(buildEndValidationJob(fixture, det, evAt));
          } finally {
            restoreTripR11Clock();
          }

          const after = await prisma.vehicleTripDetectionState.findUnique({
            where: { vehicleId: fixture.vehicle.id },
          });
          expect(after?.state).toBe(TripDetectionState.POSSIBLE_END);
        },
      });
    }, 120_000);

    it('CLICKHOUSE_END_ASSIST_CONFIRMED schedules finalize', async () => {
      if (!dbOk) return;
      const segmentEnd = new Date('2026-09-08T06:05:00.000Z');
      const evAt = new Date('2026-09-08T06:10:00.000Z');

      await runGoldenParityCase({
        prisma,
        queue: trackingQueue,
        label: 'CLICKHOUSE_END_ASSIST_CONFIRMED',
        createFixture: () => createTripR11ActiveTripFixture(prisma),
        run: async ({ harness, fixture }) => {
          mockEndValidationWindow(harness, fixture.stopBoundaryAt);
          const enteredAt = new Date('2026-09-08T06:00:00.000Z');
          await prisma.vehicleTripDetectionState.update({
            where: { vehicleId: fixture.vehicle.id },
            data: {
              state: TripDetectionState.POSSIBLE_END,
              possibleEndAt: fixture.stopBoundaryAt,
              possibleEndEnteredAt: enteredAt,
              endDetectionMode: END_DETECTION_MODES.CLICKHOUSE_END_ASSIST,
              cusumSegmentEnd: segmentEnd,
              endValidationAttempts: 0,
            },
          });

          (harness.orchestration as Record<string, unknown>).evaluateClickHouseSkipResumeRevalidation =
            jest.fn().mockResolvedValue({
              outcome: 'NO_RESUME_EVIDENCE_MATURE',
              deferCount: 0,
              relatchEnteredAt: enteredAt,
              immaturityBoundMs: 90_000,
              fetchUncertain: false,
            });

          useTripR11FrozenClock(evAt);
          try {
            const det = await prisma.vehicleTripDetectionState.findUniqueOrThrow({
              where: { vehicleId: fixture.vehicle.id },
            });
            await harness.runJob(buildEndValidationJob(fixture, det, evAt));
            await drainTripTrackingQueue({
              queue: trackingQueue,
              runJob: harness.runJob,
              maxSteps: 4,
            });
          } finally {
            restoreTripR11Clock();
          }

          const detAfter = await prisma.vehicleTripDetectionState.findUnique({
            where: { vehicleId: fixture.vehicle.id },
          });
          expect(detAfter?.state).toBe(TripDetectionState.RESTING);
        },
      });
    }, 120_000);

    it('COMPOSITE_MAX_ATTEMPT_FALLBACK — full retry-budget terminal chain', async () => {
      if (!dbOk) return;

      await runGoldenParityCase({
        prisma,
        queue: trackingQueue,
        label: 'COMPOSITE_MAX_ATTEMPT_FALLBACK',
        minObservationsWhenOn: 4,
        createFixture: () => createCompositeGoldenFixture(prisma),
        buildHarness: ({ prisma: p, queue, fixture, observability }) => {
          const stopMock = buildCompositeStopCoreMock();
          return buildTripR11OrchestrationHarness(
            p,
            queue,
            fixture,
            stopMock,
            buildCompositeCusumOngoingDetectorMock(),
            { endValidationObservability: observability },
          );
        },
        run: async ({ harness, fixture }) => {
          const realEvaluateEndCandidate =
            TripDecisionEngine.prototype.evaluateEndCandidate.bind(harness.decisionEngine);
          harness.evaluateEndCandidate.mockImplementation(realEvaluateEndCandidate);
          await runCompositeMaxAttemptFallbackChain({
            prisma,
            queue: trackingQueue,
            harness,
            fixture,
          });
        },
      });
    }, 300_000);

    it('FSM_HARD_TIMEOUT_FALLBACK when resume fetch fails past timeout', async () => {
      if (!dbOk) return;
      const pecAt = new Date('2026-09-08T08:00:00.000Z');
      const enteredAt = new Date('2026-09-08T07:00:00.000Z');

      await runGoldenParityCase({
        prisma,
        queue: trackingQueue,
        label: 'FSM_HARD_TIMEOUT_FALLBACK',
        createFixture: () => createTripR11ActiveTripFixture(prisma),
        run: async ({ harness, fixture }) => {
          await prisma.vehicleTripDetectionState.update({
            where: { vehicleId: fixture.vehicle.id },
            data: {
              state: TripDetectionState.POSSIBLE_END,
              possibleEndAt: fixture.stopBoundaryAt,
              possibleEndEnteredAt: enteredAt,
              endValidationAttempts: 0,
              lastEvidenceSummary: {
                stopBoundaryAt: fixture.stopBoundaryAt.toISOString(),
              },
            },
          });

          harness.segments.fetchRawTripCoreData = jest
            .fn()
            .mockRejectedValue(new Error('simulated_fetch_error'));

          useTripR11FrozenClock(pecAt);
          try {
            await harness.runJob({
              vehicleId: fixture.vehicle.id,
              organizationId: fixture.org.id,
              dimoTokenId: fixture.vehicle.dimoTokenId,
              trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK,
              requestedAt: pecAt.toISOString(),
              endCycleToken: enteredAt.toISOString(),
            });
          } finally {
            restoreTripR11Clock();
          }

          const det = await prisma.vehicleTripDetectionState.findUnique({
            where: { vehicleId: fixture.vehicle.id },
          });
          expect(det?.state).toBe(TripDetectionState.POSSIBLE_END);
          const queued = await trackingQueue.getJobs(
            ['delayed', 'waiting', 'active', 'prioritized'],
            0,
            30,
          );
          expect(
            queued.some((j) => j.data.trigger === TRIP_TRACKING_TRIGGERS.FINALIZE),
          ).toBe(true);
        },
      });
    }, 120_000);

    it('writer failure + delayed observability write does not alter FSM commit', async () => {
      if (!dbOk) return;

      const vlsObservedAt = new Date('2026-09-08T19:59:22.000Z');
      const idleTickAt = new Date('2026-09-08T19:59:56.000Z');
      const emptyCoreTickAt = new Date('2026-09-08T20:02:00.000Z');
      const endCycleAt = new Date('2026-09-08T20:04:30.000Z');

      const runOnce = async (obsEnabled: boolean, writerMode: 'ok' | 'fail') => {
        await trackingQueue.obliterate({ force: true });
        const fixture = await createTripR11Ks661PreIdleFixture(prisma);
        clearTripEndValidationObservabilityTestEnv();
        setTripEndValidationObservabilityTestEnv(fixture.vehicle.id, obsEnabled);

        let observability: TripEndValidationObservabilityService | undefined;
        if (obsEnabled) {
          await seedCompletedTdlObsRetentionPurgeRun(prisma, true);
          observability = buildTripEndValidationObservabilityService(prisma);
          if (writerMode === 'fail') {
            const realRecord = observability.record.bind(observability);
            jest.spyOn(observability, 'record').mockImplementation(async (input) => {
              await new Promise((r) => setTimeout(r, 50));
              if (input.processPhase === 'FINALIZE') {
                throw new Error('simulated_observability_writer_failure');
              }
              return realRecord(input);
            });
          }
        }

        const idleSegments = buildKs661IdleTransitionSegmentsMock(vlsObservedAt);
        const emptySegments = buildKs661EmptyCoreSegmentsMock(fixture.expectedEndTime);
        idleSegments.fetchEndValidationWindow = emptySegments.fetchEndValidationWindow;
        const harness = buildTripR11OrchestrationHarness(
          prisma,
          trackingQueue,
          fixture,
          idleSegments,
          buildTripR11DetectorMock(fixture.expectedEndTime),
          { endValidationObservability: observability },
        );

        try {
          useTripR11FrozenClock(idleTickAt);
          await harness.runJob(buildActiveTickJob(fixture, idleTickAt));
          restoreTripR11Clock();

          harness.segments.fetchRawTripCoreData = emptySegments.fetchRawTripCoreData;
          harness.segments.fetchPerformance = emptySegments.fetchPerformance;

          useTripR11FrozenClock(emptyCoreTickAt);
          await harness.runJob(buildActiveTickJob(fixture, emptyCoreTickAt));
          restoreTripR11Clock();

          useTripR11FrozenClock(endCycleAt);
          await drainTripTrackingQueue({ queue: trackingQueue, runJob: harness.runJob });
          restoreTripR11Clock();

          const fingerprint = await captureFsmGoldenFingerprint({
            prisma,
            queue: trackingQueue,
            vehicleId: fixture.vehicle.id,
            tripId: fixture.trip.id,
          });
          return { fixture, fingerprint };
        } catch (err) {
          await cleanupTripR11Fixture(prisma, fixture);
          throw err;
        }
      };

      const off = await runOnce(false, 'ok');
      const on = await runOnce(true, 'fail');
      try {
        assertFsmGoldenParity(off.fingerprint, on.fingerprint);
        const trip = await prisma.vehicleTrip.findUnique({ where: { id: on.fixture.trip.id } });
        expect(trip?.tripStatus).toBe(TripStatus.COMPLETED);
      } finally {
        await cleanupTripR11Fixture(prisma, off.fixture);
        await cleanupTripR11Fixture(prisma, on.fixture);
        clearTripEndValidationObservabilityTestEnv();
      }
    }, 180_000);
  },
);
