import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { CoreAppM2mClientService } from './core-app-m2m-client.service';
import { isCoreAppM2mEnabled } from './core-app-m2m.config';

@Controller('admin/core-app-service-clients')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_API_KEYS)
@Roles('MASTER_ADMIN')
export class CoreAppM2mAdminController {
  constructor(private readonly clients: CoreAppM2mClientService) {}

  @Post()
  async createClient(
    @Body()
    body: {
      clientId: string;
      displayName: string;
      productSlug: ProductSlug;
      allowedScopes?: string[];
    },
  ) {
    return this.clients.createClient(body);
  }

  @Post(':id/grants')
  async addGrant(@Param('id') serviceClientId: string, @Body() body: { organizationId: string }) {
    const grant = await this.clients.createOrgGrant(serviceClientId, body.organizationId);
    return { grant };
  }

  @Patch(':id/rotate-credential')
  async rotateCredential(@Param('id') serviceClientId: string) {
    return this.clients.rotateCredential(serviceClientId);
  }

  @Patch(':id/disable')
  async disable(@Param('id') serviceClientId: string) {
    await this.clients.disableClient(serviceClientId);
    return { status: 'DISABLED' };
  }

  @Patch(':id/grants/:grantId/revoke')
  async revokeGrant(@Param('id') serviceClientId: string, @Param('grantId') grantId: string) {
    const grant = await this.clients.revokeGrantForClient(serviceClientId, grantId);
    return { grant };
  }

  @Get('status')
  status() {
    return {
      coreAppM2mEnabled: isCoreAppM2mEnabled(),
    };
  }
}