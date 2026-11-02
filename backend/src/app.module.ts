import { Module, DynamicModule, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from '@shared/interceptors/audit.interceptor';
import { MasterAdminPrivilegedAuditInterceptor } from '@shared/interceptors/master-admin-privileged-audit.interceptor';
import { ServeStaticModule } from '@nestjs/serve-static';
import { BullModule } from '@nestjs/bullmq';
import { join } from 'path';
import Redis from 'ioredis';

import { appConfig, databaseConfig, redisConfig, dimoConfig, workerConfig, highMobilityConfig, retentionConfig, storageConfig, documentExtractionConfig, vehicleIdentityP2Config, oneautoProviderConfig, vehicleIdentityP3Config, zb1RegistrationDocumentP4Config, fuelStationEnrichmentConfig, tireDs4ShadowConfig, tireWearV3CalibrationShadowConfig, chargingStationEnrichmentConfig, physicalRefuelReconciliationConfig, rawFuelRefuelFallbackConfig, documentsConfig, whatsappConfig, diditConfig, stripeConfig, twilioConfig, aiConfig, emailConfig, notificationEvaluationConfig, notificationDeliveryConfig, paymentEmailConfig, billingEmailConfig, billingReconciliationConfig, billingStripeSyncConfig, taskAutomationOutboxConfig, taskAutomationWorkflowRuntimeConfig, workflowShadowConfig, workflowRuntimeRolloutConfig, deviceConnectionWebhookInboxConfig, connectivityRecoveryConfig, drivingIntelligenceV2Config, referenceCaptureConfig, stationsV2Config, batteryHealthV2Config, batteryV2RetentionConfig, voiceRetentionConfig, documentRetentionConfig, legalDocumentRetentionConfig, iamConfig, iamDataRetentionConfig, schedulerLeaderElectionConfig, reconciliationExecutionMutexConfig } from '@config/index';

import { PrismaModule } from '@shared/database/prisma.module';
import { StripeEnvironmentModule } from '@shared/stripe/stripe-environment.module';
import { RedisModule } from '@shared/redis/redis.module';
import { StorageModule } from '@shared/storage/storage.module';
import { AuthModule } from '@shared/auth/auth.module';
import { SharedGuardsModule } from '@shared/auth/shared-guards.module';

import { PlatformAdminModule } from '@modules/platform-admin/platform-admin.module';
import { OrganizationsModule } from '@modules/organizations/organizations.module';
import { UsersModule } from '@modules/users/users.module';
import { StationsModule } from '@modules/stations/stations.module';
import { ProductsModule } from '@modules/products/products.module';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { ClickHouseModule } from '@modules/clickhouse/clickhouse.module';
import { ObservabilityModule } from '@modules/observability/observability.module';
import { FleetHealthObservabilityModule } from '@modules/fleet-health-observability/fleet-health-observability.module';
import { VehicleDetailObservabilityModule } from '@modules/vehicles/observability/vehicle-detail-observability.module';
import { IamObservabilityModule } from '@modules/iam-observability/iam-observability.module';
import { EvaluationsObservabilityModule } from '@modules/evaluations-observability/evaluations-observability.module';
import { EnergyEventsObservabilityModule } from '@modules/energy-events-observability/energy-events-observability.module';
import { EvaluationsApiObservabilityInterceptor } from '@modules/evaluations-observability/evaluations-api.interceptor';
import { DimoModule } from '@modules/dimo/dimo.module';
import { VehicleOnboardingModule } from '@modules/vehicle-onboarding/vehicle-onboarding.module';
import { PhysicalDeviceInventoryModule } from '@modules/physical-device-inventory/physical-device-inventory.module';
import { AiModule } from '@modules/ai/ai.module';
import { IntegrationsModule } from '@modules/integrations/integrations.module';
import { BillingModule } from '@modules/billing/billing.module';
import { ProspectsModule } from '@modules/prospects/prospects.module';
import { CustomersModule } from '@modules/customers/customers.module';
import { CustomerVerificationModule } from '@modules/customer-verification/customer-verification.module';
import { MisuseCasesModule } from '@modules/vehicle-intelligence/misuse-cases/misuse-cases.module';
import { BookingsModule } from '@modules/bookings/bookings.module';
import { RentalDrivingAnalysisModule } from '@modules/rental-driving-analysis/rental-driving-analysis.module';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { BusinessAuditModule } from '@modules/business-audit/business-audit.module';
import { SupportModule } from '@modules/support/support.module';
import { TasksModule } from '@modules/tasks/tasks.module';
import { ServiceCasesModule } from '@modules/service-cases/service-cases.module';
import { FinesModule } from '@modules/fines/fines.module';
import { InvoicesModule } from '@modules/invoices/invoices.module';
import { VendorsModule } from '@modules/vendors/vendors.module';
import { DataAuthorizationsModule } from '@modules/data-authorizations/data-authorizations.module';
import { DataAnalyseModule } from '@modules/data-analyse/data-analyse.module';
import { WorkflowsModule } from '@modules/workflows/workflows.module';
import { PartsAccessoriesModule } from '@modules/parts-accessories/parts-accessories.module';
import { InsurancesModule } from '@modules/insurances/insurances.module';
import { VoiceAssistantModule } from '@modules/voice-assistant/voice-assistant.module';
import { VoiceMcpGatewayModule } from '@modules/voice-mcp-gateway/voice-mcp-gateway.module';
import { VoiceCallOrchestrationModule } from '@modules/voice-call-orchestration/voice-call-orchestration.module';
import { VoiceBillingModule } from '@modules/voice-billing/voice-billing.module';
import { VoiceProtectionModule } from '@modules/voice-protection/voice-protection.module';
import { VoiceWebhookIngestionModule } from '@modules/voice-webhook-ingestion/voice-webhook-ingestion.module';
import { WhatsAppModule } from '@modules/whatsapp/whatsapp.module';
import { SmsPersistenceModule } from '@modules/sms/sms-persistence.module';
import { BusinessInsightsModule } from '@modules/business-insights/business-insights.module';
import { DashboardUtilizationModule } from '@modules/dashboard-utilization/dashboard-utilization.module';
import { EvaluationsMetricsModule } from '@modules/evaluations-metrics/evaluations-metric.module';
import { EvaluationsAnalyticsModule } from '@modules/evaluations-analytics/evaluations-analytics.module';
import { EvaluationsFinanceModule } from '@modules/evaluations-finance/evaluations-finance.module';
import { EvaluationsInsightsModule } from '@modules/evaluations-analytics/e4/evaluations-insights.module';
import { EvaluationsQualityModule } from '@modules/evaluations-analytics/e5/evaluations-quality.module';
import { EvaluationsRecommendationsModule } from '@modules/evaluations-analytics/e7/evaluations-recommendations.module';
import { HighMobilityModule } from '@modules/high-mobility/high-mobility.module';
import { RentalHealthModule } from '@modules/rental-health/rental-health.module';
import { TechnicalObservationsModule } from '@modules/technical-observations/technical-observations.module';
import { DocumentExtractionModule } from '@modules/document-extraction/document-extraction.module';
import { DocumentsModule } from '@modules/documents/documents.module';
import { OutboundEmailModule } from '@modules/outbound-email/outbound-email.module';
import { PricingModule } from '@modules/pricing/pricing.module';
import { RentalRulesModule } from '@modules/rental-rules/rental-rules.module';
import { WorkersModule } from '@workers/workers.module';
import { SchedulerLeaderElectionModule } from '@shared/scheduler-leader/scheduler-leader-election.module';
import { ReconciliationExecutionMutexModule } from '@shared/reconciliation-execution-mutex/reconciliation-execution-mutex.module';
import { AuthApiModule } from '@modules/auth/auth.module';
import { AccountModule } from '@modules/account/account.module';
import { IamMfaModule } from '@modules/iam-mfa/iam-mfa.module';
import { IamDataRetentionModule } from '@modules/iam-data-retention/iam-data-retention.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { CommunicationModule } from '@modules/communication/communication.module';
import { HealthModule } from '@modules/health/health.module';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { OneAutoProviderModule } from '@modules/oneauto-provider/oneauto-provider.module';
import { SpaFallbackController } from './spa-fallback.controller';

async function isRedisCompatible(): Promise<boolean> {
  const logger = new Logger('RedisCheck');
  try {
    const client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      connectTimeout: 3000,
      lazyConnect: true,
    });
    await client.connect();
    const info = await client.info('server');
    await client.quit();
    const match = info.match(/redis_version:(\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1], 10);
      if (major >= 5) return true;
      logger.warn(`Redis ${match[1]}.${match[2]} detected — BullMQ requires >= 5.0. Workers disabled.`);
      return false;
    }
    return false;
  } catch {
    logger.warn('Redis not reachable — BullMQ workers disabled.');
    return false;
  }
}

