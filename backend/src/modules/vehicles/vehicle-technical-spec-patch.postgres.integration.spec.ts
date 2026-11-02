/**
 * Vehicle technical specification PATCH → PostgreSQL → read-back.
 *   VEHICLE_TECH_SPEC_PATCH_PG=1 DATABASE_URL=postgresql://.../synqdrive_tech_spec_test npm test -- vehicle-technical-spec-patch.postgres.integration.spec.ts
 */
import { BadRequestException } from '@nestjs/common';
import {
  BatterySourceType,
  BusinessType,
  DriveType,
  FuelType,
  HealthStatus,
  PrismaClient,
  ProductSlug,
  TireSetupStatus,
  VehicleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ensureOrganizationProductEntitlement } from '@modules/vehicle-onboarding/testing/org-product-test.harness';
import { VehiclesService } from './vehicles.service';
import { parseRegistrationIdentityProvenance } from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-identity-provenance.util';
import {
  applyMasterDimoActivationFinalizeInTransaction,
  buildMasterDimoActivationFinalizeInput,
} from '@modules/vehicle-onboarding/master-dimo/master-dimo-registration-artifacts';
import type { MasterDimoRegistrationInput } from '@modules/vehicle-onboarding/master-dimo/master-dimo-registration.types';
import { PrismaService } from '@shared/database/prisma.service';
import { BatteryService } from '@modules/vehicle-intelligence/battery/battery.service';
import { BrakesService } from '@modules/vehicle-intelligence/brakes/brakes.service';
import { BrakeReferenceSpecService } from '@modules/vehicle-intelligence/brakes/brake-reference-spec.service';
import { TireLifecycleService } from '@modules/vehicle-intelligence/tires/tire-lifecycle.service';
import { TireWearModelService } from '@modules/vehicle-intelligence/tires/tire-wear-model.service';
import { TireHealthAlertService } from '@modules/vehicle-intelligence/tires/tire-health-alert.service';
import { TireIdentityService } from '@modules/vehicle-intelligence/tires/tire-identity.service';
import type { DrivingImpactService } from '@modules/vehicle-intelligence/driving-impact/driving-impact.service';

const LIVE = process.env.VEHICLE_TECH_SPEC_PATCH_PG === '1';

function assertDisposableDatabaseUrl(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) {
    throw new Error('VEHICLE_TECH_SPEC_PATCH_PG=1 requires DATABASE_URL');
  }
  const dbName = new URL(url).pathname.replace(/^\//, '').split('?')[0] ?? '';
  if (!/synqdrive|test|ci|tech_spec/i.test(dbName)) {
    throw new Error(`Refusing non-disposable database name: ${dbName}`);
  }
}

async function serviceUpdate(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
  body: Record<string, unknown>,
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
    { rawBody: body },
  );
}

function prismaService(prisma: PrismaClient): PrismaService {
  return prisma as unknown as PrismaService;
}

function buildTireLifecycle(prisma: PrismaClient): TireLifecycleService {
  const ps = prismaService(prisma);
  const wearModel = new TireWearModelService(ps, {} as DrivingImpactService);
  const tireHealthAlert = new TireHealthAlertService(ps);
  const tireIdentity = new TireIdentityService(ps);
  const tireHealth = { recalculate: async () => undefined };
  return new TireLifecycleService(
    ps,
    wearModel,
    tireHealth as never,
    tireHealthAlert,
    tireIdentity,
  );
}

async function serviceUpsertTires(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
  tires: Record<string, unknown>,
) {
  const serviceCtx = {
    prisma,
    withOrgScope: (orgId: string) => ({ organizationId: orgId }),
    tireLifecycleService: buildTireLifecycle(prisma),
  } as unknown as VehiclesService;
  return VehiclesService.prototype.upsertTireData.call(
    serviceCtx,
    vehicleId,
    organizationId,
    tires as Parameters<VehiclesService['upsertTireData']>[2],
  );
}

async function batteryServiceUpdate(
  prisma: PrismaClient,
  vehicleId: string,
  id: string,
  data: Record<string, unknown>,
) {
  const serviceCtx = { prisma: prismaService(prisma) } as unknown as BatteryService;
  return BatteryService.prototype.update.call(serviceCtx, vehicleId, id, data);
}

