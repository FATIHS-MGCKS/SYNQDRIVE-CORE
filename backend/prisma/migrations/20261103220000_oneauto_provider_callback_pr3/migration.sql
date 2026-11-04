-- PR3: One Auto provider callback delivery (flags default OFF at application layer)

ALTER TABLE "one_auto_provider_jobs"
ADD COLUMN "callback_delivery_token_sha256" TEXT,
ADD COLUMN "provider_callback_received_at" TIMESTAMP(3),
ADD COLUMN "retrieval_provider_dispatch_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "one_auto_provider_jobs_callback_delivery_token_sha256_key"
ON "one_auto_provider_jobs"("callback_delivery_token_sha256");

CREATE TABLE "one_auto_provider_callback_inbox" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "payload_sha256" TEXT NOT NULL,
    "payload_json" JSONB,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duplicate" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "one_auto_provider_callback_inbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "one_auto_provider_callback_inbox_job_id_idx"
ON "one_auto_provider_callback_inbox"("job_id");

CREATE INDEX "one_auto_provider_callback_inbox_org_received_idx"
ON "one_auto_provider_callback_inbox"("organization_id", "received_at");

ALTER TABLE "one_auto_provider_callback_inbox"
ADD CONSTRAINT "one_auto_provider_callback_inbox_job_id_fkey"
FOREIGN KEY ("job_id") REFERENCES "one_auto_provider_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
