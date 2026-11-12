#!/usr/bin/env bash
# P6-PR1 RentalTripLink — isolated Postgres integration gate.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[rental-trip-link-postgres-ci] %s\n' "$*"; }

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required (ephemeral PostgreSQL)." >&2
  exit 1
fi

case "${DATABASE_URL,,}" in
  *127.0.0.1*|*localhost*) ;;
  *)
    echo "DATABASE_URL must target ephemeral CI-local PostgreSQL" >&2
    exit 1
    ;;
esac

case "${DATABASE_URL,,}" in
  *srv1374778*|*app.synqdrive*|*hstgr.cloud*|*mein-vps*)
    echo "DATABASE_URL must not reference production hosts" >&2
    exit 1
    ;;
esac

log "prisma migrate deploy (resilient)"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

export RENTAL_TRIP_LINK_POSTGRES_INTEGRATION=1
log "jest rental-trip-link postgres integration"
npm test -- --runInBand --forceExit --testPathPatterns=rental-trip-link.postgres
