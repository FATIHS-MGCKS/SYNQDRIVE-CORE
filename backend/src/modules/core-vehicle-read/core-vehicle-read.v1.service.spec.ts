import { NotFoundException } from '@nestjs/common';
import { FuelType, ProductSlug, VehicleRegistryLifecycle } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { Test } from '@nestjs/testing';
import { CoreVehicleReadV1Service } from './core-vehicle-read.v1.service';
import { CORE_VEHICLE_READ_CONTRACT_VERSION } from './core-vehicle-read.v1.types';

const ORG = 'org-a';
const vehicleRow = {
  id: 'veh-1',
  make: 'VW',
  model: 'Golf',
  year: 2022,
  fuelType: FuelType.GASOLINE,
  registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
};

describe('CoreVehicleReadV1Service', () => {
  let service: CoreVehicleReadV1Service;
  const prisma = {
    vehicle: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [CoreVehicleReadV1Service, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CoreVehicleReadV1Service);
  });

  describe('listForOrganization', () => {
    it('paginates and returns contract envelope', async () => {
      prisma.vehicle.count.mockResolvedValue(3);
      prisma.vehicle.findMany.mockResolvedValue([vehicleRow]);

      const result = await service.listForOrganization(ORG, ProductSlug.RENTAL, {
        page: 1,
        limit: 1,
      });

      expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: ORG },
          skip: 0,
          take: 1,
        }),
      );
      expect(result.version).toBe(CORE_VEHICLE_READ_CONTRACT_VERSION);
      expect(result.organizationId).toBe(ORG);
      expect(result.productSlug).toBe(ProductSlug.RENTAL);
      expect(result.vehicles).toHaveLength(1);
      expect(result.pagination.total).toBe(3);
    });
  });

  describe('getForOrganization', () => {
    it('throws when vehicle is not owned by organization', async () => {
      prisma.vehicle.findFirst.mockResolvedValue(null);
      await expect(
        service.getForOrganization(ORG, 'veh-foreign', ProductSlug.RENTAL),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns single vehicle DTO', async () => {
      prisma.vehicle.findFirst.mockResolvedValue(vehicleRow);
      const result = await service.getForOrganization(ORG, 'veh-1', ProductSlug.FLEET);
      expect(result.vehicle.vehicleId).toBe('veh-1');
      expect(result.productSlug).toBe(ProductSlug.FLEET);
    });
  });
});
