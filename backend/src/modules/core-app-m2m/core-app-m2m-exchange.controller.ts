import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CoreAppM2mExchangeDto } from './dto/core-app-m2m-exchange.dto';
import { CoreAppM2mClientService } from './core-app-m2m-client.service';
import { CoreAppM2mTokenService } from './core-app-m2m-token.service';
import { CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ } from './core-app-m2m.constants';
import { isCoreAppM2mEnabled } from './core-app-m2m.config';
import { CoreAppM2mExchangeRateLimitService } from './core-app-m2m-exchange-rate-limit.service';

@Controller('auth/core-app')
export class CoreAppM2mExchangeController {
  constructor(
    private readonly clients: CoreAppM2mClientService,
    private readonly tokens: CoreAppM2mTokenService,
    private readonly rateLimit: CoreAppM2mExchangeRateLimitService,
  ) {}

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post('token')
  @HttpCode(HttpStatus.OK)
  async exchange(@Body() body: CoreAppM2mExchangeDto, @Req() req: { ip?: string; headers?: Record<string, string> }) {
    if (!isCoreAppM2mEnabled()) {
      throw new ServiceUnavailableException('Service authentication is disabled');
    }

    const ip =
      req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';
    this.rateLimit.assertAllowed(ip);

    const scope = body.scope ?? CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ;
    this.clients.assertAllowedScope(scope);

    const { client, grant } = await this.clients.validateExchangeCredentials({
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      organizationId: body.organizationId,
      scope,
    });

    return this.tokens.issue({
      clientDbId: client.id,
      clientId: client.clientId,
      organizationId: body.organizationId,
      productSlug: client.productSlug,
      credentialVersion: client.credentialVersion,
      grantVersion: grant.grantVersion,
      scope,
    });
  }
}
