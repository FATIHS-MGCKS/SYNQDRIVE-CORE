import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { QUEUE_NAMES } from './queues/queue-names';
import { DimoModule } from '@modules/dimo/dimo.module';
import { PdiIdentityDriftShadowModule } from '@modules/physical-device-inventory/pdi-identity-drift-shadow.module';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { HighMobilityModule } from '@modules/high-mobility/high-mobility.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { PaymentsModule } from '@modules/payments/payments.module';
import { BillingModule } from '@modules/billing/billing.module';
import { TaskAutomationOutboxModule } from '@modules/tasks/outbox/task-automation-outbox.module';
import { BatteryV2JobsModule } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-jobs.module';
import { BatteryGeneralizedEvidenceModule } from '@modules/vehicle-intelligence/battery-health/generalized-evidence/generalized-evidence.module';
import { BatteryV2JobsProducerModule } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-jobs-producer.module';
import { VoiceWebhookIngestionModule } from '@modules/voice-webhook-ingestion/voice-webhook-ingestion.module';
import { VoiceAssistantModule } from '@modules/voice-assistant/voice-assistant.module';
import { BookingDocumentGenerationModule } from '@modules/documents/booking-document-generation/booking-document-generation.module';

import { SnapshotWakeModule } from './snapshot-wake/snapshot-wake.module';
import { AdaptivePollingShadowModule } from './schedulers/snapshot-polling/adaptive-polling-shadow/adaptive-polling-shadow.module';
import { VsiReadonlySignalComposerModule } from '@modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-readonly-composer.module';

import { DimoSnapshotProcessor } from './processors/dimo-snapshot.processor';
import { SnapshotWakeHandoffProcessor } from './processors/snapshot-wake-handoff.processor';
import { DimoVehicleSyncProcessor } from './processors/dimo-vehicle-sync.processor';
import { DimoDtcProcessor } from './processors/dimo-dtc.processor';
import { TireRecalculationProcessor } from './processors/tire-recalculation.processor';
import { TireDs4ShadowProcessor } from './processors/tire-ds4-shadow.processor';
import { TireDs4ShadowCatchupScheduler } from './schedulers/tire-ds4-shadow-catchup.scheduler';
import { TireWearV3CalibrationShadowScheduler } from './schedulers/tire-wear-v3-calibration-shadow.scheduler';
import { TireDs4ShadowModule } from '@modules/vehicle-intelligence/tires/ds4-shadow/tire-ds4-shadow.module';
import { TireWearV3CalibrationShadowModule } from '@modules/vehicle-intelligence/tires/wear-v3-calibration-shadow/tire-wear-v3-calibration-shadow.module';
import { BrakeRecalculationProcessor } from './processors/brake-recalculation.processor';
import { TripTrackingProcessor } from './processors/trip-tracking.processor';
import { TripBehaviorEnrichmentProcessor } from './processors/trip-behavior-enrichment.processor';
import { DrivingImpactProcessor } from './processors/driving-impact.processor';
import { DrivingIntelligenceJobProcessor } from './processors/driving-intelligence-job.processor';
import { DtcKnowledgeProcessor } from './processors/dtc-knowledge.processor';
import { NotificationEvaluationProcessor } from './processors/notification-evaluation.processor';
import { NotificationDeliveryProcessor } from './processors/notification-delivery.processor';
import { PaymentEmailProcessor } from './processors/payment-email.processor';
import { TaskAutomationOutboxProcessor } from './processors/task-automation-outbox.processor';
import { BatteryV2Processor } from './processors/battery-v2.processor';
import { VoiceWebhookProcessor } from './processors/voice-webhook.processor';
import { DeviceConnectionWebhookProcessor } from './processors/device-connection-webhook.processor';
import { BookingDocumentGenerationProcessor } from './processors/booking-document-generation.processor';
import { ClickHouseMirrorRetryProcessor } from './processors/clickhouse-mirror-retry.processor';
import { RefuelStationEnrichmentProcessor } from './processors/refuel-station-enrichment.processor';
import { RechargeStationEnrichmentProcessor } from './processors/recharge-station-enrichment.processor';
import { FuelStationEnrichmentRecoveryScheduler } from './schedulers/fuel-station-enrichment-recovery.scheduler';
import { ChargingStationEnrichmentRecoveryScheduler } from './schedulers/charging-station-enrichment-recovery.scheduler';
import { PhysicalRefuelReconciliationRecoveryScheduler } from './schedulers/physical-refuel-reconciliation-recovery.scheduler';
import { RawRefuelCandidateRecoveryScheduler } from './schedulers/raw-refuel-candidate-recovery.scheduler';
import { ReferenceCaptureProcessor } from './processors/reference-capture.processor';
import { ReferenceCaptureSettlementShadowProcessor } from './processors/reference-capture-settlement-shadow.processor';
import { ReferenceCaptureExp021MaturationShadowProcessor } from './processors/reference-capture-exp021-maturation-shadow.processor';
import { OneAutoProviderProcessor } from './processors/oneauto-provider.processor';
import { ReferenceCaptureRetentionScheduler } from './schedulers/reference-capture-retention.scheduler';
import { ReferenceCaptureSettlementShadowRecoveryScheduler } from './schedulers/reference-capture-settlement-shadow-recovery.scheduler';
import { ReferenceCaptureExp021MaturationShadowRecoveryScheduler } from './schedulers/reference-capture-exp021-maturation-shadow-recovery.scheduler';
import { ReferenceCaptureExp021FleetCoordinatorScheduler } from './schedulers/reference-capture-exp021-fleet-coordinator.scheduler';
import { ReferenceCaptureExp021CanaryLiveWindowActivationScheduler } from './schedulers/reference-capture-exp021-canary-live-window-activation.scheduler';
import { ReferenceCaptureExp021CanaryLiveWindowActivationSchedulerRuntimeModule } from '@modules/vehicle-intelligence/reference-capture/exp021-canary-live-window/reference-capture-exp021-canary-live-window-activation-scheduler-runtime.module';
import { OneAutoProviderModule } from '@modules/oneauto-provider/oneauto-provider.module';

