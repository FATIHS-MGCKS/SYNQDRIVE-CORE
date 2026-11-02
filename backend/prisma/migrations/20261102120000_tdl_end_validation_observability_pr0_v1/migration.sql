-- TDL PR0: append-only end-validation decision observability (default flag OFF in app).

CREATE TABLE "trip_end_validation_decision_observations" (
    "id" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "idempotency_key" VARCHAR(512) NOT NULL,
    "organization_id" TEXT,
    "vehicle_id" TEXT NOT NULL,
    "trip_id" TEXT,
    "end_cycle_token" VARCHAR(64),
    "fsm_state_at_decision" VARCHAR(64) NOT NULL,
    "transition_to_state" VARCHAR(64),
    "process_phase" VARCHAR(64) NOT NULL,
    "decision_outcome" VARCHAR(128) NOT NULL,
    "end_detection_mode" VARCHAR(64),
    "end_confirmation_source" VARCHAR(64),
    "decision_reason" VARCHAR(512),
    "detector_outcome" VARCHAR(128),
    "cusum_reason" VARCHAR(256),
    "retry_count" INTEGER,
    "retry_budget_max" INTEGER,
    "evidence_revision" VARCHAR(64),
    "input_fingerprint" VARCHAR(128),
    "qualified_stop_boundary_at" TIMESTAMPTZ(6),
    "canonical_end_boundary_at" TIMESTAMPTZ(6),
    "event_time_at" TIMESTAMPTZ(6),
    "evidence_available_at" TIMESTAMPTZ(6),
    "worker_decision_at" TIMESTAMPTZ(6) NOT NULL,
    "worker_confirmation_at" TIMESTAMPTZ(6),
    "persisted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "core_window_point_count" INTEGER,
    "provider_source" VARCHAR(64),
    "data_quality_flags" JSONB,
    "missing_evidence_flags" JSONB,

    CONSTRAINT "trip_end_validation_decision_observations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trip_end_validation_decision_observations_idempotency_key_key" ON "trip_end_validation_decision_observations"("idempotency_key");

CREATE INDEX "trip_end_validation_decision_observations_organization_id_vehicle_id_persisted_at_idx" ON "trip_end_validation_decision_observations"("organization_id", "vehicle_id", "persisted_at");

CREATE INDEX "trip_end_validation_decision_observations_vehicle_id_trip_id_idx" ON "trip_end_validation_decision_observations"("vehicle_id", "trip_id");

CREATE INDEX "trip_end_validation_decision_observations_persisted_at_idx" ON "trip_end_validation_decision_observations"("persisted_at");

CREATE INDEX "trip_end_validation_decision_observations_decision_outcome_persisted_at_idx" ON "trip_end_validation_decision_observations"("decision_outcome", "persisted_at");

ALTER TABLE "trip_end_validation_decision_observations" ADD CONSTRAINT "trip_end_validation_decision_observations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
