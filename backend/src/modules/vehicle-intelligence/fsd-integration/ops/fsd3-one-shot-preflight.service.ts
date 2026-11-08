import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSourceLinkOperatorAuthorizationService } from '@modules/vehicle-onboarding/services/dimo-source-link-operator-authorization.service';
import { FsdDiscoveryPersistenceRepository } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import { buildFsdDimoConnectionIdentityFingerprint } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.contract.v1';
import type { Fsd3OneShotCliScopeV1, Fsd3LiveOwnerApprovalDocumentV1 } from './fsd3-one-shot-owner-approval.v1';
import type { Fsd3OneShotLiveProviderV1 } from './fsd3-one-shot-execution-capability.v1';
import { Fsd3OneShotCapabilityService } from './fsd3-one-shot-capability.service';

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
    private readonly capability: Fsd3OneShotCapabilityService,
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

  issueExecutionCapability(input: {
    scope: Fsd3OneShotCliScopeV1;
    approval: Fsd3LiveOwnerApprovalDocumentV1;
    preflight: Fsd3OneShotPreflightResultV1;
    actorUserId: string;
    liveProvider: Fsd3OneShotLiveProviderV1;
  }): string {
    if (!input.preflight.dimoVehicleId || input.preflight.dimoTokenId == null) {
      throw new Error('DIMO_IDENTITY_INCOMPLETE');
    }
    if (!input.preflight.connectionIdentityFingerprint) {
      throw new Error('DIMO_IDENTITY_INCOMPLETE');
    }
    if (
      input.preflight.organizationId !== input.scope.organizationId ||
      input.preflight.vehicleId !== input.scope.vehicleId ||
      input.preflight.providerSourceLinkId !== input.scope.providerSourceLinkId
    ) {
      throw new Error('FSD3_PREFLIGHT_SCOPE_MISMATCH');
    }
    return this.capability.mint({
      organizationId: input.scope.organizationId,
      vehicleId: input.scope.vehicleId,
      providerSourceLinkId: input.scope.providerSourceLinkId,
      discoveryRequestKey: input.scope.discoveryRequestKey,
      attestedExecutableReleaseSha: input.scope.executableReleaseSha,
      approvalReference: input.approval.approvalReference,
      liveProvider: input.liveProvider,
      actorUserId: input.actorUserId,
      operatorAuthorizationReference: input.preflight.authorizationReference,
      dimoVehicleId: input.preflight.dimoVehicleId,
      dimoTokenId: input.preflight.dimoTokenId,
      connectionIdentityFingerprint: input.preflight.connectionIdentityFingerprint,
    });
  }
}
