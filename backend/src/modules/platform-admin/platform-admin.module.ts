import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import dimoR9WebhookHealthConfig from '@config/dimo-r9-webhook-health.config';
import { RedisModule } from '@shared/redis/redis.module';
import { IamMfaModule } from '@modules/iam-mfa/iam-mfa.module';
import { AuthApiModule } from '@modules/auth/auth.module';
import { PlatformAdminController } from './platform-admin.controller';
import { SecurityGovernanceController } from './security-governance.controller';
import { SecurityGovernanceService } from './security-governance.service';
import { PlatformAdminService } from './platform-admin.service';
import { VehicleLogbookService } from './vehicle-logbook.service';
import {
  PlatformConnectivitySummaryService,
  PlatformDashboardService,
  PlatformResilienceStatusService,
} from './platform-dashboard.service';
import { PlatformOpsAlertmanagerService } from './platform-ops-alertmanager.service';
import { PlatformOpsInfrastructureService } from './platform-ops-infrastructure.service';
import { PlatformOpsService } from './platform-ops.service';
import { PlatformOpsDiS4Service } from './platform-ops-di-s4.service';
import { DimoModule } from '../dimo/dimo.module';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';
import { HealthModule } from '../health/health.module';
import { BillingModule } from '../billing/billing.module';
import { SupportModule } from '../support/support.module';
import { OutboundEmailModule } from '../outbound-email/outbound-email.module';
import { VoiceAssistantModule } from '../voice-assistant/voice-assistant.module';
import { HighMobilityModule } from '../high-mobility/high-mobility.module';
import { PlatformIntegrationsController } from './platform-integrations.controller';
import { PlatformIntegrationsService } from './platform-integrations.service';
import { BatteryGeneralizedEvidenceModule } from '../vehicle-intelligence/battery-health/generalized-evidence/generalized-evidence.module';
import { BatteryV2RestSessionFeatureInspectionAdminService } from './battery-v2-rest-session-feature-inspection.admin.service';
import { BatteryV2LvMeasuredIntelligenceAdminService } from './battery-v2-lv-measured-intelligence.admin.service';
import { BatteryV2LvEstimatedHealthShadowAdminService } from './battery-v2-lv-estimated-health-shadow.admin.service';
import { BatteryV2HvBatteryAdminService } from './battery-v2-hv-battery.admin.service';
import { DimoR9WebhookHealthService } from './dimo-r9-webhook-health/dimo-r9-webhook-health.service';

@Module({
  imports: [
    ConfigModule.forFeature(dimoR9WebhookHealthConfig),
    RedisModule,
    AuthApiModule,
    DimoModule,
    BatteryGeneralizedEvidenceModule,
    VehicleIntelligenceModule,
    HealthModule,
    BillingModule,
    SupportModule,
    IamMfaModule,
    OutboundEmailModule,
    VoiceAssistantModule,
    HighMobilityModule,
  ],
  controllers: [PlatformAdminController, SecurityGovernanceController, PlatformIntegrationsController],
  providers: [
    SecurityGovernanceService,
    PlatformIntegrationsService,
    PlatformAdminService,
    VehicleLogbookService,
    PlatformResilienceStatusService,
    PlatformConnectivitySummaryService,
    PlatformDashboardService,
    PlatformOpsService,
    PlatformOpsAlertmanagerService,
    PlatformOpsInfrastructureService,
    PlatformOpsDiS4Service,
    BatteryV2RestSessionFeatureInspectionAdminService,
    BatteryV2LvMeasuredIntelligenceAdminService,
    BatteryV2LvEstimatedHealthShadowAdminService,
    BatteryV2HvBatteryAdminService,
    DimoR9WebhookHealthService,
  ],
  exports: [PlatformAdminService, PlatformDashboardService, PlatformConnectivitySummaryService],
})
export class PlatformAdminModule {}
