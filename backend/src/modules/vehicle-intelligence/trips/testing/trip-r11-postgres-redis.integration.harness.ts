import IORedis from 'ioredis';
import { Job, Queue, Worker, type ConnectionOptions } from 'bullmq';
import RedisMemoryServer from 'redis-memory-server';
import {
  DetectionConfidence,
  PrismaClient,
  TripDetectionState,
  TripStatus,
  VehicleDetectionProfile,
} from '@prisma/client';

import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { QUEUE_NAMES } from '@workers/queues/queue-names';

import { TripDecisionEngine } from '../decision/trip-decision.engine';
import { ContinuityAssessmentDetector } from '../detectors/continuity-assessment.detector';
import { TripDetectionOrchestrationService } from '../trip-detection-orchestration.service';
import {
  END_DETECTION_MODES,
  TRIP_TRACKING_TRIGGERS,
  type TripTrackingJobData,
} from '../trip-detection.types';
import { runTripObservabilitySafely } from '../trip-fsm-observability-safe.util';

export type TripR11PostgresFixture = {
  suffix: string;
  org: { id: string };
  vehicle: { id: string; organizationId: string; dimoTokenId: number };
  trip: { id: string; startTime: Date };
  lastMovementAt: Date;
  stopBoundaryAt: Date;
  expectedEndTime: Date;
  /** Set when fixture intentionally omits pre-seeded stop boundary (KS661 entry path). */
  stopBoundaryPreseeded?: boolean;
};

export type TripR11SegmentsMock = {
  fetchRawTripCoreData: jest.Mock;
  fetchRouteEnrichment: jest.Mock;
  fetchPerformance: jest.Mock;
  fetchEndValidationWindow: jest.Mock;
};

export type TripR11DetectorMock = {
  runAll: jest.Mock;
};

export type TripR11OrchestrationHarness = {
  prisma: PrismaClient;
  decisionEngine: TripDecisionEngine;
  trackingQueue: Queue<TripTrackingJobData>;
  segments: TripR11SegmentsMock;
  detectorRegistry: TripR11DetectorMock;
  evaluateEndCandidate: jest.Mock;
  orchestration: Record<string, unknown>;
  runJob: (job: TripTrackingJobData) => Promise<void>;
};

export type TripR11RedisStack = {
  memoryServer: RedisMemoryServer;
  connection: IORedis;
  connectionOptions: ConnectionOptions;
};

/** Monotonic ms for harness waits — safe while jest fake Date is frozen. */
export function harnessMonotonicNowMs(): number {
  return performance.now();
}

export function waitHarnessDeadlineMs(timeoutMs: number): number {
  return harnessMonotonicNowMs() + timeoutMs;
}

export function isBeforeHarnessDeadline(deadlineMs: number): boolean {
  return harnessMonotonicNowMs() < deadlineMs;
}

/** Fake Date for orchestration while leaving BullMQ/ioredis timers real. */
export function useTripR11FrozenClock(now: Date): void {
  jest.useFakeTimers({
    now,
    doNotFake: [
      'setTimeout',
      'setInterval',
      'nextTick',
      'setImmediate',
      'requestAnimationFrame',
      'queueMicrotask',
      'hrtime',
      'performance',
    ],
  });
}

