import { Body, Controller, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { OneAutoProviderService } from './oneauto-provider.service';

type AuthedRequest = {
  user?: { id?: string; platformRole?: string };
};

@Controller('admin/organizations/:orgId/oneauto')
@UseGuards(RolesGuard, OrgScopingGuard, MasterAdminMfaGuard)
@Roles('MASTER_ADMIN')
@Throttle({ default: { ttl: 60_000, limit: 60 } })
export class OneAutoProviderController {
  constructor(private readonly oneAuto: OneAutoProviderService) {}

  @Get('catalog')
  getCatalog() {
    return this.oneAuto.getCatalog();
  }

  @Get('services/:serviceSku/availability')
  getAvailability(@Param('serviceSku') serviceSku: string) {
    return this.oneAuto.getServiceAvailability(serviceSku);
  }

  @Post('vehicles/:vehicleId/quote')
  quote(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: { serviceSku: string },
  ) {
    return this.oneAuto.quote(orgId, vehicleId, body.serviceSku);
  }

  @Post('vehicles/:vehicleId/execute')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_ONEAUTO_PROVIDER_EXECUTE)
  execute(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body()
    body: {
      serviceSku: string;
      idempotencyKey: string;
      confirmedPriceMinor: number;
      pricingSourceVersion: string;
      quoteIssuedAt: string;
      acknowledgeIndicativeNotGuaranteed: boolean;
    },
    @Req() req: AuthedRequest,
  ) {
    const masterAdminUserId = req.user?.id;
    if (!masterAdminUserId) {
      throw new UnauthorizedException('Authenticated master admin required');
    }
    return this.oneAuto.executeConfirmed({
      orgId,
      vehicleId,
      serviceSku: body.serviceSku,
      idempotencyKey: body.idempotencyKey,
      confirmedPriceMinor: body.confirmedPriceMinor,
      pricingSourceVersion: body.pricingSourceVersion,
      quoteIssuedAt: body.quoteIssuedAt,
      acknowledgeIndicativeNotGuaranteed: body.acknowledgeIndicativeNotGuaranteed === true,
      masterAdminUserId,
    });
  }

  @Get('jobs/:jobId')
  getJob(@Param('orgId') orgId: string, @Param('jobId') jobId: string) {
    return this.oneAuto.getJob(orgId, jobId);
  }

  @Get('jobs/:jobId/result')
  getResult(@Param('orgId') orgId: string, @Param('jobId') jobId: string) {
    return this.oneAuto.getJobResult(orgId, jobId);
  }
}
