import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrgProductStatus,
  ProductSlug,
  VehicleProductGrantStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import type { VehicleProductGrantListItem, VehicleProductGrantRecord } from './vehicle-product-grant.types';

const GRANT_ELIGIBLE_REGISTRY_LIFECYCLES: VehicleRegistryLifecycle[] = [VehicleRegistryLifecycle.ACTIVE];

@Injectable()
export class VehicleProductGrantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masterAdminAudit: MasterAdminAuditService,
  ) {}

  async grantExplicit(input: {
    organizationId: string;
    vehicleId: string;
    productSlug: ProductSlug;
    grantedByUserId: string;
    audit?: { correlationId: string; route?: string; ipAddress?: string; userAgent?: string };
  }): Promise<VehicleProductGrantRecord> {
    await this.assertOrganizationProductActive(input.organizationId, input.productSlug);
    const vehicle = await this.loadGrantEligibleVehicle(input.organizationId, input.vehicleId);

    const existing = await this.prisma.vehicleProductGrant.findUnique({
      where: {
        vehicleId_productSlug: {
          vehicleId: input.vehicleId,
          productSlug: input.productSlug,
        },
      },
    });

    if (existing?.status === VehicleProductGrantStatus.ACTIVE) {
      this.assertGrantOrganizationBinding(existing.organizationId, input.organizationId, vehicle.id);
      return existing;
    }

    const now = new Date();
    const record = await this.prisma.vehicleProductGrant.upsert({
      where: {
        vehicleId_productSlug: {
          vehicleId: input.vehicleId,
          productSlug: input.productSlug,
        },
      },
      create: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        productSlug: input.productSlug,
        status: VehicleProductGrantStatus.ACTIVE,
        grantVersion: 1,
        grantedAt: now,
        grantedByUserId: input.grantedByUserId,
      },
      update: {
        organizationId: input.organizationId,
        status: VehicleProductGrantStatus.ACTIVE,
        grantVersion: (existing?.grantVersion ?? 0) + 1,
        grantedAt: now,
        grantedByUserId: input.grantedByUserId,
        revokedAt: null,
        revokedByUserId: null,
      },
    });

    if (input.audit) {
      await this.masterAdminAudit.record({
        auditAction: MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
        actorUserId: input.grantedByUserId,
        actorPlatformRole: 'MASTER_ADMIN',
        targetOrganizationId: input.organizationId,
        entityId: record.id,
        description: `Vehicle product grant activated (${input.productSlug}) for vehicle ${input.vehicleId}`,
        correlationId: input.audit.correlationId,
        route: input.audit.route,
        ipAddress: input.audit.ipAddress,
        userAgent: input.audit.userAgent,
        changeSummary: existing?.status === VehicleProductGrantStatus.REVOKED ? 're-grant' : 'grant',
        after: {
          vehicleId: record.vehicleId,
          productSlug: record.productSlug,
          grantVersion: record.grantVersion,
        },
        metadata: { domain: 'vehicle_product_grant', action: 'grant' },
      });
    }

    return record;
  }

  async revokeGrant(input: {
    organizationId: string;
    vehicleId: string;
    productSlug: ProductSlug;
    revokedByUserId: string;
    audit?: { correlationId: string; route?: string; ipAddress?: string; userAgent?: string };
  }): Promise<VehicleProductGrantRecord> {
    const existing = await this.prisma.vehicleProductGrant.findUnique({
      where: {
        vehicleId_productSlug: {
          vehicleId: input.vehicleId,
          productSlug: input.productSlug,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Vehicle product grant not found');
    }

    if (existing.organizationId !== input.organizationId) {
      throw new NotFoundException('Vehicle product grant not found');
    }

    if (existing.status === VehicleProductGrantStatus.REVOKED) {
      return existing;
    }

    const now = new Date();
    const record = await this.prisma.vehicleProductGrant.update({
      where: { id: existing.id },
      data: {
        status: VehicleProductGrantStatus.REVOKED,
        revokedAt: now,
        revokedByUserId: input.revokedByUserId,
      },
    });

    if (input.audit) {
      await this.masterAdminAudit.record({
        auditAction: MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
        actorUserId: input.revokedByUserId,
        actorPlatformRole: 'MASTER_ADMIN',
        targetOrganizationId: input.organizationId,
        entityId: record.id,
        description: `Vehicle product grant revoked (${input.productSlug}) for vehicle ${input.vehicleId}`,
        correlationId: input.audit.correlationId,
        route: input.audit.route,
        ipAddress: input.audit.ipAddress,
        userAgent: input.audit.userAgent,
        changeSummary: 'revoke',
        before: { status: VehicleProductGrantStatus.ACTIVE },
        after: { status: VehicleProductGrantStatus.REVOKED, revokedAt: now },
        metadata: { domain: 'vehicle_product_grant', action: 'revoke' },
      });
    }

    return record;
  }

  async hasActiveGrant(
    organizationId: string,
    vehicleId: string,
    productSlug: ProductSlug,
  ): Promise<boolean> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true, registryLifecycle: true },
    });
    if (!vehicle || !GRANT_ELIGIBLE_REGISTRY_LIFECYCLES.includes(vehicle.registryLifecycle)) {
      return false;
    }

    const grant = await this.prisma.vehicleProductGrant.findFirst({
      where: {
        organizationId,
        vehicleId,
        productSlug,
        status: VehicleProductGrantStatus.ACTIVE,
      },
      select: { id: true },
    });
    return grant != null;
  }

  async listGrantedVehicles(
    organizationId: string,
    productSlug: ProductSlug,
    options?: { activeOnly?: boolean },
  ): Promise<VehicleProductGrantListItem[]> {
    const activeOnly = options?.activeOnly !== false;
    const rows = await this.prisma.vehicleProductGrant.findMany({
      where: {
        organizationId,
        productSlug,
        ...(activeOnly ? { status: VehicleProductGrantStatus.ACTIVE } : {}),
        vehicle: {
          organizationId,
          registryLifecycle: { in: GRANT_ELIGIBLE_REGISTRY_LIFECYCLES },
        },
      },
      select: {
        vehicleId: true,
        productSlug: true,
        status: true,
        grantVersion: true,
        grantedAt: true,
        revokedAt: true,
      },
      orderBy: [{ grantedAt: 'desc' }, { vehicleId: 'asc' }],
    });
    return rows;
  }

  private async assertOrganizationProductActive(
    organizationId: string,
    productSlug: ProductSlug,
  ): Promise<void> {
    const orgProduct = await this.prisma.organizationProduct.findFirst({
      where: {
        organizationId,
        product: { slug: productSlug },
        status: OrgProductStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!orgProduct) {
      throw new ForbiddenException(
        `Product license '${productSlug}' is not active for this organization`,
      );
    }
  }

  private async loadGrantEligibleVehicle(organizationId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId },
      select: { id: true, organizationId: true, registryLifecycle: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    if (vehicle.organizationId !== organizationId) {
      throw new NotFoundException('Vehicle not found');
    }
    if (!GRANT_ELIGIBLE_REGISTRY_LIFECYCLES.includes(vehicle.registryLifecycle)) {
      throw new BadRequestException(
        'Vehicle registry lifecycle does not allow product grants',
      );
    }
    return vehicle;
  }

  private assertGrantOrganizationBinding(
    grantOrganizationId: string,
    expectedOrganizationId: string,
    vehicleId: string,
  ): void {
    if (grantOrganizationId !== expectedOrganizationId) {
      throw new BadRequestException(
        `Grant organization mismatch for vehicle ${vehicleId}`,
      );
    }
  }
}