import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  applyHiddenCustomerSuffixTripExclusion,
  listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList,
} from '@modules/vehicle-intelligence/trips/trip-customer-list-reconciled-gap-split-suffix.util';
import { toCoreDrivingAssessmentReadV1 } from './core-driving-assessment-read.v1.mapper';
import type { CoreDrivingAssessmentReadV1 } from './core-driving-assessment-read.v1.types';

/** Prisma allowlist — never load fingerprints, JSON blobs, or score numerics. */
export const CORE_DS4_ASSESSMENT_READ_V1_SELECT = {
  id: true,
  assessmentVersion: true,
  assessmentStatus: true,
  evidenceQuality: true,
  computedAt: true,
} as const;

export const CORE_DS4_IMPACT_PUBLICATION_READ_V1_SELECT = {
  scorePublicationStatus: true,
} as const;

const ds4AssessmentOrderBy = [
  { sourceMotionRunCreatedAt: 'desc' as const },
  { computedAt: 'desc' as const },
  { id: 'desc' as const },
];

@Injectable()
export class CoreDrivingAssessmentReadV1Service {
  constructor(private readonly prisma: PrismaService) {}

  async getForTrip(
    organizationId: string,
    vehicleId: string,
    tripId: string,
    productSlug: ProductSlug,
  ): Promise<CoreDrivingAssessmentReadV1> {
    await this.assertTripVisibleForRead(organizationId, vehicleId, tripId);

    const assessment = await this.prisma.diV0Ds4TripAssessmentV1.findFirst({
      where: { organizationId, vehicleId, tripId },
      orderBy: ds4AssessmentOrderBy,
      select: CORE_DS4_ASSESSMENT_READ_V1_SELECT,
    });

    const impact = assessment
      ? await this.prisma.diV0Ds4TripDrivingImpactV2.findUnique({
          where: { assessmentId: assessment.id },
          select: CORE_DS4_IMPACT_PUBLICATION_READ_V1_SELECT,
        })
      : null;

    return toCoreDrivingAssessmentReadV1({
      organizationId,
      vehicleId,
      tripId,
      productSlug,
      assessment,
      impact,
    });
  }

  private async assertTripVisibleForRead(
    organizationId: string,
    vehicleId: string,
    tripId: string,
  ): Promise<void> {
    await this.assertVehicleInOrganization(organizationId, vehicleId);

    const hiddenSuffixIds = await listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList(
      this.prisma,
      vehicleId,
    );

    const trip = await this.prisma.vehicleTrip.findFirst({
      where: applyHiddenCustomerSuffixTripExclusion(
        { id: { equals: tripId }, vehicleId, vehicle: { organizationId } },
        hiddenSuffixIds,
      ),
      select: { id: true },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }
  }

  private async assertVehicleInOrganization(organizationId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
  }
}
