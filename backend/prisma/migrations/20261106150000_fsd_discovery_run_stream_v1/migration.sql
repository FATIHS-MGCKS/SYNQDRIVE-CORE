-- FSD-2/3/4 mutual admission: distinguish catalog/snapshot vs historical discovery streams on the same source link.

CREATE TYPE "FsdDiscoveryStream" AS ENUM ('FSD3_CATALOG_SNAPSHOT', 'FSD4_HISTORICAL');

ALTER TABLE "fsd_discovery_runs" ADD COLUMN "discovery_stream" "FsdDiscoveryStream" NOT NULL DEFAULT 'FSD3_CATALOG_SNAPSHOT';

CREATE INDEX "fsd_discovery_runs_source_link_stream_status_idx" ON "fsd_discovery_runs"("provider_source_link_id", "discovery_stream", "status");