async function batteryServiceCreate(
  prisma: PrismaClient,
  vehicleId: string,
  data: Record<string, unknown>,
) {
  const serviceCtx = { prisma: prismaService(prisma) } as unknown as BatteryService;
  return BatteryService.prototype.create.call(serviceCtx, vehicleId, data);
}

async function brakeServiceUpdate(
  prisma: PrismaClient,
  vehicleId: string,
  id: string,
  data: Record<string, unknown>,
) {
  const ps = prismaService(prisma);
  const serviceCtx = {
    prisma: ps,
    brakeReferenceSpec: new BrakeReferenceSpecService(ps),
  } as unknown as BrakesService;
  return BrakesService.prototype.update.call(serviceCtx, vehicleId, id, data);
}

async function brakeServiceCreate(
  prisma: PrismaClient,
  vehicleId: string,
  data: Record<string, unknown>,
) {
  const ps = prismaService(prisma);
  const serviceCtx = {
    prisma: ps,
    brakeReferenceSpec: new BrakeReferenceSpecService(ps),
  } as unknown as BrakesService;
  return BrakesService.prototype.create.call(serviceCtx, vehicleId, data);
}

function buildBatteryActivationFinalize(
  organizationId: string,
  battery: NonNullable<MasterDimoRegistrationInput['manualSpecs']>['battery'],
) {
  return buildMasterDimoActivationFinalizeInput({
    organizationId,
    stationId: null,
    dimoVehicleId: randomUUID(),
    actorUserId: null,
    manualSpecs: { battery },
  });
}

