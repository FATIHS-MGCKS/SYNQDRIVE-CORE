import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';
import { RuntimeStatusRegistry } from './runtime-status.registry';
import { bindPhysicalStateMetricSink } from '@modules/dimo/device-connection-physical-state/device-connection-physical-state.observability';

/**
 * TripMetricsService
 *
 * Prometheus observability layer for the SynqDrive trip lifecycle.
 * Exposes counters, gauges, and histograms for:
 * - Trip lifecycle (start candidates, confirmations, finalizations, discards)
 * - Detector latency
 * - Enrichment pipeline (pending, failed)
 * - Queue lag
 * - Reconciliation/repair actions
 * - Snapshot health (empty, stale)
 * - Anomaly detection
 *
 * Exposes the standard Prometheus /metrics endpoint via the registry.
 */
@Injectable()
export class TripMetricsService implements OnModuleInit {
  readonly registry: Registry;

  // ═══════════════════════════════════════════════════════════════
  //  COUNTERS
  // ═══════════════════════════════════════════════════════════════

  readonly tripStartCandidates: Counter<string>;
  readonly tripStartsConfirmed: Counter<string>;
  readonly tripFinalized: Counter<string>;
  readonly tripDiscarded: Counter<string>;
  readonly ongoingFsmDivergence: Counter<string>;
  readonly completedFsmDivergence: Counter<string>;
  readonly tripLifecycleInvariantRecovery: Counter<string>;
  readonly tripLifecycleInvariantConflict: Counter<string>;
  readonly enrichmentFailed: Counter<string>;
  readonly repairActions: Counter<string>;
  /** Trip reconciliation durable repair claims — low-cardinality repair_type only. */
  readonly tripReconciliationRepairApply: Counter<string>;
  readonly tripReconciliationRepairIdempotentSkip: Counter<string>;
  readonly tripReconciliationRepairClaimConflict: Counter<string>;
  readonly tripReconciliationRepairRecovery: Counter<string>;
  readonly emptySnapshots: Counter<string>;
  readonly staleSnapshots: Counter<string>;
  readonly duplicateCandidates: Counter<string>;
  readonly missingTripCandidates: Counter<string>;
  readonly missingEndCandidates: Counter<string>;
  readonly tripQualityAnomalies: Counter<string>;
  readonly clickHouseMirrorWrites: Counter<string>;
  readonly clickHouseAnalyticsQueries: Counter<string>;
  readonly hfPointsInsertedTotal: Counter<string>;
  readonly hfEventsDetectedTotal: Counter<string>;
  readonly tripEvidencePaths: Counter<string>;
  readonly tripAssignmentResolutions: Counter<string>;
  readonly eventTripAssociations: Counter<string>;
  readonly tripScoreDrift: Counter<string>;
  readonly tripCounterAnomalies: Counter<string>;
  readonly clickHouseMigrationFailures: Counter<string>;
  readonly dimoSnapshotPollTotal: Counter<string>;
  readonly apdShadowEnabled: Gauge<string>;
  readonly apdShadowDecisionsTotal: Counter<string>;
  readonly apdShadowWouldPollTotal: Counter<string>;
  readonly apdShadowWouldSkipTotal: Counter<string>;
  readonly apdShadowForcedFallbackTotal: Counter<string>;
  readonly apdShadowInformativeRealPollTotal: Counter<string>;
  readonly apdShadowSkippedInformativePollTotal: Counter<string>;
  readonly apdShadowLegacyTripEvidenceExclusionTotal: Counter<string>;
  readonly apdShadowVsiLvAvailabilityTotal: Counter<string>;
  readonly apdShadowVsiLvAvailabilityCadenceParityTotal: Counter<string>;
  readonly apdShadowVsiLvAvailabilityFailureTotal: Counter<string>;
  readonly apdShadowProfileInvalidatedTotal: Counter<string>;
  readonly apdShadowProfileRecoveredTotal: Counter<string>;
  readonly apdShadowFailureTotal: Counter<string>;
  readonly apdShadowCohortExcludedTotal: Counter<string>;
  readonly apdShadowEpochExcludedTotal: Counter<string>;
  readonly apdShadowCohortMemberCount: Gauge<string>;
  readonly snapshotWakeTotal: Counter<string>;
  readonly snapshotWakeProbeTotal: Counter<string>;
  readonly snapshotPollingTierVehicles: Gauge<string>;
  readonly snapshotFastTierRatio: Gauge<string>;
  readonly hvSnapshotDuplicatesDiscarded: Counter<string>;
  readonly metricsEndpointRequests: Counter<string>;

  /** Document extraction pipeline — low-cardinality labels only. */
  readonly documentExtractionJobs: Counter<string>;
  readonly documentExtractionFailures: Counter<string>;
  readonly documentExtractionRetries: Counter<string>;
  readonly documentExtractionPages: Counter<string>;
  readonly documentExtractionClassification: Counter<string>;
  readonly documentExtractionApply: Counter<string>;
  readonly documentExtractionUploadRateLimited: Counter<string>;

  /** Document Intake V2 — low-cardinality labels only (Prompt 82). */
  readonly documentUploadTotal: Counter<string>;
  readonly documentUploadRejectedTotal: Counter<string>;
  readonly documentDuplicateTotal: Counter<string>;
  readonly documentOcrTotal: Counter<string>;
  readonly documentOcrFailedTotal: Counter<string>;
  readonly documentClassificationTotal: Counter<string>;
  readonly documentAwaitingTypeTotal: Counter<string>;
  readonly documentExtractionTotal: Counter<string>;
  readonly documentPlausibilityBlockerTotal: Counter<string>;
  readonly documentEntityCandidateTotal: Counter<string>;
  readonly documentRequiredFieldTotal: Counter<string>;
  readonly documentActionPlanTotal: Counter<string>;
  readonly documentActionTotal: Counter<string>;
  readonly documentActionFailedTotal: Counter<string>;
  readonly documentPartialApplyTotal: Counter<string>;
  readonly documentRecoveryTotal: Counter<string>;
  readonly documentFollowUpTotal: Counter<string>;
  readonly documentArchiveTotal: Counter<string>;

  /** Notification engine — low-cardinality labels only. */
  readonly notificationsCreated: Counter<string>;
  readonly notificationsUpdated: Counter<string>;
  readonly notificationsResolved: Counter<string>;
  readonly notificationsReopened: Counter<string>;
  readonly notificationOccurrences: Counter<string>;
  readonly notificationDeduplicated: Counter<string>;
  readonly notificationLockContention: Counter<string>;
  readonly notificationDeliveryEnqueued: Counter<string>;
  readonly notificationDeliverySent: Counter<string>;
  readonly notificationDeliveryFailed: Counter<string>;
  readonly notificationDeliveryRetry: Counter<string>;
  readonly notificationDuplicateConstraintViolation: Counter<string>;
  readonly notificationCandidatesTotal: Counter<string>;
  readonly notificationCandidatesRejectedTotal: Counter<string>;
  readonly notificationDuplicateConflictsTotal: Counter<string>;
  readonly notificationIngestDuration: Histogram<string>;
  readonly notificationIngestFailuresTotal: Counter<string>;
  readonly notificationDeliveryAttemptsTotal: Counter<string>;
  readonly notificationDeadLettersTotal: Counter<string>;
  readonly notificationWorkflowRunsTotal: Counter<string>;
  readonly notificationWorkflowDuplicatesSuppressedTotal: Counter<string>;
  readonly notificationApiRequestsTotal: Counter<string>;
  readonly notificationApiRequestDuration: Histogram<string>;

  /** Task automation outbox — low-cardinality labels only. */
  readonly taskAutomationOutboxEnqueued: Counter<string>;
  readonly taskAutomationOutboxCompleted: Counter<string>;
  readonly taskAutomationOutboxFailed: Counter<string>;
  readonly taskAutomationOutboxRetry: Counter<string>;
  readonly taskAutomationOutboxRefreshed: Counter<string>;

  /** Driving Intelligence V2 durable jobs (P20). */
  readonly drivingIntelligenceJobCompleted: Counter<string>;
  readonly drivingIntelligenceJobRetry: Counter<string>;
  readonly drivingIntelligenceJobDeadLetter: Counter<string>;
  readonly drivingAnalysisReconciliationActions: Counter<string>;
  readonly drivingCapabilityRefresh: Counter<string>;
  readonly drivingCapabilityTransition: Counter<string>;
  readonly drivingCapabilityDetectorChanged: Counter<string>;
  readonly shadowDetectorRun: Counter<string>;
  readonly shadowDetectorSkipped: Counter<string>;
  readonly shadowDetectorCandidates: Counter<string>;
  readonly shadowDetectorFrameworkSkipped: Counter<string>;
  readonly drivingDecisionSummaryComputed: Counter<string>;
  readonly drivingAnalysisRunsTotal: Counter<string>;
  readonly drivingHealthImpactPublished: Counter<string>;

  /** Trip Route V2 R3 matching — low-cardinality only. */
  readonly tripRouteV2MatchAttempted: Counter<string>;
  readonly tripRouteV2MatchSucceeded: Counter<string>;
  readonly tripRouteV2MatchFallbackFiltered: Counter<string>;
  readonly tripRouteV2MatchRetryableFailure: Counter<string>;
  readonly tripRouteV2MatchQualityRejected: Counter<string>;
  readonly tripRouteV2MatchChunkCount: Histogram<string>;
  readonly tripRouteV2MatchFailedChunkCount: Histogram<string>;
  readonly tripRouteV2MatchCoverage: Histogram<string>;
  readonly tripRouteV2MatchConfidence: Histogram<string>;
  readonly tripRouteV2MatchDurationMs: Histogram<string>;
  readonly tripRouteV2CanonicalReadTotal: Counter<string>;
  readonly tripRouteV2CanonicalSegmentCount: Histogram<string>;

  /** Battery V2 — low-cardinality labels only (Prompt 68). */
  readonly batteryProviderObservationTotal: Counter<string>;
  readonly batteryProviderDuplicateTotal: Counter<string>;
  readonly batteryJobsTotal: Counter<string>;
  readonly batteryJobsFailedTotal: Counter<string>;
  readonly batteryJobsDeadLetterTotal: Counter<string>;
  readonly batteryV2JobsRetry: Counter<string>;
  readonly batteryV2JobProcessingDuration: Histogram<string>;
  readonly batteryRestWindowsTotal: Counter<string>;
  readonly batteryRestMeasurementsTotal: Counter<string>;
  readonly batteryRestMissedTotal: Counter<string>;
  readonly batteryRestContaminatedTotal: Counter<string>;
  readonly batteryStartProxyTotal: Counter<string>;
  readonly batteryStartInsufficientCoverageTotal: Counter<string>;
  readonly hvRechargeSegmentsTotal: Counter<string>;
  readonly hvChargeSessionsTotal: Counter<string>;
  readonly hvCapacityObservationsTotal: Counter<string>;
  readonly hvCapacitySessionsQualifiedTotal: Counter<string>;
  readonly batteryAssessmentsTotal: Counter<string>;
  readonly batteryPublicationsTotal: Counter<string>;
  readonly batteryShutdownEvidenceObservationCreatedTotal: Counter<string>;
  readonly batteryShutdownEvidenceDuplicateSuppressedTotal: Counter<string>;
  readonly batteryShutdownContextCreatedTotal: Counter<string>;
  readonly batteryShutdownContextMissingStateTotal: Counter<string>;
  readonly batteryShutdownPostEngineOffCandidateTotal: Counter<string>;
  readonly batteryShutdownPostEngineOffConfirmedTotal: Counter<string>;
  readonly batteryGeneralizedEvidenceCreatedTotal: Counter<string>;
  readonly batteryGeneralizedEvidenceDuplicateTotal: Counter<string>;
  readonly batteryRestSessionOpenedTotal: Counter<string>;
  readonly batteryRestSessionUpdatedTotal: Counter<string>;
  readonly batteryRestSessionEndedTotal: Counter<string>;
  readonly batteryRestSessionInvalidatedTotal: Counter<string>;
  readonly batteryLateTripAssociationTotal: Counter<string>;
  readonly batteryRestObservationTotal: Counter<string>;
  readonly batteryValidRestObservationTotal: Counter<string>;
  readonly batteryRestWakeQualifiedTotal: Counter<string>;
  readonly batteryCadenceLadderResearchUnqualifiedTotal: Counter<string>;
  readonly batteryGeneralizedEvidenceStateAmbiguousTotal: Counter<string>;
  readonly batteryGeneralizedEvidenceStaleReplayTotal: Counter<string>;
  readonly batteryRestSessionFeatureTriggerTotal: Counter<'reason' | 'outcome'>;
  readonly batteryRestSessionFeatureTriggerDurationSeconds: Histogram<'reason' | 'outcome'>;
  readonly batteryRestSessionFeatureRowCreatedTotal: Counter<'phase' | 'trust'>;
  readonly batteryLongitudinalProfileMaterializationAttemptsTotal: Counter<'outcome'>;
  readonly batteryLongitudinalProfileMaterializationDurationSeconds: Histogram<'outcome'>;
  readonly batteryLongitudinalReconciliationTicksTotal: Counter<'result'>;
  readonly batteryLongitudinalReconciliationCandidates: Histogram<string>;
  readonly batteryLongitudinalReconciliationProcessedTotal: Counter<'outcome'>;
  readonly batteryLongitudinalReconciliationAckTotal: Counter<'outcome'>;
  readonly batteryLongitudinalReconciliationDurationSeconds: Histogram<'result'>;
  readonly batteryLongitudinalReconciliationLastSuccessTimestamp: Gauge<string>;
  readonly batteryLongitudinalMaterializationFlagEnabled: Gauge<string>;
  readonly batteryLongitudinalReconciliationInvariantFailuresTotal: Counter<'type'>;
  readonly batteryHvH4A3ReconciliationFlagEnabled: Gauge<string>;
  readonly batteryHvH4A3ReconciliationSchedulerTicksTotal: Counter<'result'>;
  readonly batteryHvH4A3ReconciliationSchedulerDurationSeconds: Histogram<'result'>;
  readonly batteryHvH4A3ReconciliationInspectedTotal: Counter<string>;
  readonly batteryHvH4A3ReconciliationCreatedTotal: Counter<string>;
  readonly batteryHvH4A3ReconciliationExistingTotal: Counter<string>;
  readonly batteryLongitudinalProfileIntegrityInspectionTotal: Counter<'disposition'>;
  readonly batteryLongitudinalProfileSelfIntegrityFailureTotal: Counter<string>;
  readonly batteryProviderObservabilityGapOpenedTotal: Counter<string>;
  readonly batteryProviderObservabilityGapExtendedTotal: Counter<string>;
  readonly batteryProviderObservabilityGapFailureTotal: Counter<string>;
  readonly batteryV2HvRechargeReconcileErrors: Counter<string>;
  readonly batteryV2HvRechargeProviderDelay: Histogram<string>;
  readonly erdE3ConvergenceTotal: Counter<string>;
  readonly erdE4LivenessTotal: Counter<string>;
  readonly batteryV2PublicationAgeHours: Histogram<string>;
  readonly batteryCapabilitySignalsTotal: Counter<string>;
  readonly hvCapacityMethodConflictTotal: Counter<string>;
  readonly hvCapacityM2SessionCv: Histogram<string>;
  readonly batteryRetentionRunsTotal: Counter<string>;
  readonly batteryRetentionRowsDeletedTotal: Counter<string>;
  readonly batteryRetentionRowsAggregatedTotal: Counter<string>;
  readonly communicationProjectionTotal: Counter<string>;
  readonly communicationProjectionFailuresTotal: Counter<string>;
  readonly communicationProjectionLagSeconds: Histogram<string>;
  readonly communicationSendTotal: Counter<string>;
  readonly communicationSendUnknownTotal: Counter<string>;
  readonly communicationSendDurationSeconds: Histogram<string>;
  readonly communicationReconciliationTotal: Counter<string>;
  readonly communicationHandoffTotal: Counter<string>;
  readonly communicationAiOperationTotal: Counter<string>;
  readonly communicationAiOperationDurationSeconds: Histogram<string>;
  readonly communicationRetentionRunsTotal: Counter<string>;
  readonly communicationRetentionRowsAffectedTotal: Counter<string>;
  readonly communicationRetentionRunFailuresTotal: Counter<string>;
  readonly batteryMeasurementDuplicateSkipTotal: Counter<string>;
  readonly batteryV2JobsEnqueueTotal: Counter<string>;
  readonly batteryV2JobsEnqueueSuppressedTotal: Counter<string>;
  readonly batteryV2ReconciliationEnqueuedTotal: Counter<string>;
  readonly batteryV2PublicationCoverageTotal: Counter<string>;

