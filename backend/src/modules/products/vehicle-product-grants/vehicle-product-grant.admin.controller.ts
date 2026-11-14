import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { randomUUID } from 'crypto';
import { VehicleProductGrantService } from './vehicle-product-grant.service';

type MasterAdminRequest = {
  user?: { id: string };
  ip?: string;
  headers?: { 'user-agent'?: string };
  route?: { path?: string };
};

@Controller('admin/organizations/:orgId')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_ORGANIZATION)
@Roles('MASTER_ADMIN')
export class VehicleProductGrantAdminController {
  constructor(private readonly grants: VehicleProductGrantService) {}

  @Get('product-vehicle-grants')
  listGrants(@Param('orgId') orgId: string, @Query('productSlug') productSlug: string) {
    const slug = String(productSlug ?? '').toUpperCase() as ProductSlug;
    return this.grants.listGrantedVehicles(orgId, slug, { activeOnly: true });
  }

  @Post('vehicles/:vehicleId/product-grants')
  grant(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: { productSlug: ProductSlug },
    @Req() req: MasterAdminRequest,
  ) {
    const actorId = req.user?.id;
    if (!actorId) {
      throw new UnauthorizedException();
    }
    return this.grants.grantExplicit({
      organizationId: orgId,
      vehicleId,
      productSlug: body.productSlug,
      grantedByUserId: actorId,
      audit: {
        correlationId: randomUUID(),
        route: req.route?.path,
        ipAddress: req.ip,
        userAgent: req.headers?.['user-agent'],
      },
    });
  }

  @Delete('vehicles/:vehicleId/product-grants/:productSlug')
  revoke(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('productSlug') productSlug: ProductSlug,
    @Req() req: MasterAdminRequest,
  ) {
    const actorId = req.user?.id;
    if (!actorId) {
      throw new UnauthorizedException();
    }
    return this.grants.revokeGrant({
      organizationId: orgId,
      vehicleId,
      productSlug,
      revokedByUserId: actorId,
      audit: {
        correlationId: randomUUID(),
        route: req.route?.path,
        ipAddress: req.ip,
        userAgent: req.headers?.['user-agent'],
      },
    });
  }
}