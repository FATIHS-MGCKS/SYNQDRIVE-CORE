export const QUEUE_NAMES = {
  DIMO_SNAPSHOT: 'dimo.snapshot.poll',
  /** Lightweight post-terminal wake successor dispatch — no provider fetch. */
  SNAPSHOT_WAKE_HANDOFF: 'snapshot.wake.handoff',
  DIMO_VEHICLE_SYNC: 'dimo.vehicle.sync',
  DTC_POLL: 'dimo.dtc.poll',
  TIRE_RECALCULATION: 'dimo.tire.recalculation',
  /** Tire Intelligence P2 — DS4 motion shadow input materialization (OFF by default). */
  TIRE_DS4_SHADOW: 'dimo.tire.ds4-shadow',
  BRAKE_RECALCULATION: 'dimo.brake.recalculation',
  TRIP_TRACKING: 'dimo.trip-tracking',
  TRIP_BEHAVIOR_ENRICHMENT: 'trip.behavior.enrichment',
  /** Driving Impact Engine V1 — runs after HF enrichment completes. */
  DRIVING_IMPACT_COMPUTE: 'trip.driving-impact.compute',
  /** Driving Intelligence V2 — typed persistent job envelope (P18). */
  DRIVING_INTELLIGENCE: 'driving.intelligence.jobs',
  /** AI Document Upload — async text extraction + DIMO agent structuring. */
  DOCUMENT_EXTRACTION: 'document.extraction',
  /** Booking document lifecycle — async PDF generation with durable workflow state. */
  BOOKING_DOCUMENT_GENERATION: 'booking.document.generation',
  /** DTC Knowledge Base — async AI enrichment of error codes (generic + vehicle). */
  DTC_KNOWLEDGE_ENRICHMENT: 'dtc.knowledge.enrichment',
  /** Notification evaluation — org-scoped BI + V2 producer sync (debounced/scheduled). */
  NOTIFICATION_EVALUATION: 'notification.evaluation',
  /** Notification delivery — transactional outbox channel dispatch. */
  NOTIFICATION_DELIVERY: 'notification.delivery',
  PAYMENT_EMAIL: 'payment.email',
  TASK_AUTOMATION: 'task.automation',
  /** Battery Health V2 — typed async jobs (observation, assessment, HV reconcile). */
  BATTERY_V2: 'battery.v2',
  /** Voice provider webhook async processing — lifecycle correlation. */
  VOICE_WEBHOOK_PROCESS: 'voice.webhook.process',
  /** Device connection webhook inbox async processing — connectivity retry/DLQ. */
  CONNECTIVITY_WEBHOOK_PROCESS: 'connectivity.webhook.process',
  /** ClickHouse telemetry mirror write retries (P1-PL1). */
  CLICKHOUSE_MIRROR_RETRY: 'clickhouse.mirror.retry',
  /** REFUEL energy events — async OSM fuel-station location enrichment (Phase D). */
  ENERGY_REFUEL_STATION_ENRICH: 'energy.refuel.station.enrich',
  /** Canonical ERD RECHARGE — async OSM charging-station enrichment (E6.3). */
  ENERGY_RECHARGE_STATION_ENRICH: 'energy.recharge.station.enrich',
  /** DIMO LTE_R1 reference capture autonomous runner (Phase 3A.1). */
  REFERENCE_CAPTURE: 'reference.capture.recording',
  /** EXP-021 settlement shadow — forensic experiment-only delayed observations. */
  REFERENCE_CAPTURE_SETTLEMENT_SHADOW: 'reference.capture.settlement-shadow',
  /** EXP-021 live maturation shadow — isolated delayed age observations (PR-M2). */
  REFERENCE_CAPTURE_EXP021_MATURATION_SHADOW: 'reference.capture.exp021-maturation-shadow',
  /** One Auto API — Master Admin external lookups (P1, OFF by default). */
  ONEAUTO_PROVIDER: 'oneauto.provider',
} as const;
