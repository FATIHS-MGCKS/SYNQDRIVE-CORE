import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { CanonicalBatteryHealthService } from '@modules/vehicle-intelligence/battery-health/canonical-battery-health.service';
import { PrismaService } from '@shared/database/prisma.service';
import { toCoreBatteryReadV1 } from './core-battery-read.v1.mapper';
import type { CoreBatteryReadV1 } from './core-battery-read.v1.types';

const CORE_BATTERY_READ_VEHICLE_SELECT = {
  id: true,
  organizationId: true,
  fuelType: true,
} as const;

@Injectable()
export class CoreBatteryReadV1Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly canonicalBatteryHealth: CanonicalBatteryHealthService,
  ) {}

  async getForVehicle(
    organizationId: string,
    vehicleId: string,
    productSlug: ProductSlug,
  ): Promise<CoreBatteryReadV1> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: CORE_BATTERY_READ_VEHICLE_SELECT,
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const summary = await this.canonicalBatteryHealth.getSummary(vehicleId);

    return toCoreBatteryReadV1({
      organizationId,
      vehicleId,
      productSlug,
      fuelType: vehicle.fuelType,
      summary,
    });
  }
}
