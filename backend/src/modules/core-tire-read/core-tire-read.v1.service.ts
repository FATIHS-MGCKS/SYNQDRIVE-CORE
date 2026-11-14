import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import type { TireHealthService } from '@modules/vehicle-intelligence/tires/tire-health.service';
import { TIRE_HEALTH_CONSUMER_EXPORT } from '@modules/vehicle-intelligence/tires/tire-health-consumer.tokens';
import { HmSignalUsageService } from '@modules/high-mobility/high-mobility-signal-usage.service';
import { PrismaService } from '@shared/database/prisma.service';
import { toCoreTireReadV1 } from './core-tire-read.v1.mapper';

const CORE_TIRE_READ_VEHICLE_SELECT = {
  id: true,
  organizationId: true,
} as const;

@Injectable()
export class CoreTireReadV1Service {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TIRE_HEALTH_CONSUMER_EXPORT)
    private readonly tireHealth: TireHealthService,
    private readonly hm: HmSignalUsageService,
  ) {}

  async getForVehicle(
    organizationId: string,
    vehicleId: string,
    productSlug: ProductSlug,
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: CORE_TIRE_READ_VEHICLE_SELECT,
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const hmTirePressure = await this.hm
      .getTirePressureSignals(vehicleId)
      .catch(() => null);

    const summary = await this.tireHealth.getSummary(vehicleId, { hmTirePressure });

    return toCoreTireReadV1({
      organizationId,
      vehicleId,
      productSlug,
      summary,
    });
  }
}