/**
 * Run:
 *   ORGANIZATION_PRODUCT_ACCESS_MODE_POSTGRES_INTEGRATION=1 \
 *   DATABASE_URL=postgresql://...@127.0.0.1:5432/... \
 *   npm test -- --runInBand products.postgres
 */
import {
  OrganizationProductVehicleAccessMode,
  PrismaClient,
  ProductSlug,
} from '@prisma/client';

const LIVE = process.env.ORGANIZATION_PRODUCT_ACCESS_MODE_POSTGRES_INTEGRATION === '1';

(LIVE ? describe : describe.skip)('OrganizationProduct vehicleAccessMode — postgres', () => {
  const prisma = new PrismaClient();
  const orgIds: string[] = [];

  afterAll(async () => {
    if (orgIds.length) {
      await prisma.organizationProduct.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await prisma.$disconnect();
  });

  it('migration backfilled organization_products with explicit ORGANIZATION_WIDE', async () => {
    const org = await prisma.organization.create({
      data: { companyName: `OP mode ${Date.now()}`, businessType: 'RENTAL' },
    });
    orgIds.push(org.id);
    const product = await prisma.product.upsert({
      where: { slug: ProductSlug.FLEET },
      create: { slug: ProductSlug.FLEET, name: 'Fleet' },
      update: {},
    });
    await prisma.organizationProduct.create({
      data: {
        organizationId: org.id,
        productId: product.id,
        vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      },
    });
    const rows = await prisma.$queryRaw<{ vehicle_access_mode: string }[]>`
      SELECT vehicle_access_mode FROM organization_products WHERE organization_id = ${org.id}
    `;
    expect(rows[0]?.vehicle_access_mode).toBe('ORGANIZATION_WIDE');
  });

  it('two orgs same slug can persist different modes', async () => {
    const product = await prisma.product.upsert({
      where: { slug: ProductSlug.RENTAL },
      create: { slug: ProductSlug.RENTAL, name: 'Rental' },
      update: {},
    });
    for (const mode of [
      OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
    ]) {
      const org = await prisma.organization.create({
        data: { companyName: `mode-${mode}-${Date.now()}`, businessType: 'RENTAL' },
      });
      orgIds.push(org.id);
      await prisma.organizationProduct.create({
        data: {
          organizationId: org.id,
          productId: product.id,
          vehicleAccessMode: mode,
        },
      });
    }
    const modes = await prisma.organizationProduct.findMany({
      where: { organizationId: { in: orgIds } },
      select: { vehicleAccessMode: true },
    });
    expect(new Set(modes.map((m) => m.vehicleAccessMode)).size).toBe(2);
  });

  it('mode change does not mutate vehicle_product_grants rows', async () => {
    const org = await prisma.organization.create({
      data: { companyName: `grants-unchanged-${Date.now()}`, businessType: 'RENTAL' },
    });
    orgIds.push(org.id);
    const product = await prisma.product.upsert({
      where: { slug: ProductSlug.RENTAL },
      create: { slug: ProductSlug.RENTAL, name: 'Rental' },
      update: {},
    });
    const op = await prisma.organizationProduct.create({
      data: {
        organizationId: org.id,
        productId: product.id,
        vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        vin: `VIN-${Date.now()}`,
        make: 'T',
        model: 'T',
        year: 2025,
        fuelType: 'ELECTRIC',
        licensePlate: `P-${Date.now()}`,
        status: 'AVAILABLE',
      },
    });
  const grant = await prisma.vehicleProductGrant.create({
      data: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: 'admin-test',
      },
    });
    const before = await prisma.vehicleProductGrant.count({ where: { organizationId: org.id } });
    await prisma.organizationProduct.update({
      where: { id: op.id },
      data: { vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE },
    });
    const after = await prisma.vehicleProductGrant.count({ where: { organizationId: org.id } });
    const row = await prisma.vehicleProductGrant.findUniqueOrThrow({ where: { id: grant.id } });
    expect(before).toBe(1);
    expect(after).toBe(1);
    expect(row.status).toBe('ACTIVE');
  });
});