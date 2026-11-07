#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# shellcheck source=lib/fsd2-persistence-postgres-guard.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/fsd2-persistence-postgres-guard.sh"

PG_HOST="${FSD2_PG_HOST:-127.0.0.1}"
PG_PORT="${FSD2_PG_PORT:-5432}"
PG_USER="${FSD2_PG_USER:-synqdrive}"
PG_PASSWORD="${FSD2_PG_PASSWORD:-synqdrive}"
FSD2_DB="${FSD2_PG_DATABASE:-fsd2_test_ci}"

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${FSD2_DB}?schema=public"
export FSD2_PG_ADMIN_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/postgres?schema=public"
export FSD_DISCOVERY_PERSISTENCE_PG=1
export FSD_DISCOVERY_PERSISTENCE_PG_REQUIRED=1
export FSD_DISCOVERY_PERSISTENCE_MIGRATION_PG=1

fsd2_persistence_assert_pg_flag
fsd2_persistence_assert_disposable_target "${PG_HOST}" "${FSD2_DB}" "${DATABASE_URL}"

npx jest \
  src/modules/vehicle-intelligence/full-signal-discovery/persistence \
  src/modules/vehicle-intelligence/full-signal-discovery/persistence/__tests__/fsd-source-link-lifecycle-invalidation.postgres.integration.spec.ts \
  src/modules/vehicle-intelligence/full-signal-discovery/orchestration/__tests__/fsd3-orchestration.postgres.integration.spec.ts \
  src/modules/vehicle-intelligence/full-signal-discovery/orchestration/__tests__/fsd3-orchestration.safety.postgres.integration.spec.ts \
  src/modules/vehicle-intelligence/full-signal-discovery/orchestration/__tests__/fsd3-orchestration.ledger-closeout.postgres.integration.spec.ts \
  src/modules/vehicle-intelligence/full-signal-discovery/orchestration/__tests__/fsd4-orchestration.postgres.integration.spec.ts \
  --runInBand \
  --forceExit \
  --verbose
