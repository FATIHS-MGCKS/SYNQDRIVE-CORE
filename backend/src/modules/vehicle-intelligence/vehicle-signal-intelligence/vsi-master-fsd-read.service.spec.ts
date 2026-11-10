import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VsiMasterFsdReadService } from './vsi-master-fsd-read.service';
import { buildLiveCatalogOnlyCheckpointFixtureV1 } from './__fixtures__/vsi-master-fsd-read.fixture.v1';

describe('VsiMasterFsdReadService', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn() },
    vehicleDataSourceLink: { findFirst: jest.fn() },
    fsdDiscoveryRun: { findFirst: jest.fn(), findMany: jest.fn() },
    fsdDiscoveryStage: { findMany: jest.fn() },
    fsdDiscoverySignalEvidence: { findMany: jest.fn(), count: jest.fn() },
  };

  let service: VsiMasterFsdReadService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VsiMasterFsdReadService(prisma as never);
  });

  it('rejects cross-org vehicle access', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.getSummary('org-a', 'veh-1', 'link-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects run inspector for out-of-scope run id', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
    prisma.vehicleDataSourceLink.findFirst.mockResolvedValue({ id: 'link-1' });
    prisma.fsdDiscoveryRun.findFirst.mockResolvedValue(null);
    await expect(
      service.getRunInspector({
        organizationId: 'org-a',
        vehicleId: 'veh-1',
        providerSourceLinkId: 'link-1',
        runId: 'run-other',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects invalid run history cursor', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
    prisma.vehicleDataSourceLink.findFirst.mockResolvedValue({ id: 'link-1' });
    await expect(
      service.getRunHistory({
        organizationId: 'org-a',
        vehicleId: 'veh-1',
        providerSourceLinkId: 'link-1',
        cursor: 'bad',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports catalog-only snapshot as NOT_EXECUTED in summary', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
    prisma.vehicleDataSourceLink.findFirst.mockResolvedValue({ id: 'link-1' });
    const checkpoint = buildLiveCatalogOnlyCheckpointFixtureV1();
    prisma.fsdDiscoveryRun.findFirst
      .mockResolvedValueOnce({
        id: 'run-fsd3',
        runKey: 'k',
        organizationId: 'org-a',
        vehicleId: 'veh-1',
        providerSourceLinkId: 'link-1',
        discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
        status: 'COMPLETED',
        dimoTokenId: 1,
        connectionIdentityFingerprint: 'fp',
        invalidatedAt: null,
        supersededByRunId: null,
        completedAt: new Date('2026-11-09T19:41:00Z'),
        stages: [
          {
            stageType: 'CATALOG',
            status: 'SUCCEEDED',
            checkpointJson: checkpoint,
            lastHttpStatus: 200,
          },
          { stageType: 'SNAPSHOT', status: 'PLANNED', checkpointJson: {}, lastHttpStatus: null },
        ],
      })
      .mockResolvedValueOnce(null);
    prisma.fsdDiscoverySignalEvidence.count.mockResolvedValue(0);

    const summary = await service.getSummary('org-a', 'veh-1', 'link-1');
    expect(summary.catalog.availability).toBe('AUTHORITATIVE_LIVE');
    expect(summary.evidence.snapshot).toBe('NOT_EXECUTED');
    expect(summary.execution.fsd4.state).toBe('NOT_YET_EXECUTED');
  });

  it('does not invoke provider orchestration (read-only prisma)', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
    prisma.vehicleDataSourceLink.findFirst.mockResolvedValue({ id: 'link-1' });
    prisma.fsdDiscoveryRun.findFirst.mockResolvedValue(null);
    prisma.fsdDiscoverySignalEvidence.count.mockResolvedValue(0);
    await service.getSummary('org-a', 'veh-1', 'link-1');
    expect(prisma.fsdDiscoveryRun.findFirst).toHaveBeenCalled();
  });
});
