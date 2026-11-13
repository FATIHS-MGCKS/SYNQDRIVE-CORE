import { NotFoundException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import type { ServiceComplianceService } from '@modules/vehicle-intelligence/service-compliance/service-compliance.service';
import { PrismaService } from '@shared/database/prisma.service';
import { CoreServiceIntelligenceReadV1Service } from './core-service-intelligence-read.v1.service';

describe('CoreServiceIntelligenceReadV1Service', () => {
  const organizationId = 'org-a';
  const vehicleId = 'veh-a';
  const productSlug = ProductSlug.RENTAL;

  const prisma = { vehicle: { findFirst: jest.fn() } };
  const serviceCompliance = { evaluateNextServiceDetailed: jest.fn() };

  let service: CoreServiceIntelligenceReadV1Service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CoreServiceIntelligenceReadV1Service(
      prisma as unknown as PrismaService,
      serviceCompliance as unknown as ServiceComplianceService,
    );
  });

  it('404 when vehicle not in organization', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.getForVehicle(organizationId, vehicleId, productSlug)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(serviceCompliance.evaluateNextServiceDetailed).not.toHaveBeenCalled();
  });

  it('calls evaluateNextServiceDetailed once after tenant check', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: vehicleId, organizationId });
    serviceCompliance.evaluateNextServiceDetailed.mockResolvedValue({
      nextService: {
        trackingStatus: 'NO_TRACKING',
        source: null,
        distanceToNextServiceKm: null,
        timeToNextServiceDays: null,
        lastUpdatedAt: null,
        serviceSourceLabel: null,
        severity: 'INFO',
        blocksRental: false,
        title: '',
        description: '',
        message: '',
        hmDistanceFromOem: false,
        hmTimeFromOem: false,
        hmDerivedDueDate: null,
      },
      forecast: null,
    });

    await service.getForVehicle(organizationId, vehicleId, productSlug);
    expect(serviceCompliance.evaluateNextServiceDetailed).toHaveBeenCalledTimes(1);
    expect(serviceCompliance.evaluateNextServiceDetailed).toHaveBeenCalledWith(vehicleId);
  });
});
