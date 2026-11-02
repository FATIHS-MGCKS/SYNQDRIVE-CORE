-- CreateEnum
CREATE TYPE "OneAutoProviderJobStatus" AS ENUM ('CREATED', 'QUEUED', 'RUNNING', 'AWAITING_PROVIDER', 'SUCCEEDED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "one_auto_provider_jobs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "vin_snapshot" TEXT NOT NULL,
    "service_sku" TEXT NOT NULL,
    "status" "OneAutoProviderJobStatus" NOT NULL DEFAULT 'CREATED',
    "idempotency_key" TEXT NOT NULL,
    "provider_request_id" TEXT,
    "estimated_price_minor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "pricing_source_version" TEXT,
    "cost_confirmed_at" TIMESTAMP(3),
    "cost_confirmed_by_user_id" TEXT,
    "initiating_master_admin_user_id" TEXT NOT NULL,
    "confirmed_price_minor" INTEGER,
    "actual_charge_minor" INTEGER,
    "actual_charge_known" BOOLEAN NOT NULL DEFAULT false,
    "poll_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" TEXT,
    "last_error_message_redacted" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "one_auto_provider_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "one_auto_provider_responses" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "http_status" INTEGER,
    "provider_status_header" TEXT,
    "response_body_json" JSONB,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "one_auto_provider_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "one_auto_provider_jobs_organization_id_vehicle_id_idx" ON "one_auto_provider_jobs"("organization_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "one_auto_provider_jobs_status_idx" ON "one_auto_provider_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "one_auto_provider_jobs_organization_id_idempotency_key_key" ON "one_auto_provider_jobs"("organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "one_auto_provider_responses_job_id_idx" ON "one_auto_provider_responses"("job_id");

-- AddForeignKey
ALTER TABLE "one_auto_provider_jobs" ADD CONSTRAINT "one_auto_provider_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_auto_provider_jobs" ADD CONSTRAINT "one_auto_provider_jobs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_auto_provider_responses" ADD CONSTRAINT "one_auto_provider_responses_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "one_auto_provider_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
