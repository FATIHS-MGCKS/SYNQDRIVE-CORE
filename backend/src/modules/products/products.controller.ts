import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { randomUUID } from 'crypto';
import { parseVehicleAccessModeParam } from './parse-vehicle-access-mode';

type MasterAdminRequest = {
  user?: { id: string };
  ip?: string;
  headers?: { 'user-agent'?: string };
  route?: { path?: string };
};

@Controller('admin/products')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_ORGANIZATION)
@Roles('MASTER_ADMIN')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll() {
    return this.productsService.findAll();
  }

  @Get('stats')
  async getStats() {
    return this.productsService.getProductStats();
  }

  @Get('org/:orgId')
  async findOrgProducts(@Param('orgId') orgId: string) {
    return this.productsService.findOrgProducts(orgId);
  }

  @Post('assign')
  async assignToOrganization(
    @Body()
    body: {
      orgId: string;
      productSlug: string;
      plan?: string;
      vehicleAccessMode?: unknown;
    },
    @Req() req: MasterAdminRequest,
  ) {
    const actorId = req.user?.id;
    if (!actorId) {
      throw new UnauthorizedException();
    }
    const vehicleAccessMode = parseVehicleAccessModeParam(body.vehicleAccessMode);
    return this.productsService.assignProduct({
      orgId: body.orgId,
      productSlug: body.productSlug,
      plan: body.plan,
      vehicleAccessMode,
      actorUserId: actorId,
      audit: {
        correlationId: randomUUID(),
        route: req.route?.path,
        ipAddress: req.ip,
        userAgent: req.headers?.['user-agent'],
      },
    });
  }

  @Patch('org/:orgId/:productSlug/vehicle-access-mode')
  async patchVehicleAccessMode(
    @Param('orgId') orgId: string,
    @Param('productSlug') productSlug: string,
    @Body()
    body: {
      vehicleAccessMode?: unknown;
      ifCurrentVehicleAccessMode?: unknown;
    },
    @Req() req: MasterAdminRequest,
  ) {
    const actorId = req.user?.id;
    if (!actorId) {
      throw new UnauthorizedException();
    }
    const vehicleAccessMode = parseVehicleAccessModeParam(body.vehicleAccessMode);
    const ifCurrentVehicleAccessMode = parseVehicleAccessModeParam(
      body.ifCurrentVehicleAccessMode,
      'ifCurrentVehicleAccessMode',
    );
    return this.productsService.updateVehicleAccessMode({
      orgId,
      productSlug,
      vehicleAccessMode,
      ifCurrentVehicleAccessMode,
      actorUserId: actorId,
      audit: {
        correlationId: randomUUID(),
        route: req.route?.path,
        ipAddress: req.ip,
        userAgent: req.headers?.['user-agent'],
      },
    });
  }

  @Delete(':orgId/:productSlug')
  async removeFromOrganization(
    @Param('orgId') orgId: string,
    @Param('productSlug') productSlug: string,
    @Req() req: MasterAdminRequest,
  ) {
    const actorId = req.user?.id;
    if (!actorId) {
      throw new UnauthorizedException();
    }
    return this.productsService.removeProduct(orgId, productSlug, actorId, {
      correlationId: randomUUID(),
      route: req.route?.path,
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }
}