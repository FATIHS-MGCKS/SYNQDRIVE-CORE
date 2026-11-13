import { NotFoundException } from '@nestjs/common';
import { FuelType, ProductSlug } from '@prisma/client';
import { CanonicalBatteryHealthService } from '@modules/vehicle-intelligence/battery-health/canonical-battery-health.service';
import { PrismaService } from '@shared/database/prisma.service';
import { CoreBatteryReadV1Service } from './core-battery-read.v1.service';

describe('CoreBatteryReadV1Service', () => {
  const organizationId = 'org-a';
  const vehicleId = 'veh-a';
  const productSlug = ProductSlug.RENTAL;

  const prisma = {
    vehicle: {
      findFirst: jest.fn(),
    },
  };

  const canonicalBatteryHealth = {
    getSummary: jest.fn(),
  };

  let service: CoreBatteryReadV1Service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CoreBatteryReadV1Service(
      prisma as unknown as PrismaService,
      canonicalBatteryHealth as unknown as CanonicalBatteryHealthService,
    );
  });

  it('throws 404 when vehicle not in organization', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.getForVehicle(organizationId, vehicleId, productSlug)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(canonicalBatteryHealth.getSummary).not.toHaveBeenCalled();
  });

  it('scopes getSummary to bound vehicle after org check', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: vehicleId,
      organizationId,
      fuelType: FuelType.ELECTRIC,
    });
    canonicalBatteryHealth.getSummary.mockResolvedValue({
      generatedAt: '2026-06-01T12:00:00.000Z',
      canonical: { isEv: true, hv: { supported: true }, dataQuality: { aggregate: { status: 'UNAVAILABLE' } }, lv: { profile: { supported: true, profile: 'ICE', driveProfile: 'UNKNOWN', lvAssessmentAllowed: true }, canonical: { primaryTruth: { source: 'UNAVAILABLE' } } } },
      lv: { freshness: { isFresh: false, observedAt: null, ageMs: 0, isStale: true } },
      hv: { freshness: { isFresh: false, observedAt: null, ageMs: 0, isStale: true } },
    });

    const dto = await service.getForVehicle(organizationId, vehicleId, productSlug);
    expect(canonicalBatteryHealth.getSummary).toHaveBeenCalledWith(vehicleId);
    expect(dto.organizationId).toBe(organizationId);
    expect(dto.vehicleId).toBe(vehicleId);
    expect(dto.batteryAvailability).toBe('AVAILABLE');
  });
});
