import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  coreVehicleReadPaginationMeta,
  type CoreVehicleReadPagination,
} from '@modules/core-vehicle-read/core-vehicle-read.pagination';
import { toCoreTripReadV1 } from './core-trip-read.v1.mapper';
import type { CoreTripReadListV1, CoreTripReadSingleV1 } from './core-trip-read.v1.types';
import { CORE_TRIP_READ_CONTRACT_VERSION } from './core-trip-read.v1.types';

/** Prisma allowlist — never return booking, GPS, provider, or analysis fields. */
export const CORE_TRIP_READ_V1_SELECT = {
  id: true,
  vehicleId: true,
  tripStatus: true,
  startTime: true,
  endTime: true,
  distanceKm: true,
} as const;

const PUBLIC_TRIP_WHERE = { isPrivateTrip: false } as const;

@Injectable()
export class CoreTripReadV1Service {
  constructor(private readonly prisma: PrismaService) {}

  async listForVehicle(
    organizationId: string,
    vehicleId: string,
    productSlug: ProductSlug,
    pagination: CoreVehicleReadPagination,
  ): Promise<CoreTripReadListV1> {
    await this.assertVehicleInOrganization(organizationId, vehicleId);

    const where = {
      vehicleId,
      ...PUBLIC_TRIP_WHERE,
      vehicle: { organizationId },
    };

    const [total, rows] = await Promise.all([
      this.prisma.vehicleTrip.count({ where }),
      this.prisma.vehicleTrip.findMany({
        where,
        select: CORE_TRIP_READ_V1_SELECT,
        orderBy: [{ startTime: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
    ]);

    return {
      version: CORE_TRIP_READ_CONTRACT_VERSION,
      organizationId,
      vehicleId,
      productSlug,
      trips: rows.map(toCoreTripReadV1),
      pagination: coreVehicleReadPaginationMeta(total, pagination),
    };
  }

  async getForVehicle(
    organizationId: string,
    vehicleId: string,
    tripId: string,
    productSlug: ProductSlug,
  ): Promise<CoreTripReadSingleV1> {
    await this.assertVehicleInOrganization(organizationId, vehicleId);

    const row = await this.prisma.vehicleTrip.findFirst({
      where: {
        id: tripId,
        vehicleId,
        ...PUBLIC_TRIP_WHERE,
        vehicle: { organizationId },
      },
      select: CORE_TRIP_READ_V1_SELECT,
    });

    if (!row) {
      throw new NotFoundException('Trip not found');
    }

    return {
      version: CORE_TRIP_READ_CONTRACT_VERSION,
      organizationId,
      vehicleId,
      productSlug,
      trip: toCoreTripReadV1(row),
    };
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
