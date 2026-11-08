import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSourceLinkOperatorAuthorizationService } from '@modules/vehicle-onboarding/services/dimo-source-link-operator-authorization.service';
import { FsdDiscoveryPersistenceRepository } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import { buildFsdDimoConnectionIdentityFingerprint } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.contract.v1';
import {
  assertFsd3LiveOwnerApprovalMatchesScope,
  verifyFsd3LiveOwnerApprovalEnvelopeV1,
  type Fsd3LiveOwnerApprovalEnvelopeV1,
  type Fsd3OneShotCliScopeV1,
} from './fsd3-one-shot-owner-approval.v1';
import type { Fsd3OneShotLiveProviderV1 } from './fsd3-one-shot-execution-capability.v1';
import { Fsd3OneShotCapabilityService } from './fsd3-one-shot-capability.service';
import {
  mintFsd3OneShotPreflightTicketV1,
  resolveFsd3OneShotPreflightTicketSecretV1,
  verifyFsd3OneShotPreflightTicketV1,
} from './fsd3-one-shot-preflight-ticket.v1';

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
export class Fsd3OneShotPreflightService implements OnModuleInit {
  private preflightTicketSecret!: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly operatorAuth: DimoSourceLinkOperatorAuthorizationService,
    private readonly persistence: FsdDiscoveryPersistenceRepository,
    private readonly capability: Fsd3OneShotCapabilityService,
  ) {}

  onModuleInit(): void {
    this.preflightTicketSecret = resolveFsd3OneShotPreflightTicketSecretV1();
  }

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

  mintAuthorizedPreflightTicket(input: {
    scope: Fsd3OneShotCliScopeV1;
    preflight: Fsd3OneShotPreflightResultV1;
    actorUserId: string;
  }): string {
    return mintFsd3OneShotPreflightTicketV1({
      scope: input.scope,
      preflight: input.preflight,
      actorUserId: input.actorUserId,
      secret: this.preflightTicketSecret,
    });
  }

  issueExecutionCapability(input: {
    scope: Fsd3OneShotCliScopeV1;
    verifiedOwnerApprovalEnvelope: Fsd3LiveOwnerApprovalEnvelopeV1;
    preflightTicket: string;
    actorUserId: string;
    liveProvider: Fsd3OneShotLiveProviderV1;
    trustStoreJson?: string;
  }): string {
    const approval = verifyFsd3LiveOwnerApprovalEnvelopeV1({
      envelope: input.verifiedOwnerApprovalEnvelope,
      trustStoreJson: input.trustStoreJson,
    });
    assertFsd3LiveOwnerApprovalMatchesScope({
      approval,
      scope: input.scope,
      liveProvider: input.liveProvider,
    });

    const ticket = verifyFsd3OneShotPreflightTicketV1({
      token: input.preflightTicket,
      scope: input.scope,
      actorUserId: input.actorUserId,
      secret: this.preflightTicketSecret,
    });

    return this.capability.mint({
      organizationId: input.scope.organizationId,
      vehicleId: input.scope.vehicleId,
      providerSourceLinkId: input.scope.providerSourceLinkId,
      discoveryRequestKey: input.scope.discoveryRequestKey,
      attestedExecutableReleaseSha: input.scope.executableReleaseSha,
      approvalReference: approval.approvalReference,
      liveProvider: input.liveProvider,
      actorUserId: input.actorUserId,
      operatorAuthorizationReference: ticket.authorizationReference,
      dimoVehicleId: ticket.dimoVehicleId,
      dimoTokenId: ticket.dimoTokenId,
      connectionIdentityFingerprint: ticket.connectionIdentityFingerprint,
    });
  }
}
