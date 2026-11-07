import { Injectable } from '@nestjs/common';
import { UserPlatformRole } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

export type DimoSourceLinkOperatorAuthorizationEvidenceV1 = {
  authorizationReference: string;
  actorUserId: string;
  platformRole: UserPlatformRole;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
};

/**
 * Verifiable operator principal for audited DIMO source-link lifecycle mutations (CLI / ops).
 * Uses existing platform MASTER_ADMIN — does not invent new privileged roles.
 */
@Injectable()
export class DimoSourceLinkOperatorAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAuthorizedDimoSourceLinkOperator(input: {
    actorUserId: string;
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
  }): Promise<DimoSourceLinkOperatorAuthorizationEvidenceV1> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.actorUserId },
      select: { id: true, platformRole: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new VehicleOnboardingError(
        'CASE_NOT_FOUND',
        'Operator user not found or not active',
      );
    }
    if (user.platformRole !== UserPlatformRole.MASTER_ADMIN) {
      throw new VehicleOnboardingError(
        'ACTIVATION_PRECONDITION_FAILED',
        'DIMO source-link lifecycle ops require MASTER_ADMIN platform role',
        { requiredRole: UserPlatformRole.MASTER_ADMIN, actualRole: user.platformRole },
      );
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new VehicleOnboardingError('CASE_NOT_FOUND', 'Vehicle not found for organization scope');
    }

    const link = await this.prisma.vehicleDataSourceLink.findFirst({
      where: {
        id: input.providerSourceLinkId,
        vehicleId: input.vehicleId,
        provider: 'DIMO',
        sourceType: 'DIMO',
        vehicle: { organizationId: input.organizationId },
      },
      select: { id: true },
    });
    if (!link) {
      throw new VehicleOnboardingError('CASE_NOT_FOUND', 'DIMO source link not found for scope');
    }

    return {
      authorizationReference: `synqdrive:platform:MASTER_ADMIN:${user.id}`,
      actorUserId: user.id,
      platformRole: user.platformRole,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
    };
  }
}
