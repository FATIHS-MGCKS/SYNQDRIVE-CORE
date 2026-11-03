/**
 * ONEAUTO OEM vinlookup suggestion snapshot materialization + Master read (PostgreSQL).
 * ONEAUTO_OEM_SUGGESTIONS_PG=1 DATABASE_URL=postgresql://.../synqdrive_ci_ephemeral npm test -- oneauto-oem-vin-lookup-eu-suggestion.postgres.integration
 */
import { ConfigService } from '@nestjs/config';
import {
  BusinessType,
  DriveType,
  FuelType,
  HealthStatus,
  OneAutoProviderJobStatus,
  PrismaClient,
  ProductSlug,
  VehicleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ensureOrganizationProductEntitlement } from '@modules/vehicle-onboarding/testing/org-product-test.harness';
import { ONEAUTO_OEM_VIN_LOOKUP_EU_AUDI_A4_SANITIZED_RESULT } from '@modules/oneauto-provider/oem-specification/oneauto-vin-lookup-oem-suggestion.fixtures';
import { OneAutoOemVinLookupEuSuggestionMaterializationService } from '@modules/oneauto-provider/oem-specification/oneauto-oem-vin-lookup-eu-suggestion-materialization.service';
import { OneAutoOemVinLookupEuSuggestionReadService } from '@modules/oneauto-provider/oem-specification/oneauto-oem-vin-lookup-eu-suggestion-read.service';
import { OneAutoOemVinLookupEuSuggestionCleanupService } from '@modules/oneauto-provider/oem-specification/oneauto-oem-vin-lookup-eu-suggestion-cleanup.service';
import { assertSafeOemSuggestionListDto } from '@modules/oneauto-provider/oem-specification/oneauto-oem-vin-lookup-eu-suggestion.dto';

const LIVE = process.env.ONEAUTO_OEM_SUGGESTIONS_PG === '1';
const TEST_VIN = 'WBA12345678901234';

function testConfig(): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'oneautoProvider') {
        return {
          oemSuggestionsEnabled: true,
          oemSuggestionsCleanupBatchSize: 25,
        };
      }
      return {};
    },
  } as unknown as ConfigService;
}

function assertDisposableDatabaseUrl(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('ONEAUTO_OEM_SUGGESTIONS_PG=1 requires DATABASE_URL');
  const dbName = new URL(url).pathname.replace(/^\//, '').split('?')[0] ?? '';
  if (!/synqdrive|test|ci|oem|oneauto/i.test(dbName)) {
    throw new Error(`Refusing non-disposable database name: ${dbName}`);
  }
}

async function createOrgVehicle(
  prisma: PrismaClient,
  input?: { organizationId?: string; vehicleId?: string; vin?: string },
) {
  const organizationId = input?.organizationId ?? randomUUID();
  const vehicleId = input?.vehicleId ?? randomUUID();
  const vin = input?.vin ?? TEST_VIN;
  await prisma.organization.create({
    data: {
      id: organizationId,
      companyName: `ONEAUTO-OEM ${organizationId.slice(0, 8)}`,
      businessType: BusinessType.FLEET,
    },
  });
  await ensureOrganizationProductEntitlement(prisma, organizationId, ProductSlug.FLEET);
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      organizationId,
      vin,
      make: 'Audi',
      model: 'A4',
      year: 2019,
      fuelType: FuelType.DIESEL,
      status: VehicleStatus.AVAILABLE,
      healthStatus: HealthStatus.GOOD,
      driveType: DriveType.AWD,
    },
  });
  return { organizationId, vehicleId, vin };
}

