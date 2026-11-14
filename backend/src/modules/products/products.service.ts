import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrganizationProduct,
  OrganizationProductVehicleAccessMode,
  OrgProductPlan,
  OrgProductStatus,
  ProductSlug,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  TRIAL: 'Trial',
  SUSPENDED: 'Inactive',
  CANCELLED: 'Inactive',
};

const PLAN_LABELS: Record<string, string> = {
  STARTER: 'Starter',
  BUSINESS: 'Business',
  PROFESSIONAL: 'Professional',
  ENTERPRISE: 'Enterprise',
  CUSTOM: 'Custom',
};

export type OrganizationProductAdminView = {
  id: string;
  name: string;
  status: string;
  plan: string;
  productSlug: ProductSlug;
  vehicleAccessMode: OrganizationProductVehicleAccessMode;
  statusCode: OrgProductStatus;
  planCode: OrgProductPlan;
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masterAdminAudit: MasterAdminAuditService,
  ) {}

  async findAll() {
    const products = await this.prisma.product.findMany({
      include: {
        organizationProducts: {
          where: { status: { in: ['ACTIVE', 'TRIAL'] } },
          select: { id: true },
        },
      },
      orderBy: { slug: 'asc' },
    });

    return products.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description ?? '',
      organizationsCount: p.organizationProducts.length,
    }));
  }

  async findOrgProducts(orgId: string): Promise<OrganizationProductAdminView[]> {
    const orgProducts = await this.prisma.organizationProduct.findMany({
      where: { organizationId: orgId },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });

    return orgProducts.map((op) => ({
      id: op.id,
      name: op.product.name,
      status: STATUS_LABELS[op.status] ?? op.status,
      plan: PLAN_LABELS[op.plan] ?? op.plan,
      productSlug: op.product.slug,
      vehicleAccessMode: op.vehicleAccessMode,
      statusCode: op.status,
      planCode: op.plan,
    }));
  }

  async getProductStats() {
    const products = await this.prisma.product.findMany({
      include: {
        organizationProducts: {
          select: { status: true },
        },
      },
      orderBy: { slug: 'asc' },
    });

    return products.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      totalOrgs: p.organizationProducts.length,
      active: p.organizationProducts.filter((op) => op.status === 'ACTIVE').length,
      trial: p.organizationProducts.filter((op) => op.status === 'TRIAL').length,
    }));
  }

  async assignProduct(input: {
    orgId: string;
    productSlug: string;
    plan?: string;
    vehicleAccessMode: OrganizationProductVehicleAccessMode;
    actorUserId: string;
    audit?: { correlationId: string; route?: string; ipAddress?: string; userAgent?: string };
  }): Promise<OrganizationProduct> {
    const product = await this.prisma.product.findUnique({
      where: { slug: input.productSlug as ProductSlug },
    });
    if (!product) {
      throw new NotFoundException(`Product with slug "${input.productSlug}" not found`);
    }

    const planValue = (input.plan as OrgProductPlan) || OrgProductPlan.STARTER;

    const existing = await this.prisma.organizationProduct.findUnique({
      where: {
        organizationId_productId: { organizationId: input.orgId, productId: product.id },
      },
    });

    if (existing) {
      if (existing.vehicleAccessMode !== input.vehicleAccessMode) {
        throw new BadRequestException(
          'vehicleAccessMode cannot be changed via assign; use PATCH vehicle-access-mode',
        );
      }
      const willMutate =
        existing.plan !== planValue || existing.status !== OrgProductStatus.ACTIVE;
      if (!willMutate) {
        return existing;
      }
      const updated = await this.prisma.organizationProduct.update({
        where: { id: existing.id },
        data: {
          plan: planValue,
          status: OrgProductStatus.ACTIVE,
        },
      });
      if (input.audit) {
        await this.masterAdminAudit.record({
          auditAction: MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
          actorUserId: input.actorUserId,
          actorPlatformRole: 'MASTER_ADMIN',
          targetOrganizationId: input.orgId,
          entityId: updated.id,
          description: `Organization product reassigned (${input.productSlug})`,
          correlationId: input.audit.correlationId,
          route: input.audit.route,
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
          changeSummary: 'reassign',
          before: { plan: existing.plan, status: existing.status },
          after: { plan: updated.plan, status: updated.status },
          metadata: {
            domain: 'organization_product',
            action: 'reassign',
            productSlug: input.productSlug,
            vehicleAccessMode: existing.vehicleAccessMode,
          },
        });
      }
      return updated;
    }

    const created = await this.prisma.organizationProduct.create({
      data: {
        organizationId: input.orgId,
        productId: product.id,
        plan: planValue,
        status: OrgProductStatus.ACTIVE,
        vehicleAccessMode: input.vehicleAccessMode,
        activatedAt: new Date(),
      },
    });

    if (input.audit) {
      await this.masterAdminAudit.record({
        auditAction: MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
        actorUserId: input.actorUserId,
        actorPlatformRole: 'MASTER_ADMIN',
        targetOrganizationId: input.orgId,
        entityId: created.id,
        description: `Organization product assigned (${input.productSlug}) with vehicle access mode ${input.vehicleAccessMode}`,
        correlationId: input.audit.correlationId,
        route: input.audit.route,
        ipAddress: input.audit.ipAddress,
        userAgent: input.audit.userAgent,
        changeSummary: 'assign',
        after: {
          productSlug: input.productSlug,
          vehicleAccessMode: input.vehicleAccessMode,
          status: created.status,
        },
        metadata: { domain: 'organization_product', action: 'assign' },
      });
    }

    return created;
  }

  async updateVehicleAccessMode(input: {
    orgId: string;
    productSlug: string;
    vehicleAccessMode: OrganizationProductVehicleAccessMode;
    ifCurrentVehicleAccessMode: OrganizationProductVehicleAccessMode;
    actorUserId: string;
    audit?: { correlationId: string; route?: string; ipAddress?: string; userAgent?: string };
  }): Promise<OrganizationProduct> {
    const product = await this.prisma.product.findUnique({
      where: { slug: input.productSlug as ProductSlug },
    });
    if (!product) {
      throw new NotFoundException(`Product with slug "${input.productSlug}" not found`);
    }

    const orgProduct = await this.prisma.organizationProduct.findUnique({
      where: {
        organizationId_productId: { organizationId: input.orgId, productId: product.id },
      },
    });
    if (!orgProduct) {
      throw new NotFoundException('Organization product assignment not found');
    }

    if (orgProduct.vehicleAccessMode !== input.ifCurrentVehicleAccessMode) {
      throw new ConflictException(
        `Vehicle access mode expectation mismatch; expected ${input.ifCurrentVehicleAccessMode}, found ${orgProduct.vehicleAccessMode}`,
      );
    }

    if (orgProduct.vehicleAccessMode === input.vehicleAccessMode) {
      return orgProduct;
    }

    const updated = await this.prisma.organizationProduct.updateMany({
      where: {
        id: orgProduct.id,
        organizationId: input.orgId,
        vehicleAccessMode: input.ifCurrentVehicleAccessMode,
      },
      data: {
        vehicleAccessMode: input.vehicleAccessMode,
      },
    });

    if (updated.count !== 1) {
      const current = await this.prisma.organizationProduct.findUnique({ where: { id: orgProduct.id } });
      if (!current) {
        throw new NotFoundException('Organization product assignment not found');
      }
      throw new ConflictException(
        `Vehicle access mode changed concurrently; expected ${input.ifCurrentVehicleAccessMode}, found ${current.vehicleAccessMode}`,
      );
    }

    const result = await this.prisma.organizationProduct.findUniqueOrThrow({
      where: { id: orgProduct.id },
    });

    if (
      input.audit &&
      input.vehicleAccessMode === OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE
    ) {
      await this.masterAdminAudit.record({
        auditAction: MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
        actorUserId: input.actorUserId,
        actorPlatformRole: 'MASTER_ADMIN',
        targetOrganizationId: input.orgId,
        entityId: result.id,
        description: `Organization product vehicle access mode broadened to ORGANIZATION_WIDE (${input.productSlug})`,
        correlationId: input.audit.correlationId,
        route: input.audit.route,
        ipAddress: input.audit.ipAddress,
        userAgent: input.audit.userAgent,
        changeSummary: 'vehicle-access-mode-broaden',
        before: { vehicleAccessMode: input.ifCurrentVehicleAccessMode },
        after: { vehicleAccessMode: input.vehicleAccessMode },
        metadata: { domain: 'organization_product', action: 'vehicle_access_mode_patch' },
      });
    } else if (input.audit) {
      await this.masterAdminAudit.record({
        auditAction: MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
        actorUserId: input.actorUserId,
        actorPlatformRole: 'MASTER_ADMIN',
        targetOrganizationId: input.orgId,
        entityId: result.id,
        description: `Organization product vehicle access mode set to ${input.vehicleAccessMode} (${input.productSlug})`,
        correlationId: input.audit.correlationId,
        route: input.audit.route,
        ipAddress: input.audit.ipAddress,
        userAgent: input.audit.userAgent,
        changeSummary: 'vehicle-access-mode-narrow',
        before: { vehicleAccessMode: input.ifCurrentVehicleAccessMode },
        after: { vehicleAccessMode: input.vehicleAccessMode },
        metadata: { domain: 'organization_product', action: 'vehicle_access_mode_patch' },
      });
    }

    return result;
  }

  async removeProduct(
    orgId: string,
    productSlug: string,
    actorUserId: string,
    audit?: { correlationId: string; route?: string; ipAddress?: string; userAgent?: string },
  ): Promise<OrganizationProduct> {
    const product = await this.prisma.product.findUnique({
      where: { slug: productSlug as ProductSlug },
    });
    if (!product) {
      throw new NotFoundException(`Product with slug "${productSlug}" not found`);
    }

    const orgProduct = await this.prisma.organizationProduct.findUnique({
      where: {
        organizationId_productId: { organizationId: orgId, productId: product.id },
      },
    });
    if (!orgProduct) {
      throw new NotFoundException('Organization product assignment not found');
    }

    if (audit) {
      await this.masterAdminAudit.record({
        auditAction: MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
        actorUserId,
        actorPlatformRole: 'MASTER_ADMIN',
        targetOrganizationId: orgId,
        entityId: orgProduct.id,
        description: `Organization product removed (${productSlug}); vehicle grants remain dormant until explicit cleanup`,
        correlationId: audit.correlationId,
        route: audit.route,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
        changeSummary: 'remove',
        before: {
          vehicleAccessMode: orgProduct.vehicleAccessMode,
          status: orgProduct.status,
        },
        metadata: { domain: 'organization_product', action: 'remove', dormantGrants: true },
      });
    }

    return this.prisma.organizationProduct.delete({
      where: { id: orgProduct.id },
    });
  }
}