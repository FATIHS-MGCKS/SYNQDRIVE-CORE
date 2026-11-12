import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { extractOrgIdFromEntitlementsPath } from './core-app-m2m.allowlist';
import { CoreAppM2mTokenService } from './core-app-m2m-token.service';

type RequestWithAuth = {
  url?: string;
  path?: string;
  authPrincipalKind?: string;
  coreAppServiceBearerToken?: string;
  coreAppServicePrincipal?: unknown;
  user?: unknown;
  tenantId?: string;
  params?: { orgId?: string };
};

@Injectable()
export class CoreAppEntitlementsAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: CoreAppM2mTokenService,
    private readonly orgScoping: OrgScopingGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest() as RequestWithAuth;
    const path = (request.url ?? request.path ?? '').split('?')[0];
    const routeOrgId = request.params?.orgId ?? extractOrgIdFromEntitlementsPath(path);

    if (request.authPrincipalKind === 'core_app_service') {
      const token = request.coreAppServiceBearerToken;
      if (!token || !routeOrgId) {
        throw new UnauthorizedException('Service authentication incomplete');
      }
      const principal = await this.tokenService.verifyBearerToken(token, routeOrgId);
      request.coreAppServicePrincipal = principal;
      request.tenantId = routeOrgId;
      return true;
    }

    if (request.user) {
      return this.orgScoping.canActivate(context);
    }

    throw new UnauthorizedException('Authentication required');
  }
}
