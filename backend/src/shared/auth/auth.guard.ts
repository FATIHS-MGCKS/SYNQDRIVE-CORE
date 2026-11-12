import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { sessionClaimsFromJwt } from '@shared/auth/auth-session-claims.types';
import { CORE_APP_SERVICE_TOKEN_TYPE } from '@modules/core-app-m2m/core-app-m2m.constants';
import {
  isCoreAppM2mAllowlistedApiPath,
  isCoreAppM2mExchangePath,
} from '@modules/core-app-m2m/core-app-m2m.allowlist';
import { isCoreAppM2mEnabled } from '@modules/core-app-m2m/core-app-m2m.config';

/**
 * Exact paths (not prefixes) that require no authentication.
 * Using explicit paths instead of broad prefixes prevents accidental exposure
 * of new auth-module endpoints without deliberate opt-in.
 */
const PUBLIC_EXACT_PATHS = new Set<string>([
  '/api/v1/auth/login',
  '/api/v1/auth/login/mfa',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/password-reset/request',
  '/api/v1/auth/password-reset/confirm',
  // Seed-admin bootstrap: still token-gated via SEED_ADMIN_TOKEN + ENABLE_SEED_ADMIN in controller.
  '/api/v1/auth/seed-admin',
  '/api/v1/invites/validate',
  '/api/v1/invites/accept',
  '/api/v1/webhooks/dimo',
  '/api/v1/webhooks/dimo/health',
  '/api/v1/webhooks/didit',
  '/api/v1/webhooks/stripe',
  '/api/v1/webhooks/stripe-connect',
  '/api/v1/webhooks/twilio/voice',
  '/api/v1/webhooks/twilio/status',
  '/api/v1/webhooks/resend/outbound-email',
  // Prometheus scrape: skips JWT; MetricsAuthGuard enforces METRICS_BEARER_TOKEN instead.
  '/api/v1/metrics',
  '/api/v1/auth/core-app/token',
]);

/**
 * Prefix-based public paths still needed for non-auth legacy compatibility.
 * Keep this list as short as possible.
 */
const PUBLIC_PATH_PREFIXES: string[] = [
  '/api/v1/vehicles/register/ai-tire-specs',
  // HM webhooks are routed under /integrations/ and guarded by their own HMAC verification
  '/api/v1/integrations/high-mobility/webhook',
  // Health and readiness are public for load balancers and orchestrators
  '/api/v1/health',
  '/api/v1/ai/health',
  // Voice MCP gateway uses short-lived scoped bearer tokens (not user JWT)
  '/api/v1/mcp/voice',
  // ElevenLabs post-call and conversation webhooks — org-scoped path, HMAC verified in controller
  '/api/v1/webhooks/elevenlabs/post-call',
  '/api/v1/webhooks/elevenlabs/conversation',
  // One Auto provider async callbacks — token in path (no vendor HMAC documented)
  '/api/v1/webhooks/oneauto/provider-callback/',
];

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private readonly jwtSecret: string;

  constructor() {
    // JWT_SECRET must be present — validated by app.config.ts at startup before this runs
    if (!process.env.JWT_SECRET) {
      throw new Error('FATAL: JWT_SECRET is not set. AuthGuard cannot initialise without it.');
    }
    this.jwtSecret = process.env.JWT_SECRET;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const path: string = request.url || request.path || '';

    // Allow requests that don't target the API (e.g. static assets, SPA)
    if (!path.startsWith('/api/')) {
      return true;
    }

    // Strip query string for path matching
    const pathWithoutQuery = path.split('?')[0];

    if (PUBLIC_EXACT_PATHS.has(pathWithoutQuery)) {
      return true;
    }

    if (PUBLIC_PATH_PREFIXES.some((p) => pathWithoutQuery.startsWith(p))) {
      return true;
    }

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }

    const unsafe = jwt.decode(token, { complete: true }) as jwt.Jwt | null;
    const payloadTyp = (unsafe?.payload as Record<string, unknown> | undefined)?.typ;
    if (payloadTyp === CORE_APP_SERVICE_TOKEN_TYPE) {
      if (!isCoreAppM2mEnabled()) {
        throw new UnauthorizedException('Service authentication is disabled');
      }
      if (isCoreAppM2mExchangePath(pathWithoutQuery)) {
        throw new UnauthorizedException('Service tokens cannot access the token exchange endpoint');
      }
      if (!isCoreAppM2mAllowlistedApiPath(pathWithoutQuery)) {
        throw new UnauthorizedException('Service token not permitted for this route');
      }
      request.authPrincipalKind = 'core_app_service';
      request.coreAppServiceBearerToken = token;
      return true;
    }

    return this.validateJwt(request, token);
  }

  private validateJwt(request: any, token: string): boolean {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      request.user = {
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        platformRole: decoded.platformRole,
        platformPermissions: decoded.platformPermissions ?? [],
        membershipRole: decoded.membershipRole,
        organizationId: decoded.organizationId,
        membershipId: decoded.membershipId ?? null,
        sessionVersion: decoded.sessionVersion ?? 0,
        membershipVersion: decoded.membershipVersion ?? null,
        sessionClaims: sessionClaimsFromJwt(decoded as Record<string, unknown>),
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractToken(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
