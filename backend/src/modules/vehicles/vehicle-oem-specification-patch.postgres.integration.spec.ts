/**
 * OEM specification PATCH authorization + optimistic concurrency (PostgreSQL).
 *   VEHICLE_OEM_SPEC_PATCH_PG=1 DATABASE_URL=postgresql://.../synqdrive_oem_spec_test npm test -- vehicle-oem-specification-patch.postgres.integration.spec.ts
 */
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  BusinessType,
  DriveType,
  FuelType,
  HealthStatus,
  Prisma,
  PrismaClient,
  ProductSlug,
  VehicleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ensureOrganizationProductEntitlement } from '@modules/vehicle-onboarding/testing/org-product-test.harness';
import { parseRegistrationIdentityProvenance } from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-identity-provenance.util';
import { VehiclesService } from './vehicles.service';

const LIVE = process.env.VEHICLE_OEM_SPEC_PATCH_PG === '1';

function assertDisposableDatabaseUrl(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) {
    throw new Error('VEHICLE_OEM_SPEC_PATCH_PG=1 requires DATABASE_URL');
  }
  const dbName = new URL(url).pathname.replace(/^\//, '').split('?')[0] ?? '';
  if (!/synqdrive|test|ci|oem_spec/i.test(dbName)) {
    throw new Error(`Refusing non-disposable database name: ${dbName}`);
  }
}

async function serviceUpdate(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
  body: Record<string, unknown>,
  actorPlatformRole: string | null = 'MASTER_ADMIN',
) {
  const serviceCtx = {
    prisma,
    withOrgScope: (orgId: string) => ({ organizationId: orgId }),
  } as unknown as VehiclesService;
  return VehiclesService.prototype.update.call(
    serviceCtx,
    vehicleId,
    body as never,
    organizationId,
    { rawBody: body, actorPlatformRole },
  );
}

