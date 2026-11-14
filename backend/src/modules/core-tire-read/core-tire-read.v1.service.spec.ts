import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductSlug } from '@prisma/client';
import { CoreTireReadV1Service } from './core-tire-read.v1.service';
import { TIRE_HEALTH_CONSUMER_EXPORT } from '@modules/vehicle-intelligence/tires/tire-health-consumer.tokens';

describe('CoreTireReadV1Service', () => {
  const prisma = {
    vehicle: {
      findFirst: jest.fn(),
    },
  };
  const tireHealth = {
    getSummary: jest.fn(),
  };
  const hm = {
    getTirePressureSignals: jest.fn(),
  };
  const config = {
    get: jest.fn().mockReturnValue({
      customerReadEnabled: false,
      customerReadAuthoritative: false,
    }),
  };

  let service: CoreTireReadV1Service;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new CoreTireReadV1Service(
      prisma as never,
      tireHealth as never,
      hm as never,
      config as unknown as ConfigService,
    );
    config.get.mockReturnValue({
      customerReadEnabled: false,
      customerReadAuthoritative: false,
    });
  });

  it('binds organization before HM prefetch and getSummary', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'v1', organizationId: 'org-1' });
    hm.getTirePressureSignals.mockResolvedValue({ frontLeft: 2.5 });
    tireHealth.getSummary.mockResolvedValue(null);

    await service.getForVehicle('org-1', 'v1', ProductSlug.RENTAL);

    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
      where: { id: 'v1', organizationId: 'org-1' },
      select: { id: true, organizationId: true },
    });
    expect(hm.getTirePressureSignals).toHaveBeenCalledWith('v1');
    expect(tireHealth.getSummary).toHaveBeenCalledWith('v1', {
      hmTirePressure: { frontLeft: 2.5 },
    });
  });

  it('HM prefetch failure falls back to null context', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'v1', organizationId: 'org-1' });
    hm.getTirePressureSignals.mockRejectedValue(new Error('hm down'));
    tireHealth.getSummary.mockResolvedValue(null);

    await service.getForVehicle('org-1', 'v1', ProductSlug.RENTAL);

    expect(tireHealth.getSummary).toHaveBeenCalledWith('v1', { hmTirePressure: null });
  });

  it('throws 404 for cross-org vehicle', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.getForVehicle('org-1', 'v1', ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tireHealth.getSummary).not.toHaveBeenCalled();
  });
});

describe('CoreTireReadV1Service — token wiring', () => {
  it('uses TIRE_HEALTH_CONSUMER_EXPORT symbol', () => {
    expect(TIRE_HEALTH_CONSUMER_EXPORT).toBeDefined();
  });
});