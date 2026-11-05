#!/usr/bin/env bash
# OneAuto OE_SERVICE_HISTORY_EU ingestion — ephemeral PostgreSQL migration + ingestion gates.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

fail_closed_url() {
  local url="$1"
  local lower="${url,,}"
  case "$lower" in
    *127.0.0.1*|*localhost*) ;;
    *) echo "DATABASE_URL must target ephemeral local PostgreSQL" >&2; exit 1 ;;
  esac
  case "$lower" in
    *srv1374778*|*app.synqdrive.eu*|*hstgr.cloud*|*mein-vps*) echo "DATABASE_URL must not reference production" >&2; exit 1 ;;
  esac
}

PG_USER="${CI_PG_USER:-synqdrive}"
PG_PASSWORD="${CI_PG_PASSWORD:-synqdrive}"
PG_DB="${CI_PG_DB:-synqdrive_ci_ephemeral}"
PG_PORT="${CI_PG_PORT:-5432}"
export DATABASE_URL="${DATABASE_URL:-postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${PG_DB}?schema=public}"
fail_closed_url "$DATABASE_URL"

if [[ "${SKIP_CI_PG_START:-}" != "1" ]]; then
  bash scripts/test/ci-start-postgres.sh
fi

psql_admin() {
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "${CI_PG_CONTAINER:-ci-postgres}"; then
    docker exec "${CI_PG_CONTAINER:-ci-postgres}" psql -U "$PG_USER" "$@"
  else
    PGPASSWORD="$PG_PASSWORD" psql -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" "$@"
  fi
}

echo "==> Fresh database migrate deploy"
export PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1
export SYNQDRIVE_DATABASE_IDENTITY_PROFILE=ephemeral
bash scripts/test/prisma-migrate-deploy-resilient.sh
npx prisma migrate status

echo "==> Upgrade simulation (pre-ingestion schema → apply ingestion migration)"
UPGRADE_DB="${PG_DB}_oneauto_sh_upgrade"
psql_admin -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"${UPGRADE_DB}\";" \
  -c "CREATE DATABASE \"${UPGRADE_DB}\";"

UPGRADE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${UPGRADE_DB}?schema=public"
DATABASE_URL="$UPGRADE_URL" PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

TARGET_MIGRATION="20261103231000_oneauto_oe_service_history_eu_ingestion"
psql_admin -d "$UPGRADE_DB" -v ON_ERROR_STOP=1 <<SQL
DELETE FROM "_prisma_migrations" WHERE migration_name = '${TARGET_MIGRATION}';
DROP TABLE IF EXISTS "one_auto_oe_service_history_eu_ingestion_event_links" CASCADE;
DROP TABLE IF EXISTS "one_auto_oe_service_history_eu_ingestions" CASCADE;
DROP TYPE IF EXISTS "OneAutoOeServiceHistoryEuIngestionEventLinkKind";
DROP TYPE IF EXISTS "OneAutoOeServiceHistoryEuIngestionStatus";
DROP INDEX IF EXISTS "vehicle_service_events_oneauto_source_uq";
DROP INDEX IF EXISTS "vehicle_service_events_oneauto_vehicle_hist_uq";
DROP INDEX IF EXISTS "vehicle_service_events_one_auto_provider_job_id_idx";
DROP INDEX IF EXISTS "vehicle_service_events_one_auto_vehicle_historical_event_key_idx";
ALTER TABLE "vehicle_service_events"
  DROP COLUMN IF EXISTS "one_auto_provider_job_id",
  DROP COLUMN IF EXISTS "external_source_event_key",
  DROP COLUMN IF EXISTS "one_auto_vehicle_historical_event_key",
  DROP COLUMN IF EXISTS "source_payload_json";
SQL

DATABASE_URL="$UPGRADE_URL" PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh
DATABASE_URL="$UPGRADE_URL" npx prisma migrate status

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${PG_DB}?schema=public"
export ONEAUTO_OE_SERVICE_HISTORY_PG=1
export ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED=1

npx jest --runInBand --forceExit --verbose \
  src/modules/oneauto-provider/service-history/oneauto-oe-service-history-eu-ingestion.postgres.integration.spec.ts

echo "OneAuto OE service history PostgreSQL CI OK"
