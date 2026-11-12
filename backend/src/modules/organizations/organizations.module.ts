import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { TenantOrganizationProfileController } from './tenant-organization-profile.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationsOperationalService } from './organizations-operational.service';
import { UsersModule } from '@modules/users/users.module';
import { PaymentsModule } from '@modules/payments/payments.module';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { BillingModule } from '@modules/billing/billing.module';

@Module({
  imports: [
    UsersModule,
    PaymentsModule,
    VehiclesModule,
    BillingModule,
  ],
  controllers: [OrganizationsController, TenantOrganizationProfileController],
  providers: [OrganizationsService, OrganizationsOperationalService],
  exports: [OrganizationsService, OrganizationsOperationalService],
})
export class OrganizationsModule {}