@Module({})
export class AppModule {
  static async forRootAsync(): Promise<DynamicModule> {
    // Redis availability is reported but not used as a gate for module registration.
    //
    // Previously BullModule and WorkersModule were registered conditionally, which
    // caused a critical bootstrap failure: feature modules (e.g. VehicleIntelligenceModule)
    // unconditionally call `BullModule.registerQueue` and inject queues via `@InjectQueue`,
    // which is unresolvable when the root BullModule is missing. We now always register
    // BullModule + WorkersModule so the dependency graph is stable. If Redis is
    // unavailable at runtime, BullMQ (via ioredis) will reconnect automatically
    // and queue producers will surface errors on `.add()` rather than crashing boot.
    const redisOk = await isRedisCompatible();
    RuntimeStatusRegistry.setWorkersEnabled(redisOk);

    return {
      module: AppModule,
      controllers: [SpaFallbackController],
      providers: [
        // Global rate limiting — moderate defaults for API traffic.
        // Auth-sensitive routes (login, seed-admin) are further throttled via @Throttle().
        {
          provide: APP_GUARD,
          useClass: ThrottlerGuard,
        },
        // Global audit interceptor — logs all mutating HTTP operations to ActivityLog.
        // AuditService is provided by ActivityLogModule (@Global).
        {
          provide: APP_INTERCEPTOR,
          useClass: AuditInterceptor,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: MasterAdminPrivilegedAuditInterceptor,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: EvaluationsApiObservabilityInterceptor,
        },
      ],
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [appConfig, databaseConfig, redisConfig, dimoConfig, workerConfig, highMobilityConfig, retentionConfig, storageConfig, documentExtractionConfig, vehicleIdentityP2Config, oneautoProviderConfig, vehicleIdentityP3Config, zb1RegistrationDocumentP4Config, fuelStationEnrichmentConfig, tireDs4ShadowConfig, tireWearV3CalibrationShadowConfig, chargingStationEnrichmentConfig, physicalRefuelReconciliationConfig, rawFuelRefuelFallbackConfig, documentsConfig, whatsappConfig, diditConfig, stripeConfig, twilioConfig, aiConfig, emailConfig, notificationEvaluationConfig, notificationDeliveryConfig, paymentEmailConfig, billingEmailConfig, billingReconciliationConfig, billingStripeSyncConfig, taskAutomationOutboxConfig, taskAutomationWorkflowRuntimeConfig, workflowShadowConfig, workflowRuntimeRolloutConfig, deviceConnectionWebhookInboxConfig, connectivityRecoveryConfig, drivingIntelligenceV2Config, referenceCaptureConfig, stationsV2Config, batteryHealthV2Config, batteryV2RetentionConfig, voiceRetentionConfig, documentRetentionConfig, legalDocumentRetentionConfig, iamConfig, iamDataRetentionConfig, schedulerLeaderElectionConfig, reconciliationExecutionMutexConfig],
        }),

