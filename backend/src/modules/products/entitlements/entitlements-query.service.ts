import { Injectable, NotFoundException } from '@nestjs/common';
import { OrgProductPlan, OrgProductStatus, ProductSlug } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  isEntitledForAnyAccess,
  isOrganizationProductLicenseTermExpired,
  ORGANIZATION_PRODUCT_EXPIRES_AT_POLICY,
  resolveEntitlementCapabilities,
} from './entitlements-policy';
import {
  CORE_ENTITLEMENTS_CONTRACT_VERSION,
  resolveCoreEntitlementsM2mProductionReady,
  type EntitlementOrganizationListV1,
  type EntitlementProductRecordV1,
} from './entitlements-query.types';

function isProductSlug(value: string): value is ProductSlug {
  return (Object.values(ProductSlug) as string[]).includes(value);
}

@Injectable()
export class EntitlementsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async assertOrganizationExists(organizationId: string): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
  }

  async listForOrganization(organizationId: string): Promise<EntitlementOrganizationListV1> {
    await this.assertOrganizationExists(organizationId);

    const rows = await this.prisma.organizationProduct.findMany({
      where: { organizationId },
      include: { product: true },
      orderBy: { product: { slug: 'asc' } },
    });

    const products = rows.map((row) => this.mapRow(organizationId, row));

    return {
      contractVersion: CORE_ENTITLEMENTS_CONTRACT_VERSION,
      organizationId,
      m2mProductionReady: resolveCoreEntitlementsM2mProductionReady(),
      products,
    };
  }

  async getForOrganizationProduct(
    organizationId: string,
    productSlug: string,
  ): Promise<EntitlementProductRecordV1> {
    if (!isProductSlug(productSlug)) {
      throw new NotFoundException(`Unknown product slug "${productSlug}"`);
    }

    await this.assertOrganizationExists(organizationId);

    const row = await this.prisma.organizationProduct.findFirst({
      where: {
        organizationId,
        product: { slug: productSlug },
      },
      include: { product: true },
    });

    if (!row) {
      return this.unassignedRecord(organizationId, productSlug);
    }

    return this.mapRow(organizationId, row);
  }

  private mapRow(
    organizationId: string,
    row: {
      productId: string;
      status: OrgProductStatus;
      plan: OrgProductPlan;
      activatedAt: Date | null;
      expiresAt: Date | null;
      product: { id: string; slug: ProductSlug; name: string };
    },
  ): EntitlementProductRecordV1 {
    const capabilities = resolveEntitlementCapabilities(row.status);
    const licenseTermExpired = isOrganizationProductLicenseTermExpired(row.expiresAt);
    return {
      contractVersion: CORE_ENTITLEMENTS_CONTRACT_VERSION,
      organizationId,
      productSlug: row.product.slug,
      productId: row.product.id,
      productName: row.product.name,
      entitled: isEntitledForAnyAccess(row.status),
      status: row.status,
      plan: row.plan,
      activatedAt: row.activatedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      licenseTermExpired,
      capabilities,
      expiresAtPolicy: ORGANIZATION_PRODUCT_EXPIRES_AT_POLICY,
    };
  }

  private unassignedRecord(
    organizationId: string,
    productSlug: ProductSlug,
  ): EntitlementProductRecordV1 {
    const capabilities = resolveEntitlementCapabilities(null);
    return {
      contractVersion: CORE_ENTITLEMENTS_CONTRACT_VERSION,
      organizationId,
      productSlug,
      productId: null,
      productName: null,
      entitled: false,
      status: null,
      plan: null,
      activatedAt: null,
      expiresAt: null,
      licenseTermExpired: false,
      capabilities,
      expiresAtPolicy: ORGANIZATION_PRODUCT_EXPIRES_AT_POLICY,
    };
  }
}
