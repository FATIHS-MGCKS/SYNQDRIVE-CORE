import { NotFoundException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import type { DtcService } from '@modules/vehicle-intelligence/dtc/dtc.service';
import { PrismaService } from '@shared/database/prisma.service';
import { CoreDtcReadV1Service } from './core-dtc-read.v1.service';

describe('CoreDtcReadV1Service', () => {
  const organizationId = 'org-a';
  const vehicleId = 'veh-a';
  const productSlug = ProductSlug.RENTAL;

  const prisma = {
    vehicle: {
      findFirst: jest.fn(),
    },
  };

  const dtc = {
    getSummary: jest.fn(),
  };

  let service: CoreDtcReadV1Service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CoreDtcReadV1Service(
      prisma as unknown as PrismaService,
      dtc as unknown as DtcService,
    );
  });

  it('throws 404 when vehicle not in organization', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.getForVehicle(organizationId, vehicleId, productSlug)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(dtc.getSummary).not.toHaveBeenCalled();
  });

  it('calls getSummary only after org-bound vehicle check', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: vehicleId, organizationId });
    dtc.getSummary.mockResolvedValue({
      status: 'clean',
      activeFaultCount: 0,
      activeFaultPreview: [],
      worstSeverityBand: 'unknown',
      lastCheckedAt: '2026-06-01T10:00:00.000Z',
      lastSuccessfulCheckAt: '2026-06-01T10:00:00.000Z',
      isStale: false,
      message: 'ok',
    });

    const dto = await service.getForVehicle(organizationId, vehicleId, productSlug);
    expect(dtc.getSummary).toHaveBeenCalledWith(vehicleId);
    expect(dto.organizationId).toBe(organizationId);
    expect(dto.monitoringStatus).toBe('clean');
  });
});
