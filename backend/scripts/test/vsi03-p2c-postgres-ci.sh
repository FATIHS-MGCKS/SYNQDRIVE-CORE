#!/usr/bin/env bash
# Disposable PostgreSQL certification for VSI-03 P2C observation ledger.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# shellcheck source=lib/vsi03-p2c-postgres-guard.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/vsi03-p2c-postgres-guard.sh"

PG_HOST="${VSI03_PG_HOST:-127.0.0.1}"
PG_PORT="${VSI03_PG_PORT:-5432}"
PG_USER="${VSI03_PG_USER:-synqdrive}"
PG_PASSWORD="${VSI03_PG_PASSWORD:-synqdrive}"
PG_ADMIN_DB="${VSI03_PG_ADMIN_DB:-postgres}"
VSI03_DB="${VSI03_PG_DATABASE:-vsi03_test_ci}"

vsi03_p2c_assert_safe_admin_database_name "${PG_ADMIN_DB}"
vsi03_p2c_assert_disposable_target "${PG_HOST}" "${VSI03_DB}" "postgresql://${PG_USER}@${PG_HOST}/${VSI03_DB}"

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${VSI03_DB}?schema=public"
export VSI03_READONLY_COMPOSER_PG=1

bash scripts/test/vsi03-p2c-postgres-guard.contract.sh

echo "VSI03 P2C postgres CI: host=${PG_HOST} db=${VSI03_DB}"

if command -v psql >/dev/null 2>&1; then
  PGPASSWORD="${PG_PASSWORD}" psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_ADMIN_DB}" -v ON_ERROR_STOP=1 \
    -c "SELECT 1 FROM pg_database WHERE datname = '${VSI03_DB}'" | grep -q 1 \
    || PGPASSWORD="${PG_PASSWORD}" psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_ADMIN_DB}" -v ON_ERROR_STOP=1 \
      -c "CREATE DATABASE \"${VSI03_DB}\""
fi

export PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1
bash scripts/test/prisma-migrate-deploy-resilient.sh

npx jest \
  --runInBand \
  --verbose \
  vsi-provider-source-observation.postgres.integration \
  vsi-provider-source-observation.concurrency.postgres.integration \
  vsi-profile-materialization.postgres.integration \
  vsi-profile-lifecycle.postgres.integration \
  vsi-profile-fingerprint.postgres.integration \
  vsi-lv-standby-transmission-evidence.postgres.integration \
  vsi-p5h1-profile-revision-history.postgres.integration \
  vsi-capability-resolver.postgres.integration \
  vsi-apds-p5.postgres.integration \
  vsi-apds-p5-binding.postgres.integration \
  vsi-apds-p5-historical-attribution.postgres.integration \
  vsi-apds-p5b1-offline-replay.postgres.integration \
  vsi-apds-p5b2-historical-replay.postgres.integration \
  vsi-apds-p5b2-phase2-manifest-replay.postgres.integration \
  vsi-apds-p5b1-evidence.writer.postgres.integration \
  vsi-p3a-per-link-catalog.postgres.integration \
  vsi-p3a-per-link-catalog.concurrency.postgres.integration \
  vsi-native-discovery-inventory.postgres.integration \
  vsi-snapshot-native-discovery.postgres.integration \
  vsi-hf-native-discovery.postgres.integration
