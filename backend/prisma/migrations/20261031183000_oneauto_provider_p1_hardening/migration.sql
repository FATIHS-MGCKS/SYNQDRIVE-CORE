-- One Auto P1 pre-merge hardening — budget reservation, dispatch idempotency, quote binding
ALTER TABLE "one_auto_provider_jobs" ADD COLUMN "budget_reserved_minor" INTEGER;
ALTER TABLE "one_auto_provider_jobs" ADD COLUMN "quote_issued_at" TIMESTAMP(3);
ALTER TABLE "one_auto_provider_jobs" ADD COLUMN "initial_provider_dispatch_at" TIMESTAMP(3);

CREATE INDEX "one_auto_provider_jobs_organization_id_cost_confirmed_at_idx"
  ON "one_auto_provider_jobs"("organization_id", "cost_confirmed_at");

ALTER TABLE "one_auto_provider_responses" ADD COLUMN "response_phase" TEXT;
