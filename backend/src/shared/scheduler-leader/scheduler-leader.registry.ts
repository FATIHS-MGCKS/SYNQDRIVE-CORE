/**
 * Bounded scheduler name enum for metrics and guard labels.
 * Add new singleton schedulers here when introducing @Cron/@Interval producers.
 */
export const SINGLETON_GLOBAL_SCHEDULER_NAMES = [
  'dimo_snapshot_tick',
  'dimo_snapshot_janitor',
  'trip_reconciliation_fast',
  'trip_reconciliation_warm',
  'trip_reconciliation_cold',
  'trip_di_boundary_admission_recovery_fleet',
  'trip_tracking_recovery',
  'snapshot_wake_handoff_recovery',
  'trip_analysis_recovery',
  'tire_recalculation',
  'tire_ds4_shadow_catchup',
  'tire_wear_v3_calibration_shadow_writer',
  'brake_recalculation',
  'payment_connect_reconciliation',
  'billing_reconciliation',
  'hm_health_polling',
  'driving_analysis_reconciliation',
  'data_retention',
  'storage_orphan_sweep',
  'battery_v2_reconciliation',
  'battery_v2_longitudinal_materialization_reconciliation',
  'battery_hv_h4_a3_reconciliation',
  'battery_v2_retention',
  'voice_retention',
  'iam_data_retention',
  'document_retention',
  'document_intake_action_recovery',
  'document_extraction_recovery',
  'fuel_station_enrichment_recovery',
  'charging_station_enrichment_recovery',
  'physical_refuel_reconciliation_recovery',
  'device_connection_webhook_inbox',
  'physical_state_shadow_observation_retention',
  'communication_retention',
  'legal_document_retention',
  'booking_document_generation_recovery_minute',
  'booking_document_generation_recovery_five_minute',
  'payment_email',
  'vehicle_warning_retention',
  'notification_delivery',
  'notification_retention',
  'invoice_overdue_mark',
  'invoice_overdue_reconcile_stale',
  'invoice_overdue_refresh_payment_tasks',
  'invite_email',
  'iam_audit_outbox',
  'task_automation_outbox',
  'business_insights',
  'business_audit_outbox',
  'booking_eligibility_recheck',
  'billing_domain_event_outbox',
  'billing_domain_event_email',
  'vehicle_registry_lifecycle_outbox',
  'vsi_profile_lifecycle_outbox',
  'reference_capture_retention',
  'reference_capture_settlement_shadow_recovery',
  'reference_capture_exp021_maturation_shadow_recovery',
  'reference_capture_exp021_fleet_coordinator',
  'reference_capture_exp021_canary_live_window_activation',
  'di_v0_s4_discovery',
  'di_v0_s4_drift_watcher',
  'di_v0_s4_maintenance_reaper',
  'di_v0_p2_auto_projection_v2',
  'di_v0_s4_research_v2',
  'di_v0_motion_core_shadow_v1',
  'ds4_rpm_hf_v1b_shadow_v1',
  'di_v0_ds4_assessment_v1',
  'di_v0_m7a_road_assignment_shadow_v1',
] as const;

export type SingletonGlobalSchedulerName =
  (typeof SINGLETON_GLOBAL_SCHEDULER_NAMES)[number];

/** BullMQ repeat schedulers — idempotent upsertJobScheduler, safe on every replica. */
export const SAFE_DISTRIBUTED_SCHEDULER_NAMES = [
  'dimo_dtc_bullmq_repeat',
  'dimo_vehicle_sync_bullmq_repeat',
] as const;

/** Per-process metrics / heartbeat work — intentionally runs on every replica. */
export const REPLICA_LOCAL_SCHEDULER_NAMES = [
  'metrics_refresh_dependency',
  'metrics_refresh_queue_failed',
  'metrics_refresh_clickhouse',
  'metrics_refresh_battery_postgres',
  'metrics_refresh_voice',
  'communication_metrics_refresh',
  'notification_metrics_refresh',
  'iam_metrics_refresh',
  'di_v0_s4_claim_loop',
] as const;

export type SchedulerClassification =
  | 'SINGLETON_GLOBAL'
  | 'SAFE_DISTRIBUTED'
  | 'REPLICA_LOCAL';

export function isSingletonGlobalSchedulerName(
  name: string,
): name is SingletonGlobalSchedulerName {
  return (SINGLETON_GLOBAL_SCHEDULER_NAMES as readonly string[]).includes(name);
}
