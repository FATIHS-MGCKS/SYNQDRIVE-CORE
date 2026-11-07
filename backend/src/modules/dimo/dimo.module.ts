import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import dimoConfig from '@config/dimo.config';
import dimoProviderLimiterConfig from '@config/dimo-provider-limiter.config';
import deviceConnectionWebhookInboxConfig from '@config/device-connection-webhook-inbox.config';
import connectivityRecoveryConfig from '@config/connectivity-recovery.config';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { SharedGuardsModule } from '@shared/auth/shared-guards.module';
import { DimoController } from './dimo.controller';
import { DimoWebhookController } from './dimo-webhook.controller';
import { DimoAuthService } from './dimo-auth.service';
import { DimoProviderGateway } from './provider/dimo-provider-gateway.service';
import { DimoProviderAdmissionService } from './provider/dimo-provider-admission.service';
import { DimoProviderLimiterService } from './provider/dimo-provider-limiter.service';
import { DimoProviderMetricsService } from './provider/dimo-provider-metrics.service';
import { DimoTelemetryService } from './dimo-telemetry.service';
import { DimoVehicleSyncService } from './dimo-vehicle-sync.service';
import { DimoApiSyncService } from './dimo-api-sync.service';
import { DimoSegmentsService } from './dimo-segments.service';
import { DimoRechargeSegmentsClient } from './recharge-segments/dimo-recharge-segments.client';
import { DimoTriggersService } from './dimo-triggers.service';
import { DimoTriggersBootstrapService } from './dimo-triggers-bootstrap.service';
import { DeviceConnectionWebhookInboxService } from './device-connection-webhook-inbox.service';
import { DeviceConnectionWebhookReplayService } from './device-connection-webhook-replay.service';
import { DeviceConnectionWebhookInboxController } from './device-connection-webhook-inbox.controller';
import { RpmWebhookCandidateService } from './rpm-webhook-candidate.service';
import { RpmWebhookQueryService } from './rpm-webhook-query.service';
import { DeviceConnectionEpisodeResolutionService } from './device-connection-episode-resolution/device-connection-episode-resolution.service';
import { VehicleConnectivityRuntimeProjectionService } from './device-connection-episode-resolution/vehicle-connectivity-runtime-projection.service';
import { DeviceConnectionEpisodeResolutionOutboxService } from './device-connection-episode-resolution/device-connection-episode-resolution-outbox.service';
import { DeviceConnectionEpisodeResolutionOutboxRepository } from './device-connection-episode-resolution/device-connection-episode-resolution-outbox.repository';
import { DeviceConnectionEpisodeResolutionOutboxProcessorService } from './device-connection-episode-resolution/device-connection-episode-resolution-outbox-processor.service';
import deviceConnectionEpisodeResolutionOutboxConfig from '@config/device-connection-episode-resolution-outbox.config';
import { ConnectivityAlertService } from './connectivity-alert/connectivity-alert.service';
import { ConnectivityDiagnosticTransitionTracker } from './connectivity/connectivity-diagnostic-transition.tracker';
import { ConnectivityObservabilityService } from './connectivity/connectivity-observability.service';
import { DeviceConnectionQueryService } from './device-connection-query.service';
import { DeviceConnectionEpisodeReconciliationService } from './device-connection-episode-reconciliation/device-connection-episode-reconciliation.service';
import { DeviceConnectionEpisodeReconciliationHistoricalLoader } from './device-connection-episode-reconciliation/device-connection-episode-reconciliation-historical.loader';
import { DeviceConnectionEpisodeReconciliationApplyService } from './device-connection-episode-reconciliation/device-connection-episode-reconciliation-apply.service';
import { DeviceConnectionWebhookConfigurationService } from './device-connection-webhook-configuration/device-connection-webhook-configuration.service';
import { DimoTriggerRegistryService } from './device-connection-webhook-configuration/dimo-trigger-registry.service';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';
import { EventTripAssociationModule } from '../vehicle-intelligence/trips/event-association/event-trip-association.module';
import { DimoConnectivityLifecycleDiModule } from './dimo-connectivity-lifecycle-di.module';
import { DimoVehicleDataSourceLinkService } from './dimo-vehicle-data-source-link.service';
import { DimoProviderBudgetModule } from './provider-budget/dimo-provider-budget.module';
import { SnapshotWakeModule } from '@workers/snapshot-wake/snapshot-wake.module';
import { DeviceConnectionPhysicalStateModule } from './device-connection-physical-state/device-connection-physical-state.module';
import { VsiReadonlySignalComposerModule } from '../vehicle-intelligence/vehicle-signal-intelligence/vsi-readonly-composer.module';
import { FsdDiscoveryIntegrationModule } from '../vehicle-intelligence/fsd-integration/fsd-integration.module';

