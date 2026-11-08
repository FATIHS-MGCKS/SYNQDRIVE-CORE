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
import type { Fsd3OwnerApprovalTrustLoadContextV1 } from './fsd3-one-shot-trust-anchor.v1';

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

type AuthoritativePreflightBindingV1 = {
  result: Fsd3OneShotPreflightResultV1;
  issuedAtMs: number;
};

const AUTHORITATIVE_PREFLIGHT_TTL_MS = 2 * 60 * 1000;

@Injectable()
export class Fsd3OneShotPreflightService implements OnModuleInit {
  private preflightTicketSecret!: Buffer;
  private readonly authoritativePreflights = new Map<string, AuthoritativePreflightBindingV1>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly operatorAuth: DimoSourceLinkOperatorAuthorizationService,
    private readonly persistence: FsdDiscoveryPersistenceRepository,
    private readonly capability: Fsd3OneShotCapabilityService,
  ) {}

  onModuleInit(): void {
    this.preflightTicketSecret = resolveFsd3OneShotPreflightTicketSecretV1();
  }

  private bindingKey(scope: Fsd3OneShotCliScopeV1, actorUserId: string): string {
    return `${scope.organizationId}|${scope.vehicleId}|${scope.providerSourceLinkId}|${scope.discoveryRequestKey}|${scope.executableReleaseSha}|${actorUserId}`;
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

    const result: Fsd3OneShotPreflightResultV1 = {
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

    this.authoritativePreflights.set(this.bindingKey(input.scope, input.actorUserId), {
      result,
      issuedAtMs: Date.now(),
    });

    return result;
  }

  mintAuthorizedPreflightTicket(input: { scope: Fsd3OneShotCliScopeV1; actorUserId: string }): string {
    const key = this.bindingKey(input.scope, input.actorUserId);
    const binding = this.authoritativePreflights.get(key);
    if (!binding) {
      throw new Error('FSD3_PREFLIGHT_NOT_AUTHORITATIVE');
    }
    if (Date.now() - binding.issuedAtMs > AUTHORITATIVE_PREFLIGHT_TTL_MS) {
      this.authoritativePreflights.delete(key);
      throw new Error('FSD3_PREFLIGHT_NOT_AUTHORITATIVE');
    }

    const ticket = mintFsd3OneShotPreflightTicketV1({
      scope: input.scope,
      preflight: binding.result,
      actorUserId: input.actorUserId,
      secret: this.preflightTicketSecret,
    });

    this.authoritativePreflights.delete(key);
    return ticket;
  }

  issueExecutionCapability(input: {
    scope: Fsd3OneShotCliScopeV1;
    verifiedOwnerApprovalEnvelope: Fsd3LiveOwnerApprovalEnvelopeV1;
    preflightTicket: string;
    actorUserId: string;
    liveProvider: Fsd3OneShotLiveProviderV1;
    trustContext?: Fsd3OwnerApprovalTrustLoadContextV1;
  }): string {
    const trustContext: Fsd3OwnerApprovalTrustLoadContextV1 =
      input.liveProvider === 'dimo_live'
        ? { mode: 'OPERATOR_FILE_ANCHORED', liveDimoExecute: true }
        : (input.trustContext ?? { mode: 'OPERATOR_FILE_ANCHORED' });

    const approval = verifyFsd3LiveOwnerApprovalEnvelopeV1({
      envelope: input.verifiedOwnerApprovalEnvelope,
      trustContext,
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
