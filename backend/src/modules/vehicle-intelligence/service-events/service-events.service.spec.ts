import { Prisma } from '@prisma/client';
import { ServiceEventsService } from './service-events.service';

describe('ServiceEventsService.createFromDocumentExtraction', () => {
  const baseInput = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    documentExtractionId: 'ext-svc-1',
    documentActionIdempotencyKey: 'ext-svc-1:v1:fp:a1:CREATE_SERVICE_EVENT',
    eventType: 'FULL_SERVICE' as const,
    eventDate: '2026-05-12',
    odometerKm: 84500,
    workshopName: 'Autohaus Nord',
    notes: 'Inspektion',
    costCents: 42000,
    documentUrl: 'storage://service.pdf',
  };

  const serviceOverdueTasks = {
    onServiceHistoryChanged: jest.fn().mockResolvedValue(undefined),
  };

  function createHarness() {
    const prisma = {
      vehicleServiceEvent: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      vehicle: {
        findFirst: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const groundTruthBackedSourceGuard = {
      assertServiceEventMutable: jest.fn().mockResolvedValue(undefined),
    };
    const svc = new ServiceEventsService(
      prisma as any,
      serviceOverdueTasks as any,
      groundTruthBackedSourceGuard as any,
    );
    return { svc, prisma, groundTruthBackedSourceGuard };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns existing service event on retry for the same documentExtractionId', async () => {
    const { svc, prisma } = createHarness();
    prisma.vehicleServiceEvent.findUnique.mockResolvedValue({
      id: 'evt-existing',
      organizationId: 'org-1',
      documentExtractionId: 'ext-svc-1',
      eventType: 'FULL_SERVICE',
      eventDate: new Date('2026-05-12'),
    });

    const result = await svc.createFromDocumentExtraction(baseInput);

    expect(result.id).toBe('evt-existing');
    expect(prisma.vehicleServiceEvent.create).not.toHaveBeenCalled();
  });

  it('creates service event with documentExtractionId and confirmed event date', async () => {
    const { svc, prisma } = createHarness();
    prisma.vehicleServiceEvent.findUnique.mockResolvedValue(null);
    prisma.vehicleServiceEvent.create.mockResolvedValue({
      id: 'evt-new',
      eventType: 'FULL_SERVICE',
      eventDate: new Date('2026-05-12'),
    });

    const result = await svc.createFromDocumentExtraction(baseInput);

    expect(result.id).toBe('evt-new');
    expect(prisma.vehicleServiceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentExtractionId: 'ext-svc-1',
          organizationId: 'org-1',
          eventDate: new Date('2026-05-12'),
          origin: 'AI_UPLOAD',
        }),
      }),
    );
  });

  it('handles parallel create races via unique constraint and returns existing event', async () => {
    const { svc, prisma } = createHarness();
    const racedEvent = {
      id: 'evt-raced',
      organizationId: 'org-1',
      documentExtractionId: 'ext-svc-1',
      eventType: 'FULL_SERVICE',
      eventDate: new Date('2026-05-12'),
    };
    let lookupCount = 0;
    prisma.vehicleServiceEvent.findUnique.mockImplementation(async () => {
      lookupCount += 1;
      if (lookupCount <= 2) return null;
      return racedEvent;
    });
    prisma.vehicleServiceEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const results = await Promise.all([
      svc.createFromDocumentExtraction(baseInput),
      svc.createFromDocumentExtraction(baseInput),
    ]);

    expect(results[0].id).toBe('evt-raced');
    expect(results[1].id).toBe('evt-raced');
    expect(prisma.vehicleServiceEvent.create).toHaveBeenCalledTimes(2);
  });
});

describe('ServiceEventsService.create', () => {
  function createHarness() {
    const prisma = {
      vehicle: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      vehicleServiceEvent: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn(),
      },
    };
    const svc = new ServiceEventsService(
      prisma as any,
      {
        onServiceHistoryChanged: jest.fn().mockResolvedValue(undefined),
      } as any,
      { assertServiceEventMutable: jest.fn().mockResolvedValue(undefined) } as any,
    );
    return { svc, prisma };
  }

  it('populates organizationId from vehicle and rejects missing vehicle', async () => {
    const { svc, prisma } = createHarness();
    prisma.vehicle.findUnique.mockResolvedValue({
      id: 'veh-1',
      organizationId: 'org-vehicle',
    });
    prisma.vehicleServiceEvent.create.mockResolvedValue({ id: 'evt-1' });
    prisma.vehicleServiceEvent.findFirst.mockResolvedValue(null);
    prisma.vehicle.update.mockResolvedValue({});

    await svc.create(
      'veh-1',
      { eventType: 'BATTERY_REPLACEMENT', eventDate: '2026-01-15' },
      { userId: 'user-1' },
    );

    expect(prisma.vehicleServiceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId: 'veh-1',
          organizationId: 'org-vehicle',
        }),
      }),
    );
  });
});