(LIVE ? describe : describe.skip)(
  'Vehicle technical specification PATCH (postgres)',
  () => {
    jest.setTimeout(120_000);
    const prisma = new PrismaClient();
    let organizationId: string;
    let vehicleId: string;

    beforeAll(async () => {
      assertDisposableDatabaseUrl();
      await prisma.$queryRaw`SELECT 1`;
    });

    beforeEach(async () => {
      organizationId = randomUUID();
      vehicleId = randomUUID();
      await prisma.organization.create({
        data: {
          id: organizationId,
          companyName: `TECH-SPEC ${organizationId.slice(0, 8)}`,
          businessType: BusinessType.FLEET,
        },
      });
      await ensureOrganizationProductEntitlement(prisma, organizationId, ProductSlug.FLEET);
      await prisma.vehicle.create({
        data: {
          id: vehicleId,
          organizationId,
          vin: `TS${randomUUID().replace(/-/g, '').slice(0, 14)}`,
          make: 'VW',
          model: 'Golf',
          year: 2020,
          fuelType: FuelType.GASOLINE,
          status: VehicleStatus.AVAILABLE,
          healthStatus: HealthStatus.GOOD,
          tankCapacityLiters: 50,
          serviceIntervalManufacturerKm: 15000,
          driveType: DriveType.FWD,
          idleRpm: 800,
          maxRpm: 6500,
        },
      });
    });

    afterEach(async () => {
      await prisma.vehicleBrakeReferenceSpec.deleteMany({ where: { vehicleId } });
      await prisma.vehicleBatterySpec.deleteMany({ where: { vehicleId } });
      await prisma.vehicleTireSetup.deleteMany({ where: { vehicleId } });
      await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
      await prisma.organizationProduct.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('PATCH/GET round-trip for tank, intervals, drivetrain with confirmation', async () => {
      await serviceUpdate(prisma, organizationId, vehicleId, {
        tankCapacityLiters: 55,
        serviceIntervalManufacturerKm: 30000,
        oilChangeIntervalMonths: 24,
        drivetrain: 'AWD',
        technicalSpecificationSave: {
          confirmedFieldKeys: [
            'tankCapacityLiters',
            'serviceIntervalManufacturerKm',
            'oilChangeIntervalMonths',
            'drivetrain',
          ],
        },
      });

      const row = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: {
          tankCapacityLiters: true,
          serviceIntervalManufacturerKm: true,
          serviceIntervalManufacturerMonths: true,
          oilChangeIntervalKm: true,
          oilChangeIntervalMonths: true,
          driveType: true,
        },
      });
      expect(row?.tankCapacityLiters).toBe(55);
      expect(row?.serviceIntervalManufacturerKm).toBe(30000);
      expect(row?.oilChangeIntervalMonths).toBe(24);
      expect(row?.serviceIntervalManufacturerMonths).toBeNull();
      expect(row?.oilChangeIntervalKm).toBeNull();
      expect(row?.driveType).toBe(DriveType.AWD);
    });

    it('no-op re-save does not clear omitted fields', async () => {
      await serviceUpdate(prisma, organizationId, vehicleId, {
        tankCapacityLiters: 55,
        technicalSpecificationSave: { confirmedFieldKeys: ['tankCapacityLiters'] },
      });

      await serviceUpdate(prisma, organizationId, vehicleId, {
        notes: 'omission probe',
      });

      const row = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { tankCapacityLiters: true, notes: true },
      });
      expect(row?.tankCapacityLiters).toBe(55);
      expect(row?.notes).toBe('omission probe');
    });

    it('rejects unconfirmed AI-sourced tank change', async () => {
      await expect(
        serviceUpdate(prisma, organizationId, vehicleId, {
          tankCapacityLiters: 60,
          aiFieldProvenance: { tankCapacityLiters: { category: 'AI_ESTIMATED' } },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('blocks overwrite of USER_CONFIRMED idleRpm without confirmation', async () => {
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: {
          registrationIdentityProvenance: {
            version: 1,
            updatedAt: new Date().toISOString(),
            fields: {
              idleRpm: {
                value: 800,
                provenance: 'USER_CONFIRMED',
                confirmationStatus: 'USER_CONFIRMED',
                confirmedAt: new Date().toISOString(),
                documentExtractionId: null,
              },
            },
          },
        },
      });

      await expect(
        serviceUpdate(prisma, organizationId, vehicleId, {
          idleRpm: 850,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      const row = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { idleRpm: true, registrationIdentityProvenance: true },
      });
      expect(row?.idleRpm).toBe(800);
      const doc = parseRegistrationIdentityProvenance(row?.registrationIdentityProvenance);
      const idleField = doc?.fields
        ? (doc.fields as Record<string, { value?: number }>).idleRpm
        : undefined;
      expect(idleField?.value).toBe(800);
    });

    it('updates existing LV battery and brake reference rows without duplicate create', async () => {
      const battery = await batteryServiceCreate(prisma, vehicleId, {
        batteryType: 'AGM',
        batteryAmpere: 70,
        batteryVolt: 12,
        sourceType: BatterySourceType.MANUAL,
        sourceConfidence: 1,
      });
      const brake = await brakeServiceCreate(prisma, vehicleId, {
        frontPadThickness: 10,
        sourceType: 'manual_registration',
        sourceConfidence: 1,
        userConfirmedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      });

      await batteryServiceUpdate(prisma, vehicleId, battery.id, {
        batteryAmpere: 74,
        sourceType: BatterySourceType.MANUAL,
        sourceConfidence: 1,
      });
      await brakeServiceUpdate(prisma, vehicleId, brake.id, {
        frontPadThickness: 11,
        sourceConfidence: 1,
      });

      const batteryRows = await prisma.vehicleBatterySpec.findMany({ where: { vehicleId } });
      const brakeRows = await prisma.vehicleBrakeReferenceSpec.findMany({ where: { vehicleId } });
      expect(batteryRows).toHaveLength(1);
      expect(brakeRows).toHaveLength(1);
      expect(batteryRows[0]?.batteryAmpere).toBe(74);
      expect(brakeRows[0]?.frontPadThickness).toBe(11);
      expect(brakeRows[0]?.userConfirmedAt).not.toBeNull();
    });

    it('upserts tire reference on existing active setup and repeated save is stable', async () => {
      await prisma.vehicleTireSetup.create({
        data: {
          id: randomUUID(),
          vehicleId,
          organizationId,
          status: TireSetupStatus.ACTIVE,
          frontDimension: '225/45R17',
          rearDimension: '225/45R17',
        },
      });

      await serviceUpsertTires(prisma, organizationId, vehicleId, {
        frontDimension: '235/45R18',
        rearDimension: '235/45R18',
      });

      const afterFirst = await prisma.vehicleTireSetup.findFirst({
        where: { vehicleId, status: TireSetupStatus.ACTIVE },
      });
      expect(afterFirst?.frontDimension).toBe('235/45R18');

      await serviceUpsertTires(prisma, organizationId, vehicleId, {
        frontDimension: '235/45R18',
        rearDimension: '235/45R18',
      });

      const afterRepeat = await prisma.vehicleTireSetup.findMany({
        where: { vehicleId, status: TireSetupStatus.ACTIVE },
      });
      expect(afterRepeat).toHaveLength(1);
      expect(afterRepeat[0]?.frontDimension).toBe('235/45R18');
    });

    it('repeated technical PATCH with identical values leaves DB unchanged', async () => {
      await serviceUpdate(prisma, organizationId, vehicleId, {
        tankCapacityLiters: 55,
        technicalSpecificationSave: { confirmedFieldKeys: ['tankCapacityLiters'] },
      });
      const first = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { tankCapacityLiters: true, updatedAt: true },
      });

      await serviceUpdate(prisma, organizationId, vehicleId, {
        tankCapacityLiters: 55,
        technicalSpecificationSave: { confirmedFieldKeys: ['tankCapacityLiters'] },
      });
      const second = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { tankCapacityLiters: true, updatedAt: true },
      });

      expect(second?.tankCapacityLiters).toBe(55);
      expect(first?.tankCapacityLiters).toBe(55);
    });

    it('creates LV battery on activation finalize only for canonical type', async () => {
      await prisma.$transaction(async (tx) => {
        await applyMasterDimoActivationFinalizeInTransaction(
          tx,
          vehicleId,
          buildBatteryActivationFinalize(organizationId, {
            batteryType: 'efb',
            batteryAmpere: 70,
            batteryVolt: 12,
          }),
        );
      });
      const rows = await prisma.vehicleBatterySpec.findMany({ where: { vehicleId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.batteryType).toBe('EFB');
    });

    it('rejects invalid LV battery type without partial persistence', async () => {
      await prisma.$transaction(async (tx) => {
        await applyMasterDimoActivationFinalizeInTransaction(
          tx,
          vehicleId,
          buildBatteryActivationFinalize(organizationId, {
            batteryType: 'legacy-unknown',
            batteryAmpere: 70,
            batteryVolt: 12,
          }),
        );
      });
      expect(await prisma.vehicleBatterySpec.count({ where: { vehicleId } })).toBe(0);

      await prisma.$transaction(async (tx) => {
        await applyMasterDimoActivationFinalizeInTransaction(
          tx,
          vehicleId,
          buildBatteryActivationFinalize(organizationId, {
            batteryType: null,
            batteryAmpere: 70,
            batteryVolt: 12,
          }),
        );
      });
      expect(await prisma.vehicleBatterySpec.count({ where: { vehicleId } })).toBe(0);
    });

    it('tenant isolation: battery rows remain scoped to the vehicle org', async () => {
      const otherOrgId = randomUUID();
      await prisma.organization.create({
        data: {
          id: otherOrgId,
          companyName: `OTHER ${otherOrgId.slice(0, 8)}`,
          businessType: BusinessType.FLEET,
        },
      });
      await ensureOrganizationProductEntitlement(prisma, otherOrgId, ProductSlug.FLEET);

      await prisma.$transaction(async (tx) => {
        await applyMasterDimoActivationFinalizeInTransaction(
          tx,
          vehicleId,
          buildBatteryActivationFinalize(organizationId, {
            batteryType: 'AGM',
            batteryAmpere: 70,
            batteryVolt: 12,
          }),
        );
      });

      const scoped = await prisma.vehicleBatterySpec.findMany({
        where: { vehicle: { organizationId } },
      });
      const foreign = await prisma.vehicleBatterySpec.findMany({
        where: { vehicle: { organizationId: otherOrgId } },
      });
      expect(scoped).toHaveLength(1);
      expect(foreign).toHaveLength(0);

      await prisma.organizationProduct.deleteMany({ where: { organizationId: otherOrgId } });
      await prisma.organization.deleteMany({ where: { id: otherOrgId } });
    });
  },
);
