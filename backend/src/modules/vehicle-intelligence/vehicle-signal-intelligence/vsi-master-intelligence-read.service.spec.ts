import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VsiMasterIntelligenceReadService } from './vsi-master-intelligence-read.service';
import * as p5h1Config from './vsi-p5h1-profile-revision-history.config';

describe('VsiMasterIntelligenceReadService tenant scope', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn() },
    vehicleDataSourceLink: { findFirst: jest.fn(), findMany: jest.fn() },
  };
  const materialization = {
    listProfilesForVehicle: jest.fn(),
    getProfileForLink: jest.fn(),
  };
  const composer = { composeVehicleSignals: jest.fn() };
  const revisionHistory = { listRevisionsForLink: jest.fn(), resolveRevisionAsOf: jest.fn() };
  const capabilityResolver = { resolve: jest.fn() };

  let service: VsiMasterIntelligenceReadService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VsiMasterIntelligenceReadService(
      prisma as never,
      materialization as never,
      composer as never,
      revisionHistory as never,
      capabilityResolver as never,
    );
  });

  it('rejects cross-org vehicle access', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.getFleetOverview('org-a', 'veh-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects source link on wrong vehicle', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
    prisma.vehicleDataSourceLink.findFirst.mockResolvedValue(null);
    await expect(service.getProfileDetail('org-a', 'veh-1', 'link-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns NOT_CAPTURED for revision history when P5-H1 capture is disabled', async () => {
    jest.spyOn(p5h1Config, 'isVsiP5h1ProfileRevisionHistoryCaptureEnabled').mockReturnValue(false);
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
    prisma.vehicleDataSourceLink.findFirst.mockResolvedValue({ id: 'link-1', provider: 'DIMO' });

    const page = await service.getRevisionHistoryPage({
      organizationId: 'org-a',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-1',
    });
    expect(page.captureStatus).toBe('NOT_CAPTURED');
    expect(page.items).toEqual([]);
    expect(revisionHistory.listRevisionsForLink).not.toHaveBeenCalled();
  });

  it('rejects invalid revision cursor', async () => {
    jest.spyOn(p5h1Config, 'isVsiP5h1ProfileRevisionHistoryCaptureEnabled').mockReturnValue(true);
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
    prisma.vehicleDataSourceLink.findFirst.mockResolvedValue({ id: 'link-1', provider: 'DIMO' });

    await expect(
      service.getRevisionHistoryPage({
        organizationId: 'org-a',
        vehicleId: 'veh-1',
        providerSourceLinkId: 'link-1',
        cursor: 'not-a-number',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
