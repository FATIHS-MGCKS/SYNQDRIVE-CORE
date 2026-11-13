import { NotFoundException } from '@nestjs/common';
import { ProductSlug, TripStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { Test } from '@nestjs/testing';
import { parseCoreVehicleReadPagination } from '@modules/core-vehicle-read/core-vehicle-read.pagination';
import { CORE_TRIP_READ_V1_SELECT, CoreTripReadV1Service } from './core-trip-read.v1.service';

const ORG = 'org-a';
const VEH = 'veh-a';
const tripRow = {
  id: 'trip-1',
  vehicleId: VEH,
  tripStatus: TripStatus.COMPLETED,
  startTime: new Date('2026-01-01T00:00:00.000Z'),
  endTime: new Date('2026-01-01T01:00:00.000Z'),
  distanceKm: 10,
};

describe('CoreTripReadV1Service', () => {
  let service: CoreTripReadV1Service;
  const prisma = {
    vehicle: { findFirst: jest.fn() },
    vehicleTrip: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.vehicle.findFirst.mockResolvedValue({ id: VEH });
    const moduleRef = await Test.createTestingModule({
      providers: [CoreTripReadV1Service, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CoreTripReadV1Service);
  });

  it('excludes private trips in list query', async () => {
    prisma.vehicleTrip.count.mockResolvedValue(0);
    prisma.vehicleTrip.findMany.mockResolvedValue([]);
    const pagination = parseCoreVehicleReadPagination('1', '20');
    await service.listForVehicle(ORG, VEH, ProductSlug.RENTAL, pagination);
    expect(prisma.vehicleTrip.findMany).toHaveBeenCalledWith({
      where: {
        vehicleId: VEH,
        isPrivateTrip: false,
        vehicle: { organizationId: ORG },
      },
      select: CORE_TRIP_READ_V1_SELECT,
      orderBy: [{ startTime: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    });
  });

  it('returns 404 for vehicle not in organization', async () => {
    prisma.vehicle.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.listForVehicle(ORG, 'veh-foreign', ProductSlug.RENTAL, parseCoreVehicleReadPagination()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.vehicleTrip.findMany).not.toHaveBeenCalled();
  });

  it('returns 404 when trip not on vehicle', async () => {
    prisma.vehicleTrip.findFirst.mockResolvedValue(null);
    await expect(
      service.getForVehicle(ORG, VEH, 'trip-other-vehicle', ProductSlug.RENTAL),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns single trip DTO', async () => {
    prisma.vehicleTrip.findFirst.mockResolvedValue(tripRow);
    const result = await service.getForVehicle(ORG, VEH, tripRow.id, ProductSlug.FLEET);
    expect(result.trip.tripId).toBe(tripRow.id);
    expect(result.productSlug).toBe(ProductSlug.FLEET);
  });

  it('does not perform database writes', async () => {
    prisma.vehicleTrip.count.mockResolvedValue(1);
    prisma.vehicleTrip.findMany.mockResolvedValue([tripRow]);
    await service.listForVehicle(ORG, VEH, ProductSlug.RENTAL, parseCoreVehicleReadPagination());
    expect(prisma.vehicleTrip.update).not.toHaveBeenCalled();
    expect(prisma.vehicleTrip.create).not.toHaveBeenCalled();
  });
});
