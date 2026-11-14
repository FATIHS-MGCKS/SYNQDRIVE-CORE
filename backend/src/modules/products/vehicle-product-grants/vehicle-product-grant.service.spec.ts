import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  OrgProductStatus,
  ProductSlug,
  VehicleProductGrantStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { VehicleProductGrantService } from './vehicle-product-grant.service';

const ORG = 'org-a';
const VEH = 'veh-x';
const ADMIN = 'admin-1';

describe('VehicleProductGrantService', () => {
  const masterAdminAudit = { record: jest.fn().mockResolvedValue(undefined) };
  const grants: Record<string, unknown>[] = [];

  const prisma = {
    organizationProduct: {
      findFirst: jest.fn(),
    },
    vehicle: {
      findFirst: jest.fn(),
    },
    vehicleProductGrant: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };

  let service: VehicleProductGrantService;

  beforeEach(() => {
    jest.clearAllMocks();
    grants.length = 0;
    service = new VehicleProductGrantService(prisma as never, masterAdminAudit as never);
    prisma.organizationProduct.findFirst.mockResolvedValue({ id: 'op-1' });
    prisma.vehicle.findFirst.mockResolvedValue({
      id: VEH,
      organizationId: ORG,
      registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
    });
  });

  it('grants Product A to Vehicle X', async () => {
    prisma.vehicleProductGrant.findUnique.mockResolvedValue(null);
    prisma.vehicleProductGrant.upsert.mockResolvedValue({
      id: 'g1',
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      status: VehicleProductGrantStatus.ACTIVE,
      grantVersion: 1,
      grantedAt: new Date(),
      revokedAt: null,
      grantedByUserId: ADMIN,
      revokedByUserId: null,
    });

    const row = await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
    });

    expect(row.productSlug).toBe(ProductSlug.RENTAL);
    expect(row.status).toBe(VehicleProductGrantStatus.ACTIVE);
  });

  it('Product B has no active grant unless created', async () => {
    prisma.vehicleProductGrant.findFirst.mockResolvedValue(null);
    const ok = await service.hasActiveGrant(ORG, VEH, ProductSlug.FLEET);
    expect(ok).toBe(false);
  });

  it('Vehicle X can hold multiple product grants', async () => {
    prisma.vehicleProductGrant.findFirst
      .mockResolvedValueOnce({ id: 'g-rental' })
      .mockResolvedValueOnce({ id: 'g-fleet' });

    await expect(service.hasActiveGrant(ORG, VEH, ProductSlug.RENTAL)).resolves.toBe(true);
    await expect(service.hasActiveGrant(ORG, VEH, ProductSlug.FLEET)).resolves.toBe(true);
  });

  it('revokes Product A grant', async () => {
    prisma.vehicleProductGrant.findUnique.mockResolvedValue({
      id: 'g1',
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      status: VehicleProductGrantStatus.ACTIVE,
      grantVersion: 1,
    });
    prisma.vehicleProductGrant.update.mockResolvedValue({
      id: 'g1',
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      status: VehicleProductGrantStatus.REVOKED,
      grantVersion: 1,
      grantedAt: new Date(),
      revokedAt: new Date(),
      grantedByUserId: ADMIN,
      revokedByUserId: ADMIN,
    });

    const row = await service.revokeGrant({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      revokedByUserId: ADMIN,
    });
    expect(row.status).toBe(VehicleProductGrantStatus.REVOKED);
  });

  it('explicit re-grant after revocation bumps grantVersion', async () => {
    prisma.vehicleProductGrant.findUnique.mockResolvedValue({
      id: 'g1',
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      status: VehicleProductGrantStatus.REVOKED,
      grantVersion: 2,
    });
    prisma.vehicleProductGrant.upsert.mockResolvedValue({
      id: 'g1',
      grantVersion: 3,
      status: VehicleProductGrantStatus.ACTIVE,
      productSlug: ProductSlug.RENTAL,
      vehicleId: VEH,
      organizationId: ORG,
      grantedAt: new Date(),
      revokedAt: null,
      grantedByUserId: ADMIN,
      revokedByUserId: null,
    });

    const row = await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
    });
    expect(row.grantVersion).toBe(3);
    expect(prisma.vehicleProductGrant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ grantVersion: 3 }),
      }),
    );
  });

  it('rejects foreign-org vehicle binding as not found', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: VEH,
      organizationId: 'other-org',
      registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
    });
    await expect(
      service.grantExplicit({
        organizationId: ORG,
        vehicleId: VEH,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: ADMIN,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects grant when organization product is inactive', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue(null);
    await expect(
      service.grantExplicit({
        organizationId: ORG,
        vehicleId: VEH,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: ADMIN,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects offboarded vehicle', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: VEH,
      organizationId: ORG,
      registryLifecycle: VehicleRegistryLifecycle.OFFBOARDED,
    });
    await expect(
      service.grantExplicit({
        organizationId: ORG,
        vehicleId: VEH,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: ADMIN,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('idempotent revoke when already revoked', async () => {
    const revoked = {
      id: 'g1',
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      status: VehicleProductGrantStatus.REVOKED,
      grantVersion: 1,
      grantedAt: new Date(),
      revokedAt: new Date(),
      grantedByUserId: ADMIN,
      revokedByUserId: ADMIN,
    };
    prisma.vehicleProductGrant.findUnique.mockResolvedValue(revoked);
    const row = await service.revokeGrant({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      revokedByUserId: ADMIN,
    });
    expect(row).toBe(revoked);
    expect(prisma.vehicleProductGrant.update).not.toHaveBeenCalled();
  });

  it('hasActiveGrant is false immediately after revoke semantics', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: VEH,
      organizationId: ORG,
      registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
    });
    prisma.vehicleProductGrant.findFirst.mockResolvedValue(null);
    await expect(service.hasActiveGrant(ORG, VEH, ProductSlug.RENTAL)).resolves.toBe(false);
  });

  it('listGrantedVehicles scopes by organization and product', async () => {
    prisma.vehicleProductGrant.findMany.mockResolvedValue([
      { vehicleId: VEH, productSlug: ProductSlug.RENTAL, status: VehicleProductGrantStatus.ACTIVE, grantVersion: 1, grantedAt: new Date(), revokedAt: null },
    ]);
    await service.listGrantedVehicles(ORG, ProductSlug.RENTAL);
    expect(prisma.vehicleProductGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG,
          productSlug: ProductSlug.RENTAL,
          status: VehicleProductGrantStatus.ACTIVE,
        }),
      }),
    );
  });

  it('does not treat suspended org product as entitled for new grants', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue(null);
    await expect(
      service.grantExplicit({
        organizationId: ORG,
        vehicleId: VEH,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: ADMIN,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.organizationProduct.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: OrgProductStatus.ACTIVE }),
      }),
    );
  });
});