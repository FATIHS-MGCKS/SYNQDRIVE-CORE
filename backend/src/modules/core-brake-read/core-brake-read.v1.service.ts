import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ProductSlug } from '@prisma/client';
import type { BrakeHealthService } from '@modules/vehicle-intelligence/brakes/brake-health.service';
import { BRAKE_HEALTH_CONSUMER_EXPORT } from '@modules/vehicle-intelligence/brakes/brake-health-consumer.tokens';
import { PrismaService } from '@shared/database/prisma.service';
import { toCoreBrakeReadV1 } from './core-brake-read.v1.mapper';

const CORE_BRAKE_READ_VEHICLE_SELECT = {
  id: true,
  organizationId: true,
} as const;

@Injectable()
export class CoreBrakeReadV1Service {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BRAKE_HEALTH_CONSUMER_EXPORT)
    private readonly brakeHealth: BrakeHealthService,
  ) {}

  async getForVehicle(organizationId: string, vehicleId: string, productSlug: ProductSlug) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: CORE_BRAKE_READ_VEHICLE_SELECT,
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const summary = await this.brakeHealth.getSummary(vehicleId, { syncAlerts: false });

    return toCoreBrakeReadV1({
      organizationId,
      vehicleId,
      productSlug,
      summary,
    });
  }
}