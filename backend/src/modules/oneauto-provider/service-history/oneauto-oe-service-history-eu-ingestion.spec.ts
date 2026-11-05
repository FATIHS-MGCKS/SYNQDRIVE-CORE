import { ConfigService } from '@nestjs/config';
import {
  OneAutoOeServiceHistoryEuIngestionStatus,
  OneAutoProviderJobStatus,
  Prisma,
  ServiceEventOrigin,
  ServiceEventType,
} from '@prisma/client';
import { OneAutoOeServiceHistoryEuIngestionService } from './oneauto-oe-service-history-eu-ingestion.service';
import { ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU } from './oneauto-service-history-eu.types';
import {
  buildOneAutoOeServiceHistoryEuJobSourceEventKey,
  buildOneAutoOeServiceHistoryEuVehicleHistoricalEventKey,
} from './oneauto-oe-service-history-eu-event-identity.util';
import { mapOneAutoOeServiceHistoryEuEvent } from './oneauto-oe-service-history-eu-event.mapper';
import { runOneAutoOeServiceHistoryIngestionSafely } from './oneauto-oe-service-history-eu-ingestion-safe.util';

const ARTEON_VIN = 'WVWZZZ3HZLE010725';
const ORG_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const VEHICLE_ID = '8c850ff1-4201-432b-af2e-2711dbc7ca48';
const JOB_ID = 'job-arteon-success';
const JOB_ID_2 = 'job-arteon-success-2';

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

function successEnvelope() {
  return {
    success: true,
    result: {
      vehicle_identification_number: ARTEON_VIN,
      service_events: ARTEON_EVENTS,
    },
  };
}

function jobRow(overrides?: {
  id?: string;
  oeServiceHistoryEuIngestion?: {
    status: OneAutoOeServiceHistoryEuIngestionStatus;
    eventsDiscovered: number;
    eventsIngested: number;
  } | null;
}) {
  return {
    id: overrides?.id ?? JOB_ID,
    organizationId: ORG_ID,
    vehicleId: VEHICLE_ID,
    serviceSku: ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU,
    status: OneAutoProviderJobStatus.SUCCEEDED,
    vinSnapshot: ARTEON_VIN,
    responses: [
      {
        id: 'resp-1',
        fetchedAt: new Date('2026-11-05T10:00:00.000Z'),
        httpStatus: 200,
        responseBodyJson: successEnvelope(),
      },
    ],
    oeServiceHistoryEuIngestion: overrides?.oeServiceHistoryEuIngestion ?? null,
  };
}

