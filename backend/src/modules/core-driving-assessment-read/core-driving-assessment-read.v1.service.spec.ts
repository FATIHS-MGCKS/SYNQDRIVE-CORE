import { NotFoundException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { Test } from '@nestjs/testing';
import {
  CORE_DS4_ASSESSMENT_READ_V1_SELECT,
  CORE_DS4_IMPACT_PUBLICATION_READ_V1_SELECT,
  CoreDrivingAssessmentReadV1Service,
} from './core-driving-assessment-read.v1.service';

const ORG = 'org-a';
const VEH = 'veh-a';
const TRIP = 'trip-1';
const GAP_SUFFIX = 'trip-gap-suffix';

describe('CoreDrivingAssessmentReadV1Service', () => {
  let service: CoreDrivingAssessmentReadV1Service;
  const prisma = {
    $queryRaw: jest.fn(),
    vehicle: { findFirst: jest.fn() },
    vehicleTrip: { findFirst: jest.fn() },
    diV0Ds4TripAssessmentV1: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    diV0Ds4TripDrivingImpactV2: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.vehicle.findFirst.mockResolvedValue({ id: VEH });
    prisma.vehicleTrip.findFirst.mockResolvedValue({ id: TRIP });
    const moduleRef = await Test.createTestingModule({
      providers: [CoreDrivingAssessmentReadV1Service, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CoreDrivingAssessmentReadV1Service);
  });

  it('returns NOT_AVAILABLE when no assessment row', async () => {
    prisma.diV0Ds4TripAssessmentV1.findFirst.mockResolvedValue(null);
    const result = await service.getForTrip(ORG, VEH, TRIP, ProductSlug.FLEET);
    expect(result.assessmentAvailability).toBe('NOT_AVAILABLE');
    expect(prisma.diV0Ds4TripAssessmentV1.findFirst).toHaveBeenCalledWith({
      where: { organizationId: ORG, vehicleId: VEH, tripId: TRIP },
      orderBy: [
        { sourceMotionRunCreatedAt: 'desc' },
        { computedAt: 'desc' },
        { id: 'desc' },
      ],
      select: {
        id: true,
        assessmentVersion: true,
        assessmentStatus: true,
        computedAt: true,
      },
    });
  });

  it('loads impact publication status only', async () => {
    prisma.diV0Ds4TripAssessmentV1.findFirst.mockResolvedValue({
      id: 'asm-1',
      assessmentVersion: 'DS4_TRIP_ASSESSMENT_V1',
      assessmentStatus: 'RATED',
      computedAt: new Date('2026-06-01T12:00:00.000Z'),
    });
    prisma.diV0Ds4TripDrivingImpactV2.findUnique.mockResolvedValue({
      scorePublicationStatus: 'DISABLED_MODEL_NOT_CALIBRATED',
    });
    const result = await service.getForTrip(ORG, VEH, TRIP, ProductSlug.RENTAL);
    expect(result.assessmentAvailability).toBe('AVAILABLE');
    expect(result.scorePublicationStatus).toBe('DISABLED_MODEL_NOT_CALIBRATED');
    expect(prisma.diV0Ds4TripDrivingImpactV2.findUnique).toHaveBeenCalledWith({
      where: { assessmentId: 'asm-1' },
      select: CORE_DS4_IMPACT_PUBLICATION_READ_V1_SELECT,
    });
  });

  it('binds trip visibility to vehicleId and organization', async () => {
    prisma.vehicleTrip.findFirst.mockResolvedValue(null);
    await expect(service.getForTrip(ORG, VEH, 'trip-other', ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.vehicleTrip.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ vehicleId: VEH, vehicle: { organizationId: ORG } }),
      }),
    );
    expect(prisma.diV0Ds4TripAssessmentV1.findFirst).not.toHaveBeenCalled();
  });

  it('excludes reconciled gap-split suffix trips', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        suffix_id: GAP_SUFFIX,
        parent_id: 'parent',
        suffix_start: new Date(),
        split_from: 'parent',
        split_second_start_at: null,
      },
    ]);
    prisma.vehicleTrip.findFirst.mockResolvedValue(null);
    await expect(service.getForTrip(ORG, VEH, GAP_SUFFIX, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.vehicleTrip.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { equals: GAP_SUFFIX, notIn: [GAP_SUFFIX] },
        }),
      }),
    );
  });

  it('does not perform database writes', async () => {
    prisma.diV0Ds4TripAssessmentV1.findFirst.mockResolvedValue(null);
    await service.getForTrip(ORG, VEH, TRIP, ProductSlug.RENTAL);
    expect(prisma.diV0Ds4TripAssessmentV1.create).not.toHaveBeenCalled();
    expect(prisma.diV0Ds4TripAssessmentV1.update).not.toHaveBeenCalled();
  });
});
