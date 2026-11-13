import { NotFoundException } from '@nestjs/common';
import { FuelType, ProductSlug, VehicleRegistryLifecycle } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { Test } from '@nestjs/testing';
import { parseCoreVehicleReadPagination } from './core-vehicle-read.pagination';
import { CORE_VEHICLE_IDENTITY_V1_SELECT, CoreVehicleReadV1Service } from './core-vehicle-read.v1.service';
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

      const pagination = parseCoreVehicleReadPagination('1', '1');
      const result = await service.listForOrganization(ORG, ProductSlug.RENTAL, pagination);

      expect(prisma.vehicle.findMany).toHaveBeenCalledWith({
        where: { organizationId: ORG },
        select: CORE_VEHICLE_IDENTITY_V1_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 1,
      });
      expect(prisma.vehicle.findMany.mock.calls[0][0].where).toEqual({ organizationId: ORG });
      expect(result.version).toBe(CORE_VEHICLE_READ_CONTRACT_VERSION);
      expect(result.organizationId).toBe(ORG);
      expect(result.productSlug).toBe(ProductSlug.RENTAL);
      expect(result.vehicles).toHaveLength(1);
      expect(result.pagination).toMatchObject({ total: 3, page: 1, limit: 1, totalPages: 3 });
    });

    it('does not filter vehicles by product — org-wide registry only', async () => {
      prisma.vehicle.count.mockResolvedValue(0);
      prisma.vehicle.findMany.mockResolvedValue([]);
      const pagination = parseCoreVehicleReadPagination();
      await service.listForOrganization(ORG, ProductSlug.FLEET, pagination);
      expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: ORG },
        }),
      );
      const where = prisma.vehicle.findMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(where).not.toHaveProperty('product');
      expect(where).not.toHaveProperty('productSlug');
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