function createHarness(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const config = {
    get: jest.fn((key: string) =>
      key === 'oneautoProvider' ? { oeServiceHistoryIngestionEnabled: enabled } : {},
    ),
  } as unknown as ConfigService;

  const vehicleEventsByHistoricalKey = new Map<string, { id: string }>();
  let createCounter = 0;

  const oneAutoOeServiceHistoryEuIngestionEventLink = {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(2),
  };

  const vehicleServiceEvent = {
    create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      createCounter += 1;
      const id = `evt-${createCounter}`;
      const historicalKey = data.oneAutoVehicleHistoricalEventKey as string | undefined;
      if (historicalKey) {
        vehicleEventsByHistoricalKey.set(historicalKey, { id });
      }
      return { id, ...data };
    }),
    findFirst: jest.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.oneAutoVehicleHistoricalEventKey) {
        return vehicleEventsByHistoricalKey.get(String(where.oneAutoVehicleHistoricalEventKey)) ?? null;
      }
      if (where.externalSourceEventKey && where.oneAutoProviderJobId) {
        for (const [key, row] of vehicleEventsByHistoricalKey) {
          if (key) return row;
        }
      }
      return null;
    }),
  };

  const ingestionRows = new Map<
    string,
    { status: OneAutoOeServiceHistoryEuIngestionStatus; eventsDiscovered: number; eventsIngested: number }
  >();

  const oneAutoOeServiceHistoryEuIngestion = {
    create: jest.fn().mockImplementation(async ({ data }: any) => {
      const id = data.providerJobId as string;
      ingestionRows.set(id, {
        status: data.status,
        eventsDiscovered: data.eventsDiscovered ?? 0,
        eventsIngested: data.eventsIngested ?? 0,
      });
      return {};
    }),
    upsert: jest.fn().mockImplementation(async ({ where, create, update }: any) => {
      const id = where.providerJobId as string;
      const existing = ingestionRows.get(id);
      if (!existing) {
        ingestionRows.set(id, {
          status: create.status,
          eventsDiscovered: create.eventsDiscovered ?? 0,
          eventsIngested: create.eventsIngested ?? 0,
        });
      } else if (update?.status) {
        if (existing.status !== OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED) {
          existing.status = update.status;
        }
        if (update.eventsDiscovered != null) existing.eventsDiscovered = update.eventsDiscovered;
        if (update.eventsIngested != null) existing.eventsIngested = update.eventsIngested;
      }
      return {};
    }),
    updateMany: jest.fn().mockImplementation(async ({ where, data }: any) => {
      const row = ingestionRows.get(where.providerJobId);
      if (!row) return { count: 0 };
      if (
        where.status?.not === OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED &&
        row.status === OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED
      ) {
        return { count: 0 };
      }
      if (data.status) row.status = data.status;
      if (data.eventsDiscovered != null) row.eventsDiscovered = data.eventsDiscovered;
      if (data.eventsIngested != null) row.eventsIngested = data.eventsIngested;
      return { count: 1 };
    }),
    findUnique: jest.fn().mockImplementation(async ({ where }: { where: { providerJobId: string } }) => {
      const row = ingestionRows.get(where.providerJobId);
      if (!row) return null;
      return { status: row.status, eventsDiscovered: row.eventsDiscovered, eventsIngested: row.eventsIngested };
    }),
  };

  const prisma = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    oneAutoProviderJob: {
      findUnique: jest.fn(),
    },
    vehicle: {
      findFirst: jest.fn(),
    },
    vehicleServiceEvent,
    oneAutoOeServiceHistoryEuIngestion,
    oneAutoOeServiceHistoryEuIngestionEventLink,
  };

  const svc = new OneAutoOeServiceHistoryEuIngestionService(prisma as never, config);
  return {
    svc,
    prisma,
    vehicleServiceEvent,
    oneAutoOeServiceHistoryEuIngestion,
    vehicleEventsByHistoricalKey,
    ingestionRows,
  };
}

