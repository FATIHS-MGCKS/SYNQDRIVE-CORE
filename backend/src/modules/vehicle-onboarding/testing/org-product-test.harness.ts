import {
  OrganizationProductVehicleAccessMode,
  OrgProductPlan,
  OrgProductStatus,
  ProductSlug,
  type PrismaClient,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

export async function ensureOrganizationProductEntitlement(
  prisma: PrismaClient,
  organizationId: string,
  slug: ProductSlug,
  status: OrgProductStatus = OrgProductStatus.ACTIVE,
): Promise<void> {
  let product = await prisma.product.findUnique({ where: { slug } });
  if (!product) {
    product = await prisma.product.create({
      data: {
        id: randomUUID(),
        slug,
        name: slug,
        description: `${slug} test product`,
      },
    });
  }
  await prisma.organizationProduct.upsert({
    where: {
      organizationId_productId: { organizationId, productId: product.id },
    },
    create: {
      organizationId,
      productId: product.id,
      status,
      plan: OrgProductPlan.STARTER,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      activatedAt: new Date(),
    },
    update: { status },
  });
}
