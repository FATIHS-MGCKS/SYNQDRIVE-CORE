-- TDL PR1: retention purge run audit (bounded global audit trail).

CREATE TABLE "trip_end_validation_observability_retention_purge_runs" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "dry_run" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL,
    "cutoff_at" TIMESTAMPTZ(6),
    "eligible_count" INTEGER NOT NULL DEFAULT 0,
    "rows_deleted" INTEGER NOT NULL DEFAULT 0,
    "batch_count" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER,
    "error_message" VARCHAR(1024),
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "trip_end_validation_observability_retention_purge_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trip_end_validation_observability_retention_purge_runs_status_completed_at_idx" ON "trip_end_validation_observability_retention_purge_runs"("status", "completed_at");

CREATE INDEX "trip_end_validation_observability_retention_purge_runs_started_at_idx" ON "trip_end_validation_observability_retention_purge_runs"("started_at");
