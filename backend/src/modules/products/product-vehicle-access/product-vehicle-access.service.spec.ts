import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  OrganizationProductVehicleAccessMode,
  OrgProductStatus,
  ProductSlug,
  VehicleProductGrantStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { ProductVehicleAccessService } from './product-vehicle-access.service';

describe('ProductVehicleAccessService', () => {
  const prisma = {
    organizationProduct: { findFirst: jest.fn() },
    vehicle: { findFirst: jest.fn(), count: jest.fn(), findMany: jest.fn() },
  };

  let service: ProductVehicleAccessService;
  const ORG_A = 'org-a';
  const VEH_1 = 'veh-1';

  const activeRentalOrgProduct = {
    id: 'op-1',
    status: OrgProductStatus.ACTIVE,
    vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
    product: { slug: ProductSlug.RENTAL },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProductVehicleAccessService(prisma as never);
  });

  it('rejects inactive OrganizationProduct on resolve', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue(null);
    await expect(service.resolveProductVehicleAccess(ORG_A, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('inactive license cannot authorize any vehicle via assert', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue(null);
    await expect(service.assertVehicleAuthorized(ORG_A, VEH_1, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.vehicle.findFirst).not.toHaveBeenCalled();
  });

  it('ORGANIZATION_WIDE where excludes grant predicate', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue({
      ...activeRentalOrgProduct,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
    });
    const where = await service.getAuthorizedVehicleWhere(ORG_A, ProductSlug.RENTAL);
    expect(where.organizationId).toBe(ORG_A);
    expect(where.registryLifecycle).toEqual({ in: [VehicleRegistryLifecycle.ACTIVE] });
    expect(where).not.toHaveProperty('vehicleProductGrants');
  });

  it('SELECTED_VEHICLES where requires ACTIVE grant relation', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue({
      ...activeRentalOrgProduct,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
    });
    const where = await service.getAuthorizedVehicleWhere(ORG_A, ProductSlug.RENTAL);
    expect(where.vehicleProductGrants).toEqual({
      some: {
        organizationId: ORG_A,
        productSlug: ProductSlug.RENTAL,
        status: VehicleProductGrantStatus.ACTIVE,
      },
    });
  });

  it('SELECTED with zero grants yields empty list when used as Prisma where', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue({
      ...activeRentalOrgProduct,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
    });
    const where = await service.getAuthorizedVehicleWhere(ORG_A, ProductSlug.RENTAL);
    prisma.vehicle.count.mockResolvedValue(0);
    const total = await prisma.vehicle.count({ where });
    expect(total).toBe(0);
  });

  it('assertVehicleAuthorized denies revoked grant under SELECTED', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue({
      ...activeRentalOrgProduct,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
    });
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.assertVehicleAuthorized(ORG_A, VEH_1, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('cross-organization vehicle denied as not found', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue(activeRentalOrgProduct);
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.assertVehicleAuthorized(ORG_A, VEH_1, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('offboarded vehicle excluded — assert denies without caller context', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue(activeRentalOrgProduct);
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.assertVehicleAuthorized(ORG_A, VEH_1, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.organizationProduct.findFirst).toHaveBeenCalled();
  });

  it('ARCHIVED lifecycle excluded from authorized where', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue(activeRentalOrgProduct);
    const where = await service.getAuthorizedVehicleWhere(ORG_A, ProductSlug.RENTAL);
    expect(where.registryLifecycle).toEqual({ in: [VehicleRegistryLifecycle.ACTIVE] });
    expect(where.registryLifecycle).not.toEqual(expect.objectContaining({ in: expect.arrayContaining([VehicleRegistryLifecycle.ARCHIVED]) }));
  });

  it('list filter uses same where for count and findMany', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue({
      ...activeRentalOrgProduct,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
    });
    const where = await service.getAuthorizedVehicleWhere(ORG_A, ProductSlug.RENTAL);
    await prisma.vehicle.count({ where });
    await prisma.vehicle.findMany({ where, take: 10, skip: 0 });
    expect(prisma.vehicle.count).toHaveBeenCalledWith({ where });
    expect(prisma.vehicle.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
  });

  it('wrong product grant cannot authorize vehicle — FLEET grant under RENTAL product', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue({
      ...activeRentalOrgProduct,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
    });
    const where = await service.getAuthorizedVehicleWhere(ORG_A, ProductSlug.RENTAL);
    expect(where.vehicleProductGrants).toEqual({
      some: {
        organizationId: ORG_A,
        productSlug: ProductSlug.RENTAL,
        status: VehicleProductGrantStatus.ACTIVE,
      },
    });
    expect(where.vehicleProductGrants).not.toEqual(
      expect.objectContaining({
        some: expect.objectContaining({ productSlug: ProductSlug.FLEET }),
      }),
    );
  });

  it('multi-product: FLEET selected does not authorize RENTAL grant vehicle', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue({
      id: 'op-fleet',
      status: OrgProductStatus.ACTIVE,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      product: { slug: ProductSlug.FLEET },
    });
    const where = await service.getAuthorizedVehicleWhere(ORG_A, ProductSlug.FLEET);
    expect(where.vehicleProductGrants).toEqual({
      some: {
        organizationId: ORG_A,
        productSlug: ProductSlug.FLEET,
        status: VehicleProductGrantStatus.ACTIVE,
      },
    });
  });

  it('assertVehicleAuthorized always resolves license from DB', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue(activeRentalOrgProduct);
    prisma.vehicle.findFirst.mockResolvedValue({ id: VEH_1 });
    await service.assertVehicleAuthorized(ORG_A, VEH_1, ProductSlug.RENTAL);
    expect(prisma.organizationProduct.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG_A,
          status: OrgProductStatus.ACTIVE,
        }),
      }),
    );
  });

  it('no preResolved bypass — public assert accepts only org, vehicle, productSlug', async () => {
    expect(service.assertVehicleAuthorized.length).toBe(3);
  });
});