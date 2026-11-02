import { Injectable, Optional } from '@nestjs/common';
import { VehicleTireSetup } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildAuthoritativeV3UnavailableRead } from './tire-health-v3-read.adapter';
import { TireHealthV3ReadService } from './tire-health-v3-read.service';
import { TireWearModelService } from './tire-wear-model.service';

/**
 * Read-only tire setup listing + wear analysis passthrough.
 * All mutations go through {@link TireLifecycleService}.
 */
@Injectable()
export class TiresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wearModel: TireWearModelService,
    @Optional() private readonly tireHealthV3Read?: TireHealthV3ReadService,
  ) {}

  async findSetupsByVehicle(vehicleId: string): Promise<VehicleTireSetup[]> {
    return this.prisma.vehicleTireSetup.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      include: { measurements: { orderBy: { measuredAt: 'desc' } } },
    });
  }

  async getWearAnalysis(vehicleId: string) {
    const analysis = await this.wearModel.computeWearAnalysis(vehicleId);
    if (!analysis || !this.tireHealthV3Read?.isCustomerReadEnabled()) {
      return analysis;
    }
    const setup = await this.prisma.vehicleTireSetup.findFirst({
      where: { vehicleId, status: 'ACTIVE' },
      select: { id: true },
    });
    const authoritative = this.tireHealthV3Read.isCustomerReadAuthoritative();
    if (!setup) {
      if (!authoritative) {
        return { ...analysis, wearReadModel: 'v2' as const, wearV3: undefined };
      }
      return {
        ...analysis,
        wearReadModel: 'v3' as const,
        wearV3: buildAuthoritativeV3UnavailableRead('no_result'),
      };
    }

    const resolution = await this.tireHealthV3Read.resolveCustomerReadForApi(setup.id);
    if (resolution.kind === 'inactive') {
      return analysis;
    }
    if (!authoritative) {
      const wearV3 = resolution.kind === 'ok' ? resolution.read : undefined;
      return { ...analysis, wearReadModel: 'v2' as const, wearV3 };
    }

    const wearV3 =
      resolution.kind === 'ok'
        ? resolution.read
        : buildAuthoritativeV3UnavailableRead(resolution.reason);
    return { ...analysis, wearReadModel: 'v3' as const, wearV3 };
  }
}
