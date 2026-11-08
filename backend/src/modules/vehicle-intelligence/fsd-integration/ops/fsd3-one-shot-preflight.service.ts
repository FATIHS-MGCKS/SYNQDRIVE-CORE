import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSourceLinkOperatorAuthorizationService } from '@modules/vehicle-onboarding/services/dimo-source-link-operator-authorization.service';
import { FsdDiscoveryPersistenceRepository } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import { buildFsdDimoConnectionIdentityFingerprint } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.contract.v1';
import type { Fsd3OneShotCliScopeV1 } from './fsd3-one-shot-owner-approval.v1';

export type Fsd3OneShotPreflightResultV1 = {
  status: 'PREFLIGHT_OK';
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  dimoVehicleId: string | null;
  dimoTokenId: number | null;
  connectionIdentityFingerprint: string | null;
  linkActive: boolean;
  authorizationReference: string;
};

@Injectable()
export class Fsd3OneShotPreflightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operatorAuth: DimoSourceLinkOperatorAuthorizationService,
    private readonly persistence: FsdDiscoveryPersistenceRepository,
  ) {}

  async runAuthorizedReadOnlyPreflight(input: {
    scope: Fsd3OneShotCliScopeV1;
    actorUserId: string;
  }): Promise<Fsd3OneShotPreflightResultV1> {
    const auth = await this.operatorAuth.assertAuthorizedDimoSourceLinkOperator({
      actorUserId: input.actorUserId,
      organizationId: input.scope.organizationId,
      vehicleId: input.scope.vehicleId,
      providerSourceLinkId: input.scope.providerSourceLinkId,
    });

    const link = await this.prisma.vehicleDataSourceLink.findFirst({
      where: {
        id: input.scope.providerSourceLinkId,
        vehicleId: input.scope.vehicleId,
        provider: 'DIMO',
        sourceType: 'DIMO',
        vehicle: { organizationId: input.scope.organizationId },
      },
      include: { dimoVehicle: true },
    });
    if (!link) {
      throw new Error('SOURCE_LINK_NOT_FOUND');
    }

    await this.persistence.assertActiveSourceLinkForDispatch({
      organizationId: input.scope.organizationId,
      vehicleId: input.scope.vehicleId,
      providerSourceLinkId: input.scope.providerSourceLinkId,
    });

    const dimoVehicleId = link.dimoVehicleId;
    const tokenId = link.dimoVehicle?.tokenId ?? null;
    let connectionIdentityFingerprint: string | null = null;
    if (dimoVehicleId && tokenId != null) {
      connectionIdentityFingerprint = buildFsdDimoConnectionIdentityFingerprint({
        dimoVehicleId,
        tokenId,
      });
    }

    return {
      status: 'PREFLIGHT_OK',
      organizationId: input.scope.organizationId,
      vehicleId: input.scope.vehicleId,
      providerSourceLinkId: input.scope.providerSourceLinkId,
      dimoVehicleId,
      dimoTokenId: tokenId,
      connectionIdentityFingerprint,
      linkActive: link.isActive && link.deactivatedAt == null,
      authorizationReference: auth.authorizationReference,
    };
  }
}
