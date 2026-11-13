import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildPaginatedResult, parsePagination, type PaginationParams } from '@shared/utils/pagination';
import { toCoreVehicleIdentityV1 } from './core-vehicle-read.v1.mapper';
import type {
  CoreVehicleReadListV1,
  CoreVehicleReadSingleV1,
} from './core-vehicle-read.v1.types';
import { CORE_VEHICLE_READ_CONTRACT_VERSION } from './core-vehicle-read.v1.types';

const VEHICLE_IDENTITY_SELECT = {
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
    pagination: PaginationParams,
  ): Promise<CoreVehicleReadListV1> {
    const { skip, take } = parsePagination(pagination);
    const where = { organizationId };

    const [total, rows] = await Promise.all([
      this.prisma.vehicle.count({ where }),
      this.prisma.vehicle.findMany({
        where,
        select: VEHICLE_IDENTITY_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    const page = buildPaginatedResult(
      rows.map(toCoreVehicleIdentityV1),
      total,
      pagination,
    );

    return {
      version: CORE_VEHICLE_READ_CONTRACT_VERSION,
      organizationId,
      productSlug,
      vehicles: page.data,
      pagination: page.meta,
    };
  }

  async getForOrganization(
    organizationId: string,
    vehicleId: string,
    productSlug: ProductSlug,
  ): Promise<CoreVehicleReadSingleV1> {
    const row = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: VEHICLE_IDENTITY_SELECT,
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
