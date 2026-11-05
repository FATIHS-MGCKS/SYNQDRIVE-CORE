-- FSD-2 H1–H5 architecture corrections (draft PR #2344)

DROP INDEX IF EXISTS "fsd_discovery_runs_idempotency_key";
DROP INDEX IF EXISTS "fsd_discovery_runs_active_source_link_uq";

CREATE UNIQUE INDEX "fsd_discovery_runs_idempotency_active_key"
  ON "fsd_discovery_runs"("organization_id", "vehicle_id", "provider_source_link_id", "run_key")
  WHERE "invalidated_at" IS NULL;

CREATE UNIQUE INDEX "fsd_discovery_runs_executable_source_link_uq"
  ON "fsd_discovery_runs"("provider_source_link_id")
  WHERE "status" IN ('PENDING', 'IN_PROGRESS');

ALTER TABLE "fsd_discovery_runs"
  ADD CONSTRAINT "fsd_discovery_runs_provider_source_link_id_fkey"
  FOREIGN KEY ("provider_source_link_id") REFERENCES "vehicle_data_source_links"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "fsd_discovery_stages_id_run_stage_scope_key"
  ON "fsd_discovery_stages"("id", "run_id", "stage_type");

ALTER TABLE "fsd_discovery_signal_evidence"
  DROP CONSTRAINT IF EXISTS "fsd_discovery_signal_evidence_stage_id_fkey";

ALTER TABLE "fsd_discovery_signal_evidence"
  ADD CONSTRAINT "fsd_discovery_signal_evidence_stage_scope_fkey"
  FOREIGN KEY ("stage_id", "run_id", "stage_type")
  REFERENCES "fsd_discovery_stages"("id", "run_id", "stage_type")
  ON DELETE RESTRICT ON UPDATE CASCADE;
