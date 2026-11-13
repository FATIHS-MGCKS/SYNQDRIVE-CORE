import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

const ALLOWED_PRODUCT_SLUGS = new Set<string>(Object.values(ProductSlug));

/**
 * Validates `?productSlug=` for core vehicle read routes (user JWT only).
 * Confirms ACTIVE `OrganizationProduct` only — does not filter vehicles by product assignment.
 * Not added to M2M allowlist — service tokens remain blocked by global AuthGuard.
 */
@Injectable()
export class CoreVehicleReadProductGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const productSlug = String(request.query?.productSlug ?? '').toUpperCase();
    if (!productSlug || !ALLOWED_PRODUCT_SLUGS.has(productSlug)) {
      throw new BadRequestException('productSlug query parameter is required');
    }

    const organizationId = request.params?.orgId;
    if (!organizationId) {
      throw new ForbiddenException('Organization context required');
    }

    const orgProduct = await this.prisma.organizationProduct.findFirst({
      where: {
        organizationId,
        product: { slug: productSlug as ProductSlug },
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (!orgProduct) {
      throw new ForbiddenException(
        `Product license '${productSlug}' is not active for this organization`,
      );
    }

    request.coreVehicleReadProductSlug = productSlug as ProductSlug;
    return true;
  }
}
