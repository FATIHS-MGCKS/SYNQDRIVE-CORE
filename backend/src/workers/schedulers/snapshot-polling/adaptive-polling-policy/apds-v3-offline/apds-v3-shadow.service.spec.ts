import { ApdsV3ShadowService, buildApdsV3ShadowPhysicalRequestId } from './apds-v3-shadow.service';
import { ApdsV3ShadowRepository } from './apds-v3-shadow.repository';
import { ApdsV3ShadowEligibilityService } from './apds-v3-shadow-eligibility.service';

describe('ApdsV3ShadowService', () => {
  const upsert = jest.fn().mockResolvedValue(undefined);

  const prisma = {
    dimoPollLog: { findFirst: jest.fn().mockResolvedValue(null) },
    batteryMeasurement: { findMany: jest.fn().mockResolvedValue([]) },
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({ fuelType: 'ELECTRIC' }),
    },
  };

  const eligibility = {
    resolveForVehicle: jest.fn().mockResolvedValue({
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

  beforeEach(() => {
    jest.resetAllMocks();
    eligibility.resolveForVehicle.mockResolvedValue({
      eligible: true,
      organizationId: 'org-a',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-1',
      connectivityStatus: 'CONNECTED',
    });
    process.env.WORKER_APDS_V3_SHADOW_ENABLED = 'true';
    process.env.WORKER_APDS_V3_SHADOW_ACTIVATION_VERSION = 'APDS_V3_SHADOW_ACTIVATION_V1';
  });

  afterEach(() => {
    delete process.env.WORKER_APDS_V3_SHADOW_ENABLED;
    delete process.env.WORKER_APDS_V3_SHADOW_ACTIVATION_VERSION;
  });

  it('does not throw when persistence fails (non-blocking)', async () => {
    upsert.mockRejectedValueOnce(new Error('db down'));
    const repo = { upsertPollStartDecision: upsert } as unknown as ApdsV3ShadowRepository;
    const svc = new ApdsV3ShadowService(
      prisma as never,
      eligibility as unknown as ApdsV3ShadowEligibilityService,
      repo,
      metrics as never,
    );
    await expect(
      svc.observeActualBaselinePollStart({
        organizationId: 'org-a',
        vehicleId: 'veh-1',
        pollStartedAtMs: 1_700_000_000_000,
        tripDetectionState: null,
        lastProviderFetchedAtMs: null,
        lastTrustworthyLvSourceMs: null,
        lvProviderTimestampsMs: [],
        providerGapOpen: false,
        r9WakeKnown: false,
        deviceReconnectRecent: false,
        providerReconnectRecent: false,
        activityTierLabel: 'RESTING_STANDBY',
      }),
    ).resolves.toBeUndefined();
  });

  it('kill switch off is no-op', async () => {
    process.env.WORKER_APDS_V3_SHADOW_ENABLED = 'false';
    const repo = { upsertPollStartDecision: upsert } as unknown as ApdsV3ShadowRepository;
    const svc = new ApdsV3ShadowService(
      prisma as never,
      eligibility as unknown as ApdsV3ShadowEligibilityService,
      repo,
      metrics as never,
    );
    await svc.observeActualBaselinePollStart({
      organizationId: 'org-a',
      vehicleId: 'veh-1',
      pollStartedAtMs: 1_700_000_000_000,
      tripDetectionState: null,
      lastProviderFetchedAtMs: null,
      lastTrustworthyLvSourceMs: null,
      lvProviderTimestampsMs: [],
      providerGapOpen: false,
      r9WakeKnown: false,
      deviceReconnectRecent: false,
      providerReconnectRecent: false,
      activityTierLabel: 'RESTING_STANDBY',
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('physical request id is stable for replica idempotency', () => {
    expect(
      buildApdsV3ShadowPhysicalRequestId({
        organizationId: 'o',
        vehicleId: 'v',
        pollStartedAtMs: 123,
        realPollId: 'poll-uuid',
      }),
    ).toBe('poll-uuid');
  });
});