async function createSucceededVinLookupJob(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    vin: string;
    expiresAt: Date;
    jobId?: string;
    includeVinInProviderResult?: boolean;
    malformedResult?: boolean;
  },
) {
  const jobId = input.jobId ?? randomUUID();
  await prisma.oneAutoProviderJob.create({
    data: {
      id: jobId,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      vinSnapshot: input.vin,
      serviceSku: 'OE_VIN_LOOKUP_EU',
      status: OneAutoProviderJobStatus.SUCCEEDED,
      idempotencyKey: randomUUID(),
      initiatingMasterAdminUserId: randomUUID(),
      expiresAt: input.expiresAt,
    },
  });
  const providerResult = input.malformedResult
    ? { not_a_result: true }
    : {
        ...ONEAUTO_OEM_VIN_LOOKUP_EU_AUDI_A4_SANITIZED_RESULT,
        ...(input.includeVinInProviderResult === false
          ? {}
          : { vehicle_identification_number: input.vin }),
      };
  await prisma.oneAutoProviderResponse.create({
    data: {
      jobId,
      httpStatus: 200,
      responseBodyJson: {
        success: true,
        result: providerResult,
      },
      fetchedAt: new Date('2026-11-03T10:00:00.000Z'),
    },
  });
  return jobId;
}