  /** Fleet connectivity — low-cardinality labels only (Prompt 18). */
  readonly connectivityWebhookReceivedTotal: Counter<string>;
  readonly connectivityWebhookProcessingFailedTotal: Counter<string>;
  readonly connectivityWebhookDeadLetterTotal: Counter<string>;
  readonly connectivityEpisodeOpenedTotal: Counter<string>;
  readonly connectivityEpisodeResolvedTotal: Counter<string>;
  readonly connectivityEpisodeFalseOpenDetectedTotal: Counter<string>;
  readonly connectivityRecoverySnapshotTotal: Counter<string>;
  readonly connectivityRecoveryTelemetryTotal: Counter<string>;
  readonly connectivityBindingChangedTotal: Counter<string>;
  readonly connectivityStateConflictTotal: Counter<string>;
  readonly connectivityRuntimeStateTotal: Counter<string>;
  readonly connectivityTelemetryStateTotal: Counter<string>;
  readonly connectivityProviderReachableObservationStaleTotal: Counter<string>;
  readonly connectivityProviderReachableObservationRecoveredTotal: Counter<string>;
  readonly connectivityProviderLinkStateTotal: Counter<string>;
  readonly connectivityDeviceStateTotal: Counter<string>;
  readonly connectivityAlertTotal: Counter<string>;
  readonly connectivityAlertResolvedTotal: Counter<string>;
  readonly connectivityCoverageRatio: Gauge<string>;
  readonly connectivityReconciliationConflictTotal: Counter<string>;
  readonly connectivityPhysicalStateTransitionAppliedTotal: Counter<string>;
  readonly connectivityPhysicalStateEvidenceStaleTotal: Counter<string>;
  readonly connectivityPhysicalStateEvidenceConflictTotal: Counter<string>;
  readonly connectivityPhysicalStateSelfHealTotal: Counter<string>;
  readonly connectivityPhysicalStateDuplicateTransitionSuppressedTotal: Counter<string>;
  readonly connectivityPhysicalStateShadowEvaluationTotal: Counter<string>;
  readonly connectivityPhysicalStateShadowClassificationTotal: Counter<string>;
  readonly connectivityPhysicalStateShadowCorrectnessBlockerTotal: Counter<string>;
  readonly connectivityPhysicalStateShadowPilotScopeGateTotal: Counter<string>;
  readonly connectivityPhysicalStateShadowObservationPersistenceFailureTotal: Counter<string>;
  readonly connectivityPhysicalStateEvidenceWriterTotal: Counter<string>;
  readonly connectivityPhysicalStateStatefulShadowEvaluationTotal: Counter<string>;
  readonly connectivityPhysicalStateGtR1ExpectedFixTotal: Counter<string>;
  readonly connectivityPhysicalStatePreseedTotal: Counter<string>;

  // ═══════════════════════════════════════════════════════════════
  //  GAUGES
  // ═══════════════════════════════════════════════════════════════

  readonly enrichmentPending: Gauge<string>;
  readonly documentExtractionQueueAge: Gauge<string>;
  readonly documentExtractionActiveJobs: Gauge<string>;
  readonly possibleEndStuck: Gauge<string>;
  readonly clickHouseConfigured: Gauge<string>;
  readonly clickHouseAvailable: Gauge<string>;
  readonly clickHouseSchemaStatus: Gauge<string>;
  readonly hfMirrorEnabled: Gauge<string>;
  readonly workerRuntimeEnabled: Gauge<string>;
  readonly dependencyUp: Gauge<string>;
  readonly clickHouseLastMirrorUnixSeconds: Gauge<string>;
  readonly clickHouseTableRows: Gauge<string>;
  readonly queueFailedJobs: Gauge<string>;
  readonly notificationQueueBacklog: Gauge<string>;
  readonly notificationOutboxPending: Gauge<string>;
  readonly communicationSendUnknownCurrent: Gauge<string>;
  readonly communicationSendUnknownOldestSeconds: Gauge<string>;
  readonly communicationRetentionLastSuccessTimestamp: Gauge<string>;
  readonly communicationReconciliationLastSuccessTimestamp: Gauge<string>;
  readonly taskAutomationOutboxBacklog: Gauge<string>;
  readonly batteryV2DeadLetterBacklog: Gauge<string>;
  readonly batteryV2VehiclesWithoutPublication: Gauge<string>;
  readonly batteryPostgresTableRows: Gauge<string>;

  // ═══════════════════════════════════════════════════════════════
  //  HISTOGRAMS
  // ═══════════════════════════════════════════════════════════════

