import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import type { DtcService } from '@modules/vehicle-intelligence/dtc/dtc.service';
import { DTC_CONSUMER_EXPORT } from '@modules/vehicle-intelligence/dtc/dtc-consumer.tokens';
import { PrismaService } from '@shared/database/prisma.service';
import { toCoreDtcReadV1 } from './core-dtc-read.v1.mapper';
import type { CoreDtcReadV1 } from './core-dtc-read.v1.types';

const CORE_DTC_READ_VEHICLE_SELECT = {
  id: true,
  organizationId: true,
} as const;

@Injectable()
export class CoreDtcReadV1Service {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DTC_CONSUMER_EXPORT)
    private readonly dtc: DtcService,
  ) {}

  async getForVehicle(
    organizationId: string,
    vehicleId: string,
    productSlug: ProductSlug,
  ): Promise<CoreDtcReadV1> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: CORE_DTC_READ_VEHICLE_SELECT,
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const summary = await this.dtc.getSummary(vehicleId);
    return toCoreDtcReadV1({
      organizationId,
      vehicleId,
      productSlug,
      summary,
    });
  }
}
