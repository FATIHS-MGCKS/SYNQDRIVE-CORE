import { NotFoundException } from '@nestjs/common';
import { OrgProductPlan, OrgProductStatus, ProductSlug } from '@prisma/client';
import { EntitlementsQueryService } from './entitlements-query.service';

describe('EntitlementsQueryService', () => {
  const orgId = 'org-1';
  const prisma = {
    organization: { findUnique: jest.fn() },
    organizationProduct: { findMany: jest.fn(), findFirst: jest.fn() },
  };
  let service: EntitlementsQueryService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new EntitlementsQueryService(prisma as any);
    prisma.organization.findUnique.mockResolvedValue({ id: orgId });
  });

  it('listForOrganization maps assigned products with capabilities', async () => {
    prisma.organizationProduct.findMany.mockResolvedValue([
      {
        productId: 'p1',
        status: OrgProductStatus.ACTIVE,
        plan: OrgProductPlan.STARTER,
        activatedAt: new Date('2026-01-01T00:00:00.000Z'),
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        product: { id: 'p1', slug: ProductSlug.RENTAL, name: 'Rental' },
      },
    ]);

    const result = await service.listForOrganization(orgId);
    expect(result.contractVersion).toBe('core.entitlements.v1');
    expect(result.m2mProductionReady).toBe(false);
    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({
      entitled: true,
      productSlug: ProductSlug.RENTAL,
      capabilities: { canAccessProductUi: true, canActivateVehicles: true },
    });
  });

  it('throws when organization does not exist', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);
    await expect(service.listForOrganization('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns unassigned record for missing product slug assignment', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue(null);
    const result = await service.getForOrganizationProduct(orgId, ProductSlug.RENTAL);
    expect(result.entitled).toBe(false);
    expect(result.status).toBeNull();
    expect(result.capabilities.canAccessProductUi).toBe(false);
  });

  it('rejects unknown product slug', async () => {
    await expect(service.getForOrganizationProduct(orgId, 'VYMOD')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('exposes licenseTermExpired without revoking ACTIVE capabilities (expiresAt not enforced)', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue({
      productId: 'p1',
      status: OrgProductStatus.ACTIVE,
      plan: OrgProductPlan.STARTER,
      activatedAt: new Date('2026-01-01T00:00:00.000Z'),
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      product: { id: 'p1', slug: ProductSlug.RENTAL, name: 'Rental' },
    });

    const result = await service.getForOrganizationProduct(orgId, ProductSlug.RENTAL);
    expect(result.licenseTermExpired).toBe(true);
    expect(result.expiresAtPolicy).toBe('NOT_ENFORCED_STATUS_ONLY_PARITY');
    expect(result.capabilities).toEqual({
      canAccessProductUi: true,
      canActivateVehicles: true,
    });
  });
});
