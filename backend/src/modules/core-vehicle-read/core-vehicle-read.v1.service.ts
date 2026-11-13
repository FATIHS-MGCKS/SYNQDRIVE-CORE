import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  coreVehicleReadPaginationMeta,
  type CoreVehicleReadPagination,
} from './core-vehicle-read.pagination';
import { toCoreVehicleIdentityV1 } from './core-vehicle-read.v1.mapper';
import type {
  CoreVehicleReadListV1,
  CoreVehicleReadSingleV1,
} from './core-vehicle-read.v1.types';
import { CORE_VEHICLE_READ_CONTRACT_VERSION } from './core-vehicle-read.v1.types';

/** Explicit Prisma allowlist for core.vehicle.read.v1 — referenced by service tests. */
export const CORE_VEHICLE_IDENTITY_V1_SELECT = {
  id: true,
  make: true,
  model: true,
  year: true,
  fuelType: true,
  registryLifecycle: true,
} as const;

@Injectable()
export class CoreVehicleReadV1Service {
  constructor(private readonly prisma: PrismaService) {}

  async listForOrganization(
    organizationId: string,
    productSlug: ProductSlug,
    pagination: CoreVehicleReadPagination,
  ): Promise<CoreVehicleReadListV1> {
    const where = { organizationId };

    const [total, rows] = await Promise.all([
      this.prisma.vehicle.count({ where }),
      this.prisma.vehicle.findMany({
        where,
        select: CORE_VEHICLE_IDENTITY_V1_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
    ]);

    return {
      version: CORE_VEHICLE_READ_CONTRACT_VERSION,
      organizationId,
      productSlug,
      vehicles: rows.map(toCoreVehicleIdentityV1),
      pagination: coreVehicleReadPaginationMeta(total, pagination),
    };
  }

  async getForOrganization(
    organizationId: string,
    vehicleId: string,
    productSlug: ProductSlug,
  ): Promise<CoreVehicleReadSingleV1> {
    const row = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: CORE_VEHICLE_IDENTITY_V1_SELECT,
    });

    if (!row) {
      throw new NotFoundException('Vehicle not found');
    }

    return {
      version: CORE_VEHICLE_READ_CONTRACT_VERSION,
      organizationId,
      productSlug,
      vehicle: toCoreVehicleIdentityV1(row),
    };
  }
}