describe('OneAuto OE_SERVICE_HISTORY_EU ingestion (offline)', () => {
  const prev = process.env.ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED;

  beforeEach(() => {
    process.env.ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED = '1';
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED;
    else process.env.ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED = prev;
  });

  it('maps Arteon fixture with delivery inspection separated from maintenance', () => {
    const maintenance = mapOneAutoOeServiceHistoryEuEvent(ARTEON_EVENTS[0]!);
    const delivery = mapOneAutoOeServiceHistoryEuEvent(ARTEON_EVENTS[1]!);
    expect(maintenance.ok).toBe(true);
    expect(delivery.ok).toBe(true);
    if (!maintenance.ok || !delivery.ok) return;
    expect(maintenance.value.deliveryInspection).toBe(false);
    expect(delivery.value.deliveryInspection).toBe(true);
    expect(maintenance.value.eventType).toBe(ServiceEventType.OIL_CHANGE);
    expect(delivery.value.eventType).toBe(ServiceEventType.OTHER);
  });

  it('builds stable job and vehicle historical keys (duplicate-safe, not date-only)', () => {
    const jobKey = buildOneAutoOeServiceHistoryEuJobSourceEventKey({
      providerJobId: JOB_ID,
      event: ARTEON_EVENTS[0]!,
      eventIndex: 0,
    });
    const vehicleKey = buildOneAutoOeServiceHistoryEuVehicleHistoricalEventKey({
      normalizedVin: ARTEON_VIN,
      event: ARTEON_EVENTS[0]!,
    });
    expect(jobKey).toHaveLength(64);
    expect(vehicleKey).not.toEqual(jobKey);
    expect(
      buildOneAutoOeServiceHistoryEuVehicleHistoricalEventKey({
        normalizedVin: ARTEON_VIN,
        event: ARTEON_EVENTS[0]!,
      }),
    ).toEqual(vehicleKey);
  });

  it('ingests exactly two Arteon events on HTTP 200 success envelope', async () => {
    const { svc, prisma, vehicleServiceEvent } = createHarness();
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue(jobRow());
    prisma.vehicle.findFirst.mockResolvedValue({ vin: ARTEON_VIN });

    const result = await svc.tryIngestFromSucceededJob(JOB_ID);
    expect(result.outcome).toBe('SUCCEEDED');
    expect(result.eventsDiscovered).toBe(2);
    expect(result.eventsIngested).toBe(2);
    expect(vehicleServiceEvent.create).toHaveBeenCalledTimes(2);
    expect(vehicleServiceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          origin: ServiceEventOrigin.ONEAUTO,
          organizationId: ORG_ID,
          vehicleId: VEHICLE_ID,
          oneAutoProviderJobId: JOB_ID,
        }),
      }),
    );
  });

  it('is idempotent on repeated ingestion after SUCCEEDED', async () => {
    const { svc, prisma } = createHarness();
    const row = jobRow();
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue(row);
    prisma.vehicle.findFirst.mockResolvedValue({ vin: ARTEON_VIN });

    const first = await svc.tryIngestFromSucceededJob(JOB_ID);
    expect(first.outcome).toBe('SUCCEEDED');
    row.oeServiceHistoryEuIngestion = {
      status: OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED,
      eventsDiscovered: 2,
      eventsIngested: 2,
    };
    const second = await svc.tryIngestFromSucceededJob(JOB_ID);
    expect(second.outcome).toBe('ALREADY_SUCCEEDED');
  });

  it('links duplicate vehicle events across two successful provider jobs (no second create)', async () => {
    const { svc, prisma, vehicleServiceEvent } = createHarness();
    prisma.vehicle.findFirst.mockResolvedValue({ vin: ARTEON_VIN });

    prisma.oneAutoProviderJob.findUnique.mockResolvedValueOnce(jobRow({ id: JOB_ID }));
    const first = await svc.tryIngestFromSucceededJob(JOB_ID);
    expect(first.eventsIngested).toBe(2);
    expect(vehicleServiceEvent.create).toHaveBeenCalledTimes(2);

    prisma.oneAutoProviderJob.findUnique.mockResolvedValueOnce(jobRow({ id: JOB_ID_2 }));
    vehicleServiceEvent.create.mockClear();
    const second = await svc.tryIngestFromSucceededJob(JOB_ID_2);
    expect(second.outcome).toBe('SUCCEEDED');
    expect(second.eventsIngested).toBe(2);
    expect(vehicleServiceEvent.create).not.toHaveBeenCalled();
  });

  it('counts linked events after P2002 race on create', async () => {
    const { svc, prisma, vehicleServiceEvent } = createHarness();
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue(jobRow());
    prisma.vehicle.findFirst.mockResolvedValue({ vin: ARTEON_VIN });

    vehicleServiceEvent.create
      .mockResolvedValueOnce({ id: 'e1' })
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
      )
      .mockResolvedValueOnce({ id: 'e2' });

    vehicleServiceEvent.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'e1-race' })
      .mockResolvedValueOnce({ id: 'e1-race' });

    const result = await svc.tryIngestFromSucceededJob(JOB_ID);
    expect(result.eventsIngested).toBe(2);
    expect(result.outcome).toBe('SUCCEEDED');
  });

  it('runs concurrent ingestion without downgrading SUCCEEDED', async () => {
    const { svc, prisma, ingestionRows } = createHarness();
    const row = jobRow();
    prisma.oneAutoProviderJob.findUnique.mockImplementation(async () => ({ ...row }));
    prisma.vehicle.findFirst.mockResolvedValue({ vin: ARTEON_VIN });

    const [a, b] = await Promise.all([
      svc.tryIngestFromSucceededJob(JOB_ID),
      svc.tryIngestFromSucceededJob(JOB_ID),
    ]);
    expect(a.outcome).toBe('SUCCEEDED');
    expect(b.outcome).toBe('SUCCEEDED');
    expect(ingestionRows.get(JOB_ID)?.status).toBe(
      OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED,
    );
  });

  it('marks ingestion FAILED on DB error without throwing (provider job untouched)', async () => {
    const { svc, prisma, vehicleServiceEvent, ingestionRows } = createHarness();
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue(jobRow());
    prisma.vehicle.findFirst.mockResolvedValue({ vin: ARTEON_VIN });
    vehicleServiceEvent.create.mockRejectedValue(new Error('db_down'));

    const result = await svc.tryIngestFromSucceededJob(JOB_ID);
    expect(result.outcome).toBe('FAILED');
    const row = ingestionRows.get(JOB_ID);
    expect(row?.status).toBe(OneAutoOeServiceHistoryEuIngestionStatus.FAILED);
  });

  it('safe wrapper swallows unexpected throws', async () => {
    const ingestion = {
      tryIngestFromSucceededJob: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const logger = { error: jest.fn() } as any;
    await expect(
      runOneAutoOeServiceHistoryIngestionSafely(ingestion, JOB_ID, logger),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it('rejects cross-VIN binding', async () => {
    const { svc, prisma } = createHarness();
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue(jobRow());
    prisma.vehicle.findFirst.mockResolvedValue({ vin: 'WAUZZZF48GA096957' });
    const result = await svc.tryIngestFromSucceededJob(JOB_ID);
    expect(result.outcome).toBe('SKIPPED_BINDING');
  });

  it('skips provider failure / no-data envelopes without creating events', async () => {
    const { svc, prisma, vehicleServiceEvent } = createHarness();
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue({
      ...jobRow(),
      status: OneAutoProviderJobStatus.FAILED,
      responses: [
        {
          id: 'resp-fail',
          fetchedAt: new Date(),
          httpStatus: 206,
          responseBodyJson: { success: false, result: null, error: 'no data' },
        },
      ],
    });
    const result = await svc.tryIngestFromSucceededJob(JOB_ID);
    expect(result.outcome).toBe('SKIPPED_JOB_STATE');
    expect(vehicleServiceEvent.create).not.toHaveBeenCalled();
  });

  it('returns DISABLED when feature flag off', async () => {
    const { svc, prisma } = createHarness({ enabled: false });
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue(null);
    const result = await svc.tryIngestFromSucceededJob(JOB_ID);
    expect(result.outcome).toBe('DISABLED');
  });

  it('persists SUCCEEDED 0/0 audit for empty provider history', async () => {
    const { svc, prisma, ingestionRows } = createHarness();
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue({
      ...jobRow(),
      responses: [
        {
          id: 'resp-empty',
          fetchedAt: new Date(),
          httpStatus: 200,
          responseBodyJson: {
            success: true,
            result: {
              vehicle_identification_number: ARTEON_VIN,
              service_events: [],
            },
          },
        },
      ],
    });
    prisma.vehicle.findFirst.mockResolvedValue({ vin: ARTEON_VIN });
    const first = await svc.tryIngestFromSucceededJob(JOB_ID);
    expect(first.outcome).toBe('SUCCEEDED');
    expect(first.eventsIngested).toBe(0);
    expect(ingestionRows.get(JOB_ID)?.status).toBe(OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED);

    prisma.oneAutoProviderJob.findUnique.mockResolvedValue({
      ...jobRow(),
      oeServiceHistoryEuIngestion: {
        status: OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED,
        eventsDiscovered: 0,
        eventsIngested: 0,
      },
      responses: [
        {
          id: 'resp-empty',
          fetchedAt: new Date(),
          httpStatus: 200,
          responseBodyJson: {
            success: true,
            result: {
              vehicle_identification_number: ARTEON_VIN,
              service_events: [],
            },
          },
        },
      ],
    });
    const second = await svc.tryIngestFromSucceededJob(JOB_ID);
    expect(second.outcome).toBe('ALREADY_SUCCEEDED');
  });

  it('keeps two distinct events on the same calendar day', () => {
    const day = '2024-06-01';
    const a = buildOneAutoOeServiceHistoryEuVehicleHistoricalEventKey({
      normalizedVin: ARTEON_VIN,
      event: {
        date_of_service_event: day,
        mileage_observed: 1000,
        mileage_unit: 'km',
        service_provider: 'Shop A',
        service_type: 'Maintenance',
        service_actions: ['Oil'],
      },
    });
    const b = buildOneAutoOeServiceHistoryEuVehicleHistoricalEventKey({
      normalizedVin: ARTEON_VIN,
      event: {
        date_of_service_event: day,
        mileage_observed: 1000,
        mileage_unit: 'km',
        service_provider: 'Shop B',
        service_type: 'Repair',
        service_actions: ['Brakes'],
      },
    });
    expect(a).not.toEqual(b);
  });
});
