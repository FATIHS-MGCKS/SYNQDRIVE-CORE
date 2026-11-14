import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  OrganizationProductVehicleAccessMode,
  OrgProductStatus,
  ProductSlug,
  VehicleProductGrantStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { PRODUCT_VEHICLE_ACCESS_ELIGIBLE_LIFECYCLES } from './product-vehicle-access.policy';
import type { AuthorizedVehicleWhereInput, ResolvedProductVehicleAccess } from './product-vehicle-access.types';

@Injectable()
export class ProductVehicleAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveProductVehicleAccess(
    organizationId: string,
    productSlug: ProductSlug,
  ): Promise<ResolvedProductVehicleAccess> {
    const orgProduct = await this.prisma.organizationProduct.findFirst({
      where: {
        organizationId,
        product: { slug: productSlug },
        status: OrgProductStatus.ACTIVE,
      },
      select: {
        id: true,
        status: true,
        vehicleAccessMode: true,
        product: { select: { slug: true } },
      },
    });

    if (!orgProduct) {
      throw new ForbiddenException(
        `Product license '${productSlug}' is not active for this organization`,
      );
    }

    return {
      organizationId,
      productSlug: orgProduct.product.slug,
      organizationProductId: orgProduct.id,
      vehicleAccessMode: orgProduct.vehicleAccessMode,
      licenseStatus: orgProduct.status,
    };
  }

  buildAuthorizedVehicleWhere(
    access: ResolvedProductVehicleAccess,
  ): AuthorizedVehicleWhereInput {
    const base: AuthorizedVehicleWhereInput = {
      organizationId: access.organizationId,
      registryLifecycle: { in: PRODUCT_VEHICLE_ACCESS_ELIGIBLE_LIFECYCLES },
    };

    if (access.vehicleAccessMode === OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE) {
      return base;
    }

    return {
      ...base,
      vehicleProductGrants: {
        some: {
          organizationId: access.organizationId,
          productSlug: access.productSlug,
          status: VehicleProductGrantStatus.ACTIVE,
        },
      },
    };
  }

  async assertVehicleAuthorized(
    organizationId: string,
    vehicleId: string,
    productSlug: ProductSlug,
    preResolved?: ResolvedProductVehicleAccess,
  ): Promise<void> {
    const access = preResolved ?? (await this.resolveProductVehicleAccess(organizationId, productSlug));
    const where = this.buildAuthorizedVehicleWhere(access);

    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        ...where,
      },
      select: { id: true },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
  }
}