import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import type { ServiceComplianceService } from '@modules/vehicle-intelligence/service-compliance/service-compliance.service';
import { SERVICE_COMPLIANCE_CONSUMER_EXPORT } from '@modules/vehicle-intelligence/service-compliance/service-compliance-consumer.tokens';
import { PrismaService } from '@shared/database/prisma.service';
import { toCoreServiceIntelligenceReadV1 } from './core-service-intelligence-read.v1.mapper';
import type { CoreServiceIntelligenceReadV1 } from './core-service-intelligence-read.v1.types';

const CORE_SERVICE_INTELLIGENCE_VEHICLE_SELECT = {
  id: true,
  organizationId: true,
} as const;

@Injectable()
export class CoreServiceIntelligenceReadV1Service {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_COMPLIANCE_CONSUMER_EXPORT)
    private readonly serviceCompliance: ServiceComplianceService,
  ) {}

  async getForVehicle(
    organizationId: string,
    vehicleId: string,
    productSlug: ProductSlug,
  ): Promise<CoreServiceIntelligenceReadV1> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: CORE_SERVICE_INTELLIGENCE_VEHICLE_SELECT,
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const detailed = await this.serviceCompliance.evaluateNextServiceDetailed(vehicleId);
    return toCoreServiceIntelligenceReadV1({
      organizationId,
      vehicleId,
      productSlug,
      detailed,
    });
  }
}
