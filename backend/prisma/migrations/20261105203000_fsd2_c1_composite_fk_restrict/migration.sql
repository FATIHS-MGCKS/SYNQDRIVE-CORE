-- C1: composite evidence→stage FK must not SET NULL NOT NULL scope columns (run_id, stage_type).

ALTER TABLE "fsd_discovery_signal_evidence"
  DROP CONSTRAINT IF EXISTS "fsd_discovery_signal_evidence_stage_scope_fkey";

ALTER TABLE "fsd_discovery_signal_evidence"
  ADD CONSTRAINT "fsd_discovery_signal_evidence_stage_scope_fkey"
  FOREIGN KEY ("stage_id", "run_id", "stage_type")
  REFERENCES "fsd_discovery_stages"("id", "run_id", "stage_type")
  ON DELETE RESTRICT ON UPDATE CASCADE;
