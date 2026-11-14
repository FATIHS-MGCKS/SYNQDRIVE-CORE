/**
 * Run:
 *   PRODUCT_VEHICLE_ACCESS_POSTGRES_INTEGRATION=1 \
 *   DATABASE_URL=postgresql://...@127.0.0.1:5432/... \
 *   npm test -- --runInBand product-vehicle-access.postgres
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  OrganizationProductVehicleAccessMode,
  OrgProductStatus,
  PrismaClient,
  ProductSlug,
  VehicleProductGrantStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ProductVehicleAccessService } from './product-vehicle-access.service';

const LIVE = process.env.PRODUCT_VEHICLE_ACCESS_POSTGRES_INTEGRATION === '1';

(LIVE ? describe : describe.skip)('ProductVehicleAccessService — postgres', () => {
  const prisma = new PrismaClient();
  let service: ProductVehicleAccessService;
  const orgIds: string[] = [];

  beforeAll(() => {
    service = new ProductVehicleAccessService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    if (orgIds.length) {
      await prisma.vehicleProductGrant.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.vehicle.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organizationProduct.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await prisma.$disconnect();
  });

  async function seedOrgWithProduct(
    mode: OrganizationProductVehicleAccessMode,
    slug: ProductSlug = ProductSlug.RENTAL,
  ) {
    const org = await prisma.organization.create({
      data: { companyName: `PVA ${Date.now()}`, businessType: 'RENTAL' },
    });
    orgIds.push(org.id);
    const product = await prisma.product.upsert({
      where: { slug },
      create: { slug, name: slug },
      update: {},
    });
    await prisma.organizationProduct.create({
      data: {
        organizationId: org.id,
        productId: product.id,
        status: OrgProductStatus.ACTIVE,
        vehicleAccessMode: mode,
      },
    });
    return org.id;
  }

  async function seedVehicle(
    orgId: string,
    lifecycle: VehicleRegistryLifecycle = VehicleRegistryLifecycle.ACTIVE,
  ) {
    return prisma.vehicle.create({
      data: {
        organizationId: orgId,
        vin: `VIN-${Date.now()}-${Math.random()}`,
        make: 'T',
        model: 'T',
        year: 2025,
        fuelType: 'ELECTRIC',
        licensePlate: `P-${Date.now()}`,
        status: 'AVAILABLE',
        registryLifecycle: lifecycle,
      },
    });
  }

  it('ORGANIZATION_WIDE authorizes all ACTIVE lifecycle vehicles', async () => {
    const orgId = await seedOrgWithProduct(OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE);
    await seedVehicle(orgId);
    const where = await service.getAuthorizedVehicleWhere(orgId, ProductSlug.RENTAL);
    const count = await prisma.vehicle.count({ where });
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('SELECTED_VEHICLES zero grants yields zero authorized vehicles', async () => {
    const orgId = await seedOrgWithProduct(OrganizationProductVehicleAccessMode.SELECTED_VEHICLES);
    await seedVehicle(orgId);
    const where = await service.getAuthorizedVehicleWhere(orgId, ProductSlug.RENTAL);
    expect(await prisma.vehicle.count({ where })).toBe(0);
  });

  it('SELECTED_VEHICLES with ACTIVE grant authorizes only granted vehicle', async () => {
    const orgId = await seedOrgWithProduct(OrganizationProductVehicleAccessMode.SELECTED_VEHICLES);
    const granted = await seedVehicle(orgId);
    await seedVehicle(orgId);
    await prisma.vehicleProductGrant.create({
      data: {
        organizationId: orgId,
        vehicleId: granted.id,
        productSlug: ProductSlug.RENTAL,
        status: VehicleProductGrantStatus.ACTIVE,
        grantedByUserId: 'admin-test',
      },
    });
    const where = await service.getAuthorizedVehicleWhere(orgId, ProductSlug.RENTAL);
    expect(await prisma.vehicle.count({ where })).toBe(1);
    await expect(service.assertVehicleAuthorized(orgId, granted.id, ProductSlug.RENTAL)).resolves.toBeUndefined();
  });

  it('wrong product grant does not authorize vehicle under SELECTED', async () => {
    const orgId = await seedOrgWithProduct(OrganizationProductVehicleAccessMode.SELECTED_VEHICLES);
    const vehicle = await seedVehicle(orgId);
    await prisma.vehicleProductGrant.create({
      data: {
        organizationId: orgId,
        vehicleId: vehicle.id,
        productSlug: ProductSlug.FLEET,
        status: VehicleProductGrantStatus.ACTIVE,
        grantedByUserId: 'admin-test',
      },
    });
    await expect(service.assertVehicleAuthorized(orgId, vehicle.id, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('revoked grant does not authorize vehicle', async () => {
    const orgId = await seedOrgWithProduct(OrganizationProductVehicleAccessMode.SELECTED_VEHICLES);
    const vehicle = await seedVehicle(orgId);
    await prisma.vehicleProductGrant.create({
      data: {
        organizationId: orgId,
        vehicleId: vehicle.id,
        productSlug: ProductSlug.RENTAL,
        status: VehicleProductGrantStatus.REVOKED,
        grantedByUserId: 'admin-test',
      },
    });
    await expect(service.assertVehicleAuthorized(orgId, vehicle.id, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('inactive license fails closed', async () => {
    const org = await prisma.organization.create({
      data: { companyName: `inactive ${Date.now()}`, businessType: 'RENTAL' },
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
        status: OrgProductStatus.SUSPENDED,
        vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      },
    });
    await expect(service.resolveProductVehicleAccess(org.id, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const vehicle = await seedVehicle(org.id);
    await expect(service.assertVehicleAuthorized(org.id, vehicle.id, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('transferred vehicle not visible in foreign org', async () => {
    const orgA = await seedOrgWithProduct(OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE);
    const orgB = await seedOrgWithProduct(OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE);
    const vehicleInB = await seedVehicle(orgB);
    await expect(service.assertVehicleAuthorized(orgA, vehicleInB.id, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('offboarded vehicle not in authorized where', async () => {
    const orgId = await seedOrgWithProduct(OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE);
    const offboarded = await seedVehicle(orgId, VehicleRegistryLifecycle.OFFBOARDED);
    await expect(service.assertVehicleAuthorized(orgId, offboarded.id, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('ARCHIVED vehicle not in authorized where', async () => {
    const orgId = await seedOrgWithProduct(OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE);
    const archived = await seedVehicle(orgId, VehicleRegistryLifecycle.ARCHIVED);
    await expect(service.assertVehicleAuthorized(orgId, archived.id, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});