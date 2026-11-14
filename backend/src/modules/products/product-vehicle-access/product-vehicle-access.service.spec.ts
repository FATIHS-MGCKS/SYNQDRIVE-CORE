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
  const ORG_B = 'org-b';
  const VEH_1 = 'veh-1';
  const VEH_2 = 'veh-2';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProductVehicleAccessService(prisma as never);
  });

  const wideAccess = {
    organizationId: ORG_A,
    productSlug: ProductSlug.RENTAL,
    organizationProductId: 'op-1',
    vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
    licenseStatus: OrgProductStatus.ACTIVE,
  };

  const selectedAccess = {
    ...wideAccess,
    vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
  };

  it('rejects inactive OrganizationProduct', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue(null);
    await expect(service.resolveProductVehicleAccess(ORG_A, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('ORGANIZATION_WIDE where excludes grant predicate', () => {
    const where = service.buildAuthorizedVehicleWhere(wideAccess);
    expect(where.organizationId).toBe(ORG_A);
    expect(where.registryLifecycle).toEqual({ in: [VehicleRegistryLifecycle.ACTIVE] });
    expect(where).not.toHaveProperty('vehicleProductGrants');
  });

  it('SELECTED_VEHICLES where requires ACTIVE grant relation', () => {
    const where = service.buildAuthorizedVehicleWhere(selectedAccess);
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
      id: 'op-1',
      status: OrgProductStatus.ACTIVE,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      product: { slug: ProductSlug.RENTAL },
    });
    const access = await service.resolveProductVehicleAccess(ORG_A, ProductSlug.RENTAL);
    const where = service.buildAuthorizedVehicleWhere(access);
    prisma.vehicle.count.mockResolvedValue(0);
    const total = await prisma.vehicle.count({ where });
    expect(total).toBe(0);
  });

  it('assertVehicleAuthorized denies revoked grant under SELECTED', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue({
      id: 'op-1',
      status: OrgProductStatus.ACTIVE,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      product: { slug: ProductSlug.RENTAL },
    });
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.assertVehicleAuthorized(ORG_A, VEH_1, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('cross-organization vehicle denied as not found', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue({
      id: 'op-1',
      status: OrgProductStatus.ACTIVE,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      product: { slug: ProductSlug.RENTAL },
    });
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.assertVehicleAuthorized(ORG_A, VEH_1, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('offboarded vehicle excluded from wide where', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue({
      id: 'op-1',
      status: OrgProductStatus.ACTIVE,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      product: { slug: ProductSlug.RENTAL },
    });
    const access = await service.resolveProductVehicleAccess(ORG_A, ProductSlug.RENTAL);
    const where = service.buildAuthorizedVehicleWhere(access);
    prisma.vehicle.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if (args.where.registryLifecycle) {
        return null;
      }
      return { id: VEH_1 };
    });
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.assertVehicleAuthorized(ORG_A, VEH_1, ProductSlug.RENTAL, access)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(where.registryLifecycle).toEqual({ in: [VehicleRegistryLifecycle.ACTIVE] });
  });

  it('list filter uses same where for count and findMany', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue({
      id: 'op-1',
      status: OrgProductStatus.ACTIVE,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      product: { slug: ProductSlug.RENTAL },
    });
    const access = await service.resolveProductVehicleAccess(ORG_A, ProductSlug.RENTAL);
    const where = service.buildAuthorizedVehicleWhere(access);
    await prisma.vehicle.count({ where });
    await prisma.vehicle.findMany({ where, take: 10, skip: 0 });
    expect(prisma.vehicle.count).toHaveBeenCalledWith({ where });
    expect(prisma.vehicle.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
  });

  it('multi-product: FLEET selected does not authorize RENTAL grant vehicle', async () => {
    const fleetAccess = {
      organizationId: ORG_A,
      productSlug: ProductSlug.FLEET,
      organizationProductId: 'op-fleet',
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      licenseStatus: OrgProductStatus.ACTIVE,
    };
    const where = service.buildAuthorizedVehicleWhere(fleetAccess);
    expect(where.vehicleProductGrants).toEqual({
      some: {
        organizationId: ORG_A,
        productSlug: ProductSlug.FLEET,
        status: VehicleProductGrantStatus.ACTIVE,
      },
    });
  });
});