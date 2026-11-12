import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CoreAppServiceClientStatus,
  CoreAppServiceGrantStatus,
  ProductSlug,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import {
  CORE_APP_M2M_ALLOWED_SCOPES,
  CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ,
  type CoreAppM2mAllowedScope,
} from './core-app-m2m.constants';
import { isEntitledForAnyAccess } from '@modules/products/entitlements/entitlements-policy';

@Injectable()
export class CoreAppM2mClientService {
  constructor(private readonly prisma: PrismaService) {}

  assertAllowedScope(scope: string): asserts scope is CoreAppM2mAllowedScope {
    if (!(CORE_APP_M2M_ALLOWED_SCOPES as readonly string[]).includes(scope)) {
      throw new BadRequestException(`Scope '${scope}' is not allowed`);
    }
  }

  async createClient(input: {
    clientId: string;
    displayName: string;
    productSlug: ProductSlug;
    allowedScopes?: string[];
  }): Promise<{ record: { id: string; clientId: string }; clientSecret: string }> {
    const scopes = input.allowedScopes?.length
      ? input.allowedScopes
      : [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ];
    for (const scope of scopes) {
      this.assertAllowedScope(scope);
    }

    const clientSecret = randomBytes(32).toString('base64url');
    const credentialHash = await bcrypt.hash(clientSecret, 10);

    const record = await this.prisma.coreAppServiceClient.create({
      data: {
        clientId: input.clientId,
        displayName: input.displayName,
        productSlug: input.productSlug,
        credentialHash,
        allowedScopes: scopes,
      },
      select: { id: true, clientId: true },
    });

    return { record, clientSecret };
  }

  async createOrgGrant(serviceClientId: string, organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return this.prisma.coreAppServiceOrgGrant.create({
      data: {
        serviceClientId,
        organizationId,
      },
    });
  }

  async rotateCredential(serviceClientId: string): Promise<{ clientSecret: string; credentialVersion: number }> {
    const clientSecret = randomBytes(32).toString('base64url');
    const credentialHash = await bcrypt.hash(clientSecret, 10);
    const updated = await this.prisma.coreAppServiceClient.update({
      where: { id: serviceClientId },
      data: {
        credentialHash,
        credentialVersion: { increment: 1 },
      },
      select: { credentialVersion: true },
    });
    return { clientSecret, credentialVersion: updated.credentialVersion };
  }

  async disableClient(serviceClientId: string) {
    return this.prisma.coreAppServiceClient.update({
      where: { id: serviceClientId },
      data: { status: CoreAppServiceClientStatus.DISABLED },
    });
  }

  async revokeGrant(grantId: string) {
    return this.prisma.coreAppServiceOrgGrant.update({
      where: { id: grantId },
      data: {
        status: CoreAppServiceGrantStatus.REVOKED,
        grantVersion: { increment: 1 },
      },
    });
  }

  async revokeGrantForClient(serviceClientId: string, grantId: string) {
    const grant = await this.prisma.coreAppServiceOrgGrant.findFirst({
      where: { id: grantId, serviceClientId },
    });
    if (!grant) {
      throw new NotFoundException('Grant not found for this service client');
    }
    return this.revokeGrant(grantId);
  }

  assertScopeAllowedOnClient(
    client: { allowedScopes: unknown },
    scope: CoreAppM2mAllowedScope,
  ): void {
    const scopes = client.allowedScopes as string[];
    if (!scopes.includes(scope)) {
      throw new ForbiddenException('Scope not allowed for this client');
    }
  }

  async assertProductEntitlementForOrganization(
    organizationId: string,
    productSlug: ProductSlug,
  ): Promise<void> {
    const orgProduct = await this.prisma.organizationProduct.findFirst({
      where: {
        organizationId,
        product: { slug: productSlug },
      },
      select: { status: true },
    });
    if (!orgProduct || !isEntitledForAnyAccess(orgProduct.status)) {
      throw new ForbiddenException('Organization product entitlement not active for this operation');
    }
  }

  async assertM2mAuthorizationLive(input: {
    organizationId: string;
    productSlug: ProductSlug;
    client: { allowedScopes: unknown };
    requiredScope: CoreAppM2mAllowedScope;
  }): Promise<void> {
    this.assertScopeAllowedOnClient(input.client, input.requiredScope);
    await this.assertProductEntitlementForOrganization(input.organizationId, input.productSlug);
  }

  async validateExchangeCredentials(input: {
    clientId: string;
    clientSecret: string;
    organizationId: string;
    scope: CoreAppM2mAllowedScope;
  }) {
    const client = await this.prisma.coreAppServiceClient.findUnique({
      where: { clientId: input.clientId },
      include: {
        orgGrants: {
          where: { organizationId: input.organizationId },
        },
      },
    });

    if (!client) {
      throw new ForbiddenException('Invalid client credentials');
    }
    if (client.status !== CoreAppServiceClientStatus.ACTIVE) {
      throw new ForbiddenException('Client is disabled');
    }

    const secretOk = await bcrypt.compare(input.clientSecret, client.credentialHash);
    if (!secretOk) {
      throw new ForbiddenException('Invalid client credentials');
    }

    if (!(client.allowedScopes as string[]).includes(input.scope)) {
      throw new ForbiddenException('Scope not allowed for this client');
    }

    const grant = client.orgGrants[0];
    if (!grant || grant.status !== CoreAppServiceGrantStatus.ACTIVE) {
      throw new ForbiddenException('No active organization grant');
    }

    const orgProduct = await this.prisma.organizationProduct.findFirst({
      where: {
        organizationId: input.organizationId,
        product: { slug: client.productSlug },
      },
      select: { status: true },
    });
    if (!orgProduct || !isEntitledForAnyAccess(orgProduct.status)) {
      throw new ForbiddenException('Organization product entitlement not active for this operation');
    }

    return {
      client,
      grant,
    };
  }

  async loadClientGrantForVerification(input: {
    clientDbId: string;
    organizationId: string;
    credentialVersion: number;
    grantVersion: number;
  }) {
    const client = await this.prisma.coreAppServiceClient.findUnique({
      where: { id: input.clientDbId },
    });
    if (!client || client.status !== CoreAppServiceClientStatus.ACTIVE) {
      throw new ForbiddenException('Client is not active');
    }
    if (client.credentialVersion !== input.credentialVersion) {
      throw new ForbiddenException('Client credential has been rotated');
    }

    const grant = await this.prisma.coreAppServiceOrgGrant.findUnique({
      where: {
        serviceClientId_organizationId: {
          serviceClientId: input.clientDbId,
          organizationId: input.organizationId,
        },
      },
    });
    if (!grant || grant.status !== CoreAppServiceGrantStatus.ACTIVE) {
      throw new ForbiddenException('Organization grant is not active');
    }
    if (grant.grantVersion !== input.grantVersion) {
      throw new ForbiddenException('Organization grant has been revoked or rotated');
    }

    return { client, grant };
  }
}
