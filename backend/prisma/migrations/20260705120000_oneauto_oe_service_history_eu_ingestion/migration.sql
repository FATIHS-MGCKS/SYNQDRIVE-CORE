-- OneAuto OE_SERVICE_HISTORY_EU → VehicleServiceEvent durable ingestion (V1)

CREATE TYPE "OneAutoOeServiceHistoryEuIngestionStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'PARTIAL');

ALTER TYPE "ServiceEventOrigin" ADD VALUE IF NOT EXISTS 'ONEAUTO';

ALTER TABLE "vehicle_service_events"
  ADD COLUMN IF NOT EXISTS "one_auto_provider_job_id" TEXT,
  ADD COLUMN IF NOT EXISTS "external_source_event_key" TEXT,
  ADD COLUMN IF NOT EXISTS "source_payload_json" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_service_events_oneauto_source_uq"
  ON "vehicle_service_events" ("organization_id", "one_auto_provider_job_id", "external_source_event_key");

CREATE INDEX IF NOT EXISTS "vehicle_service_events_one_auto_provider_job_id_idx"
  ON "vehicle_service_events" ("one_auto_provider_job_id");

CREATE TABLE IF NOT EXISTS "one_auto_oe_service_history_eu_ingestions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "provider_job_id" TEXT NOT NULL,
  "status" "OneAutoOeServiceHistoryEuIngestionStatus" NOT NULL DEFAULT 'PENDING',
  "events_discovered" INTEGER NOT NULL DEFAULT 0,
  "events_ingested" INTEGER NOT NULL DEFAULT 0,
  "source_response_id" TEXT,
  "source_retrieved_at" TIMESTAMP(3),
  "last_error_code" TEXT,
  "last_error_message_redacted" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "one_auto_oe_service_history_eu_ingestions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "one_auto_oe_service_history_eu_ingestions_provider_job_id_key"
  ON "one_auto_oe_service_history_eu_ingestions" ("provider_job_id");

CREATE INDEX IF NOT EXISTS "one_auto_oe_service_history_eu_ingestions_organization_id_vehicle_id_idx"
  ON "one_auto_oe_service_history_eu_ingestions" ("organization_id", "vehicle_id");

CREATE INDEX IF NOT EXISTS "one_auto_oe_service_history_eu_ingestions_status_idx"
  ON "one_auto_oe_service_history_eu_ingestions" ("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'one_auto_oe_service_history_eu_ingestions_organization_id_fkey'
  ) THEN
    ALTER TABLE "one_auto_oe_service_history_eu_ingestions"
      ADD CONSTRAINT "one_auto_oe_service_history_eu_ingestions_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'one_auto_oe_service_history_eu_ingestions_vehicle_id_fkey'
  ) THEN
    ALTER TABLE "one_auto_oe_service_history_eu_ingestions"
      ADD CONSTRAINT "one_auto_oe_service_history_eu_ingestions_vehicle_id_fkey"
      FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'one_auto_oe_service_history_eu_ingestions_provider_job_id_fkey'
  ) THEN
    ALTER TABLE "one_auto_oe_service_history_eu_ingestions"
      ADD CONSTRAINT "one_auto_oe_service_history_eu_ingestions_provider_job_id_fkey"
      FOREIGN KEY ("provider_job_id") REFERENCES "one_auto_provider_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
