import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import {
  CORE_APP_M2M_ALLOWED_SCOPES,
  CORE_APP_M2M_AUDIENCE,
  CORE_APP_M2M_ISSUER,
  CORE_APP_SERVICE_TOKEN_TYPE,
  type CoreAppM2mAllowedScope,
} from './core-app-m2m.constants';
import {
  isCoreAppM2mEnabled,
  resolveCoreAppM2mSigningSecret,
  resolveCoreAppM2mTokenTtlSeconds,
} from './core-app-m2m.config';
import type { CoreAppServicePrincipal, CoreAppServiceTokenClaims } from './core-app-m2m.types';
import { CoreAppM2mClientService } from './core-app-m2m-client.service';

type IssueTokenInput = {
  clientDbId: string;
  clientId: string;
  organizationId: string;
  productSlug: import('@prisma/client').ProductSlug;
  credentialVersion: number;
  grantVersion: number;
  scope: CoreAppM2mAllowedScope;
};

@Injectable()
export class CoreAppM2mTokenService {
  constructor(private readonly clients: CoreAppM2mClientService) {}

  issue(input: IssueTokenInput): { accessToken: string; expiresIn: number; tokenType: string } {
    if (!isCoreAppM2mEnabled()) {
      throw new ServiceUnavailableException('Service authentication is disabled');
    }
    const secret = resolveCoreAppM2mSigningSecret();
    if (!secret) {
      throw new ServiceUnavailableException('Service authentication is not configured');
    }

    const ttlSeconds = resolveCoreAppM2mTokenTtlSeconds();
    const jti = randomUUID();

    const payload = {
      typ: CORE_APP_SERVICE_TOKEN_TYPE,
      org: input.organizationId,
      product: input.productSlug,
      scopes: [input.scope],
      cid: input.clientDbId,
      cv: input.credentialVersion,
      gv: input.grantVersion,
      jti,
    };

    const accessToken = jwt.sign(payload, secret, {
      algorithm: 'HS256',
      expiresIn: ttlSeconds,
      issuer: CORE_APP_M2M_ISSUER,
      audience: CORE_APP_M2M_AUDIENCE,
      subject: input.clientId,
    });

    return { accessToken, expiresIn: ttlSeconds, tokenType: 'Bearer' };
  }

  async verifyBearerToken(
    token: string,
    routeOrgId: string,
    requiredScope?: CoreAppM2mAllowedScope,
  ): Promise<CoreAppServicePrincipal> {
    if (!isCoreAppM2mEnabled()) {
      throw new ForbiddenException('Service authentication is disabled');
    }
    const secret = resolveCoreAppM2mSigningSecret();
    if (!secret) {
      throw new ServiceUnavailableException('Service authentication is not configured');
    }

    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: CORE_APP_M2M_ISSUER,
        audience: CORE_APP_M2M_AUDIENCE,
      }) as jwt.JwtPayload;
    } catch {
      throw new ForbiddenException('Invalid service token');
    }

    if (decoded.typ !== CORE_APP_SERVICE_TOKEN_TYPE) {
      throw new ForbiddenException('Invalid service token type');
    }

    const organizationId = String(decoded.org ?? '');
    if (!organizationId || organizationId !== routeOrgId) {
      throw new ForbiddenException('Service token organization mismatch');
    }

    const clientDbId = String(decoded.cid ?? '');
    const clientId = String(decoded.sub ?? '');
    const credentialVersion = Number(decoded.cv ?? 0);
    const grantVersion = Number(decoded.gv ?? 0);
    const productSlug = decoded.product as import('@prisma/client').ProductSlug;

    const scopes = Array.isArray(decoded.scopes)
      ? decoded.scopes.map((s) => String(s))
      : [];
    let allowedScope: CoreAppM2mAllowedScope | undefined;
    if (requiredScope) {
      if (!scopes.includes(requiredScope)) {
        throw new ForbiddenException('Missing required service scope');
      }
      allowedScope = requiredScope;
    } else {
      allowedScope = scopes.find((s) =>
        (CORE_APP_M2M_ALLOWED_SCOPES as readonly string[]).includes(s),
      ) as CoreAppM2mAllowedScope | undefined;
      if (!allowedScope) {
        throw new ForbiddenException('Missing required service scope');
      }
    }

    const { client, grant } = await this.clients.loadClientGrantForVerification({
      clientDbId,
      organizationId,
      credentialVersion,
      grantVersion,
    });

    if (client.productSlug !== productSlug) {
      throw new ForbiddenException('Service token product mismatch');
    }
    if (client.clientId !== clientId) {
      throw new ForbiddenException('Service token client mismatch');
    }

    await this.clients.assertM2mAuthorizationLive({
      organizationId,
      productSlug,
      client,
      requiredScope: allowedScope,
    });

    return {
      kind: 'core_app_service',
      clientDbId: client.id,
      clientId: client.clientId,
      organizationId: grant.organizationId,
      productSlug: client.productSlug,
      scopes: [allowedScope],
      credentialVersion: client.credentialVersion,
      grantVersion: grant.grantVersion,
      jti: String(decoded.jti ?? ''),
    };
  }
}
