import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { ProductVehicleAccessService } from '@modules/products/product-vehicle-access/product-vehicle-access.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  coreVehicleReadPaginationMeta,
  parseCoreVehicleReadPagination,
  type CoreVehicleReadPagination,
} from '@modules/core-vehicle-read/core-vehicle-read.pagination';
import {
  CORE_VEHICLE_IDENTITY_V1_SELECT,
} from '@modules/core-vehicle-read/core-vehicle-read.v1.service';
import { toCoreVehicleIdentityV1 } from '@modules/core-vehicle-read/core-vehicle-read.v1.mapper';
import type {
  CoreVehicleReadListV1,
  CoreVehicleReadSingleV1,
} from '@modules/core-vehicle-read/core-vehicle-read.v1.types';
import { CORE_VEHICLE_READ_CONTRACT_VERSION } from '@modules/core-vehicle-read/core-vehicle-read.v1.types';

@Injectable()
export class CoreAppVehicleReadV1Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productVehicleAccess: ProductVehicleAccessService,
  ) {}

  async listForProduct(
    organizationId: string,
    productSlug: ProductSlug,
    pagination: CoreVehicleReadPagination,
  ): Promise<CoreVehicleReadListV1> {
    const where = await this.productVehicleAccess.getAuthorizedVehicleWhere(organizationId, productSlug);

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

  async getForProduct(
    organizationId: string,
    vehicleId: string,
    productSlug: ProductSlug,
  ): Promise<CoreVehicleReadSingleV1> {
    const authorizedWhere = await this.productVehicleAccess.getAuthorizedVehicleWhere(
      organizationId,
      productSlug,
    );

    const row = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        ...authorizedWhere,
      },
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

  parsePagination(page?: string, limit?: string): CoreVehicleReadPagination {
    return parseCoreVehicleReadPagination(page, limit);
  }
}