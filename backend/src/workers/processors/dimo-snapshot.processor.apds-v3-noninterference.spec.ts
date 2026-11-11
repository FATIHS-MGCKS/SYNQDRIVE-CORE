import { Job } from 'bullmq';
import {
  DimoSnapshotProcessor,
  type DimoSnapshotJobData,
} from './dimo-snapshot.processor';

describe('DimoSnapshotProcessor — APDS V3 shadow non-interference', () => {
  const vehicleId = 'veh-v3';
  const dimoTokenId = 42;
  const orgId = 'org-v3';

  function buildProcessor(deps: {
    apdsV3Shadow?: { scheduleBaselineObserve: jest.Mock; isRuntimeReady: () => boolean };
    dimoTelemetry?: { fetchLatestVehicleSnapshot: jest.Mock };
    apdsThrows?: boolean;
  }) {
    const dimoTelemetry =
      deps.dimoTelemetry ??
      ({
        fetchLatestVehicleSnapshot: jest.fn().mockResolvedValue({
          signals: [],
          raw: {},
        }),
      } as never);

    const prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: orgId,
          registryLifecycle: 'ACTIVE',
          hardwareType: 'AUTOPI',
          fuelType: 'ELECTRIC',
          dimoVehicle: { connectionStatus: 'CONNECTED' },
          tripDetectionState: { state: null },
          dataSourceLinks: [{ id: 'link-1', sourceSubtype: null }],
        }),
      },
      batteryMeasurement: { findFirst: jest.fn().mockResolvedValue(null) },
      vehicleLatestState: { findUnique: jest.fn().mockResolvedValue(null) },
      dimoPollLog: {
        create: jest.fn().mockResolvedValue({ id: 'poll-1' }),
        update: jest.fn(),
      },
      vehicleLatestStateUpsert: jest.fn(),
    };

    const apdsV3Shadow = deps.apdsV3Shadow ?? {
      isRuntimeReady: () => true,
      scheduleBaselineObserve: jest.fn((() => {
        if (deps.apdsThrows) {
          throw new Error('shadow hook exploded');
        }
      }) as never),
    };

    const processor = new DimoSnapshotProcessor(
      { getVehicleJwt: jest.fn().mockResolvedValue('jwt') } as never,
      dimoTelemetry as never,
      {
        ...prisma,
        vehicleLatestState: {
          findUnique: prisma.vehicleLatestState.findUnique,
          upsert: jest.fn().mockResolvedValue({ id: 'vls', sourceTimestamp: new Date() }),
          update: jest.fn(),
        },
      } as never,
      { evaluateSnapshotForTripStart: jest.fn().mockResolvedValue(undefined) } as never,
      { classifyAndEnqueue: jest.fn() } as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      apdsV3Shadow as never,
      undefined as never,
      undefined as never,
    );

    return { processor, dimoTelemetry, apdsV3Shadow };
  }

  it('baseline pipeline still runs when V3 schedule hook throws synchronously', async () => {
    const { processor, apdsV3Shadow } = buildProcessor({ apdsThrows: true });
    const pipelineSpy = jest
      .spyOn(processor as unknown as { runSnapshotPipeline: () => Promise<unknown> }, 'runSnapshotPipeline')
      .mockResolvedValue({} as never);
    const job = {
      id: 'job-v3',
      attemptsMade: 0,
      data: { vehicleId, dimoTokenId },
    } as unknown as Job<DimoSnapshotJobData>;

    await processor.process(job);
    expect(apdsV3Shadow.scheduleBaselineObserve).toHaveBeenCalledTimes(1);
    expect(pipelineSpy).toHaveBeenCalled();
    pipelineSpy.mockRestore();
  });

  it('does not await V3 schedule before pipeline when hook is non-throwing', async () => {
    const { processor, apdsV3Shadow } = buildProcessor({});
    const pipelineSpy = jest
      .spyOn(processor as unknown as { runSnapshotPipeline: () => Promise<unknown> }, 'runSnapshotPipeline')
      .mockResolvedValue({} as never);
    const job = {
      id: 'job-v3',
      attemptsMade: 0,
      data: { vehicleId, dimoTokenId },
    } as unknown as Job<DimoSnapshotJobData>;

    await processor.process(job);
    expect(apdsV3Shadow.scheduleBaselineObserve).toHaveBeenCalledTimes(1);
    expect(pipelineSpy).toHaveBeenCalled();
    pipelineSpy.mockRestore();
  });
});
