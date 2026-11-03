import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { OneAutoOemVinLookupEuSuggestionReadService } from './oneauto-oem-vin-lookup-eu-suggestion-read.service';

@Controller('admin/organizations/:orgId/vehicles')
@UseGuards(RolesGuard, OrgScopingGuard, MasterAdminMfaGuard)
@Roles('MASTER_ADMIN')
@Throttle({ default: { ttl: 60_000, limit: 120 } })
export class OneAutoOemVinLookupEuSuggestionController {
  constructor(private readonly readService: OneAutoOemVinLookupEuSuggestionReadService) {}

  @Get(':vehicleId/oem-specification-suggestions')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_ONEAUTO_PROVIDER_EXECUTE)
  listSuggestions(@Param('orgId') orgId: string, @Param('vehicleId') vehicleId: string) {
    return this.readService.listForVehicle(orgId, vehicleId);
  }
}