(LIVE ? describe : describe.skip)('oneauto-oem-vin-lookup-eu-suggestion.postgres.integration', () => {
  let prisma: PrismaClient;
  let materialization: OneAutoOemVinLookupEuSuggestionMaterializationService;
  let readService: OneAutoOemVinLookupEuSuggestionReadService;
  let cleanup: OneAutoOemVinLookupEuSuggestionCleanupService;

  beforeAll(async () => {
    assertDisposableDatabaseUrl();
    prisma = new PrismaClient();
    await prisma.$connect();
    const cfg = testConfig();
    materialization = new OneAutoOemVinLookupEuSuggestionMaterializationService(prisma as never, cfg);
    readService = new OneAutoOemVinLookupEuSuggestionReadService(prisma as never, cfg);
    cleanup = new OneAutoOemVinLookupEuSuggestionCleanupService(prisma as never, cfg);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('enforces cross-tenant isolation on read', async () => {
    const a = await createOrgVehicle(prisma);
    const b = await createOrgVehicle(prisma);
    const jobId = await createSucceededVinLookupJob(prisma, {
      ...a,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await materialization.tryMaterializeFromSucceededJob(jobId);
    await expect(readService.listForVehicle(b.organizationId, a.vehicleId)).rejects.toThrow(/not found/i);
    const dto = await readService.listForVehicle(a.organizationId, a.vehicleId);
    expect(dto.suggestions).toHaveLength(1);
    await prisma.oneAutoOemVinLookupEuSuggestionSnapshot.deleteMany({ where: { providerJobId: jobId } });
    await prisma.oneAutoProviderResponse.deleteMany({ where: { jobId } });
    await prisma.oneAutoProviderJob.deleteMany({ where: { id: jobId } });
    await prisma.vehicle.deleteMany({ where: { id: { in: [a.vehicleId, b.vehicleId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [a.organizationId, b.organizationId] } } });
  });

  it('rejects vehicle/job organization mismatch during materialization', async () => {
    const orgA = await createOrgVehicle(prisma);
    const orgB = await createOrgVehicle(prisma);
    const jobId = await createSucceededVinLookupJob(prisma, {
      organizationId: orgA.organizationId,
      vehicleId: orgB.vehicleId,
      vin: TEST_VIN,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const outcome = await materialization.tryMaterializeFromSucceededJob(jobId);
    expect(outcome.outcome).toBe('SKIPPED_BINDING');
    await prisma.oneAutoProviderResponse.deleteMany({ where: { jobId } });
    await prisma.oneAutoProviderJob.deleteMany({ where: { id: jobId } });
    await prisma.vehicle.deleteMany({ where: { id: { in: [orgA.vehicleId, orgB.vehicleId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA.organizationId, orgB.organizationId] } } });
  });

  it('rejects VIN mismatch between job snapshot and vehicle', async () => {
    const ctx = await createOrgVehicle(prisma, { vin: TEST_VIN });
    const jobId = await createSucceededVinLookupJob(prisma, {
      ...ctx,
      vin: 'WBA00000000000000',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const outcome = await materialization.tryMaterializeFromSucceededJob(jobId);
    expect(outcome.outcome).toBe('SKIPPED_BINDING');
    await prisma.oneAutoProviderResponse.deleteMany({ where: { jobId } });
    await prisma.oneAutoProviderJob.deleteMany({ where: { id: jobId } });
    await prisma.vehicle.deleteMany({ where: { id: ctx.vehicleId } });
    await prisma.organization.deleteMany({ where: { id: ctx.organizationId } });
  });

  it('rejects expired jobs for materialization', async () => {
    const ctx = await createOrgVehicle(prisma);
    const jobId = await createSucceededVinLookupJob(prisma, {
      ...ctx,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const outcome = await materialization.tryMaterializeFromSucceededJob(jobId);
    expect(outcome.outcome).toBe('SKIPPED_EXPIRED_JOB');
    await prisma.oneAutoProviderResponse.deleteMany({ where: { jobId } });
    await prisma.oneAutoProviderJob.deleteMany({ where: { id: jobId } });
    await prisma.vehicle.deleteMany({ where: { id: ctx.vehicleId } });
    await prisma.organization.deleteMany({ where: { id: ctx.organizationId } });
  });

  it('excludes expired snapshots at read time', async () => {
    const ctx = await createOrgVehicle(prisma);
    const jobId = await createSucceededVinLookupJob(prisma, {
      ...ctx,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await materialization.tryMaterializeFromSucceededJob(jobId);
    await prisma.oneAutoOemVinLookupEuSuggestionSnapshot.updateMany({
      where: { providerJobId: jobId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const dto = await readService.listForVehicle(ctx.organizationId, ctx.vehicleId);
    expect(dto.suggestions).toHaveLength(0);
    await prisma.oneAutoOemVinLookupEuSuggestionSnapshot.deleteMany({ where: { providerJobId: jobId } });
    await prisma.oneAutoProviderResponse.deleteMany({ where: { jobId } });
    await prisma.oneAutoProviderJob.deleteMany({ where: { id: jobId } });
    await prisma.vehicle.deleteMany({ where: { id: ctx.vehicleId } });
    await prisma.organization.deleteMany({ where: { id: ctx.organizationId } });
  });

  it('materializes idempotently on retries', async () => {
    const ctx = await createOrgVehicle(prisma);
    const jobId = await createSucceededVinLookupJob(prisma, {
      ...ctx,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const first = await materialization.tryMaterializeFromSucceededJob(jobId);
    const second = await materialization.tryMaterializeFromSucceededJob(jobId);
    expect(first.outcome).toBe('CREATED');
    expect(second.outcome).toBe('ALREADY_EXISTS');
    const count = await prisma.oneAutoOemVinLookupEuSuggestionSnapshot.count({ where: { providerJobId: jobId } });
    expect(count).toBe(1);
    await prisma.oneAutoOemVinLookupEuSuggestionSnapshot.deleteMany({ where: { providerJobId: jobId } });
    await prisma.oneAutoProviderResponse.deleteMany({ where: { jobId } });
    await prisma.oneAutoProviderJob.deleteMany({ where: { id: jobId } });
    await prisma.vehicle.deleteMany({ where: { id: ctx.vehicleId } });
    await prisma.organization.deleteMany({ where: { id: ctx.organizationId } });
  });

  it('protects immutable snapshots from silent overwrite', async () => {
    const ctx = await createOrgVehicle(prisma);
    const jobId = await createSucceededVinLookupJob(prisma, {
      ...ctx,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await materialization.tryMaterializeFromSucceededJob(jobId);
    await prisma.oneAutoOemVinLookupEuSuggestionSnapshot.updateMany({
      where: { providerJobId: jobId },
      data: {
        normalizedSnapshotJson: { tampered: true },
      },
    });
    const retry = await materialization.tryMaterializeFromSucceededJob(jobId);
    expect(retry.outcome).toBe('IMMUTABLE_CONFLICT');
    await prisma.oneAutoOemVinLookupEuSuggestionSnapshot.deleteMany({ where: { providerJobId: jobId } });
    await prisma.oneAutoProviderResponse.deleteMany({ where: { jobId } });
    await prisma.oneAutoProviderJob.deleteMany({ where: { id: jobId } });
    await prisma.vehicle.deleteMany({ where: { id: ctx.vehicleId } });
    await prisma.organization.deleteMany({ where: { id: ctx.organizationId } });
  });

  it('skips malformed provider evidence without mutating the job', async () => {
    const ctx = await createOrgVehicle(prisma);
    const jobId = randomUUID();
    await prisma.oneAutoProviderJob.create({
      data: {
        id: jobId,
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId,
        vinSnapshot: ctx.vin,
        serviceSku: 'OE_VIN_LOOKUP_EU',
        status: OneAutoProviderJobStatus.SUCCEEDED,
        idempotencyKey: randomUUID(),
        initiatingMasterAdminUserId: randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.oneAutoProviderResponse.create({
      data: {
        jobId,
        httpStatus: 200,
        responseBodyJson: { success: true },
        fetchedAt: new Date(),
      },
    });
    const outcome = await materialization.tryMaterializeFromSucceededJob(jobId);
    expect(outcome.outcome).toBe('SKIPPED_RESPONSE');
    const job = await prisma.oneAutoProviderJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe(OneAutoProviderJobStatus.SUCCEEDED);
    await prisma.oneAutoProviderResponse.deleteMany({ where: { jobId } });
    await prisma.oneAutoProviderJob.deleteMany({ where: { id: jobId } });
    await prisma.vehicle.deleteMany({ where: { id: ctx.vehicleId } });
    await prisma.organization.deleteMany({ where: { id: ctx.organizationId } });
  });

  it('surfaces protected USER_CONFIRMED conflicts at read time only', async () => {
    const ctx = await createOrgVehicle(prisma);
    await prisma.vehicle.update({
      where: { id: ctx.vehicleId },
      data: {
        oemEngineDesc: 'Operator locked',
        registrationIdentityProvenance: {
          version: 2,
          oemFieldRegistryVersion: 1,
          updatedAt: new Date().toISOString(),
          fields: {
            oemEngineDesc: {
              value: 'Operator locked',
              provenance: 'USER_CONFIRMED',
              confirmationStatus: 'USER_CONFIRMED',
              confirmedAt: new Date().toISOString(),
            },
          },
        },
      },
    });
    const jobId = await createSucceededVinLookupJob(prisma, {
      ...ctx,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await materialization.tryMaterializeFromSucceededJob(jobId);
    const dto = await readService.listForVehicle(ctx.organizationId, ctx.vehicleId);
    const engineRow = dto.suggestions[0]?.comparison.fields.find((f) => f.canonicalFieldKey === 'oemEngineDesc');
    expect(engineRow?.comparisonState).toBe('CONFLICT');
    expect(engineRow?.confirmationStatus).toBe('USER_CONFIRMED');
    await prisma.oneAutoOemVinLookupEuSuggestionSnapshot.deleteMany({ where: { providerJobId: jobId } });
    await prisma.oneAutoProviderResponse.deleteMany({ where: { jobId } });
    await prisma.oneAutoProviderJob.deleteMany({ where: { id: jobId } });
    await prisma.vehicle.deleteMany({ where: { id: ctx.vehicleId } });
    await prisma.organization.deleteMany({ where: { id: ctx.organizationId } });
  });

  it('does not write Vehicle rows during materialization', async () => {
    const ctx = await createOrgVehicle(prisma);
    const before = await prisma.vehicle.findUnique({ where: { id: ctx.vehicleId } });
    const jobId = await createSucceededVinLookupJob(prisma, {
      ...ctx,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await materialization.tryMaterializeFromSucceededJob(jobId);
    const after = await prisma.vehicle.findUnique({ where: { id: ctx.vehicleId } });
    expect(after?.updatedAt?.toISOString()).toBe(before?.updatedAt?.toISOString());
    expect(after?.oemEngineDesc).toBeNull();
    await prisma.oneAutoOemVinLookupEuSuggestionSnapshot.deleteMany({ where: { providerJobId: jobId } });
    await prisma.oneAutoProviderResponse.deleteMany({ where: { jobId } });
    await prisma.oneAutoProviderJob.deleteMany({ where: { id: jobId } });
    await prisma.vehicle.deleteMany({ where: { id: ctx.vehicleId } });
    await prisma.organization.deleteMany({ where: { id: ctx.organizationId } });
  });

  it('never returns raw VIN or provider secrets in read DTO', async () => {
    const ctx = await createOrgVehicle(prisma);
    const jobId = await createSucceededVinLookupJob(prisma, {
      ...ctx,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await materialization.tryMaterializeFromSucceededJob(jobId);
    const dto = await readService.listForVehicle(ctx.organizationId, ctx.vehicleId);
    assertSafeOemSuggestionListDto(dto);
    expect(JSON.stringify(dto)).not.toContain(TEST_VIN);
    expect(JSON.stringify(dto)).not.toContain('vehicle_identification_number');
    await prisma.oneAutoOemVinLookupEuSuggestionSnapshot.deleteMany({ where: { providerJobId: jobId } });
    await prisma.oneAutoProviderResponse.deleteMany({ where: { jobId } });
    await prisma.oneAutoProviderJob.deleteMany({ where: { id: jobId } });
    await prisma.vehicle.deleteMany({ where: { id: ctx.vehicleId } });
    await prisma.organization.deleteMany({ where: { id: ctx.organizationId } });
  });

  it('skips overlapping cleanup runs', async () => {
    const ctx = await createOrgVehicle(prisma);
    const jobId = await createSucceededVinLookupJob(prisma, {
      ...ctx,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await materialization.tryMaterializeFromSucceededJob(jobId);
    await prisma.oneAutoOemVinLookupEuSuggestionSnapshot.updateMany({
      where: { providerJobId: jobId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const first = cleanup.deleteExpiredBatch();
    const second = cleanup.deleteExpiredBatch();
    const [a, b] = await Promise.all([first, second]);
    expect(a.skippedConcurrent || b.skippedConcurrent).toBe(true);
    await prisma.oneAutoProviderResponse.deleteMany({ where: { jobId } });
    await prisma.oneAutoProviderJob.deleteMany({ where: { id: jobId } });
    await prisma.vehicle.deleteMany({ where: { id: ctx.vehicleId } });
    await prisma.organization.deleteMany({ where: { id: ctx.organizationId } });
  });

  it('isolates provider success from materialization failures', async () => {
    const ctx = await createOrgVehicle(prisma);
    const jobId = await createSucceededVinLookupJob(prisma, {
      ...ctx,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const broken = new OneAutoOemVinLookupEuSuggestionMaterializationService(
      {
        ...prisma,
        oneAutoOemVinLookupEuSuggestionSnapshot: {
          ...prisma.oneAutoOemVinLookupEuSuggestionSnapshot,
          create: () => {
            throw new Error('simulated persistence fault');
          },
        },
      } as never,
      testConfig(),
    );
    const outcome = await broken.tryMaterializeFromSucceededJob(jobId);
    expect(outcome.code).toBe('MATERIALIZATION_EXCEPTION');
    const job = await prisma.oneAutoProviderJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe(OneAutoProviderJobStatus.SUCCEEDED);
    await prisma.oneAutoProviderResponse.deleteMany({ where: { jobId } });
    await prisma.oneAutoProviderJob.deleteMany({ where: { id: jobId } });
    await prisma.vehicle.deleteMany({ where: { id: ctx.vehicleId } });
    await prisma.organization.deleteMany({ where: { id: ctx.organizationId } });
  });
});
