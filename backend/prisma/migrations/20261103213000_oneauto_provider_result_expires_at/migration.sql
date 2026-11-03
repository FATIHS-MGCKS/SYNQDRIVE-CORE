-- P4 PR-2: provider async result retention marker (no automatic poll)
ALTER TABLE "one_auto_provider_jobs" ADD COLUMN "provider_result_expires_at" TIMESTAMP(3);

CREATE INDEX "one_auto_provider_jobs_provider_result_expires_at_idx" ON "one_auto_provider_jobs"("provider_result_expires_at");
