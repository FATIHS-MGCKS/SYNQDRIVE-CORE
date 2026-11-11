-- APDS V3 shadow: physical identity provenance + immutable decision fingerprint
ALTER TABLE "apds_v3_shadow_decisions"
  ADD COLUMN "physical_request_identity_class" TEXT,
  ADD COLUMN "correlation_attempt_id" TEXT,
  ADD COLUMN "decision_fingerprint" TEXT,
  ADD COLUMN "missing_evidence_reasons" JSONB NOT NULL DEFAULT '[]';

UPDATE "apds_v3_shadow_decisions"
SET
  "physical_request_identity_class" = 'DERIVED',
  "decision_fingerprint" = md5(
    coalesce("v3_decision", '') || '|' || coalesce("v3_reason", '') || '|' || "physical_request_id"
  )
WHERE "physical_request_identity_class" IS NULL;

ALTER TABLE "apds_v3_shadow_decisions"
  ALTER COLUMN "physical_request_identity_class" SET NOT NULL,
  ALTER COLUMN "decision_fingerprint" SET NOT NULL;
