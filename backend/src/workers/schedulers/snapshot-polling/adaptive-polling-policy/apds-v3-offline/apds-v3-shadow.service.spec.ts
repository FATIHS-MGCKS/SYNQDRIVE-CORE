import { TripDetectionState } from '@prisma/client';
import { ApdsV3ShadowService } from './apds-v3-shadow.service';
import { ApdsV3ShadowRepository } from './apds-v3-shadow.repository';
import { ApdsV3ShadowEligibilityService } from './apds-v3-shadow-eligibility.service';

describe('ApdsV3ShadowService', () => {
  const insertPollStartDecision = jest.fn().mockResolvedValue('inserted');

  const prismaInner = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    dimoPollLog: { findFirst: jest.fn().mockResolvedValue(null) },
    batteryMeasurement: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleLatestState: { findUnique: jest.fn().mockResolvedValue(null) },
    vehicleSignalCapabilityProfileRevision: { findFirst: jest.fn().mockResolvedValue(null) },
    vehicleProviderSourceObservation: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const prisma = {
    ...prismaInner,
    $transaction: jest.fn(async (fn: (tx: typeof prismaInner) => Promise<unknown>) =>
      fn(prismaInner),
    ),
  };

  const eligibility = {
    resolveForBaselinePoll: jest.fn().mockResolvedValue({
      eligible: true,
      organizationId: 'org-a',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-1',
      connectivityStatus: 'CONNECTED',
    }),
  };

  const metrics = {
    recordDecision: jest.fn(),
    recordEligibilityBlocked: jest.fn(),
    recordWriteSuppressed: jest.fn(),
    setRuntimeReady: jest.fn(),
  };

  const envelope = () => ({
    job: {
      id: 'job-1',
      attemptsMade: 0,
      data: {
        vehicleId: 'veh-1',
        dimoTokenId: 9,
        apdShadowEnqueueEvidence: {
          attemptId: 'att-1',
          canonicalJobId: 'snapshot-veh-1',
          binding: 'PHYSICAL_JOB_PAYLOAD' as const,
          outcome: 'ENQUEUED' as const,
          observedAtMs: 1,
        },
      },
    },
    organizationId: 'org-a',
    vehicleId: 'veh-1',
    baselineProviderSourceLinkId: 'link-1',
    pollStartedAtMs: 1_700_000_000_000,
    tripDetectionState: TripDetectionState.RESTING,
    vehicleFuelType: 'ELECTRIC',
    lastTrustworthyLvSourceMs: null,
    lastTopLevelProviderSourceMs: null,
    r9WakeKnown: false,
    providerGapOpen: false,
    deviceReconnectRecent: false,
    providerReconnectRecent: false,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    eligibility.resolveForBaselinePoll.mockResolvedValue({
      eligible: true,
      organizationId: 'org-a',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-1',
      connectivityStatus: 'CONNECTED',
    });
    insertPollStartDecision.mockResolvedValue('inserted');
    process.env.WORKER_APDS_V3_SHADOW_ENABLED = 'true';
    process.env.WORKER_APDS_V3_SHADOW_ACTIVATION_VERSION = 'APDS_V3_SHADOW_ACTIVATION_V1';
  });

  afterEach(() => {
    delete process.env.WORKER_APDS_V3_SHADOW_ENABLED;
    delete process.env.WORKER_APDS_V3_SHADOW_ACTIVATION_VERSION;
  });

  it('scheduleBaselineObserve does not throw when persistence fails', async () => {
    insertPollStartDecision.mockRejectedValueOnce(new Error('db down'));
    const repo = { insertPollStartDecision } as unknown as ApdsV3ShadowRepository;
    const svc = new ApdsV3ShadowService(
      prisma as never,
      eligibility as unknown as ApdsV3ShadowEligibilityService,
      repo,
      metrics as never,
    );
    expect(() => svc.scheduleBaselineObserve(envelope())).not.toThrow();
    await svc.onModuleDestroy();
  });

  it('kill switch off is no-op', async () => {
    process.env.WORKER_APDS_V3_SHADOW_ENABLED = 'false';
    const repo = { insertPollStartDecision } as unknown as ApdsV3ShadowRepository;
    const svc = new ApdsV3ShadowService(
      prisma as never,
      eligibility as unknown as ApdsV3ShadowEligibilityService,
      repo,
      metrics as never,
    );
    svc.scheduleBaselineObserve(envelope());
    await svc.onModuleDestroy();
    expect(insertPollStartDecision).not.toHaveBeenCalled();
  });

  it('skips physical identity when job id missing', async () => {
    const repo = { insertPollStartDecision } as unknown as ApdsV3ShadowRepository;
    const svc = new ApdsV3ShadowService(
      prisma as never,
      eligibility as unknown as ApdsV3ShadowEligibilityService,
      repo,
      metrics as never,
    );
    svc.scheduleBaselineObserve({
      ...envelope(),
      job: { data: { vehicleId: 'veh-1', dimoTokenId: 1 } },
    });
    await svc.onModuleDestroy();
    expect(insertPollStartDecision).not.toHaveBeenCalled();
    expect(metrics.recordWriteSuppressed).toHaveBeenCalledWith('PHYSICAL_IDENTITY_UNVERIFIED');
  });
});
