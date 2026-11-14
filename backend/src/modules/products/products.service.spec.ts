import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  OrganizationProductVehicleAccessMode,
  OrgProductPlan,
  OrgProductStatus,
  ProductSlug,
} from '@prisma/client';
import { ProductsService } from './products.service';

describe('ProductsService — vehicle access mode', () => {
  const masterAdminAudit = { record: jest.fn().mockResolvedValue(undefined) };

  const prisma = {
    product: { findUnique: jest.fn() },
    organizationProduct: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      delete: jest.fn(),
    },
  };

  let service: ProductsService;
  const ORG = 'org-1';
  const PID = 'prod-rental';
  const ADMIN = 'admin-1';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProductsService(prisma as never, masterAdminAudit as never);
    prisma.product.findUnique.mockResolvedValue({ id: PID, slug: ProductSlug.RENTAL });
  });

  it('creates assignment with explicit vehicleAccessMode', async () => {
    prisma.organizationProduct.findUnique.mockResolvedValue(null);
    prisma.organizationProduct.create.mockResolvedValue({
      id: 'op-1',
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      status: OrgProductStatus.ACTIVE,
    });

    const row = await service.assignProduct({
      orgId: ORG,
      productSlug: ProductSlug.RENTAL,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      actorUserId: ADMIN,
    });

    expect(row.vehicleAccessMode).toBe(OrganizationProductVehicleAccessMode.SELECTED_VEHICLES);
    expect(prisma.organizationProduct.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
        }),
      }),
    );
  });

  it('reassignment preserves mode and rejects mode change via assign', async () => {
    prisma.organizationProduct.findUnique.mockResolvedValue({
      id: 'op-1',
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      plan: OrgProductPlan.STARTER,
      status: OrgProductStatus.ACTIVE,
    });
    await expect(
      service.assignProduct({
        orgId: ORG,
        productSlug: ProductSlug.RENTAL,
        vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
        actorUserId: ADMIN,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('audits reassignment when plan or status mutates', async () => {
    prisma.organizationProduct.findUnique.mockResolvedValue({
      id: 'op-1',
      vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      plan: OrgProductPlan.STARTER,
      status: OrgProductStatus.SUSPENDED,
    });
    prisma.organizationProduct.update.mockResolvedValue({
      id: 'op-1',
      plan: OrgProductPlan.BUSINESS,
      status: OrgProductStatus.ACTIVE,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
    });

    await service.assignProduct({
      orgId: ORG,
      productSlug: ProductSlug.RENTAL,
      plan: OrgProductPlan.BUSINESS,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      actorUserId: ADMIN,
      audit: { correlationId: 'c-reassign' },
    });

    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        changeSummary: 'reassign',
        targetOrganizationId: ORG,
        actorUserId: ADMIN,
        correlationId: 'c-reassign',
      }),
    );
  });

  it('does not audit reassignment no-op', async () => {
    prisma.organizationProduct.findUnique.mockResolvedValue({
      id: 'op-1',
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      plan: OrgProductPlan.STARTER,
      status: OrgProductStatus.ACTIVE,
    });
    await service.assignProduct({
      orgId: ORG,
      productSlug: ProductSlug.RENTAL,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      actorUserId: ADMIN,
      audit: { correlationId: 'c-noop' },
    });
    expect(prisma.organizationProduct.update).not.toHaveBeenCalled();
    expect(masterAdminAudit.record).not.toHaveBeenCalled();
  });

  it('returns 409 when current=WIDE expected=SELECTED target=WIDE (CAS)', async () => {
    prisma.organizationProduct.findUnique.mockResolvedValue({
      id: 'op-1',
      vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
    });

    await expect(
      service.updateVehicleAccessMode({
        orgId: ORG,
        productSlug: ProductSlug.RENTAL,
        vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
        ifCurrentVehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
        actorUserId: ADMIN,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.organizationProduct.updateMany).not.toHaveBeenCalled();
  });

  it('returns idempotent success when current equals expected equals target', async () => {
    prisma.organizationProduct.findUnique.mockResolvedValue({
      id: 'op-1',
      vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
    });

    const row = await service.updateVehicleAccessMode({
      orgId: ORG,
      productSlug: ProductSlug.RENTAL,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      ifCurrentVehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      actorUserId: ADMIN,
      audit: { correlationId: 'c-idem' },
    });

    expect(row.vehicleAccessMode).toBe(OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE);
    expect(prisma.organizationProduct.updateMany).not.toHaveBeenCalled();
    expect(masterAdminAudit.record).not.toHaveBeenCalled();
  });

  it('returns 409 on conflicting mode PATCH after failed updateMany', async () => {
    prisma.organizationProduct.findUnique
      .mockResolvedValueOnce({
        id: 'op-1',
        vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      })
      .mockResolvedValueOnce({
        id: 'op-1',
        vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      });
    prisma.organizationProduct.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateVehicleAccessMode({
        orgId: ORG,
        productSlug: ProductSlug.RENTAL,
        vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
        ifCurrentVehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
        actorUserId: ADMIN,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('audits broadening to ORGANIZATION_WIDE', async () => {
    prisma.organizationProduct.findUnique.mockResolvedValue({
      id: 'op-1',
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
    });
    prisma.organizationProduct.updateMany.mockResolvedValue({ count: 1 });
    prisma.organizationProduct.findUniqueOrThrow.mockResolvedValue({
      id: 'op-1',
      vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
    });

    await service.updateVehicleAccessMode({
      orgId: ORG,
      productSlug: ProductSlug.RENTAL,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      ifCurrentVehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      actorUserId: ADMIN,
      audit: { correlationId: 'c-1' },
    });

    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ changeSummary: 'vehicle-access-mode-broaden' }),
    );
  });

  it('audits narrowing ORGANIZATION_WIDE -> SELECTED_VEHICLES', async () => {
    prisma.organizationProduct.findUnique.mockResolvedValue({
      id: 'op-1',
      vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
    });
    prisma.organizationProduct.updateMany.mockResolvedValue({ count: 1 });
    prisma.organizationProduct.findUniqueOrThrow.mockResolvedValue({
      id: 'op-1',
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
    });

    await service.updateVehicleAccessMode({
      orgId: ORG,
      productSlug: ProductSlug.RENTAL,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      ifCurrentVehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      actorUserId: ADMIN,
      audit: { correlationId: 'c-narrow' },
    });

    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        changeSummary: 'vehicle-access-mode-narrow',
        actorUserId: ADMIN,
        targetOrganizationId: ORG,
        correlationId: 'c-narrow',
        before: { vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE },
        after: { vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES },
      }),
    );
  });
});