import { DimoSnapshotScheduler } from './schedulers/dimo-snapshot.scheduler';
import { SnapshotWakeHandoffRecoveryScheduler } from './schedulers/snapshot-wake-handoff-recovery.scheduler';
import { DimoDtcScheduler } from './schedulers/dimo-dtc.scheduler';
import { DimoVehicleSyncScheduler } from './schedulers/dimo-vehicle-sync.scheduler';
import { TireRecalculationScheduler } from './schedulers/tire-recalculation.scheduler';
import { BrakeRecalculationScheduler } from './schedulers/brake-recalculation.scheduler';
import { TripTrackingRecoveryScheduler } from './schedulers/trip-tracking-recovery.scheduler';
import { TripAnalysisRecoveryScheduler } from './schedulers/trip-analysis-recovery.scheduler';
import { TripReconciliationScheduler } from './schedulers/trip-reconciliation.scheduler';
import { DrivingAnalysisReconciliationScheduler } from './schedulers/driving-analysis-reconciliation.scheduler';
import { PaymentConnectReconciliationScheduler } from './schedulers/payment-connect-reconciliation.scheduler';
import { BillingReconciliationScheduler } from './schedulers/billing-reconciliation.scheduler';
import { HmHealthPollingScheduler } from './schedulers/hm-health-polling.scheduler';
import { DataRetentionScheduler } from './schedulers/data-retention.scheduler';
import { StorageOrphanSweepScheduler } from './schedulers/storage-orphan-sweep.scheduler';
import { BatteryV2RetentionScheduler } from './schedulers/battery-v2-retention.scheduler';
import { BatteryV2ReconciliationScheduler } from './schedulers/battery-v2-reconciliation.scheduler';
import { BatteryV2LongitudinalMaterializationReconciliationScheduler } from './schedulers/battery-v2-longitudinal-materialization-reconciliation.scheduler';
import { BatteryHvH4A3ReconciliationScheduler } from './schedulers/battery-hv-h4-a3-reconciliation.scheduler';
import { BatteryHvH4A3ReconciliationModule } from '@modules/vehicle-intelligence/battery-health/hv-h4/battery-hv-h4-a3-reconciliation.module';
import { VoiceRetentionScheduler } from './schedulers/voice-retention.scheduler';
import { IamDataRetentionScheduler } from './schedulers/iam-data-retention.scheduler';
import { IamDataRetentionModule } from '@modules/iam-data-retention/iam-data-retention.module';
import { VehicleWarningGdprModule } from '@modules/vehicle-warning-gdpr/vehicle-warning-gdpr.module';
import { VehicleRegistryLifecycleOutboxProcessor } from '@modules/vehicle-onboarding/registry-lifecycle/vehicle-registry-lifecycle-outbox.processor';
import { VehicleRegistryLifecycleOutboxRepository } from '@modules/vehicle-onboarding/registry-lifecycle/vehicle-registry-lifecycle-outbox.repository';
import { VehicleRegistryLifecycleOutboxWorker } from '@modules/vehicle-onboarding/registry-lifecycle/vehicle-registry-lifecycle-outbox.worker';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.DIMO_SNAPSHOT },
      { name: QUEUE_NAMES.SNAPSHOT_WAKE_HANDOFF },
      { name: QUEUE_NAMES.DIMO_VEHICLE_SYNC },
      { name: QUEUE_NAMES.DTC_POLL },
      { name: QUEUE_NAMES.TIRE_RECALCULATION },
      { name: QUEUE_NAMES.TIRE_DS4_SHADOW },
      { name: QUEUE_NAMES.BRAKE_RECALCULATION },
      { name: QUEUE_NAMES.TRIP_TRACKING },
      { name: QUEUE_NAMES.TRIP_BEHAVIOR_ENRICHMENT },
      { name: QUEUE_NAMES.DRIVING_IMPACT_COMPUTE },
      { name: QUEUE_NAMES.DRIVING_INTELLIGENCE },
      { name: QUEUE_NAMES.DTC_KNOWLEDGE_ENRICHMENT },
      { name: QUEUE_NAMES.NOTIFICATION_EVALUATION },
      { name: QUEUE_NAMES.NOTIFICATION_DELIVERY },
      { name: QUEUE_NAMES.PAYMENT_EMAIL },
      { name: QUEUE_NAMES.TASK_AUTOMATION },
      { name: QUEUE_NAMES.BATTERY_V2 },
      { name: QUEUE_NAMES.VOICE_WEBHOOK_PROCESS },
      { name: QUEUE_NAMES.CONNECTIVITY_WEBHOOK_PROCESS },
      { name: QUEUE_NAMES.BOOKING_DOCUMENT_GENERATION },
      { name: QUEUE_NAMES.CLICKHOUSE_MIRROR_RETRY },
      { name: QUEUE_NAMES.ENERGY_REFUEL_STATION_ENRICH },
      { name: QUEUE_NAMES.ENERGY_RECHARGE_STATION_ENRICH },
      { name: QUEUE_NAMES.REFERENCE_CAPTURE },
      { name: QUEUE_NAMES.REFERENCE_CAPTURE_SETTLEMENT_SHADOW },
      { name: QUEUE_NAMES.REFERENCE_CAPTURE_EXP021_MATURATION_SHADOW },
      { name: QUEUE_NAMES.ONEAUTO_PROVIDER },
    ),
    DimoModule,
    PdiIdentityDriftShadowModule,
    SnapshotWakeModule,
    AdaptivePollingShadowModule,
    VsiReadonlySignalComposerModule,
    VehicleIntelligenceModule,
    TireDs4ShadowModule,
    TireWearV3CalibrationShadowModule,
    HighMobilityModule,
    NotificationsModule,
    PaymentsModule,
    BillingModule,
    TaskAutomationOutboxModule,
    BatteryV2JobsProducerModule,
    BatteryV2JobsModule,
    BatteryGeneralizedEvidenceModule,
    BatteryHvH4A3ReconciliationModule,
    VoiceWebhookIngestionModule,
    VoiceAssistantModule,
    IamDataRetentionModule,
    VehicleWarningGdprModule,
    BookingDocumentGenerationModule,
    ReferenceCaptureExp021CanaryLiveWindowActivationSchedulerRuntimeModule,
    OneAutoProviderModule,
  ],
  providers: [
    // Processors
    DimoSnapshotProcessor,
    SnapshotWakeHandoffProcessor,
    DimoVehicleSyncProcessor,
    DimoDtcProcessor,
    TireRecalculationProcessor,
    TireDs4ShadowProcessor,
    BrakeRecalculationProcessor,
    TripTrackingProcessor,
    TripBehaviorEnrichmentProcessor,
    DrivingImpactProcessor,
    DrivingIntelligenceJobProcessor,
    DtcKnowledgeProcessor,
    NotificationEvaluationProcessor,
    NotificationDeliveryProcessor,
    PaymentEmailProcessor,
    TaskAutomationOutboxProcessor,
    BatteryV2Processor,
    VoiceWebhookProcessor,
    DeviceConnectionWebhookProcessor,
    BookingDocumentGenerationProcessor,
    ClickHouseMirrorRetryProcessor,
    RefuelStationEnrichmentProcessor,
    RechargeStationEnrichmentProcessor,
    ReferenceCaptureProcessor,
    ReferenceCaptureSettlementShadowProcessor,
    ReferenceCaptureExp021MaturationShadowProcessor,
    OneAutoProviderProcessor,

    // Schedulers
    DimoSnapshotScheduler,
    SnapshotWakeHandoffRecoveryScheduler,
    DimoDtcScheduler,
    DimoVehicleSyncScheduler,
    TireRecalculationScheduler,
    TireDs4ShadowCatchupScheduler,
    TireWearV3CalibrationShadowScheduler,
    BrakeRecalculationScheduler,
    TripTrackingRecoveryScheduler,
    TripAnalysisRecoveryScheduler,
    TripReconciliationScheduler,
    DrivingAnalysisReconciliationScheduler,
    PaymentConnectReconciliationScheduler,
    BillingReconciliationScheduler,
    HmHealthPollingScheduler,
    DataRetentionScheduler,
    StorageOrphanSweepScheduler,
    BatteryV2ReconciliationScheduler,
    BatteryV2LongitudinalMaterializationReconciliationScheduler,
    BatteryHvH4A3ReconciliationScheduler,
    BatteryV2RetentionScheduler,
    VoiceRetentionScheduler,
    IamDataRetentionScheduler,
    FuelStationEnrichmentRecoveryScheduler,
    ChargingStationEnrichmentRecoveryScheduler,
    PhysicalRefuelReconciliationRecoveryScheduler,
    RawRefuelCandidateRecoveryScheduler,
    ReferenceCaptureRetentionScheduler,
    ReferenceCaptureSettlementShadowRecoveryScheduler,
    ReferenceCaptureExp021MaturationShadowRecoveryScheduler,
    ReferenceCaptureExp021FleetCoordinatorScheduler,
    ReferenceCaptureExp021CanaryLiveWindowActivationScheduler,
    VehicleRegistryLifecycleOutboxRepository,
    VehicleRegistryLifecycleOutboxProcessor,
    VehicleRegistryLifecycleOutboxWorker,
  ],
})
export class WorkersModule {}
