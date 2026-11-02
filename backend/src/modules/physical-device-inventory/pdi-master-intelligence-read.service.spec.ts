import { NotFoundException } from '@nestjs/common';
import { PdiMasterIntelligenceReadService } from './pdi-master-intelligence-read.service';

describe('PdiMasterIntelligenceReadService scope', () => {
  const prisma = {
    physicalDevice: { findUnique: jest.fn() },
    physicalDeviceAssignment: { findFirst: jest.fn() },
    vehicle: { findFirst: jest.fn(), findUnique: jest.fn() },
    deviceConnectionEpisode: { findMany: jest.fn() },
    vehicleDataSourceLink: { findMany: jest.fn() },
  };
  const inventory = { getDeviceDetail: jest.fn() };

  let service: PdiMasterIntelligenceReadService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PdiMasterIntelligenceReadService(prisma as never, inventory as never);
  });

  it('denies cross-organization device scope', async () => {
    prisma.physicalDevice.findUnique.mockResolvedValue({
      ownerOrganizationId: 'org-a',
      assignments: [],
    });
    await expect(service.getDeviceIntelligence('dev-1', 'org-b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
