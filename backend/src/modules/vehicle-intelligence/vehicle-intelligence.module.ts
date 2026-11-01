import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DataAuthorizationsModule } from '../data-authorizations/data-authorizations.module';
import { VehicleIntelligenceController } from './vehicle-intelligence.controller';
import { DamagesOrgController } from './damages/damages-org.controller';
import { BatteryService } from './battery/battery.service';
import { TiresService } from './tires/tires.service';
import { TireWearModelService } from './tires/tire-wear-model.service';
import { TireHealthService } from './tires/tire-health.service';
import { TireHealthAlertService } from './tires/tire-health-alert.service';
import { TireLifecycleService } from './tires/tire-lifecycle.service';
import { TireIdentityService } from './tires/tire-identity.service';
import { BrakesService } from './brakes/brakes.service';
import { BrakeHealthService } from './brakes/brake-health.service';
import { BrakeEvidenceService } from './brakes/brake-evidence.service';
import { BrakeLifecycleService } from './brakes/brake-lifecycle.service';
import { BrakeServiceApplicationService } from './brakes/brake-service-application.service';
import { BrakeServiceOutboxService } from './brakes/brake-service-outbox.service';
import { ValidateBrakeServiceScopePipe } from './brakes/brake-service-scope.validation';
import { BrakeInitializationWorkflowService } from './brakes/brake-initialization-workflow.service';
import { BrakeEnrichmentJobDiagnosticsService } from './brakes/brake-enrichment-job-diagnostics.service';
import { BrakeRegistrationService } from './brakes/brake-registration.service';
import { BrakeReferenceSpecService } from './brakes/brake-reference-spec.service';
import { BrakeRegistrationBackfillService } from './brakes/brake-registration-backfill.service';
import { BrakeBaselineCandidateAuditService } from './brakes/brake-baseline-candidate-audit.service';
import { BrakeBaselineBackfillService } from './brakes/brake-baseline-backfill.service';
import { DimoBrakingEventIntakeService } from './brakes/dimo-braking-event-intake.service';
import { BrakeComponentInstallationService } from './brakes/brake-component-installation.service';
import { BrakeComponentLifecycleService } from './brakes/brake-component-lifecycle.service';
import { BrakeRecalculationOrchestratorService } from './brakes/brake-recalculation-orchestrator.service';
import { BrakeRecalculationInputLoader } from './brakes/brake-recalculation-input.loader';
import { BrakeHealthObservabilityService } from './brakes/brake-health-observability.service';
import { BrakePredictionValidationService } from './brakes/brake-prediction-validation.service';
import { BrakeHealthReplayService } from './brakes/brake-health-replay.service';
import { BrakeDtcEvidenceProducerService } from './brakes/brake-dtc-evidence.producer';
import { BrakeHealthAlertService } from './brakes/brake-health-alert.service';
import { BrakeMetricsService } from './brakes/brake-metrics.service';
import { TireOdometerAnchorBackfillService } from './tires/tire-odometer-anchor-backfill.service';
import { TireTripUsageBackfillService } from './tires/tire-trip-usage-backfill.service';
import { TireTripUsageLedgerReconciliationService } from './tires/tire-trip-usage-ledger-reconciliation.service';
import { TireTripUsageService } from './tires/tire-trip-usage.service';
import { TireMetricsService } from './tires/tire-metrics.service';
import { TireHealthObservabilityService } from './tires/tire-health-observability.service';
import { TirePredictionValidationService } from './tires/tire-prediction-validation.service';
import { TireHealthReplayService } from './tires/tire-health-replay.service';
import { ServiceEventsService } from './service-events/service-events.service';
import { EnrichmentJobsService } from './enrichment-jobs/enrichment-jobs.service';
import { DtcService } from './dtc/dtc.service';
import { DtcSnapshotApplyService } from './dtc/snapshot/dtc-snapshot-apply.service';
import { Dtc02ObservabilityModule } from './dtc/observability/dtc02-observability.module';
import { DtcKnowledgeService } from './dtc-knowledge/dtc-knowledge.service';
import { DtcKnowledgeEnrichmentService } from './dtc-knowledge/dtc-knowledge-enrichment.service';
import { DtcAiResearchService } from './dtc-knowledge/dtc-ai-research.service';
import { DTC_RESEARCH_PORT } from './dtc-knowledge/dtc-research.port';
import { DrivingEventsService } from './driving-events/driving-events.service';
import { TripsService } from './trips/trips.service';
import { TripDetectionOrchestrationService } from './trips/trip-detection-orchestration.service';
import { TripLifecycleRecoveryService } from './trips/trip-lifecycle-recovery.service';
import { TripBehaviorEnrichmentService } from './trips/trip-behavior-enrichment.service';
import { TripEnrichmentOrchestratorService } from './trips/trip-enrichment-orchestrator.service';
import {
  TripRouteArtifactMaterializerService,
  TripRouteCanonicalReadService,
  VehicleTripRouteArtifactRepository,
} from './trips/route-artifact';
import { MapboxChunkMatchingClientService } from './trips/route-artifact/chunked-matching/mapbox-chunk-matching.client.service';
import { TripRouteChunkedMatcherService } from './trips/route-artifact/chunked-matching/trip-route-chunked-matcher.service';
import { TripAnalysisCoordinatorService } from './trips/trip-analysis-coordinator.service';
import { BoundaryRefreshLifecycleService } from './trips/boundary-refresh-lifecycle.service';
import { LteR1BehaviorEnrichmentService } from './trips/lte-r1-behavior-enrichment.service';
import { DimoNativeDrivingEventPersistenceService } from './dimo-native-driving-events/dimo-native-driving-event-persistence.service';
import { EventContextEnrichmentService } from './event-context/event-context-enrichment.service';
import { HfMirrorService } from './trips/hf-mirror.service';
import { WaypointMirrorService } from './trips/waypoint-mirror.service';
import { ActivityWindowProducerService } from './trips/activity-window-producer.service';
import { TripChEvidenceMirrorCoordinator } from './trips/trip-ch-evidence-mirror.coordinator';
import { MapboxService } from './trips/mapbox.service';
import { MapboxRouteMatcherService } from './trips/mapbox-route-matcher.service';
import { FmmRouteMatcherService } from './trips/fmm-route-matcher.service';
import { ROUTE_MAP_MATCHER } from './trips/route-map-matcher.port';
import { TripAssignmentService } from './trips/trip-assignment.service';
import { TripAttributionService } from './trips/trip-attribution.service';
import { DriverScoreService } from './trips/driver-score.service';
import { TripAnalyticsCanonicalService } from './trips/trip-analytics-canonical.service';
import { DamagesService } from './damages/damages.service';
import { BatteryHealthService } from './battery-health/battery-health.service';
import { HvBatteryHealthService } from './battery-health/hv-battery-health.service';
import { BatteryV2Service } from './battery-health/battery-v2.service';
import { BatteryEvidenceService } from './battery-health/battery-evidence.service';
import { BatteryGroundTruthRepository } from './battery-health/ground-truth/ground-truth.repository';
import { BatteryGroundTruthSourceResolver } from './battery-health/ground-truth/ground-truth-source.resolver';
import { BatteryGroundTruthService } from './battery-health/ground-truth/ground-truth.service';
import { BatteryGroundTruthInspectionService } from './battery-health/ground-truth/ground-truth-inspection.service';
import { BatteryGroundTruthEmissionService } from './battery-health/ground-truth/ground-truth-emission.service';
import { BatteryGroundTruthBackedSourceGuard } from './battery-health/ground-truth/ground-truth-backed-source.guard';
import { CanonicalBatteryHealthService } from './battery-health/canonical-battery-health.service';
import { BatteryMeasurementSessionRepository } from './battery-health/battery-measurement-session.repository';
import { BatteryMeasurementSessionService } from './battery-health/battery-measurement-session.service';
import { BatteryMeasurementRepository } from './battery-health/battery-measurement.repository';
import { BatteryMeasurementService } from './battery-health/battery-measurement.service';
import { BatteryAssessmentRepository } from './battery-health/battery-assessment.repository';
import { BatteryAssessmentService } from './battery-health/battery-assessment.service';
import { BatteryPublicationRepository } from './battery-health/battery-publication.repository';
import { BatteryPublicationService } from './battery-health/battery-publication.service';
import { LvCanonicalBatteryResolverService } from './battery-health/lv-canonical/lv-canonical-battery-resolver.service';
import { HvMethodProfileService } from './battery-health/hv-method-profile/hv-method-profile.service';
import {
  HvChargeSessionIngestService,
  HvChargeSessionPersistService,
  HvChargeSessionRepository,
  HvChargeSessionNativeFallbackConvergenceService,
  HvChargeSessionBoundaryEnrichmentService,
  HvFallbackChargeSessionDetectorService,
  HvRechargeSessionReconcileProducerService,
  HvRechargeSessionReconcileService,
} from './battery-health/hv-charge-session';
import { HvChargingCounterEvidenceModule } from './battery-health/hv-charging-counter-evidence/hv-charging-counter-evidence.module';
import {
  HvCapacityCrossSessionAssessmentService,
  HvCapacityM2SampleProviderService,
  HvCapacityM3ValidationService,
  HvCapacityObservationRepository,
  HvCapacityShadowProducerService,
  HvCapacityShadowService,
  HvSohGateAssessmentService,
  HvCapacitySessionSummaryService,
  HvCapacityShadowEvaluationService,
  HvCapacityShadowEvaluationController,
} from './battery-health/hv-capacity-shadow';
import { HvMeasurementQualityController } from './battery-health/hv-measurement-quality/hv-measurement-quality.controller';
import { HvMeasurementQualityService } from './battery-health/hv-measurement-quality/hv-measurement-quality.service';
import {
  VehicleBatteryReferenceCapacityController,
  VehicleBatteryReferenceCapacityRepository,
  VehicleBatteryReferenceCapacityService,
} from './battery-health/reference-capacity';
import { VehicleMotionPhysicsReferenceController } from './motion-physics-reference/vehicle-motion-physics-reference.controller';
import { VehicleMotionPhysicsReferenceRepository } from './motion-physics-reference/motion-physics-reference.repository';
import { VehicleMotionPhysicsReferenceService } from './motion-physics-reference/vehicle-motion-physics-reference.service';
import { HealthSummaryService } from './health-summary/health-summary.service';
import { AiHealthCareAggregationService } from './health-summary/ai-health-care-aggregation.service';
import { VehicleHealthTabSummaryService } from './health-summary/vehicle-health-tab-summary.service';
import { RentalHealthModule } from '../rental-health/rental-health.module';
import { DashboardWarningLightsService } from './dashboard-warning-lights/dashboard-warning-lights.service';
import { ServiceComplianceService } from './service-compliance/service-compliance.service';
import { ComplianceTaskMaterializeService } from './service-compliance/compliance-task-materialize.service';
import { ServiceOverdueTaskService } from './service-compliance/service-overdue-task.service';
import { BatteryTaskService } from './battery-health/battery-task.service';
import { VehicleFileSummaryService } from './vehicle-file/vehicle-file-summary.service';
import { TasksModule } from '../tasks/tasks.module';
import { DrivingImpactService } from './driving-impact/driving-impact.service';
import { DimoAvailableSignalsPreflightService } from './driving-capability/dimo-available-signals-preflight.service';
import { VehicleDrivingCapabilityRepository } from './driving-capability/vehicle-driving-capability.repository';
import { VehicleDrivingCapabilityResolverService } from './driving-capability/vehicle-driving-capability-resolver.service';
import { DrivingDetectorCapabilityResolverService } from './driving-detector-capability/driving-detector-capability.service';
import { VehicleDrivingCapabilityLifecycleService } from './driving-capability/vehicle-driving-capability-lifecycle.service';
import { ShadowDetectorOrchestratorService } from './shadow-detector/shadow-detector.orchestrator.service';
import { ShadowDetectorEnrichmentService } from './shadow-detector/shadow-detector-enrichment.service';
import { DrivingIntelligenceV2Config } from './driving-intelligence-v2/driving-intelligence-v2.config';
import { DimoTripSegmentValidationService } from './dimo-trip-segment-validation/dimo-trip-segment-validation.service';
import { DimoTripSegmentValidateJobHandler } from './dimo-trip-segment-validation/dimo-trip-segment-validation.handler';
import { TripAssessabilityRepository } from './trip-assessability/trip-assessability.repository';
import { TripAssessabilityService } from './trip-assessability/trip-assessability.service';
import { DrivingEvidenceRepository } from './driving-evidence/driving-evidence.repository';
import { DrivingEvidenceService } from './driving-evidence/driving-evidence.service';
import { DrivingAnalysisRunRepository } from './driving-analysis-run/driving-analysis-run.repository';
import { DrivingAnalysisRunService } from './driving-analysis-run/driving-analysis-run.service';
import { DrivingAnalysisStageRepository } from './driving-analysis-stage/driving-analysis-stage.repository';
import { DrivingAnalysisStageOrchestratorService } from './driving-analysis-stage/driving-analysis-stage.orchestrator.service';
import { DrivingIntelligenceJobRepository } from './driving-intelligence-jobs/driving-intelligence-jobs.repository';
import { DrivingIntelligenceJobDispatcherService } from './driving-intelligence-jobs/driving-intelligence-jobs.dispatcher.service';
import { DrivingIntelligenceJobHandlerRegistry } from './driving-intelligence-jobs/driving-intelligence-jobs.handler.registry';
import { DrivingIntelligenceJobProcessorService } from './driving-intelligence-jobs/driving-intelligence-jobs.processor.service';
import { DrivingEventContextJobService } from './event-context/driving-event-context-job.service';
import { DrivingEventContextEnrichJobHandler } from './event-context/driving-event-context-enrich.handler';
import { DrivingAnalysisInitService } from './driving-analysis-init/driving-analysis-init.service';
import { TripPostFinalizeAnalysisProducer } from './driving-analysis-init/trip-post-finalize-analysis.producer';
import { DrivingAnalysisReconciliationService } from './driving-analysis-reconciliation/driving-analysis-reconciliation.service';
import { DriverAttributionRepository } from './driver-attribution/driver-attribution.repository';
import { DriverAttributionService } from './driver-attribution/driver-attribution.service';
import { DrivingAttributionResolveJobHandler } from './driver-attribution/driving-attribution-resolve.handler';
import { TripAssessabilityInputLoader } from './trip-assessability/trip-assessability-input.loader';
import { TripDecisionSummaryService } from './trips/trip-decision-summary.service';
import { DrivingNativeEventsIngestJobHandler } from './driving-intelligence-jobs/handlers/driving-native-events-ingest.handler';
import { DrivingRouteEnrichJobHandler } from './driving-intelligence-jobs/handlers/driving-route-enrich.handler';
import { DrivingImpactComputeJobHandler } from './driving-intelligence-jobs/handlers/driving-impact-compute.handler';
import { DrivingAssessabilityComputeJobHandler } from './driving-intelligence-jobs/handlers/driving-assessability-compute.handler';
import { DrivingDecisionSummaryComputeJobHandler } from './driving-intelligence-jobs/handlers/driving-decision-summary-compute.handler';
import { DrivingHealthImpactPublishJobHandler } from './driving-intelligence-jobs/handlers/driving-health-impact-publish.handler';
import { DrivingDecisionsService } from './driving-decisions/driving-decisions.service';
import { DrivingDecisionsController } from './driving-decisions/driving-decisions.controller';
import { ReferenceCaptureController } from './reference-capture/reference-capture.controller';
import { ReferenceCaptureConfig } from './reference-capture/reference-capture.config';
import { ReferenceCaptureSessionService } from './reference-capture/reference-capture-session.service';
import { ReferenceCaptureSessionRepository } from './reference-capture/reference-capture-session.repository';
import { ReferenceCaptureObservationRepository } from './reference-capture/reference-capture-observation.repository';
import { ReferenceCapturePreflightService } from './reference-capture/reference-capture-preflight.service';
import { ReferenceCaptureAcquisitionService } from './reference-capture/reference-capture-acquisition.service';
import { ReferenceCaptureObservationWriterService } from './reference-capture/reference-capture-observation-writer.service';
import { ReferenceCaptureMassBindingService } from './reference-capture/reference-capture-mass-binding.service';
import { ReferenceCaptureRetentionService } from './reference-capture/reference-capture-retention.service';
import { ReferenceCaptureReadinessService } from './reference-capture/reference-capture-readiness.service';
import { ReferenceCaptureRunnerService } from './reference-capture/reference-capture-runner.service';
import { ReferenceCaptureRuntimeHealthService } from './reference-capture/reference-capture-runtime-health.service';
import { ReferenceCaptureFastGoService } from './reference-capture/reference-capture-fast-go.service';
import { ReferenceCaptureSettlementShadowRepository } from './reference-capture/reference-capture-settlement-shadow.repository';
import { ReferenceCaptureSettlementShadowRunnerService } from './reference-capture/reference-capture-settlement-shadow-runner.service';
import { ReferenceCaptureSettlementShadowService } from './reference-capture/reference-capture-settlement-shadow.service';
import { ReferenceCaptureExp021FleetRepository } from './reference-capture/exp021-fleet/reference-capture-exp021-fleet.repository';
import { ReferenceCaptureExp021FleetCoordinatorService } from './reference-capture/exp021-fleet/reference-capture-exp021-fleet-coordinator.service';
import { ReferenceCaptureExp021CanaryLiveWindowActivationService } from './reference-capture/exp021-canary-live-window/reference-capture-exp021-canary-live-window-activation.service';
import { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow.repository';
import { ReferenceCaptureExp021MaturationShadowRunnerService } from './reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-runner.service';
import { ReferenceCaptureExp021MaturationShadowEnrollmentService } from './reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-enrollment.service';
import { ReferenceCaptureExp021MaturationShadowWorkerService } from './reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-worker.service';
import { ReferenceCaptureExp021MaturationShadowProviderQueryAdapter } from './reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-provider-query.adapter';
import { TripDrivingImpactBackfillService } from './driving-impact/trip-driving-impact-backfill.service';
import { BrakingEventLedgerService } from './brakes/braking-event-ledger.service';
import { EnergyEventsService } from './energy-events/energy-events.service';
import { ErdRechargeShadowParityMetricsService } from './energy-events/erd-recharge-shadow-parity/erd-recharge-shadow-parity.metrics';
import { ErdRechargeProductReadDedupeMetricsService } from './energy-events/erd-recharge-product-read-dedupe/erd-recharge-product-read-dedupe.metrics';
import { ErdRechargeLegacyFragmentProductReadMetricsService } from './energy-events/erd-recharge-legacy-fragment-product-read/erd-recharge-legacy-fragment-product-read.metrics';
import { ErdRechargeWriteAuthorityMetricsService } from './energy-events/erd-recharge-write-authority/erd-recharge-write-authority.metrics';
import { ErdRechargeWriteCutoverReadinessService } from './energy-events/erd-recharge-write-authority/erd-recharge-write-cutover-readiness.service';
import { ErdRechargeCanonicalProjectionRuntimeService } from './energy-events/erd-recharge-write-authority/erd-recharge-canonical-projection-runtime.service';
import { ErdRechargeShadowParityRepository } from './energy-events/erd-recharge-shadow-parity/erd-recharge-shadow-parity.repository';
import { ErdRechargeShadowParityRuntimeService } from './energy-events/erd-recharge-shadow-parity/erd-recharge-shadow-parity.runtime';
import { ErdRechargeShadowParityService } from './energy-events/erd-recharge-shadow-parity/erd-recharge-shadow-parity.service';
import { RawRefuelCandidateService } from './energy-events/raw-refuel-candidate/raw-refuel-candidate.service';
import { RawRefuelCandidateRecoveryService } from './energy-events/raw-refuel-candidate/raw-refuel-candidate-recovery.service';
import { RawFuelRefuelFallbackRuntimeService } from './energy-events/raw-fuel-refuel-fallback/raw-fuel-refuel-fallback-runtime.service';
import { RawRefuelPromotionPreparationService } from './energy-events/raw-fuel-refuel-fallback/raw-refuel-promotion-preparation.service';
import { RawRefuelConvergenceService } from './energy-events/raw-fuel-refuel-fallback/raw-refuel-convergence.service';
import { RawRefuelPromotionService } from './energy-events/raw-fuel-refuel-fallback/raw-refuel-promotion.service';
import { RawRefuelG2HandoffService } from './energy-events/raw-fuel-refuel-fallback/raw-refuel-g2-handoff.service';
import { PhysicalRefuelCoordinateRuntimeService } from './energy-events/physical-refuel-coordinate-runtime.service';
import { PhysicalRefuelReconciliationRuntimeService } from './energy-events/physical-refuel-reconciliation-runtime.service';
import { DimoModule } from '../dimo/dimo.module';
import { AiModule } from '../ai/ai.module';
import { MisuseCasesModule } from './misuse-cases/misuse-cases.module';
import { InvoicesModule } from '@modules/invoices/invoices.module';
import { HighMobilityModule } from '../high-mobility/high-mobility.module';
import { QUEUE_NAMES } from '../../workers/queues/queue-names';
// ── New refactored providers ──
import { TripDecisionEngine } from './trips/decision/trip-decision.engine';
import { TripDetectionPolicyResolver } from './trips/policy/trip-detection-policy.resolver';
import { TripReconciliationService } from './trips/reconciliation/trip-reconciliation.service';
import { TripDiBoundaryAdmissionService } from './trips/di-boundary-admission/trip-di-boundary-admission.service';
import { DetectorRegistry } from './trips/detectors/detector.registry';
import { SnapshotEvidenceEvaluator } from './trips/detectors/snapshot-evidence.evaluator';
import { StartConfirmationDetector } from './trips/detectors/start-confirmation.detector';
import { ContinuityAssessmentDetector } from './trips/detectors/continuity-assessment.detector';
import { EndContinuityDetector } from './trips/detectors/end-continuity.detector';
import { ChangePointEndDetector } from './trips/detectors/change-point-end.detector';
import { TripQualityDetector } from './trips/detectors/trip-quality.detector';
import { TripOverlapDetector } from './trips/detectors/trip-overlap.detector';
import { IgnitionSegmentDetector } from './trips/detectors/ignition-segment.detector';
import { MotionSegmentDetector } from './trips/detectors/motion-segment.detector';
import { ActivityWindowDetector } from './trips/detectors/activity-window.detector';
import { DrivingAssessmentDeviceQualityService } from './trips/driving-assessment-device-quality.service';
import { TechnicalObservationsModule } from '../technical-observations/technical-observations.module';
import { BusinessInsightsModule } from '../business-insights/business-insights.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { RentalDrivingAnalysisModule } from '../rental-driving-analysis/rental-driving-analysis.module';
import { BatteryV2JobsProducerModule } from './battery-health/jobs/battery-v2-jobs-producer.module';
import { DriveProfileResolverService } from './drive-profile/drive-profile-resolver.service';
import { FuelStationCandidateRepository } from './fuel-stations/fuel-station-candidate.repository';
import { FuelStationLocationResolverService } from './fuel-stations/fuel-station-location-resolver.service';
import { ChargingStationCandidateRepository } from './charging-stations/charging-station-candidate.repository';
import { ChargingStationLocationResolverService } from './charging-stations/charging-station-location-resolver.service';
import { FuelStationEnrichmentProducerService } from './fuel-stations/enrichment/fuel-station-enrichment-producer.service';
import { FuelStationEnrichmentOrchestratorService } from './fuel-stations/enrichment/fuel-station-enrichment-orchestrator.service';
import { ChargingStationEnrichmentProducerService } from './charging-stations/enrichment/charging-station-enrichment-producer.service';
import { ChargingStationEnrichmentOrchestratorService } from './charging-stations/enrichment/charging-station-enrichment-orchestrator.service';
import { ChargingStationEnrichmentMetricsService } from './charging-stations/enrichment/charging-station-enrichment.metrics';
import { LvBatteryChemistryResolverService } from './lv-battery-chemistry/lv-battery-chemistry-resolver.service';
import { BatteryPolicyProfileService } from './battery-policy-profile/battery-policy-profile.service';
import { BatteryCapabilityPreflightRepository } from './battery-health/capability-preflight/battery-capability-preflight.repository';
import { BatteryCapabilityPreflightService } from './battery-health/capability-preflight/battery-capability-preflight.service';
import { BatteryCapabilityRefreshService } from './battery-health/capability-preflight/battery-capability-refresh.service';
import { BatteryCapabilityMeasurementGateService } from './battery-health/capability-preflight/battery-capability-measurement-gate.service';
import { LvRestWindowIngestionBridgeService } from './battery-health/lv-rest-window/lv-rest-window-ingestion-bridge.service';
import { BatteryRestTargetEvaluationService } from './battery-health/lv-rest-window/battery-rest-target-evaluation.service';
import { LvRestShadowSummaryService } from './battery-health/lv-rest-window/lv-rest-shadow-summary.service';
import { LvStartProxyDiagnosticService } from './battery-health/lv-start-proxy/lv-start-proxy-diagnostic.service';
import { BatteryStartProxyExtractService } from './battery-health/lv-start-proxy/battery-start-proxy-extract.service';
import { BatteryV2RetentionAggregateService } from './battery-health/retention/battery-v2-retention-aggregate.service';
import { BatteryV2RetentionService } from './battery-health/retention/battery-v2-retention.service';
import { BatteryDataDiagnosticService } from './battery-health/diagnostic/battery-data-diagnostic.service';
import { BatteryDataRepairService } from './battery-health/diagnostic/battery-data-repair.service';
import { BatterySnapshotRestBackfillService } from './battery-health/backfill/battery-snapshot-rest-backfill.service';
import {
  BatteryShadowValidationController,
  BatteryShadowValidationService,
} from './battery-health/shadow-validation';
import { VehicleIntelligencePermissionGuard } from './vehicle-intelligence-permission.guard';
import { EventTripAssociationModule } from './trips/event-association/event-trip-association.module';
import { VehicleFindingsModule } from './findings/findings.module';
import { FindingLifecycleService } from './findings/finding-lifecycle.service';
import { FindingBridgeService } from './findings/finding-bridge.service';
import { DiV0S4RuntimeModule } from './driving-intelligence/s4-runtime/di-v0-s4-runtime.module';
import { VsiReadonlySignalComposerModule } from './vehicle-signal-intelligence/vsi-readonly-composer.module';
import { VsiSignalProfileInspectionController } from './vehicle-signal-intelligence/vsi-signal-profile-inspection.controller';
import { VsiCapabilityResolverController } from './vehicle-signal-intelligence/vsi-capability-resolver.controller';
import { VsiMasterIntelligenceReadController } from './vehicle-signal-intelligence/vsi-master-intelligence-read.controller';
import { VsiMasterIntelligenceReadService } from './vehicle-signal-intelligence/vsi-master-intelligence-read.service';
import { ApdsMasterIntelligenceReadController } from './vehicle-signal-intelligence/apds-master-intelligence-read.controller';
import { ApdsMasterIntelligenceReadService } from './vehicle-signal-intelligence/apds-master-intelligence-read.service';
import { VsiCapabilityResolverService } from './vehicle-signal-intelligence/vsi-capability-resolver.service';
import { VsiCapabilityResolverRepository } from './vehicle-signal-intelligence/vsi-capability-resolver.repository';
import { VsiApdsP5ReadonlyService } from './vehicle-signal-intelligence/vsi-apds-p5.service';
import { DiV0TripSpeedQualityModule } from './driving-intelligence/trip-speed-quality/di-v0-trip-speed-quality.module';
import { DiV0S4ResearchModule } from './driving-intelligence/s4-research-worker/di-v0-s4-research.module';
import { DiV0MotionCoreShadowModule } from './driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow.module';
import { DiV0Ds4AssessmentModule } from './driving-intelligence/ds4-assessment/ds4-assessment.module';
import { DiV0Ds4RpmHfV1aModule } from './driving-intelligence/rpm-hf-v1a/di-v0-ds4-rpm-hf-v1a.module';
import { DiV0Ds4RpmHfV1bModule } from './driving-intelligence/rpm-hf-v1b/di-v0-ds4-rpm-hf-v1b.module';
import { TireDs4ShadowModule } from './tires/ds4-shadow/tire-ds4-shadow.module';
import { TireWearV3PriorModule } from './tires/wear-v3-prior/tire-wear-v3-prior.module';
import { TireWearV3CalibrationShadowModule } from './tires/wear-v3-calibration-shadow/tire-wear-v3-calibration-shadow.module';
import { TireHealthV3ReadModule } from './tires/tire-health-v3-read.module';
import { DiV0M7aRoadAssignmentShadowModule } from './driving-intelligence/m7a-road-assignment-shadow-worker/di-v0-m7a-road-assignment-shadow.module';

@Module({
  imports: [
    forwardRef(() => DimoModule),
    VsiReadonlySignalComposerModule,
    DiV0S4RuntimeModule,
    DiV0TripSpeedQualityModule,
    DiV0S4ResearchModule,
    DiV0MotionCoreShadowModule,
    DiV0Ds4AssessmentModule,
    DiV0Ds4RpmHfV1aModule,
    DiV0Ds4RpmHfV1bModule,
    TireDs4ShadowModule,
    TireWearV3PriorModule,
    TireWearV3CalibrationShadowModule,
    TireHealthV3ReadModule,
    DiV0M7aRoadAssignmentShadowModule,
    forwardRef(() => AiModule),
    forwardRef(() => MisuseCasesModule),
    forwardRef(() => InvoicesModule),
    forwardRef(() => HighMobilityModule),
    forwardRef(() => RentalHealthModule),
    forwardRef(() => TechnicalObservationsModule),
    forwardRef(() => BusinessInsightsModule),
    forwardRef(() => RentalDrivingAnalysisModule),
    forwardRef(() => NotificationsModule),
    DataAuthorizationsModule,
    Dtc02ObservabilityModule,
    VehicleFindingsModule,
    TasksModule,
    BatteryV2JobsProducerModule,
    HvChargingCounterEvidenceModule,
    EventTripAssociationModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.TRIP_TRACKING },
      { name: QUEUE_NAMES.TRIP_BEHAVIOR_ENRICHMENT },
      { name: QUEUE_NAMES.DRIVING_IMPACT_COMPUTE },
      { name: QUEUE_NAMES.DRIVING_INTELLIGENCE },
      { name: QUEUE_NAMES.DTC_KNOWLEDGE_ENRICHMENT },
      { name: QUEUE_NAMES.BATTERY_V2 },
      { name: QUEUE_NAMES.BRAKE_RECALCULATION },
      { name: QUEUE_NAMES.ENERGY_REFUEL_STATION_ENRICH },
      { name: QUEUE_NAMES.ENERGY_RECHARGE_STATION_ENRICH },
      { name: QUEUE_NAMES.REFERENCE_CAPTURE },
      { name: QUEUE_NAMES.REFERENCE_CAPTURE_SETTLEMENT_SHADOW },
      { name: QUEUE_NAMES.REFERENCE_CAPTURE_EXP021_MATURATION_SHADOW },
    ),
  ],
  controllers: [VehicleIntelligenceController, DamagesOrgController, DrivingDecisionsController, VehicleBatteryReferenceCapacityController, VehicleMotionPhysicsReferenceController, HvCapacityShadowEvaluationController, HvMeasurementQualityController, BatteryShadowValidationController, ReferenceCaptureController, VsiSignalProfileInspectionController, VsiCapabilityResolverController, VsiMasterIntelligenceReadController, ApdsMasterIntelligenceReadController],
  providers: [
    VsiCapabilityResolverRepository,
    VsiApdsP5ReadonlyService,
    VsiCapabilityResolverService,
    VsiMasterIntelligenceReadService,
    ApdsMasterIntelligenceReadService,
    VehicleIntelligencePermissionGuard,
    BatteryService,
    TiresService,
    TireWearModelService,
    TireHealthService,
    TireHealthAlertService,
    TirePredictionValidationService,
    TireHealthReplayService,
    TireLifecycleService,
    TireIdentityService,
    BrakesService,
    BrakeReferenceSpecService,
    BrakeHealthService,
    BrakeEvidenceService,
    BrakeLifecycleService,
    BrakeServiceApplicationService,
    BrakeServiceOutboxService,
    ValidateBrakeServiceScopePipe,
    BrakeInitializationWorkflowService,
    BrakeEnrichmentJobDiagnosticsService,
    BrakeRegistrationService,
    BrakeRegistrationBackfillService,
    BrakeBaselineCandidateAuditService,
    BrakeBaselineBackfillService,
    DimoBrakingEventIntakeService,
    BrakingEventLedgerService,
    BrakeComponentInstallationService,
    BrakeComponentLifecycleService,
    BrakeRecalculationOrchestratorService,
    BrakeRecalculationInputLoader,
    BrakeHealthObservabilityService,
    BrakePredictionValidationService,
    BrakeHealthReplayService,
    BrakeDtcEvidenceProducerService,
    BrakeHealthAlertService,
    BrakeMetricsService,
    TireOdometerAnchorBackfillService,
    TireTripUsageBackfillService,
    TireTripUsageLedgerReconciliationService,
    TireTripUsageService,
    TireMetricsService,
    TireHealthObservabilityService,
    ServiceEventsService,
    EnrichmentJobsService,
    DtcService,
    DtcSnapshotApplyService,
    FindingLifecycleService,
    FindingBridgeService,
    DtcKnowledgeService,
    DtcKnowledgeEnrichmentService,
    DtcAiResearchService,
    { provide: DTC_RESEARCH_PORT, useExisting: DtcAiResearchService },
    DrivingEventsService,
    TripsService,
    TripDetectionOrchestrationService,
    TripLifecycleRecoveryService,
    TripBehaviorEnrichmentService,
    TripEnrichmentOrchestratorService,
    VehicleTripRouteArtifactRepository,
    TripRouteArtifactMaterializerService,
    TripRouteCanonicalReadService,
    MapboxChunkMatchingClientService,
    TripRouteChunkedMatcherService,
    TripAnalysisCoordinatorService,
    BoundaryRefreshLifecycleService,
    EventContextEnrichmentService,
    LteR1BehaviorEnrichmentService,
    DimoNativeDrivingEventPersistenceService,
    DrivingAssessmentDeviceQualityService,
    HfMirrorService,
    WaypointMirrorService,
    ActivityWindowProducerService,
    TripChEvidenceMirrorCoordinator,
    MapboxService,
    MapboxRouteMatcherService,
    FmmRouteMatcherService,
    {
      provide: ROUTE_MAP_MATCHER,
      useExisting: MapboxRouteMatcherService,
    },
    TripAssignmentService,
    TripAttributionService,
    DriverScoreService,
    TripAnalyticsCanonicalService,
    DamagesService,
    BatteryHealthService,
    HvBatteryHealthService,
    BatteryV2Service,
    BatteryEvidenceService,
    BatteryGroundTruthRepository,
    BatteryGroundTruthSourceResolver,
    BatteryGroundTruthService,
    BatteryGroundTruthInspectionService,
    BatteryGroundTruthEmissionService,
    BatteryGroundTruthBackedSourceGuard,
    CanonicalBatteryHealthService,
    BatteryMeasurementSessionRepository,
    BatteryMeasurementSessionService,
    BatteryMeasurementRepository,
    BatteryMeasurementService,
    BatteryAssessmentRepository,
    BatteryAssessmentService,
    BatteryPublicationRepository,
    BatteryPublicationService,
    LvCanonicalBatteryResolverService,
    HvMethodProfileService,
    HvChargeSessionRepository,
    HvChargeSessionNativeFallbackConvergenceService,
    HvChargeSessionBoundaryEnrichmentService,
    HvChargeSessionPersistService,
    HvChargeSessionIngestService,
    HvFallbackChargeSessionDetectorService,
    HvRechargeSessionReconcileProducerService,
    HvRechargeSessionReconcileService,
    HvCapacityObservationRepository,
    HvCapacityM2SampleProviderService,
    HvCapacityShadowService,
    HvCapacityShadowProducerService,
    HvCapacitySessionSummaryService,
    HvCapacityM3ValidationService,
    HvCapacityCrossSessionAssessmentService,
    HvSohGateAssessmentService,
    HvCapacityShadowEvaluationService,
    HvMeasurementQualityService,
    VehicleBatteryReferenceCapacityRepository,
    VehicleBatteryReferenceCapacityService,
    VehicleMotionPhysicsReferenceRepository,
    VehicleMotionPhysicsReferenceService,
    DriveProfileResolverService,
    FuelStationCandidateRepository,
    FuelStationLocationResolverService,
    ChargingStationCandidateRepository,
    ChargingStationLocationResolverService,
    FuelStationEnrichmentProducerService,
    FuelStationEnrichmentOrchestratorService,
    ChargingStationEnrichmentProducerService,
    ChargingStationEnrichmentOrchestratorService,
    ChargingStationEnrichmentMetricsService,
    PhysicalRefuelCoordinateRuntimeService,
    PhysicalRefuelReconciliationRuntimeService,
    LvBatteryChemistryResolverService,
    BatteryPolicyProfileService,
    BatteryCapabilityPreflightRepository,
    BatteryCapabilityPreflightService,
    BatteryCapabilityRefreshService,
    BatteryCapabilityMeasurementGateService,
    LvRestWindowIngestionBridgeService,
    BatteryRestTargetEvaluationService,
    LvRestShadowSummaryService,
    LvStartProxyDiagnosticService,
    BatteryStartProxyExtractService,
    BatteryV2RetentionAggregateService,
    BatteryV2RetentionService,
    BatteryDataDiagnosticService,
    BatteryDataRepairService,
    BatterySnapshotRestBackfillService,
    BatteryShadowValidationService,
    HealthSummaryService,
    AiHealthCareAggregationService,
    VehicleHealthTabSummaryService,
    DashboardWarningLightsService,
    ServiceComplianceService,
    ComplianceTaskMaterializeService,
    ServiceOverdueTaskService,
    BatteryTaskService,
    VehicleFileSummaryService,
    DrivingImpactService,
    DimoAvailableSignalsPreflightService,
    VehicleDrivingCapabilityRepository,
    VehicleDrivingCapabilityResolverService,
    DrivingDetectorCapabilityResolverService,
    VehicleDrivingCapabilityLifecycleService,
    ShadowDetectorOrchestratorService,
    ShadowDetectorEnrichmentService,
    DrivingIntelligenceV2Config,
    DimoTripSegmentValidationService,
    DimoTripSegmentValidateJobHandler,
    ReferenceCaptureConfig,
    ReferenceCaptureSessionRepository,
    ReferenceCaptureObservationRepository,
    ReferenceCaptureSessionService,
    ReferenceCapturePreflightService,
    ReferenceCaptureAcquisitionService,
    ReferenceCaptureObservationWriterService,
    ReferenceCaptureMassBindingService,
    ReferenceCaptureRetentionService,
    ReferenceCaptureReadinessService,
    ReferenceCaptureRunnerService,
    ReferenceCaptureRuntimeHealthService,
    ReferenceCaptureFastGoService,
    ReferenceCaptureSettlementShadowRepository,
    ReferenceCaptureSettlementShadowRunnerService,
    ReferenceCaptureSettlementShadowService,
    ReferenceCaptureExp021FleetRepository,
    ReferenceCaptureExp021FleetCoordinatorService,
    ReferenceCaptureExp021CanaryLiveWindowActivationService,
    ReferenceCaptureExp021MaturationShadowRepository,
    ReferenceCaptureExp021MaturationShadowProviderQueryAdapter,
    ReferenceCaptureExp021MaturationShadowRunnerService,
    ReferenceCaptureExp021MaturationShadowEnrollmentService,
    ReferenceCaptureExp021MaturationShadowWorkerService,
    TripAssessabilityRepository,
    TripAssessabilityService,
    TripAssessabilityInputLoader,
    TripDecisionSummaryService,
    DrivingEvidenceRepository,
    DrivingEvidenceService,
    DrivingAnalysisRunRepository,
    DrivingAnalysisRunService,
    DrivingAnalysisStageRepository,
    DrivingAnalysisStageOrchestratorService,
    DrivingIntelligenceJobRepository,
    DrivingIntelligenceJobDispatcherService,
    DrivingIntelligenceJobHandlerRegistry,
    DrivingIntelligenceJobProcessorService,
    DrivingEventContextJobService,
    DrivingEventContextEnrichJobHandler,
    DrivingAnalysisInitService,
    TripPostFinalizeAnalysisProducer,
    DrivingAnalysisReconciliationService,
    DriverAttributionRepository,
    DriverAttributionService,
    DrivingAttributionResolveJobHandler,
    DrivingNativeEventsIngestJobHandler,
    DrivingRouteEnrichJobHandler,
    DrivingImpactComputeJobHandler,
    DrivingAssessabilityComputeJobHandler,
    DrivingDecisionSummaryComputeJobHandler,
    DrivingHealthImpactPublishJobHandler,
    DrivingDecisionsService,
    TripDrivingImpactBackfillService,
    EnergyEventsService,
    ErdRechargeShadowParityRepository,
    ErdRechargeShadowParityMetricsService,
    ErdRechargeProductReadDedupeMetricsService,
    ErdRechargeLegacyFragmentProductReadMetricsService,
    ErdRechargeWriteAuthorityMetricsService,
    ErdRechargeWriteCutoverReadinessService,
    ErdRechargeCanonicalProjectionRuntimeService,
    ErdRechargeShadowParityService,
    ErdRechargeShadowParityRuntimeService,
    RawRefuelCandidateService,
    RawRefuelCandidateRecoveryService,
    RawFuelRefuelFallbackRuntimeService,
    RawRefuelPromotionPreparationService,
    RawRefuelConvergenceService,
    RawRefuelPromotionService,
    RawRefuelG2HandoffService,
    // ── New refactored providers ──
    TripDecisionEngine,
    TripDetectionPolicyResolver,
    TripReconciliationService,
    TripDiBoundaryAdmissionService,
    // Detector instances (all implement TripDetector interface)
    SnapshotEvidenceEvaluator,
    StartConfirmationDetector,
    ContinuityAssessmentDetector,
    EndContinuityDetector,
    ChangePointEndDetector,
    TripQualityDetector,
    TripOverlapDetector,
    IgnitionSegmentDetector,
    MotionSegmentDetector,
    ActivityWindowDetector,
    // Registry dispatches to detector instances by name (from PolicyResolver output)
    DetectorRegistry,
  ],
  exports: [
    BatteryService,
    TiresService,
    TireWearModelService,
    TireHealthService,
    TireHealthAlertService,
    TirePredictionValidationService,
    TireHealthReplayService,
    TireLifecycleService,
    TireIdentityService,
    BrakesService,
    BrakeReferenceSpecService,
    BrakeHealthService,
    BrakeEvidenceService,
    BrakeLifecycleService,
    BrakeServiceApplicationService,
    BrakeServiceOutboxService,
    ValidateBrakeServiceScopePipe,
    BrakeInitializationWorkflowService,
    BrakeEnrichmentJobDiagnosticsService,
    BrakeRegistrationService,
    BrakeRegistrationBackfillService,
    BrakeBaselineCandidateAuditService,
    BrakeBaselineBackfillService,
    DimoBrakingEventIntakeService,
    BrakingEventLedgerService,
    BrakeComponentInstallationService,
    BrakeComponentLifecycleService,
    BrakeRecalculationOrchestratorService,
    BrakeRecalculationInputLoader,
    BrakeHealthObservabilityService,
    BrakePredictionValidationService,
    BrakeHealthReplayService,
    BrakeDtcEvidenceProducerService,
    BrakeHealthAlertService,
    BrakeMetricsService,
    TireOdometerAnchorBackfillService,
    TireTripUsageBackfillService,
    TireTripUsageLedgerReconciliationService,
    TireTripUsageService,
    TireMetricsService,
    TireHealthObservabilityService,
    ServiceEventsService,
    EnrichmentJobsService,
    DtcService,
    DtcSnapshotApplyService,
    Dtc02ObservabilityModule,
    FindingLifecycleService,
    FindingBridgeService,
    DtcKnowledgeService,
    DtcKnowledgeEnrichmentService,
    DrivingEventsService,
    TripsService,
    TripDetectionOrchestrationService,
    TripLifecycleRecoveryService,
    TripBehaviorEnrichmentService,
    TripEnrichmentOrchestratorService,
    VehicleTripRouteArtifactRepository,
    TripRouteArtifactMaterializerService,
    TripRouteCanonicalReadService,
    MapboxChunkMatchingClientService,
    TripRouteChunkedMatcherService,
    TripAnalysisCoordinatorService,
    BoundaryRefreshLifecycleService,
    LteR1BehaviorEnrichmentService,
    DimoNativeDrivingEventPersistenceService,
    DrivingAssessmentDeviceQualityService,
    EventContextEnrichmentService,
    TripAssignmentService,
    TripAttributionService,
    DriverScoreService,
    TripAnalyticsCanonicalService,
    DamagesService,
    BatteryHealthService,
    HvBatteryHealthService,
    BatteryV2Service,
    BatteryEvidenceService,
    BatteryGroundTruthRepository,
    BatteryGroundTruthSourceResolver,
    BatteryGroundTruthService,
    BatteryGroundTruthInspectionService,
    BatteryGroundTruthEmissionService,
    BatteryGroundTruthBackedSourceGuard,
    CanonicalBatteryHealthService,
    BatteryMeasurementSessionRepository,
    BatteryMeasurementSessionService,
    BatteryMeasurementRepository,
    BatteryMeasurementService,
    BatteryAssessmentRepository,
    BatteryAssessmentService,
    BatteryPublicationRepository,
    BatteryPublicationService,
    LvCanonicalBatteryResolverService,
    HvMethodProfileService,
    HvChargeSessionRepository,
    HvChargeSessionNativeFallbackConvergenceService,
    HvChargeSessionBoundaryEnrichmentService,
    HvChargeSessionPersistService,
    HvChargeSessionIngestService,
    HvFallbackChargeSessionDetectorService,
    HvRechargeSessionReconcileProducerService,
    HvRechargeSessionReconcileService,
    HvCapacityObservationRepository,
    HvCapacityM2SampleProviderService,
    HvCapacityShadowService,
    HvCapacityShadowProducerService,
    HvCapacitySessionSummaryService,
    HvCapacityM3ValidationService,
    HvCapacityCrossSessionAssessmentService,
    HvSohGateAssessmentService,
    HvCapacityShadowEvaluationService,
    HvMeasurementQualityService,
    VehicleBatteryReferenceCapacityRepository,
    VehicleBatteryReferenceCapacityService,
    VehicleMotionPhysicsReferenceRepository,
    VehicleMotionPhysicsReferenceService,
    DriveProfileResolverService,
    FuelStationCandidateRepository,
    FuelStationLocationResolverService,
    ChargingStationCandidateRepository,
    ChargingStationLocationResolverService,
    FuelStationEnrichmentProducerService,
    FuelStationEnrichmentOrchestratorService,
    ChargingStationEnrichmentProducerService,
    ChargingStationEnrichmentOrchestratorService,
    ChargingStationEnrichmentMetricsService,
    PhysicalRefuelCoordinateRuntimeService,
    PhysicalRefuelReconciliationRuntimeService,
    LvBatteryChemistryResolverService,
    BatteryPolicyProfileService,
    BatteryCapabilityPreflightRepository,
    BatteryCapabilityPreflightService,
    BatteryCapabilityRefreshService,
    BatteryCapabilityMeasurementGateService,
    LvRestWindowIngestionBridgeService,
    BatteryRestTargetEvaluationService,
    LvRestShadowSummaryService,
    LvStartProxyDiagnosticService,
    BatteryStartProxyExtractService,
    BatteryV2RetentionService,
    BatteryDataDiagnosticService,
    BatteryDataRepairService,
    BatterySnapshotRestBackfillService,
    BatteryShadowValidationService,
    ServiceComplianceService,
    DashboardWarningLightsService,
    ComplianceTaskMaterializeService,
    ServiceOverdueTaskService,
    BatteryTaskService,
    DrivingImpactService,
    DimoAvailableSignalsPreflightService,
    VehicleDrivingCapabilityRepository,
    VehicleDrivingCapabilityResolverService,
    DrivingDetectorCapabilityResolverService,
    VehicleDrivingCapabilityLifecycleService,
    ShadowDetectorOrchestratorService,
    ShadowDetectorEnrichmentService,
    DrivingIntelligenceV2Config,
    DimoTripSegmentValidationService,
    ReferenceCaptureConfig,
    ReferenceCaptureSessionRepository,
    ReferenceCaptureAcquisitionService,
    ReferenceCaptureObservationWriterService,
    ReferenceCaptureRunnerService,
    ReferenceCaptureRetentionService,
    ReferenceCaptureSettlementShadowService,
    ReferenceCaptureSettlementShadowRunnerService,
    ReferenceCaptureExp021MaturationShadowWorkerService,
    ReferenceCaptureExp021MaturationShadowRunnerService,
    ReferenceCaptureExp021FleetCoordinatorService,
    ReferenceCaptureExp021CanaryLiveWindowActivationService,
    TripAssessabilityRepository,
    TripAssessabilityService,
    DrivingEvidenceRepository,
    DrivingEvidenceService,
    DrivingAnalysisRunRepository,
    DrivingAnalysisRunService,
    DrivingAnalysisStageRepository,
    DrivingAnalysisStageOrchestratorService,
    DrivingIntelligenceJobRepository,
    DrivingIntelligenceJobDispatcherService,
    DrivingIntelligenceJobProcessorService,
    DrivingAnalysisInitService,
    TripPostFinalizeAnalysisProducer,
    DrivingAnalysisReconciliationService,
    DriverAttributionRepository,
    DriverAttributionService,
    TripDrivingImpactBackfillService,
    EnergyEventsService,
    RawRefuelCandidateRecoveryService,
    TripDecisionEngine,
    TripDetectionPolicyResolver,
    TripReconciliationService,
    DetectorRegistry,
    BatteryV2JobsProducerModule,
    EventTripAssociationModule,
  ],
})
export class VehicleIntelligenceModule {}
