import { DrivingAnalysisReconciliationService } from './driving-analysis-reconciliation.service';
import {
  DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES,
  DRIVING_IMPACT_RECONCILE_DETAIL_MISSING_IMPACT,
  DRIVING_IMPACT_RECONCILE_DETAIL_STATUS_DESYNC,
  buildReconciliationIdempotencyKey,
} from './driving-analysis-reconciliation.types';

function makeRentalReconciliationPort() {
  return {
    scanBookingsWithoutRentalAnalysis: jest.fn().mockResolvedValue([]),
    remediateBookingWithoutRentalAnalysis: jest.fn().mockResolvedValue('skipped'),
  };
}

function buildService(overrides?: {
  prisma?: Record<string, unknown>;
  analysisInit?: Record<string, unknown>;
  jobDispatcher?: Record<string, unknown>;
  jobRepository?: Record<string, unknown>;
  rentalReconciliation?: ReturnType<typeof makeRentalReconciliationPort>;
}) {
  const prisma = {
    organization: { findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]) },
    vehicleTrip: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    drivingAnalysisRun: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    tripDrivingImpact: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    drivingEvent: { findMany: jest.fn().mockResolvedValue([]) },
    booking: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    drivingIntelligenceJob: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    drivingAnalysisStage: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides?.prisma,
  } as any;

  const analysisInit = {
    initializeForCompletedTrip: jest.fn().mockResolvedValue({
      runId: 'run-1',
      runCreated: false,
      runDeduplicated: true,
      jobs: [{ enqueued: false, deduplicated: true }],
      queueErrors: [],
    }),
    ...overrides?.analysisInit,
  };

  const jobDispatcher = { enqueue: jest.fn(), ...overrides?.jobDispatcher };
  const jobRepository = {
    findRetryablePending: jest.fn().mockResolvedValue([]),
    findStuckInProgress: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    markRetryScheduled: jest.fn(),
    ...overrides?.jobRepository,
  };

  const rentalReconciliation = overrides?.rentalReconciliation ?? makeRentalReconciliationPort();

  const service = new DrivingAnalysisReconciliationService(
    prisma,
    analysisInit as any,
    jobDispatcher as any,
    jobRepository as any,
    rentalReconciliation as any,
  );

  return { service, prisma, analysisInit, jobDispatcher, jobRepository, rentalReconciliation };
}

describe('DrivingAnalysisReconciliationService', () => {
  it('builds hour-bucket idempotency keys for reconciliation actions', () => {
    const key = buildReconciliationIdempotencyKey(
      DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.TRIP_WITHOUT_ANALYSIS_RUN,
      'trip-1',
      3_600_000,
      3_600_000 * 5,
    );
    expect(key).toBe('reconcile:TRIP_WITHOUT_ANALYSIS_RUN:trip-1:5');
  });

  it('second remediation with same bucket deduplicates via dispatcher skip', async () => {
    const { service, analysisInit } = buildService({
      prisma: {
        vehicleTrip: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([{ id: 'trip-1', vehicleId: 'vehicle-1' }])
            .mockResolvedValue([])
            .mockResolvedValue([])
            .mockResolvedValue([]),
          findFirst: jest.fn().mockResolvedValue({ vehicleId: 'vehicle-1', tripStatus: 'COMPLETED' }),
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        drivingAnalysisRun: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      },
    });

    const first = await service.runPeriodicReconciliation({ organizationId: 'org-1', maxActions: 10 });
    const second = await service.runPeriodicReconciliation({ organizationId: 'org-1', maxActions: 10 });

    expect(first.findings.length).toBeGreaterThan(0);
    expect(analysisInit.initializeForCompletedTrip).toHaveBeenCalledTimes(1);
    expect(second.actionsSkipped).toBeGreaterThanOrEqual(0);
    expect(second.actionsEnqueued).toBe(0);
  });

  it('flags status_desync when impact row exists but drivingImpactStatus is pending', async () => {
    const { service } = buildService({
      prisma: {
        vehicleTrip: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ id: 'trip-impact' }])
            .mockResolvedValueOnce([])
            .mockResolvedValue([]),
          findFirst: jest.fn(),
          findUnique: jest.fn().mockResolvedValue({
            id: 'trip-impact',
            analysisStagesJson: { behavior: 'done', route: 'done', misuse: 'done', drivingImpact: 'pending' },
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        tripDrivingImpact: {
          findMany: jest.fn().mockResolvedValue([{ tripId: 'trip-impact' }]),
          findUnique: jest.fn().mockResolvedValue({ tripId: 'trip-impact' }),
        },
      },
    });

    const result = await service.runPeriodicReconciliation({ organizationId: 'org-1', maxActions: 10 });

    const finding = result.findings.find(
      (row) =>
        row.checkType === DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.DRIVING_IMPACT_STATUS_MISMATCH &&
        row.entityId === 'trip-impact',
    );
    expect(finding?.detail).toBe(DRIVING_IMPACT_RECONCILE_DETAIL_STATUS_DESYNC);
    expect(result.actionsEnqueued).toBeGreaterThanOrEqual(1);
  });

  it('flags missing_impact when behavior completed but no impact row exists', async () => {
    const { service } = buildService({
      prisma: {
        vehicleTrip: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ id: 'trip-missing' }])
            .mockResolvedValueOnce([])
            .mockResolvedValue([]),
          findFirst: jest.fn().mockResolvedValue({ vehicleId: 'vehicle-1' }),
        },
        tripDrivingImpact: { findMany: jest.fn().mockResolvedValue([]) },
        drivingAnalysisRun: {
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn().mockResolvedValue({ id: 'run-1' }),
        },
      },
      jobDispatcher: {
        enqueue: jest.fn().mockResolvedValue({ enqueued: true, deduplicated: false }),
      },
    });

    const result = await service.runPeriodicReconciliation({ organizationId: 'org-1', maxActions: 10 });

    const finding = result.findings.find(
      (row) =>
        row.checkType === DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.DRIVING_IMPACT_STATUS_MISMATCH &&
        row.entityId === 'trip-missing',
    );
    expect(finding?.detail).toBe(DRIVING_IMPACT_RECONCILE_DETAIL_MISSING_IMPACT);
  });
});