  /** @deprecated Mislabeled trip duration — use tripDuration. Kept for backward compatibility. */
  readonly tripFinalizeLatency: Histogram<string>;
  /** @deprecated Boundary delta, often ~0 — use tripEndRecognitionLatency. Kept for compatibility. */
  readonly tripEndLatencyFromMovement: Histogram<string>;
  readonly tripStartCandidateLatency: Histogram<string>;
  readonly tripStartRecognitionLatency: Histogram<string>;
  readonly snapshotWakeToFetchSeconds: Histogram<string>;
  readonly tripStartBoundaryAdjustment: Histogram<string>;
  readonly tripStartBoundaryAdmissionShadowComparisons: Counter<string>;
  readonly tripStartBoundaryAdmissionShadowErrors: Counter<string>;
  readonly tripStartBoundaryAdmissionShadowDeltaSeconds: Histogram<string>;
  readonly tripStartBoundaryAdmissionShadowRouteFetchAttempts: Counter<string>;
  readonly tripStartBoundaryAdmissionShadowRouteFetchErrors: Counter<string>;
  readonly tripEndCandidateLatency: Histogram<string>;
  readonly tripEndRecognitionLatency: Histogram<string>;
  readonly tripEndBoundaryAdjustment: Histogram<string>;
  readonly tripDuration: Histogram<string>;
  readonly tripTimingSampleRejected: Counter<string>;
  /** TDL PR0 — end-validation decision observability (flag-off default). */
  readonly tripEndValidationDecisionTotal: Counter<string>;
  readonly tripEndValidationCusumOutcomeTotal: Counter<string>;
  readonly tripEndValidationRetryExhaustionTotal: Counter<string>;
  readonly tripEndValidationClickHouseAssistTotal: Counter<string>;
  readonly tripEndValidationObservabilityWriteFailures: Counter<string>;
  readonly tripEndValidationDecisionLatencySeconds: Histogram<string>;
  readonly tripEndValidationObservabilityRetentionRunsTotal: Counter<string>;
  readonly tripEndValidationObservabilityRetentionRowsDeletedTotal: Counter<string>;
  readonly tripEndValidationObservabilityRetentionLastSuccessTimestamp: Gauge<string>;
  readonly detectorLatency: Histogram<string>;
  readonly queueLag: Histogram<string>;
  readonly clickHouseQueryDuration: Histogram<string>;
  readonly clickHouseAnalysisGuard: Counter<string>;
  readonly documentExtractionDuration: Histogram<string>;
  readonly notificationProcessingDuration: Histogram<string>;
  readonly notificationRunDuration: Histogram<string>;
  readonly notificationOpenAge: Histogram<string>;
  readonly taskAutomationOutboxProcessingDuration: Histogram<string>;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });

    this.tripStartCandidates = new Counter({
      name: 'synqdrive_trip_start_candidates_total',
      help: 'Total snapshot evaluations that triggered a POSSIBLE_START candidate',
      labelNames: ['profile', 'detector'],
      registers: [this.registry],
    });

    this.tripStartsConfirmed = new Counter({
      name: 'synqdrive_trip_starts_confirmed_total',
      help: 'Total trips confirmed as ACTIVE_TRIP',
      labelNames: ['profile', 'mode'],
      registers: [this.registry],
    });

    this.tripFinalized = new Counter({
      name: 'synqdrive_trip_finalized_total',
      help: 'Total trips finalized as COMPLETED',
      labelNames: ['profile', 'quality', 'source'],
      registers: [this.registry],
    });

    this.tripDiscarded = new Counter({
      name: 'synqdrive_trip_discarded_total',
      help: 'Total trips discarded/cancelled',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.ongoingFsmDivergence = new Counter({
      name: 'synqdrive_ongoing_fsm_divergence_total',
      help: 'Detected ONGOING trip vs FSM start divergence episodes',
      registers: [this.registry],
    });

    this.completedFsmDivergence = new Counter({
      name: 'synqdrive_completed_fsm_divergence_total',
      help: 'Detected COMPLETED/CANCELLED trip vs active FSM divergence episodes',
      registers: [this.registry],
    });

    this.tripLifecycleInvariantRecovery = new Counter({
      name: 'synqdrive_trip_lifecycle_invariant_recovery_total',
      help: 'Successful lifecycle invariant recoveries',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.tripLifecycleInvariantConflict = new Counter({
      name: 'synqdrive_trip_lifecycle_invariant_conflict_total',
      help: 'Lifecycle invariant conflicts requiring manual review',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.enrichmentFailed = new Counter({
      name: 'synqdrive_enrichment_failed_total',
      help: 'Total behavior enrichment failures',
      labelNames: ['stage'],
      registers: [this.registry],
    });

    this.repairActions = new Counter({
      name: 'synqdrive_repair_actions_total',
      help: 'Total repair actions taken by the reconciliation layer',
      labelNames: ['type', 'result'],
      registers: [this.registry],
    });

    this.tripReconciliationRepairApply = new Counter({
      name: 'synqdrive_trip_reconciliation_repair_apply_total',
      help: 'Trip reconciliation repairs that committed a new mutation',
      labelNames: ['repair_type'],
      registers: [this.registry],
    });

    this.tripReconciliationRepairIdempotentSkip = new Counter({
      name: 'synqdrive_trip_reconciliation_repair_idempotent_skip_total',
      help: 'Trip reconciliation repairs skipped because the semantic repair already exists',
      labelNames: ['repair_type'],
      registers: [this.registry],
    });

    this.tripReconciliationRepairClaimConflict = new Counter({
      name: 'synqdrive_trip_reconciliation_repair_claim_conflict_total',
      help: 'Trip reconciliation repair claim races resolved without duplicate mutation',
      labelNames: ['repair_type'],
      registers: [this.registry],
    });

    this.tripReconciliationRepairRecovery = new Counter({
      name: 'synqdrive_trip_reconciliation_repair_recovery_total',
      help: 'Trip reconciliation repairs retried after a prior REJECTED or crash-interrupted attempt',
      labelNames: ['repair_type'],
      registers: [this.registry],
    });

    this.emptySnapshots = new Counter({
      name: 'synqdrive_empty_snapshots_total',
      help: 'Total DIMO snapshots with no signalsLatest',
      labelNames: ['vehicle_profile'],
      registers: [this.registry],
    });

    this.staleSnapshots = new Counter({
      name: 'synqdrive_stale_snapshots_total',
      help: 'Total DIMO snapshots where data age exceeds stale threshold',
      labelNames: ['vehicle_profile'],
      registers: [this.registry],
    });

    this.duplicateCandidates = new Counter({
      name: 'synqdrive_duplicate_trip_candidates_total',
      help: 'Total trip candidates rejected due to overlap detection',
      registers: [this.registry],
    });

    this.missingTripCandidates = new Counter({
      name: 'synqdrive_missing_trip_candidates_total',
      help: 'Total missing trip candidates detected by reconciliation',
      labelNames: ['tier'],
      registers: [this.registry],
    });

    this.missingEndCandidates = new Counter({
      name: 'synqdrive_missing_end_candidates_total',
      help: 'Total trips found with missing end time during reconciliation',
      registers: [this.registry],
    });

    this.tripQualityAnomalies = new Counter({
      name: 'synqdrive_trip_quality_anomalies_total',
      help: 'Total trips flagged with quality anomalies',
      labelNames: ['anomaly_type'],
      registers: [this.registry],
    });

    this.clickHouseMirrorWrites = new Counter({
      name: 'synqdrive_clickhouse_mirror_writes_total',
      help: 'Total best-effort ClickHouse mirror write attempts by table/result',
      labelNames: ['table', 'result'],
      registers: [this.registry],
    });

    this.clickHouseAnalyticsQueries = new Counter({
      name: 'synqdrive_clickhouse_analytics_queries_total',
      help: 'Total ClickHouse analytics query executions by query/result',
      labelNames: ['query', 'result'],
      registers: [this.registry],
    });

    this.hfPointsInsertedTotal = new Counter({
      name: 'synqdrive_clickhouse_hf_points_inserted_total',
      help: 'Total high-frequency telemetry points inserted into ClickHouse',
      registers: [this.registry],
    });

    this.hfEventsDetectedTotal = new Counter({
      name: 'synqdrive_clickhouse_hf_events_detected_total',
      help: 'Total high-frequency derived events inserted into ClickHouse',
      registers: [this.registry],
    });

    this.tripEvidencePaths = new Counter({
      name: 'synqdrive_trip_evidence_paths_total',
      help: 'Total trip decisions by evidence path used',
      labelNames: ['phase', 'path'],
      registers: [this.registry],
    });

    this.tripAssignmentResolutions = new Counter({
      name: 'synqdrive_trip_assignment_resolutions_total',
      help: 'Total canonical trip assignment resolutions by status and eligibility',
      labelNames: ['status', 'score_eligible'],
      registers: [this.registry],
    });

    this.eventTripAssociations = new Counter({
      name: 'synqdrive_event_trip_associations_total',
      help: 'Event to trip association decisions by pipeline stage and reason',
      labelNames: ['stage', 'reason'],
      registers: [this.registry],
    });

    this.tripScoreDrift = new Counter({
      name: 'synqdrive_trip_score_drift_total',
      help: 'Total observed drift between legacy VehicleTrip score and canonical style score',
      labelNames: ['bucket'],
      registers: [this.registry],
    });

    this.tripCounterAnomalies = new Counter({
      name: 'synqdrive_trip_counter_anomalies_total',
      help: 'Total canonical trip counter anomalies detected during enrichment',
      labelNames: ['anomaly_type', 'source'],
      registers: [this.registry],
    });

    this.clickHouseMigrationFailures = new Counter({
      name: 'synqdrive_clickhouse_migration_failures_total',
      help: 'Total ClickHouse schema migration failures',
      registers: [this.registry],
    });

    this.dimoSnapshotPollTotal = new Counter({
      name: 'synqdrive_dimo_snapshot_poll_total',
      help: 'Total DIMO snapshot poll worker outcomes',
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.apdShadowEnabled = new Gauge({
      name: 'synqdrive_apd_shadow_enabled',
      help: '1 when WORKER_APD_SHADOW_ENABLED observes reconciliation polls',
      registers: [this.registry],
    });

    this.apdShadowDecisionsTotal = new Counter({
      name: 'synqdrive_apd_shadow_decisions_total',
      help: 'APD shadow pre-poll decisions',
      labelNames: ['policy', 'decision', 'reason'],
      registers: [this.registry],
    });

    this.apdShadowWouldPollTotal = new Counter({
      name: 'synqdrive_apd_shadow_would_poll_total',
      help: 'APD shadow WOULD_POLL decisions',
      labelNames: ['policy'],
      registers: [this.registry],
    });

    this.apdShadowWouldSkipTotal = new Counter({
      name: 'synqdrive_apd_shadow_would_skip_total',
      help: 'APD shadow WOULD_SKIP decisions',
      labelNames: ['policy'],
      registers: [this.registry],
    });

    this.apdShadowForcedFallbackTotal = new Counter({
      name: 'synqdrive_apd_shadow_forced_fallback_total',
      help: 'APD shadow forced/conservative decisions',
      labelNames: ['policy', 'reason'],
      registers: [this.registry],
    });

    this.apdShadowInformativeRealPollTotal = new Counter({
      name: 'synqdrive_apd_shadow_informative_real_poll_total',
      help: 'Real polls that advanced at least one source signal',
      labelNames: ['source'],
      registers: [this.registry],
    });

    this.apdShadowSkippedInformativePollTotal = new Counter({
      name: 'synqdrive_apd_shadow_skipped_informative_poll_total',
      help: 'Shadow WOULD_SKIP but real poll was informative',
      labelNames: ['policy', 'source'],
      registers: [this.registry],
    });

    this.apdShadowLegacyTripEvidenceExclusionTotal = new Counter({
      name: 'synqdrive_apd_shadow_legacy_trip_evidence_exclusion_total',
      help: 'APD shadow reconciliation relieved by frozen legacy trip evidence exclusion',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.apdShadowVsiLvAvailabilityTotal = new Counter({
      name: 'synqdrive_apd_shadow_vsi_lv_availability_total',
      help: 'Parallel VSI→APDS shadow LV availability classification (does not change B2/B4 decisions)',
      labelNames: ['classification'],
      registers: [this.registry],
    });

    this.apdShadowVsiLvAvailabilityCadenceParityTotal = new Counter({
      name: 'synqdrive_apd_shadow_vsi_lv_availability_cadence_parity_total',
      help: 'Shadow decisions where LV signal availability limits cadence interpretation vs baseline INSUFFICIENT_RECENT_EVIDENCE',
      registers: [this.registry],
    });

    this.apdShadowVsiLvAvailabilityFailureTotal = new Counter({
      name: 'synqdrive_apd_shadow_vsi_lv_availability_failure_total',
      help: 'Parallel VSI LV availability loader/projection failures (B2/B4 baseline continues)',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.apdShadowProfileInvalidatedTotal = new Counter({
      name: 'synqdrive_apd_shadow_profile_invalidated_total',
      help: 'APD profile invalidations',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.apdShadowProfileRecoveredTotal = new Counter({
      name: 'synqdrive_apd_shadow_profile_recovered_total',
      help: 'APD profile recoveries after invalidation',
      registers: [this.registry],
    });

    this.apdShadowFailureTotal = new Counter({
      name: 'synqdrive_apd_shadow_failure_total',
      help: 'APD shadow pipeline failures (non-blocking)',
      labelNames: ['stage'],
      registers: [this.registry],
    });

    this.apdShadowCohortExcludedTotal = new Counter({
      name: 'synqdrive_apd_shadow_cohort_excluded_total',
      help: 'APD shadow opportunities excluded by cohort gate (bounded reasons only)',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.apdShadowEpochExcludedTotal = new Counter({
      name: 'synqdrive_apd_shadow_epoch_excluded_total',
      help: 'APD shadow opportunities excluded by durable activation epoch gate',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.apdShadowCohortMemberCount = new Gauge({
      name: 'synqdrive_apd_shadow_cohort_member_count',
      help: 'Configured APD shadow cohort member count when cohort config is READY',
      registers: [this.registry],
    });

    this.snapshotWakeTotal = new Counter({
      name: 'synqdrive_trip_snapshot_wake_total',
      help: 'DIMO provider snapshot wake intake outcomes',
      labelNames: ['source', 'reason', 'outcome'],
      registers: [this.registry],
    });

    this.snapshotWakeProbeTotal = new Counter({
      name: 'synqdrive_trip_snapshot_wake_probe_total',
      help: 'Bounded wake probe scheduling outcomes',
      labelNames: ['reason', 'outcome'],
      registers: [this.registry],
    });

    this.snapshotWakeToFetchSeconds = new Histogram({
      name: 'synqdrive_trip_snapshot_wake_to_fetch_seconds',
      help:
        'Seconds from provider wake EVENT_TIME to canonical snapshot providerFetchedAt WORKER_TIME',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600],
      registers: [this.registry],
    });

    this.snapshotPollingTierVehicles = new Gauge({
      name: 'synqdrive_snapshot_polling_tier_vehicles',
      help: 'Connected snapshot-eligible vehicles by effective polling tier',
      labelNames: ['tier'],
      registers: [this.registry],
    });

    this.snapshotFastTierRatio = new Gauge({
      name: 'synqdrive_snapshot_fast_tier_ratio',
      help:
        'Share of connected snapshot cohort in ACTIVE_DRIVING + RECENTLY_ACTIVE tiers',
      registers: [this.registry],
    });

    this.hvSnapshotDuplicatesDiscarded = new Counter({
      name: 'synqdrive_hv_snapshot_duplicates_discarded_total',
      help: 'HV battery health snapshots skipped by provider observation dedup policy',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.metricsEndpointRequests = new Counter({
      name: 'synqdrive_metrics_endpoint_requests_total',
      help: 'Total /metrics scrape attempts by result',
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.documentExtractionJobs = new Counter({
      name: 'synqdrive_document_extraction_jobs_total',
      help: 'Document extraction pipeline job outcomes by status and stage',
      labelNames: ['status', 'stage'],
      registers: [this.registry],
    });

    this.documentExtractionFailures = new Counter({
      name: 'synqdrive_document_extraction_failures_total',
      help: 'Document extraction failures by stage, error code, and retryability',
      labelNames: ['stage', 'error_code', 'retryable'],
      registers: [this.registry],
    });

    this.documentExtractionRetries = new Counter({
      name: 'synqdrive_document_extraction_retries_total',
      help: 'Document extraction retry attempts by stage',
      labelNames: ['stage'],
      registers: [this.registry],
    });

    this.documentExtractionPages = new Counter({
      name: 'synqdrive_document_extraction_pages_total',
      help: 'Document pages processed by extraction method',
      labelNames: ['method'],
      registers: [this.registry],
    });

    this.documentExtractionClassification = new Counter({
      name: 'synqdrive_document_extraction_classification_total',
      help: 'Document classification outcomes',
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.documentExtractionApply = new Counter({
      name: 'synqdrive_document_extraction_apply_total',
      help: 'Document apply outcomes after human confirmation',
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.documentExtractionUploadRateLimited = new Counter({
      name: 'synqdrive_document_extraction_upload_rate_limited_total',
      help: 'Document upload requests rejected by upload rate limits',
      labelNames: ['scope', 'reason'],
      registers: [this.registry],
    });

    this.documentUploadTotal = new Counter({
      name: 'synqdrive_document_upload_total',
      help: 'Document Intake V2 uploads accepted into the pipeline',
      labelNames: ['scope', 'source_surface'],
      registers: [this.registry],
    });

    this.documentUploadRejectedTotal = new Counter({
      name: 'synqdrive_document_upload_rejected_total',
      help: 'Document Intake V2 uploads rejected before queueing',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.documentDuplicateTotal = new Counter({
      name: 'synqdrive_document_duplicate_total',
      help: 'Document Intake V2 duplicate assessments',
      labelNames: ['outcome'],
      registers: [this.registry],
    });

    this.documentOcrTotal = new Counter({
      name: 'synqdrive_document_ocr_total',
      help: 'Document Intake V2 OCR/text extraction completions',
      labelNames: ['method'],
      registers: [this.registry],
    });

    this.documentOcrFailedTotal = new Counter({
      name: 'synqdrive_document_ocr_failed_total',
      help: 'Document Intake V2 OCR failures',
      labelNames: ['error_code', 'retryable'],
      registers: [this.registry],
    });

    this.documentClassificationTotal = new Counter({
      name: 'synqdrive_document_classification_total',
      help: 'Document Intake V2 classification decisions',
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.documentAwaitingTypeTotal = new Counter({
      name: 'synqdrive_document_awaiting_type_total',
      help: 'Document Intake V2 extractions waiting for user document type',
      labelNames: ['source'],
      registers: [this.registry],
    });

    this.documentExtractionTotal = new Counter({
      name: 'synqdrive_document_extraction_total',
      help: 'Document Intake V2 structured extractions completed',
      labelNames: ['document_category', 'overall_status'],
      registers: [this.registry],
    });

    this.documentPlausibilityBlockerTotal = new Counter({
      name: 'synqdrive_document_plausibility_blocker_total',
      help: 'Document Intake V2 plausibility blocker checks',
      labelNames: ['blocker_code'],
      registers: [this.registry],
    });

    this.documentEntityCandidateTotal = new Counter({
      name: 'synqdrive_document_entity_candidate_total',
      help: 'Document Intake V2 ranked entity candidates by confidence band',
      labelNames: ['entity_type', 'confidence'],
      registers: [this.registry],
    });

    this.documentRequiredFieldTotal = new Counter({
      name: 'synqdrive_document_required_field_total',
      help: 'Document Intake V2 required/optional field presence at extraction',
      labelNames: ['requirement', 'presence', 'document_category'],
      registers: [this.registry],
    });

    this.documentActionPlanTotal = new Counter({
      name: 'synqdrive_document_action_plan_total',
      help: 'Document Intake V2 action plan lifecycle events',
      labelNames: ['document_category', 'outcome'],
      registers: [this.registry],
    });

    this.documentActionTotal = new Counter({
      name: 'synqdrive_document_action_total',
      help: 'Document Intake V2 action executions',
      labelNames: ['semantic_action', 'outcome'],
      registers: [this.registry],
    });

    this.documentActionFailedTotal = new Counter({
      name: 'synqdrive_document_action_failed_total',
      help: 'Document Intake V2 failed action executions',
      labelNames: ['semantic_action', 'error_code'],
      registers: [this.registry],
    });

    this.documentPartialApplyTotal = new Counter({
      name: 'synqdrive_document_partial_apply_total',
      help: 'Document Intake V2 partial apply outcomes',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.documentRecoveryTotal = new Counter({
      name: 'synqdrive_document_recovery_total',
      help: 'Document Intake V2 recovery scheduler actions',
      labelNames: ['kind', 'outcome'],
      registers: [this.registry],
    });

    this.documentFollowUpTotal = new Counter({
      name: 'synqdrive_document_follow_up_total',
      help: 'Document Intake V2 follow-up suggestion lifecycle events',
      labelNames: ['follow_up_type', 'outcome'],
      registers: [this.registry],
    });

    this.documentArchiveTotal = new Counter({
      name: 'synqdrive_document_archive_total',
      help: 'Document Intake V2 archive index and apply events',
      labelNames: ['outcome'],
      registers: [this.registry],
    });

    this.enrichmentPending = new Gauge({
      name: 'synqdrive_enrichment_pending',
      help: 'Current number of trips pending behavior enrichment',
      registers: [this.registry],
    });

    this.possibleEndStuck = new Gauge({
      name: 'synqdrive_possible_end_stuck',
      help: 'Number of vehicles currently stuck in POSSIBLE_END state',
      labelNames: ['vehicle_profile'],
      registers: [this.registry],
    });

    this.clickHouseConfigured = new Gauge({
      name: 'synqdrive_clickhouse_configured',
      help: 'Whether ClickHouse is configured via environment variables',
      registers: [this.registry],
    });

    this.clickHouseAvailable = new Gauge({
      name: 'synqdrive_clickhouse_available',
      help: 'Whether ClickHouse is currently reachable and enabled',
      registers: [this.registry],
    });

    this.clickHouseSchemaStatus = new Gauge({
      name: 'synqdrive_clickhouse_schema_status',
      help: 'ClickHouse schema health code: 0=disabled, 1=degraded, 2=schema_error, 3=available',
      registers: [this.registry],
    });

    this.hfMirrorEnabled = new Gauge({
      name: 'synqdrive_hf_mirror_enabled',
      help: 'Whether post-trip HF mirror is enabled via HF_MIRROR_ENABLED',
      registers: [this.registry],
    });

    this.workerRuntimeEnabled = new Gauge({
      name: 'synqdrive_worker_runtime_enabled',
      help: 'Whether BullMQ workers were enabled at backend bootstrap time',
      registers: [this.registry],
    });

    this.dependencyUp = new Gauge({
      name: 'synqdrive_dependency_up',
      help: 'Readiness probe result for critical dependencies (1=ok, 0=error)',
      labelNames: ['dependency'],
      registers: [this.registry],
    });

    this.clickHouseLastMirrorUnixSeconds = new Gauge({
      name: 'synqdrive_clickhouse_last_mirror_unix_seconds',
      help: 'Unix timestamp of the last successful ClickHouse mirror write per table',
      labelNames: ['table'],
      registers: [this.registry],
    });

    this.clickHouseTableRows = new Gauge({
      name: 'synqdrive_clickhouse_table_rows',
      help: 'Aggregated active row count per ClickHouse table (from system.parts)',
      labelNames: ['table', 'status'],
      registers: [this.registry],
    });

    this.queueFailedJobs = new Gauge({
      name: 'synqdrive_queue_failed_jobs',
      help: 'Current failed BullMQ job count per queue',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.documentExtractionQueueAge = new Gauge({
      name: 'synqdrive_document_extraction_queue_age_seconds',
      help: 'Age in seconds of the oldest waiting document extraction job',
      registers: [this.registry],
    });

    this.documentExtractionActiveJobs = new Gauge({
      name: 'synqdrive_document_extraction_active_jobs',
      help: 'Currently active document extraction worker jobs',
      registers: [this.registry],
    });

    this.tripFinalizeLatency = new Histogram({
      name: 'synqdrive_trip_finalize_latency_seconds',
      help:
        'DEPRECATED: trip duration (startTime→endTime), not worker recognition latency. Use synqdrive_trip_duration_seconds.',
      buckets: [60, 300, 900, 1800, 3600, 7200, 18000],
      labelNames: ['profile'],
      registers: [this.registry],
    });

    this.tripEndLatencyFromMovement = new Histogram({
      name: 'synqdrive_trip_end_latency_from_movement_seconds',
      help:
        'DEPRECATED: canonical end boundary delta vs movement anchor, not worker recognition latency. Use synqdrive_trip_end_recognition_latency_seconds.',
      buckets: [30, 60, 120, 180, 300, 600, 900, 1800],
      labelNames: ['profile', 'end_source'],
      registers: [this.registry],
    });

    this.tripStartCandidateLatency = new Histogram({
      name: 'synqdrive_trip_start_candidate_latency_seconds',
      help:
        'Seconds from start candidate EVENT_TIME to POSSIBLE_START worker recognition (enteredAt−candidateAt).',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 900, 1800, 3600],
      labelNames: ['profile', 'clock_source'],
      registers: [this.registry],
    });

    this.tripStartRecognitionLatency = new Histogram({
      name: 'synqdrive_trip_start_recognition_latency_seconds',
      help:
        'Seconds from canonical start EVENT_TIME to ACTIVE_TRIP worker recognition (recognizedAt−effectiveStartAt).',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 900, 1800, 3600],
      labelNames: ['profile', 'mode', 'outcome'],
      registers: [this.registry],
    });

    this.tripStartBoundaryAdjustment = new Histogram({
      name: 'synqdrive_trip_start_boundary_adjustment_seconds',
      help:
        'Absolute seconds between initial start candidate and confirmed canonical start boundary.',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 900, 1800],
      labelNames: ['profile', 'source', 'direction', 'outcome'],
      registers: [this.registry],
    });

    this.tripStartBoundaryAdmissionShadowComparisons = new Counter({
      name: 'synqdrive_trip_start_boundary_admission_shadow_comparisons_total',
      help:
        'P1B evidence-backed start boundary shadow comparisons at trip start confirmation (non-authoritative).',
      labelNames: [
        'integration_modality',
        'decision',
        'legacy_source',
        'evidence_coverage',
      ],
      registers: [this.registry],
    });

    this.tripStartBoundaryAdmissionShadowErrors = new Counter({
      name: 'synqdrive_trip_start_boundary_admission_shadow_errors_total',
      help: 'P1B start boundary shadow execution failures (non-blocking).',
      labelNames: ['phase'],
      registers: [this.registry],
    });

    this.tripStartBoundaryAdmissionShadowDeltaSeconds = new Histogram({
      name: 'synqdrive_trip_start_boundary_admission_shadow_delta_seconds',
      help:
        'Absolute seconds between legacy canonical start and P1A shadow-proposed start at confirmation.',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 900, 1800],
      labelNames: ['integration_modality', 'decision', 'legacy_source'],
      registers: [this.registry],
    });

    this.tripStartBoundaryAdmissionShadowRouteFetchAttempts = new Counter({
      name: 'synqdrive_trip_start_boundary_admission_shadow_route_fetch_attempts_total',
      help:
        'P1B shadow-only additional route enrichment provider call attempts (before provider I/O).',
      registers: [this.registry],
    });

    this.tripStartBoundaryAdmissionShadowRouteFetchErrors = new Counter({
      name: 'synqdrive_trip_start_boundary_admission_shadow_route_fetch_errors_total',
      help: 'P1B shadow-only additional route enrichment provider call failures.',
      registers: [this.registry],
    });

    this.tripEndCandidateLatency = new Histogram({
      name: 'synqdrive_trip_end_candidate_latency_seconds',
      help:
        'Seconds from end candidate EVENT_TIME to POSSIBLE_END worker recognition (enteredAt−candidateAt).',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 900, 1800, 3600],
      labelNames: ['profile', 'evidence_path', 'clock_source'],
      registers: [this.registry],
    });

    this.tripEndRecognitionLatency = new Histogram({
      name: 'synqdrive_trip_end_recognition_latency_seconds',
      help:
        'Seconds from canonical end EVENT_TIME to COMPLETED worker recognition (recognizedAt−canonicalEndAt).',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 900, 1800, 3600],
      labelNames: ['profile', 'commit_confirmation'],
      registers: [this.registry],
    });

    this.tripEndBoundaryAdjustment = new Histogram({
      name: 'synqdrive_trip_end_boundary_adjustment_seconds',
      help:
        'Absolute seconds between end candidate and canonical end boundary (boundary accuracy, not recognition).',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 900, 1800],
      labelNames: ['profile', 'end_source', 'direction'],
      registers: [this.registry],
    });

    this.tripDuration = new Histogram({
      name: 'synqdrive_trip_duration_seconds',
      help: 'Canonical trip duration from startTime to endTime in seconds.',
      buckets: [60, 300, 900, 1800, 3600, 7200, 18000, 43200],
      labelNames: ['profile'],
      registers: [this.registry],
    });

    this.tripTimingSampleRejected = new Counter({
      name: 'synqdrive_trip_timing_sample_rejected_total',
      help: 'Rejected trip timing histogram samples (invalid anchor, negative delta, invalid timestamp).',
      labelNames: ['metric', 'reason'],
      registers: [this.registry],
    });

    this.tripEndValidationDecisionTotal = new Counter({
      name: 'synqdrive_trip_end_validation_decision_total',
      help:
        'Append-only end-validation / finalize decision observations persisted (TDL PR0; non-authoritative).',
      labelNames: ['outcome', 'end_mode', 'confirmation_source'],
      registers: [this.registry],
    });

    this.tripEndValidationCusumOutcomeTotal = new Counter({
      name: 'synqdrive_trip_end_validation_cusum_outcome_total',
      help: 'CUSUM END_VALIDATION branch outcomes (validated / inconclusive / still_ongoing).',
      labelNames: ['cusum_outcome'],
      registers: [this.registry],
    });

    this.tripEndValidationRetryExhaustionTotal = new Counter({
      name: 'synqdrive_trip_end_validation_retry_exhaustion_total',
      help: 'Max CUSUM attempt budget exhausted before composite fallback finalize.',
      labelNames: ['end_mode'],
      registers: [this.registry],
    });

    this.tripEndValidationClickHouseAssistTotal = new Counter({
      name: 'synqdrive_trip_end_validation_clickhouse_assist_total',
      help: 'ClickHouse end-assist observability outcomes on END_VALIDATION path.',
      labelNames: ['assist_outcome'],
      registers: [this.registry],
    });

    this.tripEndValidationObservabilityWriteFailures = new Counter({
      name: 'synqdrive_trip_end_validation_observability_write_failures_total',
      help: 'Failed persistence attempts for trip end-validation observability (FSM unaffected).',
      labelNames: ['phase'],
      registers: [this.registry],
    });

    this.tripEndValidationDecisionLatencySeconds = new Histogram({
      name: 'synqdrive_trip_end_validation_decision_latency_seconds',
      help:
        'Seconds from canonical/event end boundary to worker decision time for observed end-validation outcomes.',
      buckets: [1, 5, 15, 30, 60, 120, 300, 600, 900, 1800, 3600],
      labelNames: ['outcome', 'phase'],
      registers: [this.registry],
    });

    this.tripEndValidationObservabilityRetentionRunsTotal = new Counter({
      name: 'synqdrive_trip_end_validation_observability_retention_runs_total',
      help: 'TDL end-validation observability retention purge runs.',
      labelNames: ['status', 'dry_run'],
      registers: [this.registry],
    });

    this.tripEndValidationObservabilityRetentionRowsDeletedTotal = new Counter({
      name: 'synqdrive_trip_end_validation_observability_retention_rows_deleted_total',
      help: 'Rows deleted by TDL end-validation observability retention purge.',
      registers: [this.registry],
    });

    this.tripEndValidationObservabilityRetentionLastSuccessTimestamp = new Gauge({
      name: 'synqdrive_trip_end_validation_observability_retention_last_success_timestamp',
      help: 'Unix timestamp of last successful TDL end-validation observability retention purge.',
      registers: [this.registry],
    });

    this.detectorLatency = new Histogram({
      name: 'synqdrive_detector_latency_seconds',
      help: 'Time taken by a detector to execute in seconds',
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 15],
      labelNames: ['detector'],
      registers: [this.registry],
    });

    this.queueLag = new Histogram({
      name: 'synqdrive_queue_lag_seconds',
      help: 'Time from job creation to job processing start in seconds',
      buckets: [1, 5, 15, 60, 300, 900],
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.clickHouseQueryDuration = new Histogram({
      name: 'synqdrive_clickhouse_query_duration_seconds',
      help: 'ClickHouse query execution duration in seconds',
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 15],
      labelNames: ['query_type'],
      registers: [this.registry],
    });

    this.clickHouseAnalysisGuard = new Counter({
      name: 'synqdrive_clickhouse_analysis_guard_total',
      help: 'ClickHouse analysis guard outcomes for trip analysis hardening',
      labelNames: ['outcome', 'scope'],
      registers: [this.registry],
    });

    this.documentExtractionDuration = new Histogram({
      name: 'synqdrive_document_extraction_duration_seconds',
      help: 'Document extraction stage duration in seconds',
      buckets: [0.25, 0.5, 1, 2, 5, 15, 30, 60, 120, 300],
      labelNames: ['stage'],
      registers: [this.registry],
    });

    this.notificationsCreated = new Counter({
      name: 'synqdrive_notifications_created_total',
      help: 'Notifications materialized as new OPEN records',
      labelNames: ['domain'],
      registers: [this.registry],
    });

    this.notificationsUpdated = new Counter({
      name: 'synqdrive_notifications_updated_total',
      help: 'Active notifications updated (occurrence/severity)',
      labelNames: ['domain'],
      registers: [this.registry],
    });

    this.notificationsResolved = new Counter({
      name: 'synqdrive_notifications_resolved_total',
      help: 'Notifications transitioned to RESOLVED',
      labelNames: ['domain'],
      registers: [this.registry],
    });

    this.notificationsReopened = new Counter({
      name: 'synqdrive_notifications_reopened_total',
      help: 'Notifications reopened after RESOLVED',
      labelNames: ['domain'],
      registers: [this.registry],
    });

    this.notificationOccurrences = new Counter({
      name: 'synqdrive_notification_occurrences_total',
      help: 'Notification occurrences appended',
      registers: [this.registry],
    });

    this.notificationDeduplicated = new Counter({
      name: 'synqdrive_notification_deduplicated_total',
      help: 'Ingest operations deduplicated without new delivery',
      registers: [this.registry],
    });

    this.notificationLockContention = new Counter({
      name: 'synqdrive_notification_lock_contention_total',
      help: 'Notification evaluation org lock contention events',
      registers: [this.registry],
    });

    this.notificationDeliveryEnqueued = new Counter({
      name: 'synqdrive_notification_delivery_enqueued_total',
      help: 'Outbox delivery rows enqueued',
      labelNames: ['channel', 'transition'],
      registers: [this.registry],
    });

    this.notificationDeliverySent = new Counter({
      name: 'synqdrive_notification_delivery_sent_total',
      help: 'Successful channel deliveries',
      labelNames: ['channel'],
      registers: [this.registry],
    });

    this.notificationDeliveryFailed = new Counter({
      name: 'synqdrive_notification_delivery_failed_total',
      help: 'Failed channel delivery attempts',
      labelNames: ['channel', 'error_code'],
      registers: [this.registry],
    });

    this.notificationDeliveryRetry = new Counter({
      name: 'synqdrive_notification_delivery_retry_total',
      help: 'Delivery retries scheduled',
      labelNames: ['channel'],
      registers: [this.registry],
    });

    this.notificationDuplicateConstraintViolation = new Counter({
      name: 'synqdrive_notification_duplicate_constraint_violation_total',
      help: 'Outbox idempotency unique constraint prevented duplicate delivery',
      registers: [this.registry],
    });

    this.notificationDuplicateConflictsTotal = new Counter({
      name: 'synqdrive_notification_duplicate_conflicts_total',
      help: 'Notification idempotency or fingerprint duplicate conflicts',
      registers: [this.registry],
    });

    this.notificationCandidatesTotal = new Counter({
      name: 'synqdrive_notification_candidates_total',
      help: 'Notification candidates submitted for ingest',
      labelNames: ['source_type', 'event_type'],
      registers: [this.registry],
    });

    this.notificationCandidatesRejectedTotal = new Counter({
      name: 'synqdrive_notification_candidates_rejected_total',
      help: 'Notification candidates rejected before ingest',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.notificationIngestDuration = new Histogram({
      name: 'synqdrive_notification_ingest_duration_seconds',
      help: 'Single notification ingest/materialize duration',
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
      labelNames: ['event_type'],
      registers: [this.registry],
    });

    this.notificationIngestFailuresTotal = new Counter({
      name: 'synqdrive_notification_ingest_failures_total',
      help: 'Notification ingest failures',
      labelNames: ['error_code'],
      registers: [this.registry],
    });

    this.notificationDeliveryAttemptsTotal = new Counter({
      name: 'synqdrive_notification_delivery_attempts_total',
      help: 'Notification delivery channel dispatch attempts',
      labelNames: ['channel'],
      registers: [this.registry],
    });

    this.notificationDeadLettersTotal = new Counter({
      name: 'synqdrive_notification_dead_letters_total',
      help: 'Notification delivery rows moved to dead letter',
      labelNames: ['channel', 'error_code'],
      registers: [this.registry],
    });

    this.notificationWorkflowRunsTotal = new Counter({
      name: 'synqdrive_notification_workflow_runs_total',
      help: 'Notification lifecycle workflow triggers',
      labelNames: ['lifecycle_event', 'result'],
      registers: [this.registry],
    });

    this.notificationWorkflowDuplicatesSuppressedTotal = new Counter({
      name: 'synqdrive_notification_workflow_duplicates_suppressed_total',
      help: 'Duplicate notification workflow runs suppressed by idempotency',
      labelNames: ['lifecycle_event'],
      registers: [this.registry],
    });

    this.notificationApiRequestsTotal = new Counter({
      name: 'synqdrive_notification_api_requests_total',
      help: 'Notification REST API requests',
      labelNames: ['route', 'method', 'status_class', 'result'],
      registers: [this.registry],
    });

    this.notificationApiRequestDuration = new Histogram({
      name: 'synqdrive_notification_api_request_duration_seconds',
      help: 'Notification REST API request duration',
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
      labelNames: ['route', 'method', 'result'],
      registers: [this.registry],
    });

    this.notificationProcessingDuration = new Histogram({
      name: 'synqdrive_notification_processing_duration_seconds',
      help: 'Single outbox delivery processing duration',
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 15, 30],
      registers: [this.registry],
    });

    this.notificationRunDuration = new Histogram({
      name: 'synqdrive_notification_run_duration_seconds',
      help: 'Notification evaluation run duration',
      buckets: [0.5, 1, 2, 5, 15, 30, 60, 120, 300],
      labelNames: ['trigger_class'],
      registers: [this.registry],
    });

    this.notificationOpenAge = new Histogram({
      name: 'synqdrive_notification_open_age_seconds',
      help: 'Age distribution of open notifications at observation time',
      buckets: [300, 900, 3600, 14400, 86400, 604800],
      labelNames: ['severity'],
      registers: [this.registry],
    });

    this.notificationQueueBacklog = new Gauge({
      name: 'synqdrive_notification_queue_backlog',
      help: 'Pending or retryable notification delivery outbox rows',
      registers: [this.registry],
    });

    this.notificationOutboxPending = new Gauge({
      name: 'synqdrive_notification_outbox_pending',
      help: 'Pending notification delivery outbox rows (alias for queue backlog)',
      registers: [this.registry],
    });

    this.communicationSendUnknownCurrent = new Gauge({
      name: 'synqdrive_communication_send_unknown_current',
      help: 'Current unresolved UNKNOWN reply commands (bounded sample)',
      labelNames: ['channel'],
      registers: [this.registry],
    });

    this.communicationSendUnknownOldestSeconds = new Gauge({
      name: 'synqdrive_communication_send_unknown_oldest_seconds',
      help: 'Age of oldest unresolved UNKNOWN reply command',
      labelNames: ['channel'],
      registers: [this.registry],
    });

    this.communicationRetentionLastSuccessTimestamp = new Gauge({
      name: 'synqdrive_communication_retention_last_success_timestamp',
      help: 'Unix timestamp of last successful Communication retention run',
      registers: [this.registry],
    });

    this.communicationReconciliationLastSuccessTimestamp = new Gauge({
      name: 'synqdrive_communication_reconciliation_last_success_timestamp',
      help: 'Unix timestamp of last successful Communication reconciliation by channel',
      labelNames: ['channel'],
      registers: [this.registry],
    });

    this.taskAutomationOutboxEnqueued = new Counter({
      name: 'synqdrive_task_automation_outbox_enqueued_total',
      help: 'Task automation outbox rows enqueued',
      labelNames: ['rule_id'],
      registers: [this.registry],
    });

    this.taskAutomationOutboxCompleted = new Counter({
      name: 'synqdrive_task_automation_outbox_completed_total',
      help: 'Successful task automation outbox executions',
      labelNames: ['rule_id'],
      registers: [this.registry],
    });

    this.taskAutomationOutboxFailed = new Counter({
      name: 'synqdrive_task_automation_outbox_failed_total',
      help: 'Failed task automation outbox execution attempts',
      labelNames: ['rule_id', 'error_code'],
      registers: [this.registry],
    });

    this.taskAutomationOutboxRetry = new Counter({
      name: 'synqdrive_task_automation_outbox_retry_total',
      help: 'Task automation outbox retries scheduled',
      labelNames: ['rule_id'],
      registers: [this.registry],
    });

    this.taskAutomationOutboxRefreshed = new Counter({
      name: 'synqdrive_task_automation_outbox_refreshed_total',
      help: 'Existing task automation outbox rows refreshed after repeat failure',
      registers: [this.registry],
    });

    this.taskAutomationOutboxBacklog = new Gauge({
      name: 'synqdrive_task_automation_outbox_backlog',
      help: 'Pending or dead-letter task automation outbox rows',
      registers: [this.registry],
    });

    this.taskAutomationOutboxProcessingDuration = new Histogram({
      name: 'synqdrive_task_automation_outbox_processing_duration_seconds',
      help: 'Single task automation outbox processing duration',
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 15, 30],
      registers: [this.registry],
    });

    this.drivingIntelligenceJobCompleted = new Counter({
      name: 'synqdrive_driving_intelligence_job_completed_total',
      help: 'Driving intelligence durable jobs completed successfully',
      labelNames: ['job_type'],
      registers: [this.registry],
    });

    this.drivingIntelligenceJobRetry = new Counter({
      name: 'synqdrive_driving_intelligence_job_retry_total',
      help: 'Driving intelligence durable job retries scheduled',
      labelNames: ['job_type', 'error_code'],
      registers: [this.registry],
    });

    this.drivingIntelligenceJobDeadLetter = new Counter({
      name: 'synqdrive_driving_intelligence_job_dead_letter_total',
      help: 'Driving intelligence durable jobs moved to dead-letter state',
      labelNames: ['job_type', 'error_code'],
      registers: [this.registry],
    });

    this.drivingAnalysisReconciliationActions = new Counter({
      name: 'synqdrive_driving_analysis_reconciliation_actions_total',
      help: 'Driving analysis reconciliation remediations',
      labelNames: ['check_type', 'result'],
      registers: [this.registry],
    });

    this.drivingCapabilityRefresh = new Counter({
      name: 'synqdrive_driving_capability_refresh_total',
      help: 'Driving capability lifecycle refresh attempts',
      labelNames: ['trigger', 'result', 'skipped_reason'],
      registers: [this.registry],
    });

    this.drivingCapabilityTransition = new Counter({
      name: 'synqdrive_driving_capability_transition_total',
      help: 'Capability signal transitions observed during refresh',
      labelNames: ['kind', 'trigger'],
      registers: [this.registry],
    });

    this.drivingCapabilityDetectorChanged = new Counter({
      name: 'synqdrive_driving_capability_detector_changed_total',
      help: 'Detector capability fingerprint changes after refresh',
      labelNames: ['trigger'],
      registers: [this.registry],
    });

    this.shadowDetectorRun = new Counter({
      name: 'synqdrive_shadow_detector_run_total',
      help: 'Shadow detector executions completed',
      labelNames: ['detector_id', 'result'],
      registers: [this.registry],
    });

    this.shadowDetectorSkipped = new Counter({
      name: 'synqdrive_shadow_detector_skipped_total',
      help: 'Shadow detector executions skipped',
      labelNames: ['detector_id', 'reason'],
      registers: [this.registry],
    });

    this.shadowDetectorCandidates = new Counter({
      name: 'synqdrive_shadow_detector_candidates_total',
      help: 'Shadow candidate events produced (not persisted as DrivingEvent)',
      labelNames: ['detector_id'],
      registers: [this.registry],
    });

    this.shadowDetectorFrameworkSkipped = new Counter({
      name: 'synqdrive_shadow_detector_framework_skipped_total',
      help: 'Shadow detector framework skipped entirely',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.drivingDecisionSummaryComputed = new Counter({
      name: 'synqdrive_driving_decision_summary_computed_total',
      help: 'Trip decision summaries computed and persisted',
      labelNames: ['data_basis', 'recommendation'],
      registers: [this.registry],
    });

    this.drivingAnalysisRunsTotal = new Counter({
      name: 'synqdrive_driving_analysis_runs_total',
      help: 'Driving analysis runs completed by type and status',
      labelNames: ['analysis_type', 'status'],
      registers: [this.registry],
    });

    this.drivingHealthImpactPublished = new Counter({
      name: 'synqdrive_driving_health_impact_published_total',
      help: 'Health impact publish jobs that recalculated brake/tire health',
      labelNames: ['eligibility'],
      registers: [this.registry],
    });

    this.tripRouteV2MatchAttempted = new Counter({
      name: 'synqdrive_trip_route_v2_match_attempted_total',
      help: 'Trip Route V2 chunked map-matching attempts',
      registers: [this.registry],
    });

    this.tripRouteV2MatchSucceeded = new Counter({
      name: 'synqdrive_trip_route_v2_match_succeeded_total',
      help: 'Trip Route V2 MATCHED artifact outcomes',
      registers: [this.registry],
    });

    this.tripRouteV2MatchFallbackFiltered = new Counter({
      name: 'synqdrive_trip_route_v2_match_fallback_filtered_total',
      help: 'Trip Route V2 matching fell back to FILTERED',
      registers: [this.registry],
    });

    this.tripRouteV2MatchRetryableFailure = new Counter({
      name: 'synqdrive_trip_route_v2_match_retryable_failure_total',
      help: 'Trip Route V2 retryable Mapbox matching failures',
      registers: [this.registry],
    });

    this.tripRouteV2MatchQualityRejected = new Counter({
      name: 'synqdrive_trip_route_v2_match_quality_rejected_total',
      help: 'Trip Route V2 deterministic quality gate rejections',
      registers: [this.registry],
    });

    this.tripRouteV2MatchChunkCount = new Histogram({
      name: 'synqdrive_trip_route_v2_match_chunk_count',
      help: 'Trip Route V2 Mapbox chunk count per trip',
      buckets: [1, 2, 5, 10, 20, 50, 100, 200],
      registers: [this.registry],
    });

    this.tripRouteV2MatchFailedChunkCount = new Histogram({
      name: 'synqdrive_trip_route_v2_match_failed_chunk_count',
      help: 'Trip Route V2 failed chunk count per trip',
      buckets: [0, 1, 2, 5, 10, 20],
      registers: [this.registry],
    });

    this.tripRouteV2MatchCoverage = new Histogram({
      name: 'synqdrive_trip_route_v2_match_coverage',
      help: 'Trip Route V2 match coverage ratio (0..1)',
      buckets: [0.5, 0.7, 0.85, 0.9, 0.95, 1],
      registers: [this.registry],
    });

    this.tripRouteV2MatchConfidence = new Histogram({
      name: 'synqdrive_trip_route_v2_match_confidence',
      help: 'Trip Route V2 weighted match confidence (0..1)',
      buckets: [0.3, 0.5, 0.7, 0.85, 0.95, 1],
      registers: [this.registry],
    });

    this.tripRouteV2MatchDurationMs = new Histogram({
      name: 'synqdrive_trip_route_v2_match_duration_ms',
      help: 'Trip Route V2 matching pipeline duration in milliseconds',
      buckets: [100, 500, 1000, 2500, 5000, 15000, 30000, 60000],
      registers: [this.registry],
    });

    this.tripRouteV2CanonicalReadTotal = new Counter({
      name: 'synqdrive_trip_route_v2_canonical_read_total',
      help: 'Canonical trip route read-model responses by processing state and quality',
      labelNames: ['processing_state', 'route_quality', 'ready'],
      registers: [this.registry],
    });

    this.tripRouteV2CanonicalSegmentCount = new Histogram({
      name: 'synqdrive_trip_route_v2_canonical_segment_count',
      help: 'Segment count returned by canonical trip route reads',
      buckets: [1, 2, 3, 5, 10, 20],
      registers: [this.registry],
    });

    this.batteryProviderObservationTotal = new Counter({
      name: 'synqdrive_battery_provider_observation_total',
      help: 'Battery provider observation classification outcomes',
      labelNames: ['signal', 'outcome'],
      registers: [this.registry],
    });

    this.batteryProviderDuplicateTotal = new Counter({
      name: 'synqdrive_battery_provider_duplicate_total',
      help: 'Battery provider observations discarded as duplicates',
      labelNames: ['signal', 'reason'],
      registers: [this.registry],
    });

    this.batteryJobsTotal = new Counter({
      name: 'synqdrive_battery_jobs_total',
      help: 'Battery V2 jobs enqueued or completed',
      labelNames: ['job_type', 'outcome'],
      registers: [this.registry],
    });

    this.batteryJobsFailedTotal = new Counter({
      name: 'synqdrive_battery_jobs_failed_total',
      help: 'Failed Battery V2 job attempts',
      labelNames: ['job_type', 'error_code'],
      registers: [this.registry],
    });

    this.batteryJobsDeadLetterTotal = new Counter({
      name: 'synqdrive_battery_jobs_dead_letter_total',
      help: 'Battery V2 jobs moved to dead-letter after exhausted retries',
      labelNames: ['job_type', 'error_code'],
      registers: [this.registry],
    });

    this.batteryV2JobsRetry = new Counter({
      name: 'synqdrive_battery_v2_jobs_retry_total',
      help: 'Battery V2 job retries scheduled',
      labelNames: ['job_type', 'error_code'],
      registers: [this.registry],
    });

    this.batteryV2DeadLetterBacklog = new Gauge({
      name: 'synqdrive_battery_v2_dead_letter_backlog',
      help: 'Battery V2 dead-letter rows awaiting operator review',
      registers: [this.registry],
    });

    this.batteryV2VehiclesWithoutPublication = new Gauge({
      name: 'synqdrive_battery_v2_vehicles_without_publication',
      help: 'Fleet vehicles with LV battery features but no LV publication row',
      labelNames: ['scope'],
      registers: [this.registry],
    });

    this.batteryV2JobsEnqueueTotal = new Counter({
      name: 'synqdrive_battery_v2_jobs_enqueue_total',
      help: 'Battery V2 BullMQ enqueue attempts by outcome',
      labelNames: ['job_type', 'outcome'],
      registers: [this.registry],
    });

    this.batteryV2JobsEnqueueSuppressedTotal = new Counter({
      name: 'synqdrive_battery_v2_jobs_enqueue_suppressed_total',
      help: 'Battery V2 enqueue suppressions (dead letter, duplicate, workers disabled)',
      labelNames: ['job_type', 'reason'],
      registers: [this.registry],
    });

    this.batteryV2ReconciliationEnqueuedTotal = new Counter({
      name: 'synqdrive_battery_v2_reconciliation_enqueued_total',
      help: 'Jobs enqueued by Battery V2 reconciliation tick per category',
      labelNames: ['category'],
      registers: [this.registry],
    });

    this.batteryV2PublicationCoverageTotal = new Counter({
      name: 'synqdrive_battery_v2_publication_coverage_total',
      help: 'Battery publication fleet coverage observations',
      labelNames: ['scope', 'state'],
      registers: [this.registry],
    });

    this.batteryV2PublicationAgeHours = new Histogram({
      name: 'synqdrive_battery_v2_publication_age_hours',
      help: 'Age of LV publication evidence at publish time (bucketed histogram)',
      labelNames: ['maturity'],
      buckets: [1, 6, 24, 24 * 7, 24 * 30, 24 * 90],
      registers: [this.registry],
    });

    this.batteryV2JobProcessingDuration = new Histogram({
      name: 'synqdrive_battery_v2_job_processing_duration_seconds',
      help: 'Battery V2 job handler processing duration',
      labelNames: ['job_type'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 15, 30, 60],
      registers: [this.registry],
    });

    this.batteryRestWindowsTotal = new Counter({
      name: 'synqdrive_battery_rest_windows_total',
      help: 'LV rest window lifecycle events',
      labelNames: ['window', 'outcome'],
      registers: [this.registry],
    });

    this.batteryRestMeasurementsTotal = new Counter({
      name: 'synqdrive_battery_rest_measurements_total',
      help: 'LV REST target measurements by window and quality',
      labelNames: ['window', 'quality'],
      registers: [this.registry],
    });

    this.batteryRestMissedTotal = new Counter({
      name: 'synqdrive_battery_rest_missed_total',
      help: 'LV REST targets classified as MISSED',
      labelNames: ['window'],
      registers: [this.registry],
    });

    this.batteryRestContaminatedTotal = new Counter({
      name: 'synqdrive_battery_rest_contaminated_total',
      help: 'LV REST measurements classified as contaminated',
      labelNames: ['window'],
      registers: [this.registry],
    });

    this.batteryStartProxyTotal = new Counter({
      name: 'synqdrive_battery_start_proxy_total',
      help: 'ICE start proxy extraction outcomes',
      labelNames: ['outcome'],
      registers: [this.registry],
    });

    this.batteryStartInsufficientCoverageTotal = new Counter({
      name: 'synqdrive_battery_start_insufficient_coverage_total',
      help: 'Start proxy extractions skipped due to insufficient crank coverage',
      registers: [this.registry],
    });

    this.hvRechargeSegmentsTotal = new Counter({
      name: 'synqdrive_hv_recharge_segments_total',
      help: 'DIMO recharge segments fetched during HV reconcile',
      labelNames: ['trigger', 'outcome'],
      registers: [this.registry],
    });

    this.hvChargeSessionsTotal = new Counter({
      name: 'synqdrive_hv_charge_sessions_total',
      help: 'HV charge sessions persisted during reconcile',
      labelNames: ['trigger', 'change'],
      registers: [this.registry],
    });

    this.hvCapacityObservationsTotal = new Counter({
      name: 'synqdrive_hv_capacity_observations_total',
      help: 'HV capacity shadow observations persisted',
      labelNames: ['quality'],
      registers: [this.registry],
    });

    this.hvCapacitySessionsQualifiedTotal = new Counter({
      name: 'synqdrive_hv_capacity_sessions_qualified_total',
      help: 'HV charge sessions evaluated for capacity shadow qualification',
      labelNames: ['qualified'],
      registers: [this.registry],
    });

    this.batteryAssessmentsTotal = new Counter({
      name: 'synqdrive_battery_assessments_total',
      help: 'Battery health assessments persisted or skipped',
      labelNames: ['scope', 'mode', 'outcome'],
      registers: [this.registry],
    });

    this.batteryPublicationsTotal = new Counter({
      name: 'synqdrive_battery_publications_total',
      help: 'Battery publication update outcomes',
      labelNames: ['maturity', 'outcome'],
      registers: [this.registry],
    });

    this.batteryShutdownEvidenceObservationCreatedTotal = new Counter({
      name: 'synqdrive_battery_shutdown_evidence_observation_created_total',
      help: 'M3.2B shadow shutdown evidence observations persisted',
      labelNames: ['evidence_class', 'confidence_class', 'state_alignment_class'],
      registers: [this.registry],
    });

    this.batteryShutdownEvidenceDuplicateSuppressedTotal = new Counter({
      name: 'synqdrive_battery_shutdown_evidence_duplicate_suppressed_total',
      help: 'M3.2B shadow shutdown evidence idempotent duplicates suppressed',
      registers: [this.registry],
    });

    this.batteryShutdownContextCreatedTotal = new Counter({
      name: 'synqdrive_battery_shutdown_context_created_total',
      help: 'M3.2B trip shutdown context snapshots persisted',
      labelNames: ['state_alignment_class', 'state_completeness'],
      registers: [this.registry],
    });

    this.batteryShutdownContextMissingStateTotal = new Counter({
      name: 'synqdrive_battery_shutdown_context_missing_state_total',
      help: 'M3.2B trip shutdown context captured with missing VLS state',
      registers: [this.registry],
    });

    this.batteryShutdownPostEngineOffCandidateTotal = new Counter({
      name: 'synqdrive_battery_shutdown_post_engine_off_candidate_total',
      help: 'M3.2B shadow observations classified as shutdown-transition candidates near trip end',
      registers: [this.registry],
    });

    this.batteryShutdownPostEngineOffConfirmedTotal = new Counter({
      name: 'synqdrive_battery_shutdown_post_engine_off_confirmed_total',
      help: 'M3.2B shadow observations meeting strict post-engine-off pre-sleep contract',
      registers: [this.registry],
    });

    this.batteryGeneralizedEvidenceCreatedTotal = new Counter({
      name: 'synqdrive_battery_generalized_evidence_created_total',
      help: 'M3.3 shadow generalized battery evidence observations persisted',
      labelNames: ['evidence_class'],
      registers: [this.registry],
    });

    this.batteryGeneralizedEvidenceDuplicateTotal = new Counter({
      name: 'synqdrive_battery_generalized_evidence_duplicate_total',
      help: 'M3.3 shadow generalized evidence idempotent duplicates suppressed',
      registers: [this.registry],
    });

    this.batteryRestSessionOpenedTotal = new Counter({
      name: 'synqdrive_battery_rest_session_opened_total',
      help: 'M3.3 shadow rest sessions opened',
      registers: [this.registry],
    });

    this.batteryRestSessionUpdatedTotal = new Counter({
      name: 'synqdrive_battery_rest_session_updated_total',
      help: 'M3.3 shadow rest sessions updated with rest observations',
      registers: [this.registry],
    });

    this.batteryRestSessionEndedTotal = new Counter({
      name: 'synqdrive_battery_rest_session_ended_total',
      help: 'M3.3 shadow rest sessions ended (timeout or natural close)',
      registers: [this.registry],
    });

    this.batteryRestSessionInvalidatedTotal = new Counter({
      name: 'synqdrive_battery_rest_session_invalidated_total',
      help: 'M3.3 shadow rest sessions invalidated by vehicle activity',
      registers: [this.registry],
    });

    this.batteryLateTripAssociationTotal = new Counter({
      name: 'synqdrive_battery_late_trip_association_total',
      help: 'M3.3 shadow late trip associations linked to rest sessions',
      registers: [this.registry],
    });

    this.batteryRestObservationTotal = new Counter({
      name: 'synqdrive_battery_rest_observation_total',
      help: 'M3.3 shadow rest ladder observations captured',
      registers: [this.registry],
    });

    this.batteryValidRestObservationTotal = new Counter({
      name: 'synqdrive_battery_valid_rest_observation_total',
      help: 'M3.3 shadow rest observations passing alignment validity gate',
      registers: [this.registry],
    });

    this.batteryRestWakeQualifiedTotal = new Counter({
      name: 'synqdrive_battery_rest_wake_qualified_total',
      help: 'M3.3 shadow observations cadence-qualified for REST_WAKE_VOLTAGE',
      registers: [this.registry],
    });

    this.batteryCadenceLadderResearchUnqualifiedTotal = new Counter({
      name: 'synqdrive_battery_cadence_ladder_research_unqualified_total',
      help:
        'M3.3 shadow ladder candidates (nominal index>=1) not REST_WAKE promoted — research tolerance not validated or exceeds candidate band',
      registers: [this.registry],
    });

    this.batteryGeneralizedEvidenceStateAmbiguousTotal = new Counter({
      name: 'synqdrive_battery_generalized_evidence_state_ambiguous_total',
      help: 'M3.3 shadow generalized evidence classified as state ambiguous',
      registers: [this.registry],
    });

    this.batteryGeneralizedEvidenceStaleReplayTotal = new Counter({
      name: 'synqdrive_battery_generalized_evidence_stale_replay_total',
      help: 'M3.3 shadow generalized evidence classified as stale replay',
      registers: [this.registry],
    });

    this.batteryRestSessionFeatureTriggerTotal = new Counter({
      name: 'synqdrive_battery_rest_session_feature_trigger_total',
      help: 'M3.3C C5A shadow rest-session feature C4 trigger outcomes',
      labelNames: ['reason', 'outcome'],
      registers: [this.registry],
    });

    this.batteryRestSessionFeatureTriggerDurationSeconds = new Histogram({
      name: 'synqdrive_battery_rest_session_feature_trigger_duration_seconds',
      help: 'M3.3C C5A shadow rest-session feature trigger duration (C4→C3)',
      labelNames: ['reason', 'outcome'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.batteryRestSessionFeatureRowCreatedTotal = new Counter({
      name: 'synqdrive_battery_rest_session_feature_row_created_total',
      help: 'M3.3C C5A append-only rest-session feature rows created by C3',
      labelNames: ['phase', 'trust'],
      registers: [this.registry],
    });

    this.batteryLongitudinalProfileMaterializationAttemptsTotal = new Counter({
      name: 'synqdrive_battery_longitudinal_profile_materialization_attempts_total',
      help: 'M3.3F D3 gated materialization attempts by scientific outcome (flag OFF skips entirely)',
      labelNames: ['outcome'],
      registers: [this.registry],
    });

    this.batteryLongitudinalProfileMaterializationDurationSeconds = new Histogram({
      name: 'synqdrive_battery_longitudinal_profile_materialization_duration_seconds',
      help: 'M3.3F D3 gated materialization duration by outcome',
      labelNames: ['outcome'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
      registers: [this.registry],
    });

    this.batteryLongitudinalReconciliationTicksTotal = new Counter({
      name: 'synqdrive_battery_longitudinal_reconciliation_ticks_total',
      help: 'M3.3F F4.1 bounded D3 reconciliation scheduler tick decisions (low-cardinality result only)',
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.batteryLongitudinalReconciliationCandidates = new Histogram({
      name: 'synqdrive_battery_longitudinal_reconciliation_candidates',
      help: 'M3.3F F4.1 candidate vehicles considered per completed reconciliation tick',
      buckets: [0, 1, 2, 3, 4, 5, 10],
      registers: [this.registry],
    });

    this.batteryLongitudinalReconciliationProcessedTotal = new Counter({
      name: 'synqdrive_battery_longitudinal_reconciliation_processed_total',
      help: 'M3.3F F4.1 per-candidate reconciliation processing outcomes',
      labelNames: ['outcome'],
      registers: [this.registry],
    });

    this.batteryLongitudinalReconciliationAckTotal = new Counter({
      name: 'synqdrive_battery_longitudinal_reconciliation_ack_total',
      help: 'M3.3F F4.1 authoritative D3 source-evidence acknowledgement append outcomes (all materialization paths including authorized internal ops; freshness-authority scope)',
      labelNames: ['outcome'],
      registers: [this.registry],
    });

    this.batteryLongitudinalReconciliationDurationSeconds = new Histogram({
      name: 'synqdrive_battery_longitudinal_reconciliation_duration_seconds',
      help: 'M3.3F F4.1 reconciliation scheduler tick duration by result',
      labelNames: ['result'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.registry],
    });

    this.batteryLongitudinalReconciliationLastSuccessTimestamp = new Gauge({
      name: 'synqdrive_battery_longitudinal_reconciliation_last_success_timestamp',
      help: 'Unix seconds of last completed D3 reconciliation scheduler tick on this process',
      registers: [this.registry],
    });

    this.batteryLongitudinalMaterializationFlagEnabled = new Gauge({
      name: 'synqdrive_battery_longitudinal_materialization_flag_enabled',
      help: 'M3.3F F4.3 effective D3 materialization flag on this process (0=OFF, 1=ON); updated each reconciliation scheduler tick before leader guard',
      registers: [this.registry],
    });

    this.batteryLongitudinalReconciliationInvariantFailuresTotal = new Counter({
      name: 'synqdrive_battery_longitudinal_reconciliation_invariant_failures_total',
      help: 'M3.3F F4.3 typed reconciliation safety invariant violations (fail-closed)',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.batteryHvH4A3ReconciliationFlagEnabled = new Gauge({
      name: 'synqdrive_battery_hv_h4_a3_reconciliation_flag_enabled',
      help: 'M3.3-HV-H4-A3.5 reconciliation flag on this process (0=OFF, 1=ON)',
      registers: [this.registry],
    });

    this.batteryHvH4A3ReconciliationSchedulerTicksTotal = new Counter({
      name: 'synqdrive_battery_hv_h4_a3_reconciliation_scheduler_ticks_total',
      help: 'M3.3-HV-H4-A3.5 bounded reconciliation scheduler tick decisions',
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.batteryHvH4A3ReconciliationSchedulerDurationSeconds = new Histogram({
      name: 'synqdrive_battery_hv_h4_a3_reconciliation_scheduler_duration_seconds',
      help: 'M3.3-HV-H4-A3.5 reconciliation scheduler tick duration by result',
      labelNames: ['result'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.registry],
    });

    this.batteryHvH4A3ReconciliationInspectedTotal = new Counter({
      name: 'synqdrive_battery_hv_h4_a3_reconciliation_inspected_total',
      help: 'M3.3-HV-H4-A3.5 live HvChargeSession rows inspected per tick',
      registers: [this.registry],
    });

    this.batteryHvH4A3ReconciliationCreatedTotal = new Counter({
      name: 'synqdrive_battery_hv_h4_a3_reconciliation_created_total',
      help: 'M3.3-HV-H4-A3.5 new durable revisions created by reconciliation',
      registers: [this.registry],
    });

    this.batteryHvH4A3ReconciliationExistingTotal = new Counter({
      name: 'synqdrive_battery_hv_h4_a3_reconciliation_existing_total',
      help: 'M3.3-HV-H4-A3.5 rows already durable at current fingerprint',
      registers: [this.registry],
    });

    this.batteryLongitudinalProfileIntegrityInspectionTotal = new Counter({
      name: 'synqdrive_battery_longitudinal_profile_integrity_inspection_total',
      help: 'M3.3D D4 integrity inspection disposition (helpers only in F1 — no automatic runtime)',
      labelNames: ['disposition'],
      registers: [this.registry],
    });

    this.batteryLongitudinalProfileSelfIntegrityFailureTotal = new Counter({
      name: 'synqdrive_battery_longitudinal_profile_self_integrity_failure_total',
      help: 'M3.3D D4 revision self-integrity failures (helpers only in F1)',
      registers: [this.registry],
    });

    this.batteryProviderObservabilityGapOpenedTotal = new Counter({
      name: 'synqdrive_battery_provider_observability_gap_opened_total',
      help: 'M3.3 B1.2Y provider observability gaps opened',
      registers: [this.registry],
    });

    this.batteryProviderObservabilityGapExtendedTotal = new Counter({
      name: 'synqdrive_battery_provider_observability_gap_extended_total',
      help: 'M3.3 B1.2Y provider observability gaps extended (stale poll)',
      registers: [this.registry],
    });

    this.batteryProviderObservabilityGapFailureTotal = new Counter({
      name: 'synqdrive_battery_provider_observability_gap_failure_total',
      help: 'M3.3 B1.2Y provider observability gap lifecycle failures',
      labelNames: ['operation', 'reason'],
      registers: [this.registry],
    });

    this.batteryV2HvRechargeReconcileErrors = new Counter({
      name: 'synqdrive_battery_v2_hv_recharge_reconcile_errors_total',
      help: 'HV recharge reconcile provider errors',
      labelNames: ['trigger', 'error_code'],
      registers: [this.registry],
    });

    this.batteryV2HvRechargeProviderDelay = new Histogram({
      name: 'synqdrive_battery_v2_hv_recharge_provider_delay_seconds',
      help: 'Delay between latest provider segment end and reconcile time',
      labelNames: ['trigger'],
      buckets: [60, 300, 900, 1800, 3600, 7200, 21600, 86400],
      registers: [this.registry],
    });

    this.erdE3ConvergenceTotal = new Counter({
      name: 'synqdrive_erd_e3_convergence_total',
      help: 'ERD E3 fallback detection and native/fallback convergence outcomes',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.erdE4LivenessTotal = new Counter({
      name: 'synqdrive_erd_e4_liveness_total',
      help: 'ERD E4 reconciliation scheduling and recovery liveness outcomes',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.batteryCapabilitySignalsTotal = new Counter({
      name: 'synqdrive_battery_capability_signals_total',
      help: 'Battery capability preflight signal assessments',
      labelNames: ['signal', 'status'],
      registers: [this.registry],
    });

    this.hvCapacityMethodConflictTotal = new Counter({
      name: 'synqdrive_hv_capacity_method_conflict_total',
      help: 'HV M2/M3 capacity method agreement outcomes',
      labelNames: ['outcome'],
      registers: [this.registry],
    });

    this.hvCapacityM2SessionCv = new Histogram({
      name: 'synqdrive_hv_capacity_m2_session_cv',
      help: 'HV M2 intra-session capacity estimate coefficient of variation',
      buckets: [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5],
      registers: [this.registry],
    });

    this.batteryPostgresTableRows = new Gauge({
      name: 'synqdrive_battery_postgres_table_rows',
      help: 'Battery V2 PostgreSQL table row counts',
      labelNames: ['table'],
      registers: [this.registry],
    });

    this.batteryRetentionRunsTotal = new Counter({
      name: 'synqdrive_battery_retention_runs_total',
      help: 'Battery V2 retention runs completed',
      labelNames: ['dry_run'],
      registers: [this.registry],
    });

    this.batteryRetentionRowsDeletedTotal = new Counter({
      name: 'synqdrive_battery_retention_rows_deleted_total',
      help: 'Battery V2 retention rows deleted',
      registers: [this.registry],
    });

    this.batteryRetentionRowsAggregatedTotal = new Counter({
      name: 'synqdrive_battery_retention_rows_aggregated_total',
      help: 'Battery V2 retention aggregates created',
      registers: [this.registry],
    });

    this.communicationProjectionTotal = new Counter({
      name: 'synqdrive_communication_projection_total',
      help: 'Canonical Communication projection attempts',
      labelNames: ['channel', 'event_type', 'result'],
      registers: [this.registry],
    });

    this.communicationProjectionFailuresTotal = new Counter({
      name: 'synqdrive_communication_projection_failures_total',
      help: 'Canonical Communication projection failures',
      labelNames: ['channel', 'event_type', 'error_code'],
      registers: [this.registry],
    });

    this.communicationProjectionLagSeconds = new Histogram({
      name: 'synqdrive_communication_projection_lag_seconds',
      help: 'Inbound-to-canonical projection lag when measurable',
      labelNames: ['channel', 'event_type'],
      buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600],
      registers: [this.registry],
    });

    this.communicationSendTotal = new Counter({
      name: 'synqdrive_communication_send_total',
      help: 'Canonical outbound send state transitions',
      labelNames: ['channel', 'result'],
      registers: [this.registry],
    });

    this.communicationSendUnknownTotal = new Counter({
      name: 'synqdrive_communication_send_unknown_total',
      help: 'Canonical outbound sends entering UNKNOWN',
      labelNames: ['channel', 'reason'],
      registers: [this.registry],
    });

    this.communicationSendDurationSeconds = new Histogram({
      name: 'synqdrive_communication_send_duration_seconds',
      help: 'Canonical outbound dispatch duration when measurable',
      labelNames: ['channel'],
      buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.registry],
    });

    this.communicationReconciliationTotal = new Counter({
      name: 'synqdrive_communication_reconciliation_total',
      help: 'Canonical outbound/native reconciliation attempts',
      labelNames: ['channel', 'result'],
      registers: [this.registry],
    });

    this.communicationHandoffTotal = new Counter({
      name: 'synqdrive_communication_handoff_total',
      help: 'Communication handoff notification ingest attempts',
      labelNames: ['channel', 'result'],
      registers: [this.registry],
    });

    this.communicationAiOperationTotal = new Counter({
      name: 'synqdrive_communication_ai_operation_total',
      help: 'Communication AI operational requests',
      labelNames: ['operation', 'result'],
      registers: [this.registry],
    });

    this.communicationAiOperationDurationSeconds = new Histogram({
      name: 'synqdrive_communication_ai_operation_duration_seconds',
      help: 'Communication AI operational request duration',
      labelNames: ['operation'],
      buckets: [0.25, 0.5, 1, 2, 5, 10, 30, 60, 120],
      registers: [this.registry],
    });

    this.communicationRetentionRunsTotal = new Counter({
      name: 'synqdrive_communication_retention_runs_total',
      help: 'Communication retention runs completed',
      labelNames: ['dry_run', 'status'],
      registers: [this.registry],
    });

    this.communicationRetentionRowsAffectedTotal = new Counter({
      name: 'synqdrive_communication_retention_rows_affected_total',
      help: 'Communication retention rows affected across runs',
      registers: [this.registry],
    });

    this.communicationRetentionRunFailuresTotal = new Counter({
      name: 'synqdrive_communication_retention_run_failures_total',
      help: 'Communication retention per-row failures across runs',
      registers: [this.registry],
    });

    this.batteryMeasurementDuplicateSkipTotal = new Counter({
      name: 'synqdrive_battery_measurement_duplicate_skip_total',
      help: 'Battery measurement writes skipped as duplicates before insert',
      registers: [this.registry],
    });

    this.connectivityWebhookReceivedTotal = new Counter({
      name: 'synqdrive_connectivity_webhook_received_total',
      help: 'Device connection webhooks received',
      labelNames: ['provider', 'event_type'],
      registers: [this.registry],
    });

    this.connectivityWebhookProcessingFailedTotal = new Counter({
      name: 'synqdrive_connectivity_webhook_processing_failed_total',
      help: 'Device connection webhook processing failures',
      labelNames: ['provider', 'reason'],
      registers: [this.registry],
    });

    this.connectivityWebhookDeadLetterTotal = new Counter({
      name: 'synqdrive_connectivity_webhook_dead_letter_total',
      help: 'Device connection webhook dead-letter events',
      labelNames: ['provider', 'reason'],
      registers: [this.registry],
    });

    this.connectivityEpisodeOpenedTotal = new Counter({
      name: 'synqdrive_connectivity_episode_opened_total',
      help: 'Device connection episodes opened',
      labelNames: ['provider', 'reason'],
      registers: [this.registry],
    });

    this.connectivityEpisodeResolvedTotal = new Counter({
      name: 'synqdrive_connectivity_episode_resolved_total',
      help: 'Device connection episodes resolved',
      labelNames: ['provider', 'method'],
      registers: [this.registry],
    });

    this.connectivityEpisodeFalseOpenDetectedTotal = new Counter({
      name: 'synqdrive_connectivity_episode_false_open_detected_total',
      help: 'False-open episodes detected during reconciliation audit',
      labelNames: ['classification'],
      registers: [this.registry],
    });

    this.connectivityRecoverySnapshotTotal = new Counter({
      name: 'synqdrive_connectivity_recovery_snapshot_total',
      help: 'Snapshot-based episode recovery attempts',
      labelNames: ['outcome'],
      registers: [this.registry],
    });

    this.connectivityRecoveryTelemetryTotal = new Counter({
      name: 'synqdrive_connectivity_recovery_telemetry_total',
      help: 'Telemetry-based episode recovery attempts',
      labelNames: ['outcome'],
      registers: [this.registry],
    });

    this.connectivityBindingChangedTotal = new Counter({
      name: 'synqdrive_connectivity_binding_changed_total',
      help: 'Device binding changes affecting connectivity',
      labelNames: ['provider', 'outcome'],
      registers: [this.registry],
    });

    this.connectivityStateConflictTotal = new Counter({
      name: 'synqdrive_connectivity_state_conflict_total',
      help: 'Connectivity runtime state conflicts',
      labelNames: ['surface', 'reason'],
      registers: [this.registry],
    });

    this.connectivityRuntimeStateTotal = new Counter({
      name: 'synqdrive_connectivity_runtime_state_total',
      help: 'Connectivity runtime overall states calculated',
      labelNames: ['overall_state'],
      registers: [this.registry],
    });

    this.connectivityTelemetryStateTotal = new Counter({
      name: 'synqdrive_connectivity_telemetry_state_total',
      help: 'Connectivity telemetry freshness states calculated',
      labelNames: ['telemetry_state'],
      registers: [this.registry],
    });

    this.connectivityProviderLinkStateTotal = new Counter({
      name: 'synqdrive_connectivity_provider_link_state_total',
      help: 'Connectivity provider link states calculated',
      labelNames: ['provider_link_state'],
      registers: [this.registry],
    });

    this.connectivityProviderReachableObservationStaleTotal = new Counter({
      name: 'synqdrive_connectivity_provider_reachable_observation_stale_total',
      help:
        'Transitions into provider-reachable / vehicle-observation-stale ' +
        '(provider responding while source_timestamp is stale)',
      labelNames: ['provider', 'telemetry_state'],
      registers: [this.registry],
    });

    this.connectivityProviderReachableObservationRecoveredTotal = new Counter({
      name: 'synqdrive_connectivity_provider_reachable_observation_recovered_total',
      help:
        'Transitions from provider-reachable / vehicle-observation-stale back ' +
        'to fresh observation (precedence changes to unreachable / auth error / ' +
        'unknown are deliberately excluded)',
      labelNames: ['provider', 'telemetry_state'],
      registers: [this.registry],
    });

    this.connectivityDeviceStateTotal = new Counter({
      name: 'synqdrive_connectivity_device_state_total',
      help: 'Connectivity physical device states calculated',
      labelNames: ['physical_device_state'],
      registers: [this.registry],
    });

    this.connectivityAlertTotal = new Counter({
      name: 'synqdrive_connectivity_alert_total',
      help: 'Connectivity alerts created',
      labelNames: ['alert_type'],
      registers: [this.registry],
    });

    this.connectivityAlertResolvedTotal = new Counter({
      name: 'synqdrive_connectivity_alert_resolved_total',
      help: 'Connectivity alerts resolved',
      labelNames: ['alert_type'],
      registers: [this.registry],
    });

    this.connectivityCoverageRatio = new Gauge({
      name: 'synqdrive_connectivity_coverage_ratio',
      help: 'Aggregated fleet connectivity coverage ratio by coverage state bucket',
      labelNames: ['coverage_state'],
      registers: [this.registry],
    });

    this.connectivityReconciliationConflictTotal = new Counter({
      name: 'synqdrive_connectivity_reconciliation_conflict_total',
      help: 'Episode reconciliation conflicts by classification',
      labelNames: ['classification'],
      registers: [this.registry],
    });

    this.connectivityPhysicalStateTransitionAppliedTotal = new Counter({
      name: 'synqdrive_connectivity_physical_state_transition_applied_total',
      help: 'Canonical physical device state transitions applied',
      labelNames: ['source', 'transition'],
      registers: [this.registry],
    });

    this.connectivityPhysicalStateEvidenceStaleTotal = new Counter({
      name: 'synqdrive_connectivity_physical_state_evidence_stale_total',
      help: 'Stale physical device state evidence rejected',
      labelNames: ['source'],
      registers: [this.registry],
    });

    this.connectivityPhysicalStateEvidenceConflictTotal = new Counter({
      name: 'synqdrive_connectivity_physical_state_evidence_conflict_total',
      help: 'Conflicting physical device state evidence at equal timestamps',
      labelNames: ['source'],
      registers: [this.registry],
    });

    this.connectivityPhysicalStateSelfHealTotal = new Counter({
      name: 'synqdrive_connectivity_physical_state_self_heal_total',
      help: 'Physical device state projection self-heal or provenance refresh events',
      labelNames: ['source', 'outcome'],
      registers: [this.registry],
    });

    this.connectivityPhysicalStateDuplicateTransitionSuppressedTotal = new Counter({
      name: 'synqdrive_connectivity_duplicate_transition_suppressed_total',
      help: 'Duplicate physical device state evidence suppressed',
      labelNames: ['source'],
      registers: [this.registry],
    });

    this.connectivityPhysicalStateShadowEvaluationTotal = new Counter({
      name: 'synqdrive_connectivity_physical_state_shadow_evaluation_total',
      help: 'Physical-state shadow comparisons evaluated (compare-only)',
      labelNames: [
        'classification',
        'authority_mode',
        'provider',
        'legacy_decision',
        'physical_decision',
        'correctness_blocking',
      ],
      registers: [this.registry],
    });

    this.connectivityPhysicalStateShadowClassificationTotal = new Counter({
      name: 'synqdrive_connectivity_physical_state_shadow_classification_total',
      help: 'Physical-state shadow adjudication classifications',
      labelNames: [
        'classification',
        'authority_mode',
        'provider',
        'legacy_decision',
        'physical_decision',
        'correctness_blocking',
      ],
      registers: [this.registry],
    });

    this.connectivityPhysicalStateShadowCorrectnessBlockerTotal = new Counter({
      name: 'synqdrive_connectivity_physical_state_shadow_correctness_blocker_total',
      help: 'Physical-state shadow correctness-blocking divergences',
      labelNames: [
        'classification',
        'authority_mode',
        'provider',
        'legacy_decision',
        'physical_decision',
        'correctness_blocking',
      ],
      registers: [this.registry],
    });

    this.connectivityPhysicalStateShadowPilotScopeGateTotal = new Counter({
      name: 'synqdrive_connectivity_physical_state_shadow_pilot_scope_gate_total',
      help: 'STATEFUL_SHADOW pilot scope gate decisions (low-cardinality)',
      labelNames: ['allowed', 'reason', 'provider'],
      registers: [this.registry],
    });

    this.connectivityPhysicalStateShadowObservationPersistenceFailureTotal = new Counter({
      name: 'synqdrive_connectivity_physical_state_shadow_observation_persistence_failure_total',
      help: 'Shadow pilot observation durable persistence failures (compare-only evidence loss)',
      labelNames: ['provider'],
      registers: [this.registry],
    });

    this.connectivityPhysicalStateEvidenceWriterTotal = new Counter({
      name: 'synqdrive_connectivity_physical_state_evidence_writer_total',
      help: 'Physical-state evidence writer reconcile results by source and decision',
      labelNames: ['source', 'decision', 'mode'],
      registers: [this.registry],
    });

    this.connectivityPhysicalStateStatefulShadowEvaluationTotal = new Counter({
      name: 'synqdrive_connectivity_physical_state_stateful_shadow_evaluation_total',
      help: 'STATEFUL_SHADOW mode evidence evaluations',
      labelNames: ['mode'],
      registers: [this.registry],
    });

    this.connectivityPhysicalStateGtR1ExpectedFixTotal = new Counter({
      name: 'synqdrive_connectivity_physical_state_gt_r1_expected_fix_total',
      help: 'GT-R1 EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT shadow classifications',
      labelNames: ['source'],
      registers: [this.registry],
    });

    this.connectivityPhysicalStatePreseedTotal = new Counter({
      name: 'synqdrive_connectivity_physical_state_preseed_total',
      help: 'Physical-state pre-seed planner/apply outcomes',
      labelNames: ['result', 'provider', 'dry_run'],
      registers: [this.registry],
    });
  }

  async onModuleInit(): Promise<void> {
    this.workerRuntimeEnabled.set(
      RuntimeStatusRegistry.getWorkersEnabled() ? 1 : 0,
    );
    this.hfMirrorEnabled.set(process.env.HF_MIRROR_ENABLED === 'true' ? 1 : 0);
    this.clickHouseSchemaStatus.set(0);
    bindPhysicalStateMetricSink(this);
  }

  /** Returns the Prometheus metrics text for the /metrics endpoint. */
  setSnapshotPollingTierOccupancy(
    tierCounts: Map<string, number>,
  ): void {
    try {
      const allTiers = [
        'ACTIVE_DRIVING',
        'RECENTLY_ACTIVE',
        'RESTING_STANDBY',
        'LONG_IDLE',
        'OFFLINE',
        'HARD_OFFLINE',
      ];
      let total = 0;
      let fast = 0;
      for (const tier of allTiers) {
        const count = tierCounts.get(tier) ?? 0;
        this.snapshotPollingTierVehicles.set({ tier }, count);
        total += count;
        if (tier === 'ACTIVE_DRIVING' || tier === 'RECENTLY_ACTIVE') {
          fast += count;
        }
      }
      if (total > 0) {
        this.snapshotFastTierRatio.set(fast / total);
      } else {
        this.snapshotFastTierRatio.set(0);
      }
    } catch {
      // non-blocking observability
    }
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
