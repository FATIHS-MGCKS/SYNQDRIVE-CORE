import { NotFoundException } from '@nestjs/common';
import { OrganizationProductVehicleAccessMode, OrgProductStatus, ProductSlug } from '@prisma/client';
import { ProductVehicleAccessService } from '@modules/products/product-vehicle-access/product-vehicle-access.service';
import { CoreAppVehicleReadV1Service } from './core-app-vehicle-read.v1.service';

describe('CoreAppVehicleReadV1Service', () => {
  const prisma = {
    vehicle: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    organizationProduct: { findFirst: jest.fn() },
  };
  const pva = new ProductVehicleAccessService(prisma as never);
  let service: CoreAppVehicleReadV1Service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CoreAppVehicleReadV1Service(prisma as never, pva);
  });

  it('uses identical where for count and findMany', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue({
      id: 'op',
      status: OrgProductStatus.ACTIVE,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      product: { slug: ProductSlug.RENTAL },
    });
    prisma.vehicle.count.mockResolvedValue(0);
    prisma.vehicle.findMany.mockResolvedValue([]);
    await service.listForProduct('org-a', ProductSlug.RENTAL, { page: 1, limit: 20, skip: 0, take: 20 });
    const countWhere = prisma.vehicle.count.mock.calls[0][0].where;
    const findWhere = prisma.vehicle.findMany.mock.calls[0][0].where;
    expect(countWhere).toEqual(findWhere);
    expect(countWhere).toHaveProperty('vehicleProductGrants');
  });

  it('asserts vehicle authorization before detail fetch', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue({
      id: 'op',
      status: OrgProductStatus.ACTIVE,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      product: { slug: ProductSlug.RENTAL },
    });
    prisma.vehicle.findFirst
      .mockResolvedValueOnce({ id: 'veh-1' })
      .mockResolvedValueOnce({
        id: 'veh-1',
        make: 'VW',
        model: 'Golf',
        year: 2022,
        fuelType: 'GASOLINE',
        registryLifecycle: 'ACTIVE',
      });
    await service.getForProduct('org-a', 'veh-1', ProductSlug.RENTAL);
    expect(prisma.vehicle.findFirst).toHaveBeenCalledTimes(2);
  });

  it('returns not found when vehicle not authorized', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue({
      id: 'op',
      status: OrgProductStatus.ACTIVE,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      product: { slug: ProductSlug.RENTAL },
    });
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.getForProduct('org-a', 'veh-x', ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});