        // Global throttler: 200 requests per minute per IP (normal API usage)
        ThrottlerModule.forRoot([
          {
            name: 'global',
            ttl: 60_000,    // 60 seconds window
            limit: 200,     // max 200 requests per window
          },
        ]),

        ServeStaticModule.forRoot({
          rootPath: join(process.cwd(), 'public'),
          exclude: ['/api/(.*)'],
        }),

        // Global BullMQ root — always registered so @InjectQueue resolves across
        // the dependency graph. defaultJobOptions enforce bounded Redis memory
        // via removeOnComplete / removeOnFail and a consistent retry policy.
        BullModule.forRootAsync({
          useFactory: () => ({
            connection: {
              host: process.env.REDIS_HOST || 'localhost',
              port: parseInt(process.env.REDIS_PORT || '6379', 10),
              password: process.env.REDIS_PASSWORD || undefined,
              // BullMQ requires this to be null for blocking commands (waitUntilFinished, etc.)
              maxRetriesPerRequest: null,
              enableReadyCheck: false,
            },
            defaultJobOptions: {
              // Keep last N completed jobs for inspection; older ones evicted to cap memory.
              removeOnComplete: { count: 1000, age: 24 * 3600 },
              // Keep last N failed jobs for DLQ / debugging.
              removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
              attempts: 3,
              backoff: { type: 'exponential', delay: 5_000 },
            },
          }),
        }),

