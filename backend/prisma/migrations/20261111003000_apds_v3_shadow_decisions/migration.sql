CREATE TABLE "apds_v3_shadow_decisions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "provider_source_link_id" TEXT NOT NULL,
    "physical_request_id" TEXT NOT NULL,
    "decision_at" TIMESTAMPTZ(3) NOT NULL,
    "activation_version" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "baseline_canonical_due" BOOLEAN,
    "baseline_authority" TEXT NOT NULL,
    "baseline_assessable" BOOLEAN NOT NULL,
    "v3_decision" TEXT NOT NULL,
    "v3_reason" TEXT NOT NULL,
    "expected_information_gain" DOUBLE PRECISION,
    "information_gain_heuristic" BOOLEAN NOT NULL,
    "consumer_demand_fail_closed" BOOLEAN NOT NULL,
    "observation_quality" TEXT,
    "observation_scope" TEXT NOT NULL DEFAULT 'BASELINE_PHYSICAL_POLL_START_ONLY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apds_v3_shadow_decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "apds_v3_shadow_decisions_phys_policy_key" ON "apds_v3_shadow_decisions"("organization_id", "vehicle_id", "physical_request_id", "policy_version");

CREATE INDEX "apds_v3_shadow_decisions_org_decision_idx" ON "apds_v3_shadow_decisions"("organization_id", "decision_at");

ALTER TABLE "apds_v3_shadow_decisions" ADD CONSTRAINT "apds_v3_shadow_decisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "apds_v3_shadow_decisions" ADD CONSTRAINT "apds_v3_shadow_decisions_organization_id_vehicle_id_fkey" FOREIGN KEY ("organization_id", "vehicle_id") REFERENCES "vehicles"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
