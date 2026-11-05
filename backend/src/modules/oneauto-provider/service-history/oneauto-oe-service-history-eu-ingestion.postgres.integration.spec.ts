/**
 * ONEAUTO OE_SERVICE_HISTORY_EU ingestion — PostgreSQL migration + concurrency gates.
 * ONEAUTO_OE_SERVICE_HISTORY_PG=1 DATABASE_URL=postgresql://.../synqdrive_ci_ephemeral npm test -- oneauto-oe-service-history-eu-ingestion.postgres.integration
 */
import { ConfigService } from '@nestjs/config';
import {
  BusinessType,
  DriveType,
  FuelType,
  HealthStatus,
  OneAutoOeServiceHistoryEuIngestionStatus,
  OneAutoProviderJobStatus,
  PrismaClient,
  ProductSlug,
  ServiceEventOrigin,
  VehicleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ensureOrganizationProductEntitlement } from '@modules/vehicle-onboarding/testing/org-product-test.harness';
import { OneAutoOeServiceHistoryEuIngestionService } from './oneauto-oe-service-history-eu-ingestion.service';
import { ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU } from './oneauto-service-history-eu.types';

const LIVE = process.env.ONEAUTO_OE_SERVICE_HISTORY_PG === '1';
const ARTEON_VIN = 'WVWZZZ3HZLE010725';

const ARTEON_EVENTS = [
  {
    date_of_service_event: '2024-04-22',
    mileage_observed: 79439,
    mileage_unit: 'km',
    service_provider: 'ATU Hannoversch Münden',
    service_type: 'Maintenance',
    service_actions: ['Flexible oil change service.'],
  },
  {
    date_of_service_event: '2020-01-30',
    mileage_observed: 0,
    mileage_unit: 'km',
    service_provider: 'Volkswagen Wolfsburg',
    service_type: 'Delivery inspection',
    service_actions: ['Delivery inspection.'],
  },
];

function testConfig(): ConfigService {
  return {
    get: (key: string) =>
      key === 'oneautoProvider'
        ? { oeServiceHistoryIngestionEnabled: true }
        : {},
  } as unknown as ConfigService;
}

function assertDisposableDatabaseUrl(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('ONEAUTO_OE_SERVICE_HISTORY_PG=1 requires DATABASE_URL');
  const dbName = new URL(url).pathname.replace(/^\//, '').split('?')[0] ?? '';
  if (!/synqdrive|test|ci|oneauto/i.test(dbName)) {
    throw new Error(`Refusing non-disposable database name: ${dbName}`);
  }
}

async function seedOrgVehicle(prisma: PrismaClient) {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  await prisma.organization.create({
    data: {
      id: organizationId,
      companyName: `ONEAUTO-SH ${organizationId.slice(0, 8)}`,
      businessType: BusinessType.FLEET,
    },
  });
  await ensureOrganizationProductEntitlement(prisma, organizationId, ProductSlug.FLEET);
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      organizationId,
      vin: ARTEON_VIN,
      make: 'VW',
      model: 'Arteon',
      year: 2020,
      fuelType: FuelType.GASOLINE,
      status: VehicleStatus.AVAILABLE,
      healthStatus: HealthStatus.GOOD,
      driveType: DriveType.FWD,
    },
  });
  return { organizationId, vehicleId };
}

async function createArteonJob(
  prisma: PrismaClient,
  input: { organizationId: string; vehicleId: string; jobId?: string; emptyHistory?: boolean },
) {
  const jobId = input.jobId ?? randomUUID();
  await prisma.oneAutoProviderJob.create({
    data: {
      id: jobId,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      vinSnapshot: ARTEON_VIN,
      serviceSku: ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU,
      status: OneAutoProviderJobStatus.SUCCEEDED,
      idempotencyKey: randomUUID(),
      initiatingMasterAdminUserId: randomUUID(),
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    },
  });
  const responseBodyJson = input.emptyHistory
    ? {
        success: true,
        result: {
          vehicle_identification_number: ARTEON_VIN,
          service_events: [],
        },
      }
    : {
        success: true,
        result: {
          vehicle_identification_number: ARTEON_VIN,
          service_events: ARTEON_EVENTS,
        },
      };
  const response = await prisma.oneAutoProviderResponse.create({
    data: {
      jobId,
      httpStatus: 200,
      responseBodyJson,
      fetchedAt: new Date('2026-11-05T10:00:00.000Z'),
    },
  });
  return { jobId, responseId: response.id };
}

