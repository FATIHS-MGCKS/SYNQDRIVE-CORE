-- CreateTable
CREATE TABLE "one_auto_oem_vin_lookup_eu_suggestion_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "provider_job_id" TEXT NOT NULL,
    "vin_sha256_prefix" TEXT NOT NULL,
    "normalized_snapshot_json" JSONB NOT NULL,
    "response_fetched_at" TIMESTAMP(3) NOT NULL,
    "snapshot_created_at" TIMESTAMP(3) NOT NULL,
    "provider_data_updated_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "one_auto_oem_vin_lookup_eu_suggestion_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "one_auto_oem_vin_lookup_eu_suggestion_snapshots_provider_job_id_key" ON "one_auto_oem_vin_lookup_eu_suggestion_snapshots"("provider_job_id");

-- CreateIndex
CREATE INDEX "one_auto_oem_vin_lookup_eu_suggestion_snapshots_organization_id_vehicle_id_idx" ON "one_auto_oem_vin_lookup_eu_suggestion_snapshots"("organization_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "one_auto_oem_vin_lookup_eu_suggestion_snapshots_expires_at_idx" ON "one_auto_oem_vin_lookup_eu_suggestion_snapshots"("expires_at");

-- AddForeignKey
ALTER TABLE "one_auto_oem_vin_lookup_eu_suggestion_snapshots" ADD CONSTRAINT "one_auto_oem_vin_lookup_eu_suggestion_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_auto_oem_vin_lookup_eu_suggestion_snapshots" ADD CONSTRAINT "one_auto_oem_vin_lookup_eu_suggestion_snapshots_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_auto_oem_vin_lookup_eu_suggestion_snapshots" ADD CONSTRAINT "one_auto_oem_vin_lookup_eu_suggestion_snapshots_provider_job_id_fkey" FOREIGN KEY ("provider_job_id") REFERENCES "one_auto_provider_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
