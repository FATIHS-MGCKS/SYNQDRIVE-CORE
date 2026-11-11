import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { isVehicleRegistryOperationalActive } from '@modules/vehicle-onboarding/registry/vehicle-registry-operational.util';

export type ApdsV3ShadowEligibilityResult =
  | {
      eligible: true;
      organizationId: string;
      vehicleId: string;
      providerSourceLinkId: string;
      connectivityStatus: string | null;
    }
  | { eligible: false; reason: string };

/**
 * Fleet-wide dynamic eligibility — no static vehicle allowlist.
 * Baseline poll must supply authoritative source link id (fail-closed if missing).
 */
@Injectable()
export class ApdsV3ShadowEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForBaselinePoll(
    organizationId: string,
    vehicleId: string,
    baselineProviderSourceLinkId: string | null,
  ): Promise<ApdsV3ShadowEligibilityResult> {
    if (!baselineProviderSourceLinkId) {
      return { eligible: false, reason: 'BASELINE_SOURCE_LINK_MISSING' };
    }

    const link = await this.prisma.vehicleDataSourceLink.findFirst({
      where: {
        id: baselineProviderSourceLinkId,
        vehicleId,
        provider: 'DIMO',
        vehicle: { organizationId },
      },
      select: { id: true, isActive: true },
    });
    if (!link) {
      return { eligible: false, reason: 'BASELINE_SOURCE_LINK_NOT_FOUND' };
    }
    if (!link.isActive) {
      return { eligible: false, reason: 'BASELINE_SOURCE_LINK_INACTIVE' };
    }

    return this.resolveForRequiredLink(organizationId, vehicleId, baselineProviderSourceLinkId);
  }

  private async resolveForRequiredLink(
    organizationId: string,
    vehicleId: string,
    requiredSourceLinkId: string,
  ): Promise<ApdsV3ShadowEligibilityResult> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        organizationId: true,
        registryLifecycle: true,
        dimoVehicle: { select: { connectionStatus: true } },
        dataSourceLinks: {
          where: { id: requiredSourceLinkId, provider: 'DIMO', isActive: true },
          take: 1,
          select: { id: true },
        },
      },
    });

    if (!vehicle) {
      return { eligible: false, reason: 'VEHICLE_NOT_FOUND_OR_TENANT_MISMATCH' };
    }
    if (!isVehicleRegistryOperationalActive(vehicle.registryLifecycle)) {
      return { eligible: false, reason: 'VEHICLE_NOT_OPERATIONAL' };
    }
    const link = vehicle.dataSourceLinks[0];
    if (!link) {
      return { eligible: false, reason: 'BASELINE_SOURCE_LINK_SUPERSEDED' };
    }
    const status = vehicle.dimoVehicle?.connectionStatus ?? null;
    if (
      status === 'DISCONNECTED' ||
      (status != null && status !== 'CONNECTED' && status !== 'PENDING')
    ) {
      return { eligible: false, reason: 'CONNECTIVITY_INELIGIBLE' };
    }

    return {
      eligible: true,
      organizationId: vehicle.organizationId,
      vehicleId: vehicle.id,
      providerSourceLinkId: link.id,
      connectivityStatus: status,
    };
  }
}
