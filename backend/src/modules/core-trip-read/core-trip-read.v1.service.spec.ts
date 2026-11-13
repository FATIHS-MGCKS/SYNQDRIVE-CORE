import { NotFoundException } from '@nestjs/common';
import { ProductSlug, TripStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { Test } from '@nestjs/testing';
import { parseCoreVehicleReadPagination } from '@modules/core-vehicle-read/core-vehicle-read.pagination';
import { CORE_TRIP_READ_V1_SELECT, CoreTripReadV1Service } from './core-trip-read.v1.service';

const ORG = 'org-a';
const VEH = 'veh-a';
const GAP_PARENT = 'trip-gap-parent';
const GAP_SUFFIX = 'trip-gap-suffix';
const tripRow = {
  id: 'trip-1',
  vehicleId: VEH,
  tripStatus: TripStatus.COMPLETED,
  startTime: new Date('2026-01-01T00:00:00.000Z'),
  endTime: new Date('2026-01-01T01:00:00.000Z'),
  distanceKm: 10,
};
const reconciledSuffixCandidate = {
  suffix_id: GAP_SUFFIX,
  parent_id: GAP_PARENT,
  suffix_start: new Date('2026-01-02T00:00:00.000Z'),
  split_from: GAP_PARENT,
  split_second_start_at: null,
};

describe('CoreTripReadV1Service', () => {
  let service: CoreTripReadV1Service;
  const prisma = {
    $queryRaw: jest.fn(),
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
    prisma.$queryRaw.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [CoreTripReadV1Service, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CoreTripReadV1Service);
  });

  it('list query is bound to vehicle and organization without isPrivateTrip filter', async () => {
    prisma.vehicleTrip.count.mockResolvedValue(0);
    prisma.vehicleTrip.findMany.mockResolvedValue([]);
    const pagination = parseCoreVehicleReadPagination('1', '20');
    await service.listForVehicle(ORG, VEH, ProductSlug.RENTAL, pagination);
    const where = { vehicleId: VEH, vehicle: { organizationId: ORG } };
    expect(prisma.vehicleTrip.count).toHaveBeenCalledWith({ where });
    expect(prisma.vehicleTrip.findMany).toHaveBeenCalledWith({
      where,
      select: CORE_TRIP_READ_V1_SELECT,
      orderBy: [{ startTime: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    });
  });

  it('excludes reconciled gap-split suffix from list and count with one lookup', async () => {
    prisma.$queryRaw.mockResolvedValue([reconciledSuffixCandidate]);
    prisma.vehicleTrip.count.mockResolvedValue(0);
    prisma.vehicleTrip.findMany.mockResolvedValue([]);
    await service.listForVehicle(ORG, VEH, ProductSlug.RENTAL, parseCoreVehicleReadPagination());
    const where = {
      vehicleId: VEH,
      vehicle: { organizationId: ORG },
      id: { notIn: [GAP_SUFFIX] },
    };
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.vehicleTrip.count).toHaveBeenCalledWith({ where });
    expect(prisma.vehicleTrip.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
  });

  it('does not exclude suffix candidates without conclusive lineage', async () => {
    prisma.$queryRaw.mockResolvedValue([{ ...reconciledSuffixCandidate, split_from: 'trip-unrelated' }]);
    prisma.vehicleTrip.count.mockResolvedValue(0);
    prisma.vehicleTrip.findMany.mockResolvedValue([]);
    await service.listForVehicle(ORG, VEH, ProductSlug.RENTAL, parseCoreVehicleReadPagination());
    expect(prisma.vehicleTrip.count).toHaveBeenCalledWith({
      where: { vehicleId: VEH, vehicle: { organizationId: ORG } },
    });
  });

  it('returns 404 for vehicle not in organization', async () => {
    prisma.vehicle.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.listForVehicle(ORG, 'veh-foreign', ProductSlug.RENTAL, parseCoreVehicleReadPagination()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.vehicleTrip.findMany).not.toHaveBeenCalled();
  });

  it('detail query binds trip id, vehicleId and organization', async () => {
    prisma.vehicleTrip.findFirst.mockResolvedValue(null);
    await expect(
      service.getForVehicle(ORG, VEH, 'trip-other-vehicle', ProductSlug.RENTAL),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.vehicleTrip.findFirst).toHaveBeenCalledWith({
      where: { id: { equals: 'trip-other-vehicle' }, vehicleId: VEH, vehicle: { organizationId: ORG } },
      select: CORE_TRIP_READ_V1_SELECT,
    });
  });

  it('detail query excludes reconciled gap-split suffix', async () => {
    prisma.$queryRaw.mockResolvedValue([reconciledSuffixCandidate]);
    prisma.vehicleTrip.findFirst.mockResolvedValue(null);
    await expect(service.getForVehicle(ORG, VEH, GAP_SUFFIX, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.vehicleTrip.findFirst).toHaveBeenCalledWith({
      where: {
        id: { equals: GAP_SUFFIX, notIn: [GAP_SUFFIX] },
        vehicleId: VEH,
        vehicle: { organizationId: ORG },
      },
      select: CORE_TRIP_READ_V1_SELECT,
    });
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