(LIVE ? describe : describe.skip)(
  'oneauto-oe-service-history-eu-ingestion.postgres.integration',
  () => {
    let prisma: PrismaClient;
    let ingestion: OneAutoOeServiceHistoryEuIngestionService;

    beforeAll(async () => {
      assertDisposableDatabaseUrl();
      process.env.ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED = '1';
      prisma = new PrismaClient();
      await prisma.$connect();
      ingestion = new OneAutoOeServiceHistoryEuIngestionService(prisma as never, testConfig());
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('has ingestion FK constraints and unique indexes', async () => {
      const fk = await prisma.$queryRaw<Array<{ conname: string }>>`
        SELECT conname FROM pg_constraint
        WHERE conname LIKE 'one_auto_oe_service_history_eu_ingestions_%_fkey'
      `;
      expect(fk.length).toBeGreaterThanOrEqual(3);
      const uq = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes
        WHERE indexname IN (
          'one_auto_oe_service_history_eu_ingestions_provider_job_id_key',
          'vehicle_service_events_oneauto_vehicle_hist_uq'
        )
      `;
      expect(uq.length).toBe(2);
    });

    it('ingests two Arteon events and is idempotent on repeat', async () => {
      const { organizationId, vehicleId } = await seedOrgVehicle(prisma);
      const { jobId } = await createArteonJob(prisma, { organizationId, vehicleId });

      const first = await ingestion.tryIngestFromSucceededJob(jobId);
      expect(first.outcome).toBe('SUCCEEDED');
      expect(first.eventsIngested).toBe(2);

      const events = await prisma.vehicleServiceEvent.findMany({
        where: { vehicleId, origin: ServiceEventOrigin.ONEAUTO },
      });
      expect(events).toHaveLength(2);

      const second = await ingestion.tryIngestFromSucceededJob(jobId);
      expect(second.outcome).toBe('ALREADY_SUCCEEDED');

      const audit = await prisma.oneAutoOeServiceHistoryEuIngestion.findUnique({
        where: { providerJobId: jobId },
      });
      expect(audit?.status).toBe(OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED);
      expect(audit?.eventsIngested).toBe(2);
    });

    it('persists SUCCEEDED 0/0 audit for empty history and returns ALREADY_SUCCEEDED on repeat', async () => {
      const { organizationId, vehicleId } = await seedOrgVehicle(prisma);
      const { jobId } = await createArteonJob(prisma, {
        organizationId,
        vehicleId,
        emptyHistory: true,
      });

      const first = await ingestion.tryIngestFromSucceededJob(jobId);
      expect(first.outcome).toBe('SUCCEEDED');
      expect(first.eventsIngested).toBe(0);

      const audit = await prisma.oneAutoOeServiceHistoryEuIngestion.findUnique({
        where: { providerJobId: jobId },
      });
      expect(audit?.status).toBe(OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED);
      expect(audit?.eventsDiscovered).toBe(0);
      expect(audit?.eventsIngested).toBe(0);

      const second = await ingestion.tryIngestFromSucceededJob(jobId);
      expect(second.outcome).toBe('ALREADY_SUCCEEDED');
    });

    it('handles parallel ingestion without corrupting terminal SUCCEEDED audit', async () => {
      const { organizationId, vehicleId } = await seedOrgVehicle(prisma);
      const { jobId } = await createArteonJob(prisma, { organizationId, vehicleId });

      const prismaB = new PrismaClient();
      await prismaB.$connect();
      const ingestionB = new OneAutoOeServiceHistoryEuIngestionService(prismaB as never, testConfig());

      const [a, b] = await Promise.all([
        ingestion.tryIngestFromSucceededJob(jobId),
        ingestionB.tryIngestFromSucceededJob(jobId),
      ]);
      await prismaB.$disconnect();

      expect([a.outcome, b.outcome]).toEqual(
        expect.arrayContaining(['SUCCEEDED', 'ALREADY_SUCCEEDED']),
      );

      const audit = await prisma.oneAutoOeServiceHistoryEuIngestion.findUnique({
        where: { providerJobId: jobId },
      });
      expect(audit?.status).toBe(OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED);
      expect(audit?.eventsIngested).toBe(2);

      const events = await prisma.vehicleServiceEvent.count({
        where: { vehicleId, origin: ServiceEventOrigin.ONEAUTO },
      });
      expect(events).toBe(2);
    });
  },
);
