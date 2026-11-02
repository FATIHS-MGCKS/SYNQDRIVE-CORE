import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { VsiReadonlySignalComposerModule } from './vsi-readonly-composer.module';
import { VsiProfileRevisionHistoryRepository } from './vsi-profile-revision-history.repository';
import { VsiMasterIntelligenceReadService } from './vsi-master-intelligence-read.service';
import { VsiReadonlySignalComposerService } from './vsi-readonly-composer.service';
import { VsiCapabilityResolverService } from './vsi-capability-resolver.service';
import { VsiProfileLifecycleOutboxWorker } from './vsi-profile-lifecycle.worker';
import * as p5h1Config from './vsi-p5h1-profile-revision-history.config';

describe('VsiProfileRevisionHistoryRepository Nest DI (Master Intelligence revisions)', () => {
  const orgId = 'org-1';
  const vehicleId = 'veh-1';
  const linkId = 'link-1';

  function buildPrismaMock(revisionRows: unknown[] = []) {
    return {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({ id: vehicleId }),
      },
      vehicleDataSourceLink: {
        findFirst: jest.fn().mockResolvedValue({ id: linkId, provider: 'RUPTELA' }),
      },
      vehicleSignalCapabilityProfileRevision: {
        findMany: jest.fn().mockResolvedValue(revisionRows),
      },
    };
  }

  async function compileModule(prismaMock: ReturnType<typeof buildPrismaMock>) {
    return Test.createTestingModule({
      imports: [VsiReadonlySignalComposerModule],
      providers: [
        VsiMasterIntelligenceReadService,
        { provide: VsiReadonlySignalComposerService, useValue: { composeVehicleSignals: jest.fn() } },
        { provide: VsiCapabilityResolverService, useValue: { resolve: jest.fn() } },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(SchedulerLeaderGuardService)
      .useValue({ shouldRun: jest.fn(() => false), runIfLeader: jest.fn() })
      .overrideProvider(VsiProfileLifecycleOutboxWorker)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .compile();
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('injects PrismaService into VsiProfileRevisionHistoryRepository via TestingModule', async () => {
    const prismaMock = buildPrismaMock();
    const moduleRef = await compileModule(prismaMock);
    const repo = moduleRef.get(VsiProfileRevisionHistoryRepository);

    await repo.listRevisionsForLink({
      organizationId: orgId,
      vehicleId,
      providerSourceLinkId: linkId,
      maxRows: 5,
    });

    expect(prismaMock.vehicleSignalCapabilityProfileRevision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: orgId,
          vehicleId,
          providerSourceLinkId: linkId,
        },
      }),
    );
  });

  it('getRevisionHistoryPage returns empty CAPTURE_ENABLED page when P5H1 enabled and no rows', async () => {
    jest.spyOn(p5h1Config, 'isVsiP5h1ProfileRevisionHistoryCaptureEnabled').mockReturnValue(true);
    const prismaMock = buildPrismaMock([]);
    const moduleRef = await compileModule(prismaMock);
    const reads = moduleRef.get(VsiMasterIntelligenceReadService);

    const page = await reads.getRevisionHistoryPage({
      organizationId: orgId,
      vehicleId,
      providerSourceLinkId: linkId,
      limit: 20,
    });

    expect(page.captureStatus).toBe('CAPTURE_ENABLED');
    expect(page.items).toEqual([]);
    expect(page.page.hasMore).toBe(false);
    expect(page.page.nextCursor).toBeNull();
  });

  it('getRevisionHistoryPage maps revision rows without TypeError when P5H1 enabled', async () => {
    jest.spyOn(p5h1Config, 'isVsiP5h1ProfileRevisionHistoryCaptureEnabled').mockReturnValue(true);
    const evaluatedAt = new Date('2026-10-01T12:00:00.000Z');
    const recordedAt = new Date('2026-10-01T12:00:01.000Z');
    const prismaMock = buildPrismaMock([
      {
        organizationId: orgId,
        vehicleId,
        providerSourceLinkId: linkId,
        profileRevision: 3,
        profileContractVersion: 'v2',
        contentFingerprint: 'abc123def456',
        providerIdentity: 'RUPTELA',
        verifiedModality: null,
        telemetrySourceFamily: null,
        evaluatedAt,
        recordedAt,
        signalsSnapshot: [],
        profileLimitations: [],
        materializationTrigger: 'SNAPSHOT_HOOK',
        sourceLinkLifecycleContext: {},
        sourceProvenance: {},
      },
    ]);
    const moduleRef = await compileModule(prismaMock);
    const reads = moduleRef.get(VsiMasterIntelligenceReadService);

    const page = await reads.getRevisionHistoryPage({
      organizationId: orgId,
      vehicleId,
      providerSourceLinkId: linkId,
      limit: 20,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.profileRevision).toBe(3);
    expect(page.items[0]?.evaluatedAt).toBe(evaluatedAt.toISOString());
  });
});