        ScheduleModule.forRoot(),

        PrismaModule,
        StripeEnvironmentModule,
        RedisModule,
        StorageModule,
        AuthModule,
        SharedGuardsModule,
        AuthApiModule,
        AccountModule,
        IamMfaModule,
        IamDataRetentionModule,
        NotificationsModule,
        CommunicationModule,
        HealthModule,

        PlatformAdminModule,
        OrganizationsModule,
        UsersModule,
        StationsModule,
        ProductsModule,
        VehiclesModule,
        ClickHouseModule,
        ObservabilityModule,
        SchedulerLeaderElectionModule,
        ReconciliationExecutionMutexModule,
        IamObservabilityModule,
        FleetHealthObservabilityModule,
        VehicleDetailObservabilityModule,
        EvaluationsObservabilityModule,
        EnergyEventsObservabilityModule,
        VehicleIntelligenceModule,
        DimoModule,
        VehicleOnboardingModule,
        PhysicalDeviceInventoryModule,
        AiModule,
        IntegrationsModule,
        BillingModule,
        ProspectsModule,
        CustomersModule,
        CustomerVerificationModule,
        MisuseCasesModule,
        BookingsModule,
        RentalDrivingAnalysisModule,
        ActivityLogModule,
        BusinessAuditModule,
        SupportModule,
        TasksModule,
        ServiceCasesModule,
        FinesModule,
        InvoicesModule,
        VendorsModule,
        DataAuthorizationsModule,
        DataAnalyseModule,
        WorkflowsModule,
        PartsAccessoriesModule,
        InsurancesModule,
        VoiceAssistantModule,
        VoiceMcpGatewayModule,
        VoiceWebhookIngestionModule,
        VoiceCallOrchestrationModule,
        VoiceBillingModule,
        VoiceProtectionModule,
        WhatsAppModule,
        SmsPersistenceModule,
        BusinessInsightsModule,
        DashboardUtilizationModule,
        EvaluationsMetricsModule,
        EvaluationsAnalyticsModule,
        EvaluationsFinanceModule,
        EvaluationsInsightsModule,
        EvaluationsQualityModule,
        EvaluationsRecommendationsModule,
        HighMobilityModule,
        RentalHealthModule,
        TechnicalObservationsModule,
        DocumentExtractionModule,
        OneAutoProviderModule,
        DocumentsModule,
        OutboundEmailModule,
        PricingModule,
        RentalRulesModule,

        // Workers / processors / schedulers. Non-Redis schedulers inside this
        // module (e.g. brake recalc, trip reconciliation, HM polling) also live
        // here for colocation; they boot independently of queue availability.
        WorkersModule,
      ],
    };
  }
}