export function restoreTripR11Clock(): void {
  jest.useRealTimers();
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function probeTripR11Postgres(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

export async function startTripR11RedisStack(): Promise<TripR11RedisStack> {
  const memoryServer = new RedisMemoryServer();
  await memoryServer.start();
  const host = await memoryServer.getHost();
  const port = await memoryServer.getPort();
  const connection = new IORedis({ host, port, maxRetriesPerRequest: null });
  await connection.ping();
  return {
    memoryServer,
    connection,
    connectionOptions: { host, port, maxRetriesPerRequest: null },
  };
}

export async function stopTripR11RedisStack(stack: TripR11RedisStack): Promise<void> {
  await stack.connection.quit().catch(() => undefined);
  await stack.memoryServer.stop().catch(() => undefined);
}

export async function createTripR11ActiveTripFixture(
  prisma: PrismaClient,
  options?: {
    lastMovementAt?: Date;
    stopBoundaryAt?: Date;
    stopBoundarySource?: string;
    expectedEndTime?: Date;
    tripStartAt?: Date;
  },
): Promise<TripR11PostgresFixture> {
  const suffix = uniqueSuffix();
  const tripStartAt = options?.tripStartAt ?? new Date('2026-09-08T04:33:00.000Z');
  const lastMovementAt =
    options?.lastMovementAt ?? new Date('2026-09-08T05:00:00.000Z');
  const stopBoundaryAt =
    options?.stopBoundaryAt ?? new Date('2026-09-08T05:00:05.000Z');
  const expectedEndTime =
    options?.expectedEndTime ?? new Date('2026-09-08T05:00:45.000Z');
  const stopBoundarySource = options?.stopBoundarySource ?? 'idle_within_trip';
  const dimoTokenId = 910000 + Math.floor(Math.random() * 1000);

  const org = await prisma.organization.create({
    data: {
      companyName: `Trip R11 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `R11-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'R11',
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
      startTime: tripStartAt,
      startLatitude: 51.2,
      startLongitude: 9.3,
      distanceKm: 8.4,
      rawDetectionMeta: {},
    },
    select: { id: true, startTime: true },
  });

  await prisma.vehicleTripDetectionState.create({
    data: {
      vehicleId: vehicle.id,
      organizationId: org.id,
      state: TripDetectionState.ACTIVE_TRIP,
      detectionProfile: VehicleDetectionProfile.ICE,
      activeTripId: trip.id,
      possibleStartAt: tripStartAt,
      lastMeaningfulMovementAt: lastMovementAt,
      lastActivityAt: lastMovementAt,
      lastCoreProcessedAt: lastMovementAt,
      lastRouteProcessedAt: lastMovementAt,
      lastDrivingProcessedAt: lastMovementAt,
      lastEvidenceSummary: {
        lastProviderActivityAt: lastMovementAt.toISOString(),
        stopBoundaryAt: stopBoundaryAt.toISOString(),
        stopBoundarySource,
        stopBoundaryTrust: true,
      },
    },
  });

  await prisma.vehicleLatestState.create({
    data: {
      vehicleId: vehicle.id,
      dimoTokenId,
      isIgnitionOn: false,
      speedKmh: 0,
      engineLoad: 0,
      sourceTimestamp: stopBoundaryAt,
      updatedAt: stopBoundaryAt,
    },
  });

  return {
    suffix,
    org,
    vehicle: { id: vehicle.id, organizationId: vehicle.organizationId, dimoTokenId },
    trip,
    lastMovementAt,
    stopBoundaryAt,
    expectedEndTime,
    stopBoundaryPreseeded: true,
  };
}

/** KS MS 661–shaped entry: ACTIVE_TRIP without pre-seeded stopBoundaryAt. */
export async function createTripR11Ks661PreIdleFixture(
  prisma: PrismaClient,
): Promise<TripR11PostgresFixture> {
  const suffix = uniqueSuffix();
  const tripStartAt = new Date('2026-09-08T19:36:00.000Z');
  const lastMovementAt = new Date('2026-09-08T19:58:45.114Z');
  const vlsObservedAt = new Date('2026-09-08T19:59:22.000Z');
  const expectedEndTime = vlsObservedAt;
  const dimoTokenId = 910000 + Math.floor(Math.random() * 1000);

  const org = await prisma.organization.create({
    data: {
      companyName: `Trip R11 KS661 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `K661-${suffix}`.slice(0, 12),
      make: 'Audi',
      model: 'KS661',
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
      startTime: tripStartAt,
      startLatitude: 51.2,
      startLongitude: 9.3,
      distanceKm: 8.4,
      rawDetectionMeta: {},
    },
    select: { id: true, startTime: true },
  });

  await prisma.vehicleTripDetectionState.create({
    data: {
      vehicleId: vehicle.id,
      organizationId: org.id,
      state: TripDetectionState.ACTIVE_TRIP,
      detectionProfile: VehicleDetectionProfile.ICE,
      activeTripId: trip.id,
      possibleStartAt: tripStartAt,
      lastMeaningfulMovementAt: lastMovementAt,
      lastActivityAt: lastMovementAt,
      lastCoreProcessedAt: lastMovementAt,
      lastRouteProcessedAt: lastMovementAt,
      lastDrivingProcessedAt: lastMovementAt,
      lastEvidenceSummary: {
        lastProviderActivityAt: lastMovementAt.toISOString(),
      },
    },
  });

  await prisma.vehicleLatestState.create({
    data: {
      vehicleId: vehicle.id,
      dimoTokenId,
      isIgnitionOn: false,
      speedKmh: 0,
      engineLoad: 42.74509803921568,
      sourceTimestamp: vlsObservedAt,
      updatedAt: vlsObservedAt,
    },
  });

  return {
    suffix,
    org,
    vehicle: { id: vehicle.id, organizationId: vehicle.organizationId, dimoTokenId },
    trip,
    lastMovementAt,
    stopBoundaryAt: vlsObservedAt,
    expectedEndTime,
    stopBoundaryPreseeded: false,
  };
}

export function buildKs661IdleTransitionSegmentsMock(
  vlsObservedAt: Date,
): TripR11SegmentsMock {
  const coreTs = vlsObservedAt.toISOString();
  return {
    fetchRawTripCoreData: jest.fn().mockResolvedValue([
      {
        timestamp: coreTs,
        speed: 0,
        travelledDistance: 1000,
        isIgnitionOn: false,
        fuelAbsoluteLevel: null,
        batteryEnergy: null,
      },
      {
        timestamp: coreTs,
        speed: 0,
        travelledDistance: 1000,
        isIgnitionOn: false,
        fuelAbsoluteLevel: null,
        batteryEnergy: null,
      },
    ]),
    fetchRouteEnrichment: jest.fn().mockResolvedValue([]),
    fetchPerformance: jest.fn().mockResolvedValue([
      {
        timestamp: coreTs,
        rpm: 800,
        throttlePosition: 12,
        engineLoad: 42.745,
      },
    ]),
    fetchEndValidationWindow: jest.fn().mockResolvedValue([
      {
        timestamp: coreTs,
        speed: 0,
        isIgnitionOn: false,
        travelledDistance: 1000,
        fuelAbsoluteLevel: null,
        batteryEnergy: null,
      },
    ]),
  };
}

export function buildKs661EmptyCoreSegmentsMock(
  expectedEndTime: Date,
): TripR11SegmentsMock {
  const base = buildTripR11SegmentsMock(expectedEndTime);
  base.fetchRawTripCoreData = jest.fn().mockResolvedValue([]);
  base.fetchPerformance = jest.fn().mockResolvedValue([]);
  return base;
}

export async function cleanupTripR11Fixture(
  prisma: PrismaClient,
  fixture: TripR11PostgresFixture,
): Promise<void> {
  await prisma.vehicleTripTrackingRun.deleteMany({
    where: { vehicleId: fixture.vehicle.id },
  });
  await prisma.dimoPollLog.deleteMany({ where: { vehicleId: fixture.vehicle.id } });
  await prisma.vehicleLatestState.deleteMany({ where: { vehicleId: fixture.vehicle.id } });
  await prisma.vehicleTripWaypoint.deleteMany({ where: { tripId: fixture.trip.id } });
  await prisma.tripBehaviorEvent.deleteMany({ where: { tripId: fixture.trip.id } });
  await prisma.tripDrivingImpact.deleteMany({ where: { tripId: fixture.trip.id } });
  await prisma.vehicleTripDetectionState.deleteMany({
    where: { vehicleId: fixture.vehicle.id },
  });
  await prisma.vehicleTrip.deleteMany({ where: { vehicleId: fixture.vehicle.id } });
  await prisma.vehicle.delete({ where: { id: fixture.vehicle.id } }).catch(() => undefined);
  await prisma.organization.delete({ where: { id: fixture.org.id } }).catch(() => undefined);
}

export function buildTripR11SegmentsMock(
  expectedEndTime: Date,
): TripR11SegmentsMock {
  return {
    fetchRawTripCoreData: jest.fn().mockResolvedValue([]),
    fetchRouteEnrichment: jest.fn().mockResolvedValue([]),
    fetchPerformance: jest.fn().mockResolvedValue([]),
    fetchEndValidationWindow: jest.fn().mockResolvedValue([
      {
        timestamp: expectedEndTime.toISOString(),
        speed: 0,
        isIgnitionOn: false,
        travelledDistance: 1000,
        fuelAbsoluteLevel: null,
        batteryEnergy: null,
      },
    ]),
  };
}

export function buildTripR11DetectorMock(expectedEndTime: Date): TripR11DetectorMock {
  const continuityDetector = new ContinuityAssessmentDetector();
  return {
    runAll: jest.fn().mockImplementation(async (names: string[], ctx: unknown) => {
      if (names.includes('ContinuityAssessmentDetector')) {
        return [await continuityDetector.evaluate(ctx as never)];
      }
      if (names.includes('ChangePointEndDetector')) {
        return [
          {
            detectorName: 'ChangePointEndDetector',
            verdict: 'TRIGGERED',
            evidence: {
              cusumLastMovementAt: expectedEndTime.toISOString(),
              segmentEnd: expectedEndTime.toISOString(),
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

export function buildTripR11OrchestrationHarness(
  prisma: PrismaClient,
  trackingQueue: Queue<TripTrackingJobData>,
  fixture: TripR11PostgresFixture,
  segments: TripR11SegmentsMock,
  detectorRegistry: TripR11DetectorMock,
  options?: {
    endValidationObservability?: unknown;
  },
): TripR11OrchestrationHarness {
  RuntimeStatusRegistry.setWorkersEnabled(true);
  const decisionEngine = new TripDecisionEngine(prisma as never);
  const evaluateEndCandidate = jest.fn().mockReturnValue({
    shouldEnd: true,
    shouldReopen: false,
    detectedEndAt: fixture.expectedEndTime,
    confidence: 'MEDIUM',
    endMode: END_DETECTION_MODES.CUSUM_VALIDATED,
    reason: 'integration_cusum_end',
  });
  jest
    .spyOn(decisionEngine, 'evaluateEndCandidate')
    .mockImplementation(evaluateEndCandidate);

  const logger = {
    log: () => undefined,
    debug: () => undefined,
    warn: () => undefined,
  };

  const proto = TripDetectionOrchestrationService.prototype as unknown as Record<
    string,
    (...args: never[]) => unknown
  >;

  const orchestration = {
    prisma,
    decisionEngine,
    trackingQueue,
    logger,
    BACKFILL_MS: 60_000,
    OVERLAP_CORE_MS: 30_000,
    OVERLAP_ROUTE_MS: 15_000,
    OVERLAP_PERF_MS: 30_000,
    TRACKING_INTERVAL_MS: 30_000,
    TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS: 120_000,
    TRIP_END_STABILITY_WINDOW_MS: 90_000,
    TRIP_END_TIMEOUT_MS: 1_800_000,
    TRIP_END_VALIDATION_RETRY_MS: 60_000,
    TRIP_END_VALIDATION_MAX_ATTEMPTS: 3,
    TRIP_END_SEGMENT_LOOKBACK_MS: 900_000,
    TRIP_END_SEGMENT_LOOKAHEAD_MS: 300_000,
    TRIP_END_CH_ASSIST_STABILITY_MS: 30_000,
    TRIP_CONTINUITY_CORE_WINDOW_MS: 120_000,
    TRIP_CONTINUITY_PERF_WINDOW_MS: 90_000,
    TRIP_EMPTY_CORE_BACKOFF_BASE_MS: 30_000,
    TRIP_EMPTY_CORE_BACKOFF_MAX_MS: 600_000,
    TRIP_EMPTY_CORE_BACKOFF_JITTER_RATIO: 0,
    maxSameTripQualifiedStopMs: 300_000,
    TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M: 200,
    TRIP_MID_GAP_MIN_PRE_DURATION_MS: 60_000,
    LOCK_TTL_MS: 120_000,
    segments,
    detectorRegistry,
    policyResolver: {
      resolve: jest.fn().mockReturnValue({
        detectors: ['ContinuityAssessmentDetector'],
        timeoutMs: 5000,
      }),
      assessDataQuality: jest.fn(),
    },
    tripMetrics: undefined,
    getOrCreateDetectionState: proto.getOrCreateDetectionState,
    transitionState: proto.transitionState,
    acquireWorkerLock: proto.acquireWorkerLock,
    releaseWorkerLock: proto.releaseWorkerLock,
    maybeRecoverLifecycleInvariant: async () => 'continue' as const,
    ensurePossibleEndClockDurability: proto.ensurePossibleEndClockDurability,
    logTrackingRun: proto.logTrackingRun,
    enqueueTripTrackingJob: proto.enqueueTripTrackingJob,
    tripTrackingJobId: proto.tripTrackingJobId,
    resolveActiveTripIdForScheduling: proto.resolveActiveTripIdForScheduling,
    scheduleActiveTick: proto.scheduleActiveTick,
    schedulePossibleEndCheck: proto.schedulePossibleEndCheck,
    scheduleEndValidation: proto.scheduleEndValidation,
    scheduleFinalize: proto.scheduleFinalize,
    accelerateActiveTickAfterWake: proto.accelerateActiveTickAfterWake,
    cancelPendingEndCycleJobs: proto.cancelPendingEndCycleJobs,
    processActiveTick: proto.processActiveTick,
    processPossibleEndCheck: proto.processPossibleEndCheck,
    processEndValidation: proto.processEndValidation,
    processFinalize: proto.processFinalize,
    checkDimoActivityResumed: proto.checkDimoActivityResumed,
    cancelPossibleEndForResumedActivity: proto.cancelPossibleEndForResumedActivity,
    evaluateClickHouseSkipResumeRevalidation: proto.evaluateClickHouseSkipResumeRevalidation,
    dimoProviderContext: jest.fn().mockReturnValue({}),
    tryApplyClickHouseAssistedEnd: jest.fn().mockResolvedValue(false),
    findMidTripGap: jest.fn().mockReturnValue(null),
    hasClickHouseAnalyticsDetectors: jest.fn().mockReturnValue(false),
    parseEvidenceTimestamp: proto.parseEvidenceTimestamp,
    logTripEndTimeline: () => undefined,
    postFinalizeAnalysisProducer: {
      produceAfterPersistedCompletion: async () => undefined,
    },
    enrichmentOrchestrator: {
      enqueueBehaviorEnrichment: async () => undefined,
    },
    batteryLvRestSessionProducer: {
      enqueueSessionOpenForFinalizedTrip: async () => undefined,
    },
    runObservabilitySafely: (name: string, fn: () => void) =>
      runTripObservabilitySafely(logger, name, fn),
    recordEndValidationObservability: proto.recordEndValidationObservability,
    endValidationObservability: options?.endValidationObservability,
  };

  const runJob = async (job: TripTrackingJobData): Promise<void> => {
    const svc = orchestration as unknown as TripDetectionOrchestrationService;
    type Handler = (this: TripDetectionOrchestrationService, data: TripTrackingJobData) => Promise<void>;
    switch (job.trigger) {
      case TRIP_TRACKING_TRIGGERS.ACTIVE_TICK:
        await (TripDetectionOrchestrationService.prototype.processActiveTick as Handler).call(
          svc,
          job,
        );
        break;
      case TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK:
        await (
          TripDetectionOrchestrationService.prototype.processPossibleEndCheck as Handler
        ).call(svc, job);
        break;
      case TRIP_TRACKING_TRIGGERS.END_VALIDATION:
        await (TripDetectionOrchestrationService.prototype.processEndValidation as Handler).call(
          svc,
          job,
        );
        break;
      case TRIP_TRACKING_TRIGGERS.FINALIZE:
        await (TripDetectionOrchestrationService.prototype.processFinalize as Handler).call(
          svc,
          job,
        );
        break;
      default:
        throw new Error(`Unsupported trigger in R11 integration harness: ${job.trigger}`);
    }
  };

  return {
    prisma,
    decisionEngine,
    trackingQueue,
    segments,
    detectorRegistry,
    evaluateEndCandidate,
    orchestration,
    runJob,
  };
}

export function buildActiveTickJob(
  fixture: TripR11PostgresFixture,
  requestedAt: Date,
): TripTrackingJobData {
  return {
    vehicleId: fixture.vehicle.id,
    organizationId: fixture.org.id,
    dimoTokenId: fixture.vehicle.dimoTokenId,
    trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
    requestedAt: requestedAt.toISOString(),
  };
}

export function buildTripTrackingJobId(
  phase: 'at' | 'pec' | 'ev' | 'fin',
  vehicleId: string,
  tripId: string,
): string {
  return `trip-${phase}-${vehicleId}-${tripId}`;
}

export async function drainTripTrackingQueue(params: {
  queue: Queue<TripTrackingJobData>;
  runJob: (job: TripTrackingJobData) => Promise<void>;
  maxSteps?: number;
}): Promise<{ steps: number; triggers: TripTrackingJobData['trigger'][] }> {
  let steps = 0;
  const triggers: TripTrackingJobData['trigger'][] = [];
  const maxSteps = params.maxSteps ?? 20;

  const jobPhasePriority = (jobId: string | undefined): number => {
    if (!jobId) return 99;
    if (jobId.includes('-pec-')) return 1;
    if (jobId.includes('-ev-')) return 2;
    if (jobId.includes('-fin-')) return 3;
    if (jobId.includes('-at-')) return 4;
    return 50;
  };

  while (steps < maxSteps) {
    const jobs = await params.queue.getJobs(['waiting', 'delayed', 'prioritized'], 0, 20);
    if (jobs.length === 0) break;
    const job = jobs.sort((a, b) => {
      const phaseDelta =
        jobPhasePriority(a.id) - jobPhasePriority(b.id);
      if (phaseDelta !== 0) return phaseDelta;
      return (a.timestamp ?? 0) - (b.timestamp ?? 0);
    })[0]!;
    const state = await job.getState();
    if (state === 'delayed') {
      await job.promote();
    }
    const jobData = job.data;
    // Remove before runJob so nested schedule* calls do not see this job as
    // queued primary (BullMQ workers hold ACTIVE during processing; manual drain
    // otherwise leaves WAITING and stable-slot enqueue returns skipped).
    await job.remove().catch(() => undefined);
    await params.runJob(jobData);
    triggers.push(jobData.trigger);
    steps += 1;
  }
  return { steps, triggers };
}

export function createTripTrackingWorkers(params: {
  connection: ConnectionOptions;
  runJob: (job: Job<TripTrackingJobData>) => Promise<void>;
  concurrency?: number;
  workerCount?: number;
}): Worker[] {
  const workers: Worker[] = [];
  const count = params.workerCount ?? 2;
  for (let i = 0; i < count; i += 1) {
    workers.push(
      new Worker<TripTrackingJobData>(
        QUEUE_NAMES.TRIP_TRACKING,
        async (job: Job<TripTrackingJobData>) => params.runJob(job),
        {
          connection: params.connection,
          concurrency: params.concurrency ?? 1,
        },
      ),
    );
  }
  return workers;
}

export async function closeTripTrackingWorkers(workers: Worker[]): Promise<void> {
  await Promise.all(workers.map((w) => w.close().catch(() => undefined)));
}

export async function waitForHarnessCondition(
  predicate: () => Promise<boolean>,
  timeoutMs = 30_000,
  label = 'waitForHarnessCondition',
): Promise<void> {
  const deadline = waitHarnessDeadlineMs(timeoutMs);
  while (isBeforeHarnessDeadline(deadline)) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms`);
}

export async function waitForTripTrackingJobState(
  queue: Queue<TripTrackingJobData>,
  jobId: string,
  expectedState: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = waitHarnessDeadlineMs(timeoutMs);
  while (isBeforeHarnessDeadline(deadline)) {
    const job = await queue.getJob(jobId);
    if (job && (await job.getState()) === expectedState) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  const job = await queue.getJob(jobId);
  const actual = job ? await job.getState() : 'absent';
  throw new Error(
    `Job ${jobId} did not reach state=${expectedState} within ${timeoutMs}ms (actual=${actual})`,
  );
}

export async function getActiveTickJobDelayMs(
  queue: Queue<TripTrackingJobData>,
  fixture: TripR11PostgresFixture,
): Promise<number | null> {
  const jobId = buildTripTrackingJobId('at', fixture.vehicle.id, fixture.trip.id);
  const job = await queue.getJob(jobId);
  if (!job) return null;
  return job.delay ?? 0;
}

export async function countTripTrackingJobs(
  queue: Queue<TripTrackingJobData>,
  states: ('waiting' | 'delayed' | 'active' | 'completed' | 'failed')[] = [
    'waiting',
    'delayed',
    'active',
  ],
): Promise<number> {
  const jobs = await queue.getJobs(states, 0, 500);
  return jobs.length;
}

/** Remove jobs scheduled during synchronous harness steps (e.g. ACTIVE_TICK → delayed PEC). */
export async function purgeTripTrackingQueueJobs(
  queue: Queue<TripTrackingJobData>,
): Promise<number> {
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

export async function promoteDelayedTripTrackingJobs(
  queue: Queue<TripTrackingJobData>,
): Promise<number> {
  const jobs = await queue.getJobs(['delayed'], 0, 50);
  let promoted = 0;
  for (const job of jobs) {
    await job.promote().catch(() => undefined);
    promoted += 1;
  }
  return promoted;
}

export async function waitForTripTerminalStateNatural(params: {
  prisma: PrismaClient;
  fixture: TripR11PostgresFixture;
  trackingQueue: Queue<TripTrackingJobData>;
  timeoutMs?: number;
}): Promise<{ manualPromoteCount: number }> {
  const timeoutMs = params.timeoutMs ?? 60_000;
  const deadline = waitHarnessDeadlineMs(timeoutMs);
  while (isBeforeHarnessDeadline(deadline)) {
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
      return { manualPromoteCount: 0 };
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  const trip = await params.prisma.vehicleTrip.findUnique({
    where: { id: params.fixture.trip.id },
  });
  const det = await params.prisma.vehicleTripDetectionState.findUnique({
    where: { vehicleId: params.fixture.vehicle.id },
  });
  const runs = await params.prisma.vehicleTripTrackingRun.findMany({
    where: { tripId: params.fixture.trip.id },
    orderBy: { createdAt: 'asc' },
  });
  throw new Error(
    `Trip terminal natural wait timed out: tripStatus=${trip?.tripStatus} detState=${det?.state} ` +
      `activeTripId=${det?.activeTripId} queueJobs=${await countTripTrackingJobs(params.trackingQueue)} ` +
      `runs=${JSON.stringify(runs.map((r) => ({ type: r.runType, summary: r.resultSummary })))}`,
  );
}

export async function waitForTripTerminalState(params: {
  prisma: PrismaClient;
  fixture: TripR11PostgresFixture;
  trackingQueue: Queue<TripTrackingJobData>;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = params.timeoutMs ?? 30_000;
  const deadline = waitHarnessDeadlineMs(timeoutMs);
  while (isBeforeHarnessDeadline(deadline)) {
    await promoteDelayedTripTrackingJobs(params.trackingQueue);
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
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  const trip = await params.prisma.vehicleTrip.findUnique({
    where: { id: params.fixture.trip.id },
  });
  const det = await params.prisma.vehicleTripDetectionState.findUnique({
    where: { vehicleId: params.fixture.vehicle.id },
  });
  const runs = await params.prisma.vehicleTripTrackingRun.findMany({
    where: { tripId: params.fixture.trip.id },
    orderBy: { createdAt: 'asc' },
  });
  throw new Error(
    `Trip terminal wait timed out: tripStatus=${trip?.tripStatus} detState=${det?.state} ` +
      `activeTripId=${det?.activeTripId} queueJobs=${await countTripTrackingJobs(params.trackingQueue)} ` +
      `runs=${JSON.stringify(runs.map((r) => ({ type: r.runType, summary: r.resultSummary })))}`,
  );
}
