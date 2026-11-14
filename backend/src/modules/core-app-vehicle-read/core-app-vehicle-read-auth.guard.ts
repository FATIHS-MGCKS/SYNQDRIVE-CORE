import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CoreAppM2mTokenService } from '@modules/core-app-m2m/core-app-m2m-token.service';
import { CoreAppM2mRedisRateLimitService } from '@modules/core-app-m2m/core-app-m2m-redis-rate-limit.service';
import { CORE_APP_M2M_SCOPE_VEHICLE_READ } from '@modules/core-app-m2m/core-app-m2m.constants';
import type { CoreAppServicePrincipal } from '@modules/core-app-m2m/core-app-m2m.types';
import { parseProductSlugParam } from '@modules/products/vehicle-product-grants/parse-product-slug';

type VehicleReadRequest = {
  authPrincipalKind?: string;
  coreAppServiceBearerToken?: string;
  coreAppServicePrincipal?: CoreAppServicePrincipal;
  user?: unknown;
  params?: { orgId?: string; productSlug?: string; vehicleId?: string };
};

/**
 * M2M-only guard for product-bound Core App vehicle reads.
 * User JWT is always rejected.
 */
@Injectable()
export class CoreAppVehicleReadAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: CoreAppM2mTokenService,
    private readonly rateLimit: CoreAppM2mRedisRateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest() as VehicleReadRequest;

    if (request.user) {
      throw new ForbiddenException('User authentication is not permitted for this route');
    }

    if (request.authPrincipalKind !== 'core_app_service') {
      throw new UnauthorizedException('Service authentication required');
    }

    const token = request.coreAppServiceBearerToken;
    const routeOrgId = request.params?.orgId;
    if (!token || !routeOrgId) {
      throw new UnauthorizedException('Service authentication incomplete');
    }

    const principal = await this.tokenService.verifyBearerToken(
      token,
      routeOrgId,
      CORE_APP_M2M_SCOPE_VEHICLE_READ,
    );

    const pathProduct = parseProductSlugParam(request.params?.productSlug);
    if (pathProduct !== principal.productSlug) {
      throw new ForbiddenException('Service token is not authorized for this product');
    }

    request.coreAppServicePrincipal = principal;

    const operation = request.params?.vehicleId ? 'detail' : 'list';
    await this.rateLimit.assertVehicleReadAllowed({
      clientId: principal.clientId,
      organizationId: principal.organizationId,
      operation,
    });

    return true;
  }
}