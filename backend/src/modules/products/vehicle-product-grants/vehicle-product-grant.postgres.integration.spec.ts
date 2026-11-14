/**
 * Isolated Postgres concurrency gate for P3-PR9 vehicle product grants.
 * Run:
 *   VEHICLE_PRODUCT_GRANT_POSTGRES_INTEGRATION=1 \
 *   DATABASE_URL=postgresql://synqdrive_p1b_gate:...@127.0.0.1:5432/synqdrive_p3_pr9_concurrency \
 *   npm test -- --runInBand vehicle-product-grant.postgres
 */
import {
  OrganizationProductVehicleAccessMode,
  OrgProductStatus,
  PrismaClient,
  ProductSlug,
  VehicleProductGrantStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { VehicleProductGrantService } from './vehicle-product-grant.service';

const LIVE = process.env.VEHICLE_PRODUCT_GRANT_POSTGRES_INTEGRATION === '1';

function assertEphemeralDatabaseUrl() {
  const url = process.env.DATABASE_URL ?? '';
  if (!url || /production|staging|app\.synqdrive|hstgr\.cloud|srv1374778/i.test(url)) {
    throw new Error('VEHICLE_PRODUCT_GRANT_POSTGRES_INTEGRATION requires isolated DATABASE_URL');
  }
  if (!/127\.0\.0\.1|localhost/i.test(url)) {
    throw new Error('DATABASE_URL must target local ephemeral PostgreSQL');
  }
}

(LIVE ? describe : describe.skip)('VehicleProductGrant — postgres concurrency gate', () => {
  const prisma = new PrismaClient();
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as MasterAdminAuditService;
  let service: VehicleProductGrantService;

  const orgIds: string[] = [];
  const vehicleIds: string[] = [];
  const grantIds: string[] = [];

  beforeAll(() => {
    assertEphemeralDatabaseUrl();
    service = new VehicleProductGrantService(prisma as unknown as PrismaService, audit);
  });

  afterAll(async () => {
    if (grantIds.length) {
      await prisma.vehicleProductGrant.deleteMany({ where: { id: { in: grantIds } } });
    }
    if (vehicleIds.length) {
      await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    }
    if (orgIds.length) {
      await prisma.organizationProduct.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await prisma.$disconnect();
  });

  async function seedOrgWithRental() {
    const org = await prisma.organization.create({
      data: { companyName: `VPG PG ${Date.now()}`, businessType: 'RENTAL' },
    });
    orgIds.push(org.id);
    const product = await prisma.product.upsert({
      where: { slug: ProductSlug.RENTAL },
      create: { slug: ProductSlug.RENTAL, name: 'Rental' },
      update: {},
    });
    await prisma.organizationProduct.create({
      data: {
        organizationId: org.id,
        productId: product.id,
        status: OrgProductStatus.ACTIVE,
        vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      },
    });
    return org.id;
  }

  async function seedVehicle(orgId: string) {
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: orgId,
        vin: `VIN-VPG-${Date.now()}-${Math.random()}`,
        make: 'Test',
        model: 'Gate',
        year: 2025,
        fuelType: 'ELECTRIC',
        licensePlate: `VPG-${Date.now()}`,
        status: 'AVAILABLE',
        registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
      },
    });
    vehicleIds.push(vehicle.id);
    return vehicle.id;
  }

  it('migration: vehicle_product_grants exists with unique (vehicle_id, product_slug)', async () => {
    const rows = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'vehicle_product_grants'
    `;
    expect(rows.map((r) => r.column_name)).toEqual(
      expect.arrayContaining(['vehicle_id', 'product_slug', 'grant_version']),
    );
    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'vehicle_product_grants' AND indexname LIKE '%vehicle_id_product_slug%'
    `;
    expect(indexes.length).toBeGreaterThan(0);
  });

  it('concurrent first-time grants yield one row and grantVersion 1 (P2002 recovery)', async () => {
    const orgId = await seedOrgWithRental();
    const vehicleId = await seedVehicle(orgId);
    const admin = 'admin-concurrent-grant';

    const [a, b] = await Promise.all([
      service.grantExplicit({
        organizationId: orgId,
        vehicleId,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: admin,
      }),
      service.grantExplicit({
        organizationId: orgId,
        vehicleId,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: admin,
      }),
    ]);

    grantIds.push(a.id);

    expect(a.id).toBe(b.id);
    expect(a.grantVersion).toBe(1);
    expect(b.grantVersion).toBe(1);
    expect(a.status).toBe(VehicleProductGrantStatus.ACTIVE);
    expect(b.status).toBe(VehicleProductGrantStatus.ACTIVE);

    const count = await prisma.vehicleProductGrant.count({
      where: { vehicleId, productSlug: ProductSlug.RENTAL },
    });
    expect(count).toBe(1);
  });

  it('concurrent revoke then re-grant maintains monotonic grantVersion', async () => {
    const orgId = await seedOrgWithRental();
    const vehicleId = await seedVehicle(orgId);
    const admin = 'admin-race';

    const initial = await service.grantExplicit({
      organizationId: orgId,
      vehicleId,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: admin,
    });
    grantIds.push(initial.id);
    expect(initial.grantVersion).toBe(1);

    const [rev1, rev2] = await Promise.all([
      service.revokeGrant({
        organizationId: orgId,
        vehicleId,
        productSlug: ProductSlug.RENTAL,
        revokedByUserId: admin,
      }),
      service.revokeGrant({
        organizationId: orgId,
        vehicleId,
        productSlug: ProductSlug.RENTAL,
        revokedByUserId: admin,
      }),
    ]);
    expect(rev1.grantVersion).toBe(2);
    expect(rev2.grantVersion).toBe(2);
    expect(rev1.status).toBe(VehicleProductGrantStatus.REVOKED);

    const [g1, g2] = await Promise.all([
      service.grantExplicit({
        organizationId: orgId,
        vehicleId,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: admin,
      }),
      service.grantExplicit({
        organizationId: orgId,
        vehicleId,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: admin,
      }),
    ]);
    expect(g1.grantVersion).toBe(3);
    expect(g2.grantVersion).toBe(3);
    expect(g1.status).toBe(VehicleProductGrantStatus.ACTIVE);

    const finalRow = await prisma.vehicleProductGrant.findUniqueOrThrow({
      where: { vehicleId_productSlug: { vehicleId, productSlug: ProductSlug.RENTAL } },
    });
    expect(finalRow.grantVersion).toBe(3);
    expect(finalRow.status).toBe(VehicleProductGrantStatus.ACTIVE);
  });

  it('concurrent revoke vs re-grant resolves to consistent terminal state', async () => {
    const orgId = await seedOrgWithRental();
    const vehicleId = await seedVehicle(orgId);
    const admin = 'admin-cross-race';

    const initial = await service.grantExplicit({
      organizationId: orgId,
      vehicleId,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: admin,
    });
    grantIds.push(initial.id);

    const outcomes = await Promise.allSettled([
      service.revokeGrant({
        organizationId: orgId,
        vehicleId,
        productSlug: ProductSlug.RENTAL,
        revokedByUserId: admin,
      }),
      service.grantExplicit({
        organizationId: orgId,
        vehicleId,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: admin,
      }),
    ]);

    expect(outcomes.every((o) => o.status === 'fulfilled')).toBe(true);

    const finalRow = await prisma.vehicleProductGrant.findUniqueOrThrow({
      where: { vehicleId_productSlug: { vehicleId, productSlug: ProductSlug.RENTAL } },
    });
    expect(finalRow.grantVersion).toBeGreaterThanOrEqual(2);
    expect(finalRow.grantVersion).toBeLessThanOrEqual(3);
    expect([VehicleProductGrantStatus.ACTIVE, VehicleProductGrantStatus.REVOKED]).toContain(
      finalRow.status,
    );
  });
});