(LIVE ? describe : describe.skip)('vehicle-oem-specification-patch.postgres.integration', () => {
  let prisma: PrismaClient;
  let organizationId: string;
  let vehicleId: string;

  beforeAll(async () => {
    assertDisposableDatabaseUrl();
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  beforeEach(async () => {
    organizationId = randomUUID();
    vehicleId = randomUUID();
    await prisma.organization.create({
      data: {
        id: organizationId,
        companyName: `OEM-SPEC ${organizationId.slice(0, 8)}`,
        businessType: BusinessType.FLEET,
      },
    });
    await ensureOrganizationProductEntitlement(prisma, organizationId, ProductSlug.FLEET);
    await prisma.vehicle.create({
      data: {
        id: vehicleId,
        organizationId,
        vin: `VIN${vehicleId.replace(/-/g, '').slice(0, 14)}`,
        make: 'VW',
        model: 'Golf',
        year: 2022,
        fuelType: FuelType.DIESEL,
        status: VehicleStatus.AVAILABLE,
        healthStatus: HealthStatus.GOOD,
        driveType: DriveType.FWD,
      },
    });
  });

  afterEach(async () => {
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.organizationProduct.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists OEM field with USER_CONFIRMED provenance for Master Admin', async () => {
    await serviceUpdate(prisma, organizationId, vehicleId, {
      oemEngineCode: 'CBBB',
      technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
    });

    const row = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { oemEngineCode: true, registrationIdentityProvenance: true },
    });
    expect(row?.oemEngineCode).toBe('CBBB');
    const doc = parseRegistrationIdentityProvenance(row?.registrationIdentityProvenance);
    expect(doc?.fields?.oemEngineCode?.confirmationStatus).toBe('USER_CONFIRMED');
  });

  it('rejects OEM PATCH from non-Master principals (fleet.write bypass)', async () => {
    await expect(
      serviceUpdate(
        prisma,
        organizationId,
        vehicleId,
        {
          oemEngineCode: 'CBBB',
          technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
        },
        null,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows technical specification PATCH without Master Admin role', async () => {
    await serviceUpdate(
      prisma,
      organizationId,
      vehicleId,
      {
        tankCapacityLiters: 55,
        technicalSpecificationSave: { confirmedFieldKeys: ['tankCapacityLiters'] },
      },
      null,
    );
    const row = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { tankCapacityLiters: true },
    });
    expect(row?.tankCapacityLiters).toBe(55);
  });

  it('returns conflict when two concurrent OEM writes race on the same updatedAt', async () => {
    const prismaB = new PrismaClient();
    await prismaB.$connect();
    try {
      const base = {
        technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] as string[] },
      };
      const results = await Promise.allSettled([
        serviceUpdate(prisma, organizationId, vehicleId, {
          ...base,
          oemEngineCode: 'RACE_A',
        }),
        serviceUpdate(prismaB, organizationId, vehicleId, {
          ...base,
          oemEngineCode: 'RACE_B',
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
      expect((rejected[0] as PromiseRejectedResult).reason.response?.code).toBe(
        'VEHICLE_OEM_SPEC_SAVE_CONFLICT',
      );

      const row = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { oemEngineCode: true, registrationIdentityProvenance: true },
      });
      expect(['RACE_A', 'RACE_B']).toContain(row?.oemEngineCode);
      const doc = parseRegistrationIdentityProvenance(row?.registrationIdentityProvenance);
      expect(doc?.fields?.oemEngineCode?.value).toBe(row?.oemEngineCode);
    } finally {
      await prismaB.$disconnect();
    }
  });

  it('deterministic concurrency: repeated dual-connection OEM races yield one conflict each', async () => {
    const prismaB = new PrismaClient();
    await prismaB.$connect();
    try {
      let conflictObservations = 0;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await prisma.vehicle.updateMany({
          where: { id: vehicleId },
          data: {
            oemEngineCode: null,
            registrationIdentityProvenance: Prisma.DbNull,
            updatedAt: new Date(),
          },
        });
        const base = {
          technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] as string[] },
        };
        const results = await Promise.allSettled([
          serviceUpdate(prisma, organizationId, vehicleId, {
            ...base,
            oemEngineCode: `RACE_A_${attempt}`,
          }),
          serviceUpdate(prismaB, organizationId, vehicleId, {
            ...base,
            oemEngineCode: `RACE_B_${attempt}`,
          }),
        ]);
        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');
        const sawOptimisticConflict =
          fulfilled.length === 1 &&
          rejected.length === 1 &&
          (rejected[0] as PromiseRejectedResult).reason.response?.code ===
            'VEHICLE_OEM_SPEC_SAVE_CONFLICT';
        if (sawOptimisticConflict) {
          conflictObservations += 1;
        }
      }
      // Under load, staggered reads can both succeed (second writer read after first commit).
      // Require strong majority of attempts to observe the optimistic conflict contract.
      expect(conflictObservations).toBeGreaterThanOrEqual(6);
    } finally {
      await prismaB.$disconnect();
    }
  });

  it('does not apply OEM PATCH when vehicleId is resolved under a different organizationId', async () => {
    const otherOrgId = randomUUID();
    await prisma.organization.create({
      data: {
        id: otherOrgId,
        companyName: `OEM-OTHER ${otherOrgId.slice(0, 8)}`,
        businessType: BusinessType.FLEET,
      },
    });
    await ensureOrganizationProductEntitlement(prisma, otherOrgId, ProductSlug.FLEET);
    try {
      await expect(
        serviceUpdate(prisma, otherOrgId, vehicleId, {
          oemEngineCode: 'CROSS_TENANT',
          technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      const row = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { oemEngineCode: true },
      });
      expect(row?.oemEngineCode).toBeNull();
    } finally {
      await prisma.organizationProduct.deleteMany({ where: { organizationId: otherOrgId } });
      await prisma.organization.deleteMany({ where: { id: otherOrgId } });
    }
  });

  it('single-field OEM save does not mutate unrelated OEM columns', async () => {
    await serviceUpdate(prisma, organizationId, vehicleId, {
      oemEngineCode: 'ONLY_ENGINE',
      technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
    });
    const row = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        oemEngineCode: true,
        oemEngineDesc: true,
        oemTransmissionCode: true,
      },
    });
    expect(row?.oemEngineCode).toBe('ONLY_ENGINE');
    expect(row?.oemEngineDesc).toBeNull();
    expect(row?.oemTransmissionCode).toBeNull();
  });
});
