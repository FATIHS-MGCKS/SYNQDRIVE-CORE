/**
 * Portable BASE vs HEAD behavioral probe for PEC/EV lock-order regression.
 * Copied into isolated git worktrees by trip-r12-pec-ev-base-head-red-proof.sh.
 *
 * Uses only harness APIs present on BASE 24c2632… and HEAD.
 * Writes structured metrics to TRIP_R12_PROBE_METRICS_FILE (required in CI).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { PrismaClient, TripDetectionState, TripStatus } from '@prisma/client';
import { DelayedError, Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { QUEUE_NAMES } from '@workers/queues/queue-names';

import { TripDetectionOrchestrationService } from './trip-detection-orchestration.service';
import {
  TRIP_TRACKING_TRIGGERS,
  type TripTrackingJobData,
} from './trip-detection.types';
import {
  buildActiveTickJob,
  buildTripR11DetectorMock,
  buildTripR11OrchestrationHarness,
  buildTripR11SegmentsMock,
  buildTripTrackingJobId,
  cleanupTripR11Fixture,
  closeTripTrackingWorkers,
  createTripR11ActiveTripFixture,
  probeTripR11Postgres,
  restoreTripR11Clock,
  startTripR11RedisStack,
  stopTripR11RedisStack,
  useTripR11FrozenClock,
  type TripR11OrchestrationHarness,
  type TripR11PostgresFixture,
} from './testing/trip-r11-postgres-redis.integration.harness';
import { buildTripTrackingJobOptions } from './trip-tracking-queue.util';

const LIVE = process.env.TRIP_R12_POSTGRES_REDIS_INTEGRATION === '1';
const REQUIRED = process.env.TRIP_R12_POSTGRES_REDIS_REQUIRED === '1';
const METRICS_FILE = process.env.TRIP_R12_PROBE_METRICS_FILE ?? '';

function readProbeExpect(): 'BASE' | 'HEAD' {
  return (process.env.TRIP_R12_PROBE_EXPECT ?? 'HEAD').toUpperCase() === 'BASE'
    ? 'BASE'
    : 'HEAD';
}

type ProbeMetrics = {
  PROBE_EXECUTED: boolean;
  PROBE_INFRASTRUCTURE_ERROR: boolean;
  INFRA_ERROR_DETAIL: string | null;
  PROBE_EXPECT: string;
  SCHEDULE_WHILE_PEC_LOCK_HELD: boolean | null;
  EV_PROCESSOR_ENTRY: boolean | null;
  EV_LOCK_MISS: boolean | null;
  EV_LOCK_ACQUIRED: boolean | null;
  EV_TRACKING_RUN_COUNT: number | null;
  FINALIZE_PROCESSOR_ENTRY: boolean | null;
  FINALIZE_REACHED: boolean | null;
  TRIP_COMPLETED: boolean | null;
  RESTING: boolean | null;
  TERMINAL_STATE: 'TERMINAL' | 'NONTERMINAL' | null;
};

function emptyMetrics(probeExpect: 'BASE' | 'HEAD'): ProbeMetrics {
  return {
    PROBE_EXECUTED: false,
    PROBE_INFRASTRUCTURE_ERROR: false,
    INFRA_ERROR_DETAIL: null,
    PROBE_EXPECT: probeExpect,
    SCHEDULE_WHILE_PEC_LOCK_HELD: null,
    EV_PROCESSOR_ENTRY: null,
    EV_LOCK_MISS: null,
    EV_LOCK_ACQUIRED: null,
    EV_TRACKING_RUN_COUNT: null,
    FINALIZE_PROCESSOR_ENTRY: null,
    FINALIZE_REACHED: null,
    TRIP_COMPLETED: null,
    RESTING: null,
    TERMINAL_STATE: null,
  };
}

function writeMetricsFile(metrics: ProbeMetrics): void {
  if (!METRICS_FILE) {
    process.stdout.write(`TRIP_R12_PROBE_METRICS_JSON=${JSON.stringify(metrics)}\n`);
    return;
  }
  fs.mkdirSync(path.dirname(METRICS_FILE), { recursive: true });
  fs.writeFileSync(METRICS_FILE, `${JSON.stringify(metrics)}\n`, 'utf8');
}

async function probeWaitForCondition(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms`);
}

async function probePurgeQueueJobs(queue: Queue<TripTrackingJobData>): Promise<number> {
  const states = ['waiting', 'delayed', 'active', 'prioritized', 'paused'] as const;
  let removed = 0;
  for (const state of states) {
    const jobs = await queue.getJobs([state], 0, 100);
    for (const job of jobs) {
      await job.remove().catch(() => undefined);
      removed += 1;
    }
  }
  return removed;
}

function createProbeWorkers(params: {
  connection: ConnectionOptions;
  processor: (job: Job<TripTrackingJobData>) => Promise<void>;
  workerCount?: number;
  concurrency?: number;
}): Worker[] {
  const workers: Worker[] = [];
  const count = params.workerCount ?? 2;
  for (let i = 0; i < count; i += 1) {
    workers.push(
      new Worker<TripTrackingJobData>(
        QUEUE_NAMES.TRIP_TRACKING,
        async (job: Job<TripTrackingJobData>) => params.processor(job),
        {
          connection: params.connection,
          concurrency: params.concurrency ?? 1,
        },
      ),
    );
  }
  return workers;
}

function refreshOrchestrationProtoBindings(
  orchestration: TripR11OrchestrationHarness['orchestration'],
): void {
  const o = orchestration as Record<string, unknown>;
  o.acquireWorkerLock = TripDetectionOrchestrationService.prototype.acquireWorkerLock;
  o.releaseWorkerLock = TripDetectionOrchestrationService.prototype.releaseWorkerLock;
  o.scheduleEndValidation = TripDetectionOrchestrationService.prototype.scheduleEndValidation;
  o.scheduleFinalize = TripDetectionOrchestrationService.prototype.scheduleFinalize;
}

function buildPossibleEndCheckJob(
  fixture: TripR11PostgresFixture,
  requestedAt: Date,
): TripTrackingJobData {
  return {
    vehicleId: fixture.vehicle.id,
    organizationId: fixture.org.id,
    dimoTokenId: fixture.vehicle.dimoTokenId,
    trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK,
    requestedAt: requestedAt.toISOString(),
  };
}

async function runJobLikeTripTrackingProcessor(
  harness: TripR11OrchestrationHarness,
  bullJob: Job<TripTrackingJobData>,
): Promise<void> {
  try {
    await harness.runJob(bullJob.data);
  } catch (err: unknown) {
    const contentionModule = await import('./trip-tracking-lock-contention').catch(() => null);
    const ContentionError = contentionModule?.TripTrackingHandoffLockContentionError;
    if (ContentionError && err instanceof ContentionError) {
      const token = bullJob.token;
      if (!token) throw err;
      await bullJob.moveToDelayed(Date.now() + err.delayMs, token);
      throw new DelayedError(err.message);
    }
    throw err;
  }
}

async function waitForNaturalTerminal(params: {
  prisma: PrismaClient;
  fixture: TripR11PostgresFixture;
  timeoutMs: number;
}): Promise<boolean> {
  const deadline = Date.now() + params.timeoutMs;
  while (Date.now() < deadline) {
    const trip = await params.prisma.vehicleTrip.findUnique({
      where: { id: params.fixture.trip.id },
    });
    const det = await params.prisma.vehicleTripDetectionState.findUnique({
      where: { vehicleId: params.fixture.vehicle.id },
    });
    if (
      trip?.tripStatus === TripStatus.COMPLETED &&
      det?.state === TripDetectionState.RESTING &&
      det.activeTripId === null
    ) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

(LIVE ? describe : describe.skip)(
  'TDL-PROBE-R12 — portable BASE/HEAD PEC→EV lock-order behavioral probe',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let redisStack: Awaited<ReturnType<typeof startTripR11RedisStack>>;
    let trackingQueue: Queue<TripTrackingJobData>;
    let fixture: TripR11PostgresFixture | undefined;
    let metrics = emptyMetrics(readProbeExpect());

    beforeAll(async () => {
      const probeExpect = readProbeExpect();
      metrics = emptyMetrics(probeExpect);
      if (REQUIRED && !METRICS_FILE) {
        metrics.PROBE_INFRASTRUCTURE_ERROR = true;
        metrics.INFRA_ERROR_DETAIL = 'TRIP_R12_PROBE_METRICS_FILE is required';
        writeMetricsFile(metrics);
        throw new Error(metrics.INFRA_ERROR_DETAIL);
      }
      try {
        dbOk = await probeTripR11Postgres();
        if (REQUIRED && !dbOk) {
          throw new Error('Trip R12 postgres probe failed in required CI mode');
        }
        if (!dbOk) return;
        prisma = new PrismaClient();
        redisStack = await startTripR11RedisStack();
        trackingQueue = new Queue(QUEUE_NAMES.TRIP_TRACKING, {
          connection: redisStack.connectionOptions,
        });
        RuntimeStatusRegistry.setWorkersEnabled(true);
      } catch (err) {
        metrics.PROBE_INFRASTRUCTURE_ERROR = true;
        metrics.INFRA_ERROR_DETAIL = err instanceof Error ? err.message : String(err);
        writeMetricsFile(metrics);
        throw err;
      }
    }, 120_000);

    afterAll(async () => {
      writeMetricsFile(metrics);
      await trackingQueue?.close().catch(() => undefined);
      await prisma?.$disconnect().catch(() => undefined);
      if (redisStack) await stopTripR11RedisStack(redisStack);
    }, 60_000);

    it('captures causal PEC→EV observations for BASE/HEAD comparison', async () => {
      if (metrics.PROBE_INFRASTRUCTURE_ERROR || !dbOk) return;

      const probeExpect = readProbeExpect();
      let scheduleWhilePecLockHeld = false;
      let evProcessorEntry = false;
      let evLockMiss = false;
      let finalizeProcessorEntry = false;

      try {
        await trackingQueue.obliterate({ force: true });
        fixture = await createTripR11ActiveTripFixture(prisma, {
          stopBoundarySource: 'provider_stationary_vls',
        });

        const segments = buildTripR11SegmentsMock(fixture.expectedEndTime);
        const detectorRegistry = buildTripR11DetectorMock(fixture.expectedEndTime);
        const harness = buildTripR11OrchestrationHarness(
          prisma,
          trackingQueue,
          fixture,
          segments,
          detectorRegistry,
        );

        const emptyCoreTickAt = new Date('2026-09-08T05:02:30.000Z');
        useTripR11FrozenClock(emptyCoreTickAt);
        try {
          await harness.runJob(buildActiveTickJob(fixture, emptyCoreTickAt));
        } finally {
          restoreTripR11Clock();
        }
        await probePurgeQueueJobs(trackingQueue);

        const pecNow = new Date('2026-09-08T05:04:30.000Z');
        useTripR11FrozenClock(pecNow);

        let processingTrigger: TripTrackingJobData['trigger'] | null = null;

        const scheduleProto = TripDetectionOrchestrationService.prototype.scheduleEndValidation;
        const acquireProto = TripDetectionOrchestrationService.prototype.acquireWorkerLock;

        jest
          .spyOn(TripDetectionOrchestrationService.prototype, 'acquireWorkerLock')
          .mockImplementation(async function (
            this: TripDetectionOrchestrationService,
            vehicleId: string,
            ttlMs?: number,
          ) {
            const stack = new Error().stack ?? '';
            const fromEv =
              processingTrigger === TRIP_TRACKING_TRIGGERS.END_VALIDATION ||
              stack.includes('processEndValidation');
            const fromFinalize = stack.includes('processFinalize');
            const result = await acquireProto.call(this, vehicleId, ttlMs);
            if (fromEv && !result.acquired) {
              evLockMiss = true;
            }
            if (fromFinalize && result.acquired) {
              finalizeProcessorEntry = true;
            }
            return result;
          });

        jest
          .spyOn(TripDetectionOrchestrationService.prototype, 'scheduleEndValidation')
          .mockImplementation(async function (
            this: TripDetectionOrchestrationService,
            vehicleId: string,
            organizationId: string | null,
            dimoTokenId: number,
            delayMs?: number,
          ) {
            if (probeExpect === 'BASE') {
              // Historical BASE ordering: inline schedule before PEC finally releases lock.
              scheduleWhilePecLockHeld = true;
              await scheduleProto.call(this, vehicleId, organizationId, dimoTokenId, delayMs);
              await probeWaitForCondition(
                async () => evProcessorEntry,
                15_000,
                'BASE EV processor entry while PEC scheduleEndValidation held open',
              );
              await probeWaitForCondition(
                async () => evLockMiss,
                15_000,
                'BASE EV lock miss while PEC worker lock held',
              );
              return;
            }

            await scheduleProto.call(this, vehicleId, organizationId, dimoTokenId, delayMs);
          });

        refreshOrchestrationProtoBindings(harness.orchestration);

        const pecJobId = buildTripTrackingJobId('pec', fixture.vehicle.id, fixture.trip.id);
        const workers = createProbeWorkers({
          connection: redisStack.connectionOptions,
          processor: async (bullJob) => {
            processingTrigger = bullJob.data.trigger;
            try {
              if (bullJob.data.trigger === TRIP_TRACKING_TRIGGERS.END_VALIDATION) {
                evProcessorEntry = true;
              }
              if (bullJob.data.trigger === TRIP_TRACKING_TRIGGERS.FINALIZE) {
                finalizeProcessorEntry = true;
              }
              await runJobLikeTripTrackingProcessor(harness, bullJob);
            } finally {
              processingTrigger = null;
            }
          },
          workerCount: 2,
          concurrency: 1,
        });

        try {
          await trackingQueue.add(
            'trip-tracking',
            buildPossibleEndCheckJob(fixture, pecNow),
            {
              jobId: pecJobId,
              ...buildTripTrackingJobOptions(TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK),
            },
          );

          await probeWaitForCondition(async () => {
            const pecRuns = await prisma.vehicleTripTrackingRun.count({
              where: {
                tripId: fixture!.trip.id,
                runType: 'POSSIBLE_END_CHECK',
                resultSummary: { path: ['reason'], equals: 'triggering_cusum_validation' },
              },
            });
            return pecRuns >= 1;
          }, 30_000, 'PEC triggering_cusum_validation');

          if (probeExpect === 'HEAD') {
            restoreTripR11Clock();
            await probeWaitForCondition(async () => {
              const evRuns = await prisma.vehicleTripTrackingRun.count({
                where: {
                  tripId: fixture!.trip.id,
                  runType: 'END_VALIDATION',
                },
              });
              return evRuns >= 1;
            }, 60_000, 'HEAD END_VALIDATION tracking run before terminal');
            await waitForNaturalTerminal({
              prisma,
              fixture,
              timeoutMs: 60_000,
            });
          } else {
            await probePurgeQueueJobs(trackingQueue);
            restoreTripR11Clock();
          }
        } finally {
          jest.restoreAllMocks();
          await closeTripTrackingWorkers(workers);
          restoreTripR11Clock();
        }

        const evRuns = await prisma.vehicleTripTrackingRun.count({
          where: { tripId: fixture.trip.id, runType: 'END_VALIDATION' },
        });
        const finRuns = await prisma.vehicleTripTrackingRun.count({
          where: { tripId: fixture.trip.id, runType: 'FINALIZATION_CHECK' },
        });
        const trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
        const det = await prisma.vehicleTripDetectionState.findUnique({
          where: { vehicleId: fixture.vehicle.id },
        });

        const terminal =
          trip?.tripStatus === TripStatus.COMPLETED &&
          det?.state === TripDetectionState.RESTING &&
          det.activeTripId === null;

        metrics = {
          PROBE_EXECUTED: true,
          PROBE_INFRASTRUCTURE_ERROR: false,
          INFRA_ERROR_DETAIL: null,
          PROBE_EXPECT: probeExpect,
          SCHEDULE_WHILE_PEC_LOCK_HELD: scheduleWhilePecLockHeld,
          EV_PROCESSOR_ENTRY: evProcessorEntry,
          EV_LOCK_MISS: evLockMiss,
          EV_LOCK_ACQUIRED: evProcessorEntry && !evLockMiss,
          EV_TRACKING_RUN_COUNT: evRuns,
          FINALIZE_PROCESSOR_ENTRY: finalizeProcessorEntry,
          FINALIZE_REACHED: finalizeProcessorEntry || finRuns >= 1,
          TRIP_COMPLETED: trip?.tripStatus === TripStatus.COMPLETED,
          RESTING: det?.state === TripDetectionState.RESTING,
          TERMINAL_STATE: terminal ? 'TERMINAL' : 'NONTERMINAL',
        };
      } catch (err) {
        metrics.PROBE_INFRASTRUCTURE_ERROR = true;
        metrics.INFRA_ERROR_DETAIL = err instanceof Error ? err.message : String(err);
        throw err;
      } finally {
        writeMetricsFile(metrics);
        if (fixture) await cleanupTripR11Fixture(prisma, fixture);
      }

      expect(metrics.PROBE_EXECUTED).toBe(true);
    }, 180_000);
  },
);
