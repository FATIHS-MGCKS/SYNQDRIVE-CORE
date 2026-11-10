-- APDS V3 P1A — versioned discovery-delay evidence (immediate-next poll binding).
-- Does not reinterpret existing additional_discovery_delay_ms values.

ALTER TABLE "apd_shadow_reconciliation_decisions"
  ADD COLUMN IF NOT EXISTS "discovery_delay_evidence_version" TEXT,
  ADD COLUMN IF NOT EXISTS "simulated_next_poll_id" TEXT;

CREATE INDEX IF NOT EXISTS "apd_shadow_reconciliation_decisions_sim_next_poll_idx"
  ON "apd_shadow_reconciliation_decisions" ("simulated_next_poll_id")
  WHERE "simulated_next_poll_id" IS NOT NULL;