@Module({
  imports: [
    ConfigModule.forFeature(dimoConfig),
    ConfigModule.forFeature(dimoProviderLimiterConfig),
    ConfigModule.forFeature(deviceConnectionWebhookInboxConfig),
    ConfigModule.forFeature(deviceConnectionEpisodeResolutionOutboxConfig),
    ConfigModule.forFeature(connectivityRecoveryConfig),
    DimoProviderBudgetModule,
    SnapshotWakeModule,
    DimoConnectivityLifecycleDiModule,
    DeviceConnectionPhysicalStateModule,
    VsiReadonlySignalComposerModule,
    EventTripAssociationModule,
    ActivityLogModule,
    SharedGuardsModule,
    forwardRef(() => NotificationsModule),
    forwardRef(() => VehicleIntelligenceModule),
    forwardRef(() => FsdDiscoveryIntegrationModule),
  ],
  controllers: [DimoController, DimoWebhookController, DeviceConnectionWebhookInboxController],
  providers: [
    DimoProviderGateway,
    DimoProviderAdmissionService,
    DimoProviderLimiterService,
    DimoProviderMetricsService,
    DimoAuthService,
    DimoTelemetryService,
    DimoVehicleSyncService,
    DimoApiSyncService,
    DimoSegmentsService,
    DimoRechargeSegmentsClient,
    DimoTriggersService,
    DimoTriggersBootstrapService,
    DeviceConnectionWebhookInboxService,
    DeviceConnectionWebhookReplayService,
    DimoTriggerRegistryService,
    DeviceConnectionWebhookConfigurationService,
    DeviceConnectionEpisodeReconciliationService,
    DeviceConnectionEpisodeReconciliationHistoricalLoader,
    DeviceConnectionEpisodeReconciliationApplyService,
    ConnectivityObservabilityService,
    ConnectivityDiagnosticTransitionTracker,
    DeviceConnectionEpisodeResolutionService,
    DeviceConnectionEpisodeResolutionOutboxService,
    DeviceConnectionEpisodeResolutionOutboxRepository,
    DeviceConnectionEpisodeResolutionOutboxProcessorService,
    ConnectivityAlertService,
    VehicleConnectivityRuntimeProjectionService,
    DeviceConnectionQueryService,
    DimoVehicleDataSourceLinkService,
    RpmWebhookCandidateService,
    RpmWebhookQueryService,
  ],
  exports: [
    DimoProviderGateway,
    DimoAuthService,
    DimoTelemetryService,
    DimoVehicleSyncService,
    DimoApiSyncService,
    DimoSegmentsService,
    DimoRechargeSegmentsClient,
    DimoTriggersService,
    DeviceConnectionQueryService,
    DeviceConnectionEpisodeResolutionService,
    DeviceConnectionEpisodeResolutionOutboxProcessorService,
    DimoConnectivityLifecycleDiModule,
    ConnectivityAlertService,
    VehicleConnectivityRuntimeProjectionService,
    RpmWebhookQueryService,
    DeviceConnectionWebhookReplayService,
    DeviceConnectionWebhookConfigurationService,
    DimoTriggerRegistryService,
    DimoVehicleDataSourceLinkService,
    DeviceConnectionPhysicalStateModule,
  ],
})
export class DimoModule {}
