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
import { buildOneAutoOeServiceHistoryEuSourceEventKey } from './oneauto-oe-service-history-eu-event-identity.util';
import { mapOneAutoOeServiceHistoryEuEvent } from './oneauto-oe-service-history-eu-event.mapper';

const ARTEON_VIN = 'WVWZZZ3HZLE010725';
const ORG_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const VEHICLE_ID = '8c850ff1-4201-432b-af2e-2711dbc7ca48';
const JOB_ID = 'job-arteon-success';

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

function createHarness(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const config = {
    get: jest.fn((key: string) =>
      key === 'oneautoProvider' ? { oeServiceHistoryIngestionEnabled: enabled } : {},
    ),
  } as unknown as ConfigService;

  const vehicleServiceEvent = {
    create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
  };
  const oneAutoOeServiceHistoryEuIngestion = {
    upsert: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  };
  const prisma = {
    oneAutoProviderJob: {
      findUnique: jest.fn(),
    },
    vehicle: {
      findFirst: jest.fn(),
    },
    vehicleServiceEvent,
    oneAutoOeServiceHistoryEuIngestion,
  };

  const svc = new OneAutoOeServiceHistoryEuIngestionService(prisma as never, config);
  return { svc, prisma, vehicleServiceEvent, oneAutoOeServiceHistoryEuIngestion };
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

  it('builds stable source event keys (duplicate-safe, not date-only)', () => {
    const k1 = buildOneAutoOeServiceHistoryEuSourceEventKey({
      providerJobId: JOB_ID,
      event: ARTEON_EVENTS[0]!,
      eventIndex: 0,
    });
    const k2 = buildOneAutoOeServiceHistoryEuSourceEventKey({
      providerJobId: JOB_ID,
      event: ARTEON_EVENTS[1]!,
      eventIndex: 1,
    });
    expect(k1).not.toEqual(k2);
    expect(
      buildOneAutoOeServiceHistoryEuSourceEventKey({
        providerJobId: JOB_ID,
        event: ARTEON_EVENTS[0]!,
        eventIndex: 0,
      }),
    ).toEqual(k1);
  });

  it('ingests exactly two Arteon events on HTTP 200 success envelope', async () => {
    const { svc, prisma, vehicleServiceEvent } = createHarness();
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue({
      id: JOB_ID,
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
      oeServiceHistoryEuIngestion: null,
    });
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

  it('is idempotent on repeated ingestion (P2002 race)', async () => {
    const { svc, prisma, vehicleServiceEvent } = createHarness();
    const jobRow: {
      id: string;
      organizationId: string;
      vehicleId: string;
      serviceSku: string;
      status: OneAutoProviderJobStatus;
      vinSnapshot: string;
      responses: Array<{
        id: string;
        fetchedAt: Date;
        httpStatus: number;
        responseBodyJson: unknown;
      }>;
      oeServiceHistoryEuIngestion: {
        status: OneAutoOeServiceHistoryEuIngestionStatus;
        eventsDiscovered: number;
        eventsIngested: number;
      } | null;
    } = {
      id: JOB_ID,
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      serviceSku: ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU,
      status: OneAutoProviderJobStatus.SUCCEEDED,
      vinSnapshot: ARTEON_VIN,
      responses: [
        {
          id: 'resp-1',
          fetchedAt: new Date(),
          httpStatus: 200,
          responseBodyJson: successEnvelope(),
        },
      ],
      oeServiceHistoryEuIngestion: null,
    };
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue(jobRow);
    prisma.vehicle.findFirst.mockResolvedValue({ vin: ARTEON_VIN });
    vehicleServiceEvent.create
      .mockResolvedValueOnce({ id: 'e1' })
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
      )
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
      );

    const first = await svc.tryIngestFromSucceededJob(JOB_ID);
    expect(first.eventsIngested).toBe(1);
    jobRow.oeServiceHistoryEuIngestion = {
      status: OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED,
      eventsDiscovered: 2,
      eventsIngested: 2,
    };
    const second = await svc.tryIngestFromSucceededJob(JOB_ID);
    expect(second.outcome).toBe('ALREADY_SUCCEEDED');
  });

  it('rejects cross-VIN binding', async () => {
    const { svc, prisma } = createHarness();
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue({
      id: JOB_ID,
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      serviceSku: ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU,
      status: OneAutoProviderJobStatus.SUCCEEDED,
      vinSnapshot: ARTEON_VIN,
      responses: [
        {
          id: 'resp-1',
          fetchedAt: new Date(),
          httpStatus: 200,
          responseBodyJson: successEnvelope(),
        },
      ],
      oeServiceHistoryEuIngestion: null,
    });
    prisma.vehicle.findFirst.mockResolvedValue({ vin: 'WAUZZZF48GA096957' });
    const result = await svc.tryIngestFromSucceededJob(JOB_ID);
    expect(result.outcome).toBe('SKIPPED_BINDING');
  });

  it('skips provider failure / no-data envelopes without creating events', async () => {
    const { svc, prisma, vehicleServiceEvent } = createHarness();
    prisma.oneAutoProviderJob.findUnique.mockResolvedValue({
      id: JOB_ID,
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      serviceSku: ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU,
      status: OneAutoProviderJobStatus.FAILED,
      vinSnapshot: ARTEON_VIN,
      responses: [
        {
          id: 'resp-fail',
          fetchedAt: new Date(),
          httpStatus: 206,
          responseBodyJson: {
            success: false,
            result: null,
            error: 'no data',
          },
        },
      ],
      oeServiceHistoryEuIngestion: null,
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
});