describe('ServiceEventsService.applyComplianceVehicleUpdateFromExtraction', () => {
  const complianceInput = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    documentExtractionId: 'ext-tuv-1',
    documentActionIdempotencyKey: 'ext-tuv-1:v1:fp:a2:UPDATE_VEHICLE_COMPLIANCE_DATES',
    documentType: 'TUV_REPORT' as const,
    lastInspectionDate: new Date('2026-06-01'),
    nextValidUntilDate: new Date('2028-06-01'),
  };

  function createHarness() {
    const prisma = {
      vehicleServiceEvent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'evt-tuv-1',
          organizationId: 'org-1',
          documentExtractionId: 'ext-tuv-1',
        }),
      },
      vehicle: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const svc = new ServiceEventsService(
      prisma as any,
      { onServiceHistoryChanged: jest.fn() } as any,
      { assertServiceEventMutable: jest.fn().mockResolvedValue(undefined) } as any,
    );
    return { svc, prisma };
  }

  it('applies compliance dates when vehicle fields differ', async () => {
    const { svc, prisma } = createHarness();
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'veh-1',
      lastTuvDate: null,
      nextTuvDate: null,
      lastBokraftDate: null,
      nextBokraftDate: null,
    });
    prisma.vehicle.update.mockResolvedValue({ id: 'veh-1' });

    const result = await svc.applyComplianceVehicleUpdateFromExtraction(complianceInput);

    expect(result.applied).toBe(true);
    expect(prisma.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          lastTuvDate: complianceInput.lastInspectionDate,
          nextTuvDate: complianceInput.nextValidUntilDate,
        },
      }),
    );
  });

  it('skips idempotent re-apply when compliance dates already match', async () => {
    const { svc, prisma } = createHarness();
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'veh-1',
      lastTuvDate: complianceInput.lastInspectionDate,
      nextTuvDate: complianceInput.nextValidUntilDate,
      lastBokraftDate: null,
      nextBokraftDate: null,
    });

    const result = await svc.applyComplianceVehicleUpdateFromExtraction(complianceInput);

    expect(result.skipped).toBe(true);
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });

  it('recovers from partial failure between service event and vehicle update on retry', async () => {
    const { svc, prisma } = createHarness();
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'veh-1',
      lastTuvDate: null,
      nextTuvDate: null,
      lastBokraftDate: null,
      nextBokraftDate: null,
    });
    prisma.vehicle.update
      .mockRejectedValueOnce(new Error('vehicle update failed'))
      .mockResolvedValueOnce({ id: 'veh-1' });

    await expect(svc.applyComplianceVehicleUpdateFromExtraction(complianceInput)).rejects.toThrow(
      'vehicle update failed',
    );

    const retry = await svc.applyComplianceVehicleUpdateFromExtraction(complianceInput);
    expect(retry.applied).toBe(true);
    expect(prisma.vehicleServiceEvent.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.vehicle.update).toHaveBeenCalledTimes(2);
  });
});

describe('ServiceEventsService — Service Info V2 structured payload + duplicate guard', () => {
  function createHarness(existingDuplicate: Record<string, unknown> | null = null) {
    const prisma = {
      vehicle: {
        findUnique: jest.fn().mockImplementation(async (args?: { where: { id: string }; select?: Record<string, boolean> }) => {
          if (args?.select?.lastOilChangeDate) {
            return {
              lastServiceDate: null,
              lastServiceOdometerKm: null,
              lastOilChangeDate: null,
              lastOilChangeOdometerKm: null,
            };
          }
          return { id: 'veh-1', organizationId: 'org-1' };
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      vehicleServiceEvent: {
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'evt-new', ...data })),
        findFirst: jest.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
          where.eventDate && typeof where.eventDate === 'object' && 'gte' in (where.eventDate as object)
            ? existingDuplicate
            : null,
        ),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const svc = new ServiceEventsService(
      prisma as any,
      { onServiceHistoryChanged: jest.fn().mockResolvedValue(undefined) } as any,
      { assertServiceEventMutable: jest.fn().mockResolvedValue(undefined) } as any,
    );
    return { svc, prisma };
  }

  it('stores performedWork + serviceKind under the shared service_actions / service_kind payload keys', async () => {
    const { svc, prisma } = createHarness();
    await svc.create('veh-1', {
      eventType: 'FULL_SERVICE',
      eventDate: '2026-09-01',
      odometerKm: 97000,
      performedWork: [' Engine: oil and filter change. ', 'Brake fluid replaced.', 'Brake fluid replaced.'],
      serviceKind: 'INSPECTION_LARGE',
    } as any);
    expect(prisma.vehicleServiceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourcePayloadJson: {
            service_actions: ['Engine: oil and filter change.', 'Brake fluid replaced.'],
            service_kind: 'INSPECTION_LARGE',
          },
        }),
      }),
    );
  });

  it('rejects a same-day / same-type / same-odometer manual duplicate with 409 SERVICE_EVENT_DUPLICATE', async () => {
    const { svc, prisma } = createHarness({
      id: 'evt-existing',
      eventDate: new Date('2026-09-01T10:00:00Z'),
      odometerKm: 97000,
      origin: 'MANUAL',
    });
    await expect(
      svc.create('veh-1', { eventType: 'FULL_SERVICE', eventDate: '2026-09-01', odometerKm: 97000 } as any),
    ).rejects.toMatchObject({ response: { code: 'SERVICE_EVENT_DUPLICATE', existingEventId: 'evt-existing' } });
    expect(prisma.vehicleServiceEvent.create).not.toHaveBeenCalled();
  });

  it('creates when the user explicitly allows the duplicate', async () => {
    const { svc, prisma } = createHarness({ id: 'evt-existing', eventDate: new Date('2026-09-01'), odometerKm: 97000, origin: 'MANUAL' });
    await svc.create('veh-1', {
      eventType: 'FULL_SERVICE',
      eventDate: '2026-09-01',
      odometerKm: 97000,
      allowDuplicate: true,
    } as any);
    expect(prisma.vehicleServiceEvent.create).toHaveBeenCalledTimes(1);
  });

  it('extraction apply persists performedWork for forecast coverage', async () => {
    const { svc, prisma } = createHarness();
    await svc.createFromDocumentExtraction({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      documentExtractionId: 'ext-1',
      eventType: 'FULL_SERVICE',
      eventDate: '2026-05-12',
      performedWork: ['Spark plugs replaced'],
      serviceKind: null,
    });
    expect(prisma.vehicleServiceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sourcePayloadJson: { service_actions: ['Spark plugs replaced'] } }),
      }),
    );
  });
});
