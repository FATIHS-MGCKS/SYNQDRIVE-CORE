-- FSD-2 discovery persistence (runs, stages, signal evidence)

CREATE TYPE "FsdDiscoveryRunStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'INVALIDATED');
CREATE TYPE "FsdDiscoveryStageType" AS ENUM ('CATALOG', 'SNAPSHOT', 'HISTORICAL');
CREATE TYPE "FsdDiscoveryStageStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'UNKNOWN_OUTCOME', 'DEFERRED', 'SKIPPED');
CREATE TYPE "FsdDiscoveryFailureClass" AS ENUM ('REQUEST_BUDGET_EXCEEDED', 'HISTORICAL_WINDOW_INVALID', 'PROVIDER_ERROR', 'STALE_SOURCE_LINK', 'STALE_RUN_VERSION', 'INVALID_STATE_TRANSITION', 'UNKNOWN');
CREATE TYPE "FsdDiscoverySignalEvidenceState" AS ENUM ('DECLARED_ONLY', 'QUERY_PLANNED', 'QUERY_ACCEPTED', 'QUERY_FAILED', 'OBSERVED', 'NOT_EVALUABLE', 'DEFERRED');

CREATE TABLE "fsd_discovery_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "provider_source_link_id" TEXT NOT NULL,
    "run_key" TEXT NOT NULL,
    "run_revision" INTEGER NOT NULL DEFAULT 1,
    "contract_version" TEXT NOT NULL DEFAULT 'fsd-discovery-run-v1',
    "dimo_token_id" INTEGER,
    "connection_identity_fingerprint" TEXT,
    "status" "FsdDiscoveryRunStatus" NOT NULL DEFAULT 'PENDING',
    "failure_class" "FsdDiscoveryFailureClass",
    "failure_reason_redacted" VARCHAR(2000),
    "lease_owner" TEXT,
    "lease_expires_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "invalidated_at" TIMESTAMPTZ(3),
    "invalidation_reason" TEXT,
    "superseded_by_run_id" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fsd_discovery_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fsd_discovery_stages" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "stage_type" "FsdDiscoveryStageType" NOT NULL,
    "status" "FsdDiscoveryStageStatus" NOT NULL DEFAULT 'PLANNED',
    "plan_fingerprint" TEXT,
    "checkpoint_json" JSONB NOT NULL DEFAULT '{}',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_http_status" INTEGER,
    "last_outcome" TEXT,
    "last_error_code" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fsd_discovery_stages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fsd_discovery_signal_evidence" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "stage_id" TEXT,
    "stage_type" "FsdDiscoveryStageType" NOT NULL,
    "signal_name" TEXT NOT NULL,
    "declared_by_provider" BOOLEAN NOT NULL DEFAULT true,
    "schema_shape" TEXT,
    "evidence_state" "FsdDiscoverySignalEvidenceState" NOT NULL DEFAULT 'DECLARED_ONLY',
    "query_planned" BOOLEAN NOT NULL DEFAULT false,
    "query_accepted" BOOLEAN,
    "observed_value" BOOLEAN,
    "provenance_json" JSONB NOT NULL DEFAULT '{}',
    "quality_json" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fsd_discovery_signal_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fsd_discovery_runs_idempotency_key" ON "fsd_discovery_runs"("organization_id", "vehicle_id", "provider_source_link_id", "run_key");
CREATE UNIQUE INDEX "fsd_discovery_runs_source_link_revision_key" ON "fsd_discovery_runs"("provider_source_link_id", "run_revision");
CREATE INDEX "fsd_discovery_runs_org_vehicle_idx" ON "fsd_discovery_runs"("organization_id", "vehicle_id");
CREATE INDEX "fsd_discovery_runs_source_link_status_idx" ON "fsd_discovery_runs"("provider_source_link_id", "status");
CREATE INDEX "fsd_discovery_runs_invalidated_at_idx" ON "fsd_discovery_runs"("invalidated_at");
CREATE UNIQUE INDEX "fsd_discovery_runs_active_source_link_uq" ON "fsd_discovery_runs"("provider_source_link_id") WHERE "invalidated_at" IS NULL;

CREATE UNIQUE INDEX "fsd_discovery_stages_run_stage_key" ON "fsd_discovery_stages"("run_id", "stage_type");
CREATE INDEX "fsd_discovery_stages_run_status_idx" ON "fsd_discovery_stages"("run_id", "status");

CREATE UNIQUE INDEX "fsd_discovery_signal_evidence_run_stage_signal_key" ON "fsd_discovery_signal_evidence"("run_id", "stage_type", "signal_name");
CREATE INDEX "fsd_discovery_signal_evidence_run_stage_idx" ON "fsd_discovery_signal_evidence"("run_id", "stage_type");

ALTER TABLE "fsd_discovery_runs" ADD CONSTRAINT "fsd_discovery_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fsd_discovery_runs" ADD CONSTRAINT "fsd_discovery_runs_vehicle_scope_fkey" FOREIGN KEY ("organization_id", "vehicle_id") REFERENCES "vehicles"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fsd_discovery_stages" ADD CONSTRAINT "fsd_discovery_stages_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "fsd_discovery_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fsd_discovery_signal_evidence" ADD CONSTRAINT "fsd_discovery_signal_evidence_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "fsd_discovery_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fsd_discovery_signal_evidence" ADD CONSTRAINT "fsd_discovery_signal_evidence_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "fsd_discovery_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
